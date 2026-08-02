import type {
  Frame,
  FrameColliderCircle,
  FrameColliderOverride,
  FrameColliderRect,
} from './animation';
import type { Asset } from './asset';
import type { Collider } from './collider';

export type FrameColliderOverrideIssueCode =
  | 'asset-collider-id-duplicate'
  | 'frame-override-collider-id-duplicate'
  | 'frame-override-dangling-collider'
  | 'frame-override-shape-mismatch'
  | 'frame-override-non-finite'
  | 'frame-override-non-positive-size';

export interface FrameColliderOverrideIssue {
  code: FrameColliderOverrideIssueCode;
  path: string;
  message: string;
  frameId?: string;
  colliderId: string;
}

export interface FrameColliderOverrideInspection {
  valid: boolean;
  issues: FrameColliderOverrideIssue[];
}

export class FrameColliderOverrideValidationError extends Error {
  readonly issues: FrameColliderOverrideIssue[];

  constructor(issues: FrameColliderOverrideIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'FrameColliderOverrideValidationError';
    this.issues = issues;
  }
}

const KNOWN_ENTRY_KEYS = new Set(['colliderId', 'rect', 'circle', 'visible']);

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function geometryNumbers(
  override: FrameColliderOverride,
): Array<{ key: string; value: number; positive?: boolean }> {
  if (override.rect) {
    return [
      { key: 'rect/x', value: override.rect.x },
      { key: 'rect/y', value: override.rect.y },
      { key: 'rect/width', value: override.rect.width, positive: true },
      { key: 'rect/height', value: override.rect.height, positive: true },
    ];
  }
  if (override.circle) {
    return [
      { key: 'circle/x', value: override.circle.x },
      { key: 'circle/y', value: override.circle.y },
      { key: 'circle/radius', value: override.circle.radius, positive: true },
    ];
  }
  return [];
}

/** JSON Schemaで扱わない参照・shape・有限値の意味検証。入力は変更しない。 */
export function inspectFrameColliderOverrides(asset: Asset): FrameColliderOverrideInspection {
  const issues: FrameColliderOverrideIssue[] = [];
  const colliderById = new Map<string, Collider>();
  asset.colliders.forEach((collider, index) => {
    if (colliderById.has(collider.id)) {
      issues.push({
        code: 'asset-collider-id-duplicate',
        path: `/colliders/${index}/id`,
        message: `Asset共通collider ID「${collider.id}」が重複しています。`,
        colliderId: collider.id,
      });
    } else {
      colliderById.set(collider.id, collider);
    }
  });

  (asset.frames ?? []).forEach((frame, frameIndex) => {
    const seen = new Set<string>();
    (frame.colliderOverrides ?? []).forEach((override, overrideIndex) => {
      const basePath = `/frames/${frameIndex}/colliderOverrides/${overrideIndex}`;
      if (seen.has(override.colliderId)) {
        issues.push({
          code: 'frame-override-collider-id-duplicate',
          path: `${basePath}/colliderId`,
          message: `Frame「${frame.id}」でcollider「${override.colliderId}」の上書きが重複しています。`,
          frameId: frame.id,
          colliderId: override.colliderId,
        });
      }
      seen.add(override.colliderId);

      const collider = colliderById.get(override.colliderId);
      if (!collider) {
        issues.push({
          code: 'frame-override-dangling-collider',
          path: `${basePath}/colliderId`,
          message: `Frame「${frame.id}」が存在しないcollider「${override.colliderId}」を参照しています。`,
          frameId: frame.id,
          colliderId: override.colliderId,
        });
      } else if (
        (override.rect && collider.shape !== 'rect') ||
        (override.circle && collider.shape !== 'circle')
      ) {
        const geometryKey = override.rect ? 'rect' : 'circle';
        issues.push({
          code: 'frame-override-shape-mismatch',
          path: `${basePath}/${geometryKey}`,
          message: `Frame「${frame.id}」のgeometryとcollider「${override.colliderId}」のshapeが一致しません。`,
          frameId: frame.id,
          colliderId: override.colliderId,
        });
      }

      for (const item of geometryNumbers(override)) {
        if (!isFiniteNumber(item.value)) {
          issues.push({
            code: 'frame-override-non-finite',
            path: `${basePath}/${item.key}`,
            message: `Frame「${frame.id}」の${item.key.replace('/', '.')}は有限数である必要があります。`,
            frameId: frame.id,
            colliderId: override.colliderId,
          });
        } else if (item.positive && item.value <= 0) {
          issues.push({
            code: 'frame-override-non-positive-size',
            path: `${basePath}/${item.key}`,
            message: `Frame「${frame.id}」の${item.key.replace('/', '.')}は0より大きい必要があります。`,
            frameId: frame.id,
            colliderId: override.colliderId,
          });
        }
      }
    });
  });
  return { valid: issues.length === 0, issues };
}

export function assertFrameColliderOverridesValid(asset: Asset): void {
  const inspection = inspectFrameColliderOverrides(asset);
  if (!inspection.valid) {
    throw new FrameColliderOverrideValidationError(inspection.issues);
  }
}

export function hasCanonicalFrameColliderOverrides(asset: Asset): boolean {
  return (asset.frames ?? []).some((frame) => (frame.colliderOverrides?.length ?? 0) > 0);
}

export function findFrameColliderOverride(
  frame: Frame,
  colliderId: string,
): FrameColliderOverride | undefined {
  return frame.colliderOverrides?.find((entry) => entry.colliderId === colliderId);
}

/** Frameのfield単位fallbackを適用した有効collider一覧を返す。 */
export function resolveFrameColliders(asset: Asset, frameId: string): Collider[] {
  assertFrameColliderOverridesValid(asset);
  const frame = (asset.frames ?? []).find((entry) => entry.id === frameId);
  if (!frame) {
    return asset.colliders;
  }
  const overrideById = new Map(
    (frame.colliderOverrides ?? []).map((override) => [override.colliderId, override]),
  );
  return asset.colliders.map((collider) => {
    const override = overrideById.get(collider.id);
    if (!override) {
      return collider;
    }
    if (collider.shape === 'rect') {
      return {
        ...collider,
        visible: override.visible ?? collider.visible,
        rect: override.rect ? structuredClone(override.rect) : collider.rect,
      };
    }
    return {
      ...collider,
      visible: override.visible ?? collider.visible,
      circle: override.circle ? structuredClone(override.circle) : collider.circle,
    };
  });
}

export type FrameColliderOverrideMutationErrorCode =
  'frame-not-found' | 'collider-not-found' | 'shape-mismatch' | 'unknown-fields-would-remain';

export type FrameColliderOverrideMutationResult =
  | { ok: true; changed: boolean; asset: Asset }
  | {
      ok: false;
      changed: false;
      asset: Asset;
      code: FrameColliderOverrideMutationErrorCode;
      message: string;
    };

function mutationError(
  asset: Asset,
  code: FrameColliderOverrideMutationErrorCode,
  message: string,
): FrameColliderOverrideMutationResult {
  return { ok: false, changed: false, asset, code, message };
}

function jsonValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValueEqual(value, right[index]))
    );
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonValueEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function mergeGeometry<T extends FrameColliderRect | FrameColliderCircle>(
  current: T | undefined,
  next: T,
): T {
  return {
    ...(current ? structuredClone(current) : {}),
    ...structuredClone(next),
  } as T;
}

interface PreservedEntryFields {
  colliderId: string;
  visible?: boolean;
  [key: string]: unknown;
}

function preserveNonGeometryFields(
  entry: FrameColliderOverride | undefined,
  colliderId: string,
): PreservedEntryFields {
  const fields = structuredClone(entry ?? { colliderId }) as PreservedEntryFields;
  delete fields.rect;
  delete fields.circle;
  return fields;
}

function withUpdatedFrame(
  asset: Asset,
  frameId: string,
  update: (frame: Frame) => Frame,
  now: Date,
): Asset {
  return {
    ...asset,
    frames: (asset.frames ?? []).map((frame) => (frame.id === frameId ? update(frame) : frame)),
    updatedAt: now.toISOString(),
  };
}

function writeEntries(frame: Frame, entries: FrameColliderOverride[]): Frame {
  if (entries.length > 0) {
    return { ...frame, colliderOverrides: entries };
  }
  const next = { ...frame };
  delete next.colliderOverrides;
  return next;
}

function unknownEntryKeys(entry: FrameColliderOverride): string[] {
  return Object.keys(entry).filter((key) => !KNOWN_ENTRY_KEYS.has(key));
}

function removeOrRejectEmptyEntry(
  asset: Asset,
  frameId: string,
  colliderId: string,
  nextEntry: FrameColliderOverride,
  now: Date,
): FrameColliderOverrideMutationResult {
  if (nextEntry.rect || nextEntry.circle || nextEntry.visible !== undefined) {
    return {
      ok: true,
      changed: true,
      asset: withUpdatedFrame(
        asset,
        frameId,
        (frame) =>
          writeEntries(
            frame,
            (frame.colliderOverrides ?? []).map((entry) =>
              entry.colliderId === colliderId ? nextEntry : entry,
            ),
          ),
        now,
      ),
    };
  }
  const unknownKeys = unknownEntryKeys(nextEntry);
  if (unknownKeys.length > 0) {
    return mutationError(
      asset,
      'unknown-fields-would-remain',
      `未知field（${unknownKeys.join('、')}）だけが残るため解除できません。「このFrameの上書きをすべて解除」を使ってください。`,
    );
  }
  return resetFrameColliderOverride(asset, frameId, colliderId, now);
}

export function setFrameColliderGeometry(
  asset: Asset,
  frameId: string,
  colliderId: string,
  geometry: FrameColliderRect | FrameColliderCircle,
  now = new Date(),
): FrameColliderOverrideMutationResult {
  const frame = (asset.frames ?? []).find((entry) => entry.id === frameId);
  if (!frame) return mutationError(asset, 'frame-not-found', '選択したFrameが見つかりません。');
  const collider = asset.colliders.find((entry) => entry.id === colliderId);
  if (!collider)
    return mutationError(asset, 'collider-not-found', '選択した当たり判定が見つかりません。');
  const isRect = 'width' in geometry;
  if ((collider.shape === 'rect') !== isRect) {
    return mutationError(
      asset,
      'shape-mismatch',
      '共通当たり判定とgeometryのshapeが一致しません。',
    );
  }
  const existing = findFrameColliderOverride(frame, colliderId);
  const entryFields = preserveNonGeometryFields(existing, colliderId);
  let nextEntry: FrameColliderOverride;
  if (isRect) {
    const nextGeometry = mergeGeometry(existing?.rect, geometry as FrameColliderRect);
    if (existing?.rect && jsonValueEqual(existing.rect, nextGeometry)) {
      return { ok: true, changed: false, asset };
    }
    nextEntry = { ...entryFields, colliderId, rect: nextGeometry };
  } else {
    const nextGeometry = mergeGeometry(existing?.circle, geometry as FrameColliderCircle);
    if (existing?.circle && jsonValueEqual(existing.circle, nextGeometry)) {
      return { ok: true, changed: false, asset };
    }
    nextEntry = { ...entryFields, colliderId, circle: nextGeometry };
  }
  const nextEntries = existing
    ? (frame.colliderOverrides ?? []).map((entry) =>
        entry.colliderId === colliderId ? nextEntry : entry,
      )
    : [...(frame.colliderOverrides ?? []), nextEntry];
  return {
    ok: true,
    changed: true,
    asset: withUpdatedFrame(asset, frameId, (entry) => writeEntries(entry, nextEntries), now),
  };
}

export function setFrameColliderVisible(
  asset: Asset,
  frameId: string,
  colliderId: string,
  visible: boolean | undefined,
  now = new Date(),
): FrameColliderOverrideMutationResult {
  const frame = (asset.frames ?? []).find((entry) => entry.id === frameId);
  if (!frame) return mutationError(asset, 'frame-not-found', '選択したFrameが見つかりません。');
  if (!asset.colliders.some((entry) => entry.id === colliderId))
    return mutationError(asset, 'collider-not-found', '選択した当たり判定が見つかりません。');
  const existing = findFrameColliderOverride(frame, colliderId);
  if (existing?.visible === visible || (!existing && visible === undefined)) {
    return { ok: true, changed: false, asset };
  }
  if (!existing && visible !== undefined) {
    return {
      ok: true,
      changed: true,
      asset: withUpdatedFrame(
        asset,
        frameId,
        (entry) =>
          writeEntries(entry, [...(entry.colliderOverrides ?? []), { colliderId, visible }]),
        now,
      ),
    };
  }
  const nextEntry = { ...structuredClone(existing!) };
  if (visible === undefined) delete nextEntry.visible;
  else nextEntry.visible = visible;
  return removeOrRejectEmptyEntry(asset, frameId, colliderId, nextEntry, now);
}

export function resetFrameColliderGeometry(
  asset: Asset,
  frameId: string,
  colliderId: string,
  now = new Date(),
): FrameColliderOverrideMutationResult {
  const frame = (asset.frames ?? []).find((entry) => entry.id === frameId);
  if (!frame) return mutationError(asset, 'frame-not-found', '選択したFrameが見つかりません。');
  const existing = findFrameColliderOverride(frame, colliderId);
  if (!existing?.rect && !existing?.circle) return { ok: true, changed: false, asset };
  const nextEntry = { ...structuredClone(existing) };
  delete nextEntry.rect;
  delete nextEntry.circle;
  return removeOrRejectEmptyEntry(asset, frameId, colliderId, nextEntry, now);
}

export function resetFrameColliderOverride(
  asset: Asset,
  frameId: string,
  colliderId: string,
  now = new Date(),
): FrameColliderOverrideMutationResult {
  const frame = (asset.frames ?? []).find((entry) => entry.id === frameId);
  if (!frame) return mutationError(asset, 'frame-not-found', '選択したFrameが見つかりません。');
  if (!findFrameColliderOverride(frame, colliderId)) return { ok: true, changed: false, asset };
  return {
    ok: true,
    changed: true,
    asset: withUpdatedFrame(
      asset,
      frameId,
      (entry) =>
        writeEntries(
          entry,
          (entry.colliderOverrides ?? []).filter((item) => item.colliderId !== colliderId),
        ),
      now,
    ),
  };
}

export function frameColliderReferenceReason(asset: Asset, colliderId: string): string | undefined {
  const frames = (asset.frames ?? []).filter((frame) =>
    frame.colliderOverrides?.some((entry) => entry.colliderId === colliderId),
  );
  if (frames.length === 0) return undefined;
  return `Frame上書き（${frames.map((frame) => frame.name || frame.id).join('、')}）が参照しているため削除できません。先に各Frameの上書きをすべて解除してください。`;
}
