import type { Asset } from '../model';
import { assertExpandedEntries } from '../input/inputSafety';
import {
  inspectAsset,
  type InspectionPanelTarget,
  type InspectionIssue,
} from '../model/assetInspection';
import type { CasprojBundle, CasprojImportResult } from '../storage/casproj';
import {
  assertBundleDocumentConsistency,
  assertCasprojInputSize,
  DEFAULT_CASPROJ_README,
  importCasproj,
} from '../storage/casproj';

export interface ReviewFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface ReviewSnapshot {
  sourceSha256?: string;
  readme?: string;
  projectId: string;
  projectName: string;
  fingerprint: string;
  assets: Asset[];
  files: ReviewFile[];
  project: CasprojBundle['project'];
  exportPresets?: CasprojBundle['exportPresets'];
  warnings: string[];
  migrations: string[];
}
export interface AssetRevision {
  id: string;
  name: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  fields: string[];
  changes: Array<{
    field: string;
    path: string;
    before: string;
    after: string;
    panel: InspectionPanelTarget | null;
  }>;
  changesTruncated: boolean;
  files: Array<{ path: string; status: 'added' | 'removed' | 'changed' }>;
  issues: InspectionIssue[];
}
export interface RevisionReview {
  format: 'chameleon-revision-review';
  version: '0.1.0';
  baseline: { projectId: string; projectName: string; fingerprint: string };
  current: { projectId: string; projectName: string; fingerprint: string };
  sameProject: boolean;
  assets: AssetRevision[];
  projectChanged: boolean;
  settingsChanged: boolean;
  readmeChanged: boolean;
  otherFiles: AssetRevision['files'];
  limitations: string[];
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Object key order is immaterial; array order and unknown fields remain meaningful. */
export function revisionJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(revisionJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compare)
    .map((key) => `${JSON.stringify(key)}:${revisionJson(record[key])}`)
    .join(',')}}`;
}
async function hash(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function check(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('比較を取り消しました', 'AbortError');
}
export async function snapshotRevision(
  bundle: CasprojBundle,
  details: { warnings?: string[]; migrations?: string[]; signal?: AbortSignal } = {},
): Promise<ReviewSnapshot> {
  check(details.signal);
  assertBundleDocumentConsistency(bundle.project, bundle.assets);
  assertExpandedEntries(
    bundle.files.map((file) => ({ path: file.path, size: file.bytes.byteLength })),
  );
  const assets = structuredClone(bundle.assets).sort((a, b) => compare(a.id, b.id));
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length)
    throw new Error('同じ素材IDが複数あります。比較できません。');
  const files: ReviewFile[] = [];
  for (const entry of [...bundle.files].sort((a, b) => compare(a.path, b.path))) {
    check(details.signal);
    if (files.at(-1)?.path === entry.path) throw new Error('同じファイルpathが複数あります。');
    files.push({
      path: entry.path,
      bytes: entry.bytes.byteLength,
      sha256: await hash(entry.bytes),
    });
  }
  check(details.signal);
  const project = structuredClone(bundle.project);
  const exportPresets = structuredClone(bundle.exportPresets);
  const fingerprint = await hash(
    new TextEncoder().encode(
      revisionJson({
        project,
        assets,
        files,
        exportPresets,
        readme: bundle.readme ?? DEFAULT_CASPROJ_README,
      }),
    ),
  );
  check(details.signal);
  return {
    readme: bundle.readme ?? DEFAULT_CASPROJ_README,
    projectId: project.id,
    projectName: project.name,
    project,
    assets,
    files,
    exportPresets,
    fingerprint,
    warnings: [...(details.warnings ?? [])],
    migrations: [...(details.migrations ?? [])],
  };
}
/** Pure archive reader. Deliberately does not use the storage import/commit coordinator. */
export async function readReferenceRevision(
  file: Blob,
  signal?: AbortSignal,
): Promise<ReviewSnapshot> {
  assertCasprojInputSize(file.size);
  check(signal);
  const bytes = new Uint8Array(await file.arrayBuffer());
  check(signal);
  const sourceSha256 = await hash(bytes);
  check(signal);
  const parsed: CasprojImportResult = await importCasproj(bytes);
  check(signal);
  const snapshot = await snapshotRevision(parsed.bundle, {
    warnings: parsed.warnings,
    migrations: parsed.appliedMigrations,
    signal,
  });
  return { ...snapshot, sourceSha256 };
}
function changedFiles(before: ReviewFile[], after: ReviewFile[]): AssetRevision['files'] {
  const old = new Map(before.map((file) => [file.path, file]));
  const next = new Map(after.map((file) => [file.path, file]));
  return [...new Set([...old.keys(), ...next.keys()])].sort(compare).flatMap((path) => {
    const a = old.get(path),
      b = next.get(path);
    if (a && b && a.sha256 === b.sha256 && a.bytes === b.bytes) return [];
    return [
      { path, status: !a ? ('added' as const) : !b ? ('removed' as const) : ('changed' as const) },
    ];
  });
}
const FIELD_PANELS: Record<string, InspectionPanelTarget> = {
  canvasSize: 'layers',
  assetType: 'asset-type',
  tile: 'asset-type',
  effect: 'asset-type',
  gimmick: 'asset-type',
  frames: 'timeline',
  animations: 'timeline',
  layers: 'layers',
  textures: 'layers',
  origin: 'game-data',
  colliders: 'game-data',
  anchors: 'game-data',
  gameAttributes: 'game-attributes',
  parts: 'parts',
  rigAnimations: 'parts',
};
function describe(value: unknown, other: unknown): string {
  if (value === undefined) return 'なし';
  const text = revisionJson(value),
    comparison = revisionJson(other);
  if (text.length <= 500) return text;
  let index = 0;
  while (index < text.length && text[index] === comparison[index]) index += 1;
  const start = Math.max(0, index - 80);
  return `位置${index}付近: ${start ? '…' : ''}${text.slice(start, start + 300)}…（${text.length}文字中の一部表示）`;
}
function assetChanges(
  a: Asset,
  b: Asset,
  fields: string[],
): Pick<AssetRevision, 'changes' | 'changesTruncated'> {
  const changes: AssetRevision['changes'] = [];
  let truncated = false;
  const visit = (before: unknown, after: unknown, path: string, field: string) => {
    if (revisionJson(before) === revisionJson(after)) return;
    if (changes.length >= 200) {
      truncated = true;
      return;
    }
    if (
      before &&
      after &&
      typeof before === 'object' &&
      typeof after === 'object' &&
      Array.isArray(before) === Array.isArray(after)
    ) {
      const left = before as Record<string, unknown>,
        right = after as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compare);
      for (const key of keys) {
        visit(
          Object.prototype.hasOwnProperty.call(left, key) ? left[key] : undefined,
          Object.prototype.hasOwnProperty.call(right, key) ? right[key] : undefined,
          Array.isArray(before)
            ? `${path}[${key}]`
            : /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
              ? `${path}.${key}`
              : `${path}[${JSON.stringify(key)}]`,
          field,
        );
        if (truncated) return;
      }
    } else {
      changes.push({
        field,
        path,
        before: describe(before, after),
        after: describe(after, before),
        panel: FIELD_PANELS[field] ?? null,
      });
    }
  };
  for (const field of fields.filter((field) => !['updatedAt', 'createdAt'].includes(field))) {
    visit(
      (a as unknown as Record<string, unknown>)[field],
      (b as unknown as Record<string, unknown>)[field],
      field,
      field,
    );
    if (truncated) break;
  }
  return { changes, changesTruncated: truncated };
}
export function compareRevisions(before: ReviewSnapshot, after: ReviewSnapshot): RevisionReview {
  const old = new Map(before.assets.map((asset) => [asset.id, asset]));
  const next = new Map(after.assets.map((asset) => [asset.id, asset]));
  const ids = [...new Set([...old.keys(), ...next.keys()])].sort(compare);
  const changes = changedFiles(before.files, after.files);
  const assets: AssetRevision[] = ids.map((id) => {
    const a = old.get(id),
      b = next.get(id);
    const fields =
      a && b
        ? [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .sort(compare)
            .filter(
              (key) =>
                revisionJson((a as unknown as Record<string, unknown>)[key]) !==
                revisionJson((b as unknown as Record<string, unknown>)[key]),
            )
        : [];
    const files = changes.filter((file) => file.path.startsWith(`assets/${id}/`));
    return {
      id,
      name: (b ?? a)!.displayName || (b ?? a)!.name,
      status: !a
        ? 'added'
        : !b
          ? 'removed'
          : fields.length || files.length
            ? 'changed'
            : 'unchanged',
      fields,
      ...(a && b ? assetChanges(a, b, fields) : { changes: [], changesTruncated: false }),
      files,
      issues: b ? inspectAsset(b) : [],
    };
  });
  return {
    format: 'chameleon-revision-review',
    version: '0.1.0',
    baseline: {
      projectId: before.projectId,
      projectName: before.projectName,
      fingerprint: before.fingerprint,
    },
    current: {
      projectId: after.projectId,
      projectName: after.projectName,
      fingerprint: after.fingerprint,
    },
    sameProject: before.projectId === after.projectId,
    assets,
    projectChanged: revisionJson(before.project) !== revisionJson(after.project),
    settingsChanged: revisionJson(before.exportPresets) !== revisionJson(after.exportPresets),
    readmeChanged: before.readme !== after.readme,
    otherFiles: changes.filter((file) => !ids.some((id) => file.path.startsWith(`assets/${id}/`))),
    limitations: [
      '読込時の内容比較です。現在の編集や他タブの更新後は再確認してください。',
      '画像はバイト差分です。見た目の同一性・実エンジン動作・性能・利用権利は判定していません。',
      '素材はIDで照合します。同名でもIDが異なれば追加/削除です。',
      '形式移行がある参照版は移行後の意味を比較します。元ZIPそのものの同一性を示すものではありません。',
    ],
  };
}
