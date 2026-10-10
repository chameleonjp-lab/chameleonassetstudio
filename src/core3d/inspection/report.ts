import { NATIVE_RENDER_PROFILE as R } from '../profile/renderProfile';
import { validateProject, type Project3D } from '../model/project';
import { inspectNativeImage } from '../model/nativeImageMetadata';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../profile/assetIoProfile';
import { inspectStatistics, type ProjectStatistics } from './statistics';
import { inspectSourceProfile, type SourceProfile } from './sourceProfile';
export type InspectionTarget =
  | { kind: 'project' }
  | { kind: 'node'; nodeId: string }
  | {
      kind: 'mesh';
      meshId: string;
      nodeId?: string;
      element?: { kind: 'vertex' | 'face'; id: string };
    }
  | { kind: 'material'; materialId: string; section: 'factors' | 'texture' }
  | { kind: 'source'; sourceId: string; materialId?: string }
  | { kind: 'skin'; skinId: string; nodeId?: string; jointId?: string; vertexId?: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'game'; section: 'settings' | 'anchors' | 'colliders'; id?: string };
export interface InspectionIssue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  target: InspectionTarget;
  message: string;
  impact: string;
  remedy: string;
  exportRelevant: boolean;
}
export interface InspectionSnapshot {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  unavailableBlobs: { blobId: string; reason: string }[];
  estimatedBytes: number;
}
export interface InspectionReport {
  projectId: string;
  revision: number;
  profileId: string;
  statistics: ProjectStatistics;
  sources: SourceProfile[];
  issues: InspectionIssue[];
}
/** Unlike export capture, missing bytes produce partial inspection, never invented zeroes. */
export function captureInspectionSnapshot(
  project: Project3D,
  readBlob: (id: string) => Uint8Array,
): InspectionSnapshot {
  validateProject(project);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(project)).length;
  assertIoBudget(jsonBytes, P.jsonBytes, 'Inspection JSON');
  const blobs = new Map<string, Uint8Array>();
  const unavailableBlobs: InspectionSnapshot['unavailableBlobs'] = [];
  let retained = 0;
  for (const id of project.blobIds) {
    let bytes: Uint8Array;
    try {
      bytes = readBlob(id);
    } catch (error) {
      unavailableBlobs.push({
        blobId: id,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    retained += bytes.length;
    assertIoBudget(retained, P.totalBlobBytes, 'Inspection blobs');
    blobs.set(id, bytes.slice());
  }
  const estimatedBytes = jsonBytes * 4 + retained * 4;
  assertIoBudget(estimatedBytes, P.estimatedPeakBytes, 'Inspection estimate');
  return { project: structuredClone(project), blobs, unavailableBlobs, estimatedBytes };
}
export const isInspectionStale = (
  report: InspectionReport,
  project: Pick<Project3D, 'id' | 'revision'>,
) => report.projectId !== project.id || report.revision !== project.revision;
export async function buildInspectionReport(
  snapshot: InspectionSnapshot,
): Promise<InspectionReport> {
  const p = snapshot.project;
  validateProject(p);
  assertIoBudget(snapshot.estimatedBytes, P.estimatedPeakBytes, 'Inspection estimate');
  const issues: InspectionIssue[] = [];
  let omittedIssues = 0;
  const add = (
    code: string,
    severity: InspectionIssue['severity'],
    target: InspectionTarget,
    message: string,
    impact: string,
    remedy: string,
    exportRelevant = true,
  ) => {
    if (issues.length < 512)
      issues.push({ code, severity, target, message, impact, remedy, exportRelevant });
    else omittedIssues++;
  };
  const vertices = p.meshes.reduce((n, mesh) => n + mesh.vertices.length, 0);
  const faces = p.meshes.reduce((n, mesh) => n + mesh.faces.length, 0);
  if (p.nodes.length > R.nodes || vertices > R.vertices || faces > R.triangles)
    add(
      'render-budget-profile',
      'warning',
      { kind: 'project' },
      '現在の表示用プロファイルの数量上限を超えています。',
      'GLB原本の保持・入出力上限と表示・編集の数量上限は異なります。現在の3D表示は保証されません。',
      '原本と編集用バックアップを保持してください。数量を調整する場合は別コピーを作り、元作品を自動削減しないでください。',
      false,
    );
  for (const { blobId, reason } of snapshot.unavailableBlobs)
    add(
      'missing-blob',
      'error',
      { kind: 'project' },
      `保持データを読み出せません: ${blobId}`,
      '原本または画像を含む出力は確認できません。',
      `元のバックアップから別コピーを復元してください。${reason}`,
    );
  for (const mesh of p.meshes) {
    if (!mesh.faces.length)
      add(
        'empty-mesh',
        'error',
        { kind: 'mesh', meshId: mesh.id },
        '面のないメッシュがあります。',
        'GLBに書き出せません。',
        '面を追加するか、不要な部品を確認してください。',
      );
    for (const f of mesh.faces) {
      const target: InspectionTarget = {
        kind: 'mesh',
        meshId: mesh.id,
        element: { kind: 'face', id: f.id },
      };
      if (f.vertexIds.length !== 3)
        add(
          'non-triangle',
          'error',
          target,
          '三角形以外の面があります。',
          '現在のGLB出力対象外です。',
          '元を保全して三角形へ分割してください。',
        );
      if (f.normals?.some((n) => Math.hypot(...n) === 0))
        add(
          'zero-normal',
          'error',
          target,
          '長さ0の法線があります。',
          'GLBへ書き出せません。',
          '法線を再計算してください。',
        );
      else if (f.normals?.some((n) => Math.abs(Math.hypot(...n) - 1) > 1e-5))
        add(
          'normal-normalized',
          'warning',
          target,
          '単位長でない法線があります。',
          '出力派生データだけ正規化します。',
          '正本の法線を確認してください。',
        );
      const material = p.materials.find((m) => m.id === f.materialId);
      if (material?.textureBlobId && !f.uv)
        add(
          'missing-uv',
          'error',
          target,
          '画像付き材質にUVがありません。',
          '画像の位置が定義されていません。',
          'UVを設定してください。',
        );
    }
  }
  for (const m of p.materials) {
    if (m.textureBlobId) {
      const bytes = snapshot.blobs.get(m.textureBlobId);
      if (!bytes)
        add(
          'missing-texture',
          'error',
          { kind: 'material', materialId: m.id, section: 'texture' },
          '材質の画像が読み出せません。',
          '表示・出力の一致を確認できません。',
          '原本を保全して画像を読み直してください。',
        );
      else
        try {
          inspectNativeImage(bytes);
        } catch {
          add(
            'image-header',
            'warning',
            { kind: 'material', materialId: m.id, section: 'texture' },
            '標準画像ヘッダーを確認できません。',
            'WebP変換など実デコードの確認が必要です。',
            '画像形式と寸法を確認してください。',
          );
        }
    }
    if (!m.alphaMode || m.alphaMode === 'LEGACY_AUTO')
      add(
        'legacy-alpha',
        'warning',
        { kind: 'material', materialId: m.id, section: 'factors' },
        '互換用の自動透過設定です。',
        'GLBは明示的な透過方式へ変換します。',
        '不透明・切抜き・半透明を確認してください。',
      );
  }
  for (const n of p.nodes)
    if (n.visible === false)
      add(
        'hidden-retained',
        'info',
        { kind: 'node', nodeId: n.id },
        '非表示部品があります。',
        'GLBでは部品を保持し、表示状態を保証しません。',
        '配布対象の部品を確認してください。',
      );
  for (const c of p.clips)
    if (!c.tracks.some((t) => t.keys.length))
      add(
        'empty-clip',
        'info',
        { kind: 'clip', clipId: c.id },
        'キーのないアニメーションです。',
        'GLB animationは作らずsidecarに情報を保持します。',
        '必要ならキーを追加してください。',
      );
  const sources: SourceProfile[] = [];
  const sourceCache = new Map<string, SourceProfile>();
  if (p.sources.length > 256)
    add(
      'source-inspection-limit',
      'warning',
      { kind: 'project' },
      '原本情報は先頭256件まで検査します。',
      '残りの原本は未検査で、保持データは変更しません。',
      '必要な原本の利用条件を別途確認してください。',
    );
  for (const source of p.sources.slice(0, 256)) {
    const key = source.blobId + ':' + source.mimeType;
    let cached = sourceCache.get(key);
    if (!cached) {
      cached = await inspectSourceProfile(source, snapshot.blobs.get(source.blobId));
      sourceCache.set(key, cached);
    }
    const profile: SourceProfile = {
      ...cached,
      sourceId: source.id,
      declaredRights: source.rights.declared,
      storedEmbeddedRights: source.rights.embedded,
    };
    sources.push(profile);
    if (profile.status !== 'inspected')
      add(
        'source-metadata',
        profile.status === 'invalid' ? 'error' : 'warning',
        { kind: 'source', sourceId: source.id },
        '原本情報を完全には検査できません。',
        `状態: ${profile.status}。保持原本は変更しません。`,
        '元の形式・利用条件を確認してください。',
      );
    if (!profile.hashVerified)
      add(
        'source-hash',
        'error',
        { kind: 'source', sourceId: source.id },
        '原本のハッシュを確認できません。',
        '原本の同一性を確認できません。',
        '元のバックアップと照合してください。',
      );
    if (!source.rights.declared && !source.rights.embedded)
      add(
        'source-terms-unknown',
        'warning',
        { kind: 'source', sourceId: source.id },
        '原本の利用条件が未記入です。',
        '配布許諾は確認できません。',
        '権利者の利用条件を確認して申告欄へ記録してください。',
      );
    if (source.rights.declared || source.rights.embedded)
      add(
        'source-terms',
        'warning',
        { kind: 'source', sourceId: source.id },
        '原本の利用条件を確認してください。',
        '申告と埋込情報は許諾の証明ではありません。',
        '配布前に権利者の条件を確認してください。',
      );
    if (profile.extensionsRequired.length || profile.sourceOnlyFeatures.length)
      add(
        'source-only',
        'warning',
        { kind: 'source', sourceId: source.id },
        `原本だけの機能: ${[...profile.extensionsRequired, ...profile.sourceOnlyFeatures].slice(0, 16).join(', ')}${profile.extensionsRequired.length + profile.sourceOnlyFeatures.length > 16 ? '（ほかは原本情報を確認）' : ''}`,
        '編集・表示・出力の対応範囲は原本と異なります。',
        '原本情報と配布先の対応を確認してください。',
      );
  }
  const statistics = inspectStatistics(p, snapshot.blobs);
  if (statistics.bounds.status === 'unknown')
    add(
      'bounds-unknown',
      'warning',
      { kind: 'project' },
      '保存姿勢の寸法を算出できません。',
      statistics.bounds.reason,
      '変換や形状の値を確認してください。',
    );
  if (omittedIssues)
    issues.push({
      code: 'issue-limit',
      severity: 'warning',
      target: { kind: 'project' },
      message: `警告 ${omittedIssues} 件は件数上限により表示を省略しました。`,
      impact: '未表示の問題があり、警告なしとは判定できません。',
      remedy: '表示された問題を確認してから再検査してください。',
      exportRelevant: true,
    });
  return {
    projectId: p.id,
    revision: p.revision,
    profileId: P.id,
    statistics,
    sources,
    issues,
  };
}
export function exportInspectionWarnings(report: InspectionReport): string[] {
  return report.issues
    .filter((i) => i.exportRelevant)
    .map((i) => `${i.code} ${JSON.stringify(i.target)}: ${i.message} ${i.impact}`);
}
