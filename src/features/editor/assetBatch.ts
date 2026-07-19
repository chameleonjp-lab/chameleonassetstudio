import {
  inspectLinkedVariant,
  prepareLinkedVariantRefresh,
  type Asset,
  type AssetFamily,
  type LinkedAssetFamilyVariant,
  type PaletteReplacement,
  type Project,
  type Size,
} from '../../core/model';
import {
  MAX_ASSET_BATCH_REVISION_TARGETS,
  getStorageWarningLevel,
  type AssetBatchReadExpectation,
  type AssetBatchRevisionTarget,
  type SaveAssetBatchRevisionInput,
  type StorageUsage,
  type StorageWarningLevel,
} from '../../core/storage';
import {
  inspectCanvasResizeOverflow,
  resizeAssetCanvas,
  type CanvasResizeAnchor,
  type CanvasResizeOverflowCounts,
} from './canvasResize';
import { validateBlankCanvasSize } from './blankAsset';

export type AssetBatchOperation = 'linked-refresh' | 'palette' | 'canvas-resize';

export interface LinkedRefreshBatchConfig {
  type: 'linked-refresh';
  targetAssetIds: string[];
}

export interface PaletteBatchTargetConfig {
  assetId: string;
  layerId: string;
}

export interface PaletteBatchConfig {
  type: 'palette';
  targets: PaletteBatchTargetConfig[];
  replacements: PaletteReplacement[];
  tolerance: number;
}

export interface CanvasResizeBatchConfig {
  type: 'canvas-resize';
  targetAssetIds: string[];
  size: Size;
  anchor: CanvasResizeAnchor;
}

export type AssetBatchConfig =
  LinkedRefreshBatchConfig | PaletteBatchConfig | CanvasResizeBatchConfig;

export type AssetBatchTargetStatus =
  'ready' | 'warning' | 'manual-adjusted' | 'ineligible' | 'up-to-date';

export interface AssetBatchProgress {
  completed: number;
  total: number;
  currentLabel: string;
  percent: number;
}

export interface AssetBatchBlobRevision {
  key: string;
  before: Blob;
  after: Blob;
}

export interface AssetBatchProjectVariantUpdate {
  familyId: string;
  variant: LinkedAssetFamilyVariant;
}

export interface PreparedAssetBatchTarget {
  id: string;
  assetId: string;
  label: string;
  status: AssetBatchTargetStatus;
  reasons: string[];
  changes: string[];
  estimatedChangeBytes: number;
  beforeAsset?: Asset;
  afterAsset?: Asset;
  blobs: AssetBatchBlobRevision[];
  readExpectations: AssetBatchReadExpectation[];
  projectVariantUpdate?: AssetBatchProjectVariantUpdate;
  canvasWarnings?: CanvasResizeOverflowCounts;
}

export interface AssetBatchPreview {
  operation: AssetBatchOperation;
  preparedAt: string;
  beforeProject: Project;
  targets: PreparedAssetBatchTarget[];
  storageUsage: StorageUsage;
}

export interface AssetBatchPreparationDependencies {
  loadAssetBlobs(asset: Asset): Promise<Map<string, Blob>>;
  loadBlob(key: string): Promise<Blob | null>;
  transformPaletteBlob(
    source: Blob,
    replacements: readonly PaletteReplacement[],
    tolerance: number,
    onProgress?: (progress: number) => void,
  ): Promise<{ blob: Blob; changed: boolean }>;
  getStorageUsage(): Promise<StorageUsage>;
}

export class AssetBatchCancelledError extends Error {
  constructor() {
    super('一括処理のpreviewを取り消しました。正本は変更されていません。');
    this.name = 'AssetBatchCancelledError';
  }
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AssetBatchCancelledError();
  }
}

/** targetを常に1件ずつ準備し、取消時は準備済み出力もcommitへ渡さない。 */
export async function prepareSequentialBatchTargets<TInput, TOutput>(options: {
  inputs: readonly TInput[];
  signal: AbortSignal;
  labelFor(input: TInput): string;
  prepare(input: TInput, onProgress: (progress: number) => void): Promise<TOutput>;
  onProgress?: (progress: AssetBatchProgress) => void;
}): Promise<TOutput[]> {
  const total = options.inputs.length;
  const result: TOutput[] = [];
  for (let index = 0; index < total; index += 1) {
    throwIfCancelled(options.signal);
    const input = options.inputs[index];
    const currentLabel = options.labelFor(input);
    const report = (targetProgress: number) => {
      const bounded = Math.max(0, Math.min(1, targetProgress));
      options.onProgress?.({
        completed: index,
        total,
        currentLabel,
        percent: total === 0 ? 100 : ((index + bounded) / total) * 100,
      });
    };
    report(0);
    const output = await options.prepare(input, report);
    throwIfCancelled(options.signal);
    result.push(output);
    options.onProgress?.({
      completed: index + 1,
      total,
      currentLabel,
      percent: total === 0 ? 100 : ((index + 1) / total) * 100,
    });
  }
  return result;
}

function configTargets(config: AssetBatchConfig): Array<string | PaletteBatchTargetConfig> {
  return config.type === 'palette' ? config.targets : config.targetAssetIds;
}

export function assertAssetBatchTargetCount(config: AssetBatchConfig): void {
  const count = configTargets(config).length;
  if (count < 1 || count > MAX_ASSET_BATCH_REVISION_TARGETS) {
    throw new Error(
      `一括処理の対象数は1〜${MAX_ASSET_BATCH_REVISION_TARGETS}件にしてください: ${count}`,
    );
  }
  const assetIds = configTargets(config).map((target) =>
    typeof target === 'string' ? target : target.assetId,
  );
  if (new Set(assetIds).size !== assetIds.length) {
    throw new Error('同じAssetを一括処理へ複数回指定できません。1 Assetにつき1 targetです。');
  }
}

function familyVariantTarget(
  project: Project,
  assetId: string,
): { family: AssetFamily; variant: LinkedAssetFamilyVariant } | null {
  for (const family of project.families ?? []) {
    const variant = family.variants.find(
      (candidate): candidate is LinkedAssetFamilyVariant =>
        candidate.assetId === assetId && candidate.kind !== 'manual',
    );
    if (variant) {
      return { family, variant };
    }
  }
  return null;
}

function unavailableTarget(
  id: string,
  assetId: string,
  label: string,
  reason: string,
): PreparedAssetBatchTarget {
  return {
    id,
    assetId,
    label,
    status: 'ineligible',
    reasons: [reason],
    changes: [],
    estimatedChangeBytes: 0,
    blobs: [],
    readExpectations: [],
  };
}

async function prepareLinkedTarget(options: {
  project: Project;
  assets: Asset[];
  assetId: string;
  now: Date;
  signal: AbortSignal;
  dependencies: AssetBatchPreparationDependencies;
  onProgress(progress: number): void;
}): Promise<PreparedAssetBatchTarget> {
  const membership = familyVariantTarget(options.project, options.assetId);
  const targetAsset = options.assets.find((asset) => asset.id === options.assetId);
  const baseAsset = options.assets.find((asset) => asset.id === membership?.family.baseAssetId);
  const label = targetAsset?.displayName ?? options.assetId;
  const id = `linked:${membership?.family.id ?? 'missing'}:${options.assetId}`;
  if (!membership || !targetAsset || !baseAsset) {
    return unavailableTarget(id, options.assetId, label, 'Familyまたは参照Assetを読み込めません。');
  }

  options.onProgress(0.1);
  const [baseBlobs, variantBlobs] = await Promise.all([
    options.dependencies.loadAssetBlobs(baseAsset),
    options.dependencies.loadAssetBlobs(targetAsset),
  ]);
  throwIfCancelled(options.signal);
  options.onProgress(0.3);
  const inspection = await inspectLinkedVariant({
    base: baseAsset,
    variantAsset: targetAsset,
    variant: membership.variant,
    baseBlobs,
    variantBlobs,
  });
  throwIfCancelled(options.signal);
  options.onProgress(0.55);
  if (inspection.status === 'ineligible') {
    return {
      ...unavailableTarget(id, options.assetId, label, inspection.reasons.join(' ')),
      reasons: inspection.reasons,
    };
  }
  if (inspection.status === 'up-to-date') {
    return {
      id,
      assetId: options.assetId,
      label,
      status: 'up-to-date',
      reasons: ['baseとvariantは最終同期時点から変わっていません。'],
      changes: [],
      estimatedChangeBytes: 0,
      beforeAsset: targetAsset,
      afterAsset: targetAsset,
      blobs: [],
      readExpectations: [],
    };
  }

  const artifact = await prepareLinkedVariantRefresh({
    base: baseAsset,
    variantAsset: targetAsset,
    variant: membership.variant,
    baseBlobs,
    variantBlobs,
    inspection,
    transformPaletteBlob: async (blob, replacements, tolerance) => {
      const transformed = await options.dependencies.transformPaletteBlob(
        blob,
        replacements,
        tolerance,
        (progress) => options.onProgress(0.55 + progress * 0.35),
      );
      throwIfCancelled(options.signal);
      return transformed.blob;
    },
    now: options.now,
  });
  throwIfCancelled(options.signal);
  options.onProgress(0.95);
  const changedPaths = new Set(artifact.blobChanges.map((change) => change.targetPath));
  const blobs = artifact.blobChanges.map((change) => ({
    key: `${targetAsset.id}/${change.targetPath}`,
    before: change.before,
    after: change.after,
  }));
  return {
    id,
    assetId: targetAsset.id,
    label,
    status: inspection.manualAdjusted ? 'manual-adjusted' : 'ready',
    reasons: inspection.reasons,
    changes: artifact.changes,
    estimatedChangeBytes: blobs.reduce((sum, blob) => sum + blob.after.size, 0),
    beforeAsset: structuredClone(targetAsset),
    afterAsset: artifact.afterAsset,
    blobs,
    readExpectations: [
      {
        asset: structuredClone(baseAsset),
        blobs: artifact.baseReadBlobPaths.map((path) => ({
          key: `${baseAsset.id}/${path}`,
          expected: baseBlobs.get(path)!,
        })),
      },
      {
        asset: structuredClone(targetAsset),
        blobs: artifact.variantReadBlobPaths
          .filter((path) => !changedPaths.has(path))
          .map((path) => ({
            key: `${targetAsset.id}/${path}`,
            expected: variantBlobs.get(path)!,
          })),
      },
    ],
    projectVariantUpdate: {
      familyId: membership.family.id,
      variant: artifact.nextVariant,
    },
  };
}

async function preparePaletteTarget(options: {
  assets: Asset[];
  target: PaletteBatchTargetConfig;
  config: PaletteBatchConfig;
  now: Date;
  signal: AbortSignal;
  dependencies: AssetBatchPreparationDependencies;
  onProgress(progress: number): void;
}): Promise<PreparedAssetBatchTarget> {
  const asset = options.assets.find((candidate) => candidate.id === options.target.assetId);
  const layer = asset?.layers.find((candidate) => candidate.id === options.target.layerId);
  const texture = asset?.textures.find((candidate) => candidate.id === layer?.textureId);
  const label = asset
    ? `${asset.displayName} / ${layer?.name ?? options.target.layerId}`
    : options.target.assetId;
  const id = `palette:${options.target.assetId}:${options.target.layerId}`;
  if (!asset || !layer || !texture) {
    return unavailableTarget(
      id,
      options.target.assetId,
      label,
      'Asset、layer、TextureRefの対応がありません。',
    );
  }
  if (layer.layerType !== 'image' || texture.kind !== 'edit') {
    return unavailableTarget(
      id,
      asset.id,
      label,
      'palette置換はedit画像layerだけを対象にできます。',
    );
  }
  const sharingLayers = asset.layers.filter((candidate) => candidate.textureId === texture.id);
  if (sharingLayers.length !== 1) {
    return unavailableTarget(
      id,
      asset.id,
      label,
      `同じedit TextureRefを${sharingLayers.length} layerが共有しているため、暗黙に他layerを変更できません。`,
    );
  }

  const key = `${asset.id}/${texture.path}`;
  options.onProgress(0.1);
  const before = await options.dependencies.loadBlob(key);
  if (!before) {
    return unavailableTarget(
      id,
      asset.id,
      label,
      `編集用画像Blobが見つかりません: ${texture.path}`,
    );
  }
  const transformed = await options.dependencies.transformPaletteBlob(
    before,
    options.config.replacements,
    options.config.tolerance,
    (progress) => options.onProgress(0.1 + progress * 0.8),
  );
  throwIfCancelled(options.signal);
  if (!transformed.changed) {
    return {
      id,
      assetId: asset.id,
      label,
      status: 'up-to-date',
      reasons: ['指定した置換元色に一致するpixelがありません。'],
      changes: [],
      estimatedChangeBytes: 0,
      beforeAsset: asset,
      afterAsset: asset,
      blobs: [],
      readExpectations: [],
    };
  }
  if (transformed.blob.type !== texture.mimeType) {
    return unavailableTarget(
      id,
      asset.id,
      label,
      `palette変換後BlobのMIME typeが一致しません: ${texture.path}`,
    );
  }
  const afterAsset: Asset = {
    ...structuredClone(asset),
    updatedAt: options.now.toISOString(),
    textures: asset.textures.map((candidate) =>
      candidate.id === texture.id ? { ...candidate, size: { ...candidate.size } } : candidate,
    ),
  };
  options.onProgress(0.95);
  return {
    id,
    assetId: asset.id,
    label,
    status: 'ready',
    reasons: [],
    changes: [
      `layer「${layer.name}」の${texture.path}へ色置換${options.config.replacements.length}件を適用`,
    ],
    estimatedChangeBytes: transformed.blob.size,
    beforeAsset: structuredClone(asset),
    afterAsset,
    blobs: [{ key, before, after: transformed.blob }],
    readExpectations: [],
  };
}

function warningDetails(warnings: CanvasResizeOverflowCounts): string {
  const values = [
    ['layer', warnings.layers],
    ['frame状態', warnings.frameStates],
    ['原点', warnings.origin],
    ['anchor', warnings.anchors],
    ['collider', warnings.colliders],
    ['Part pivot', warnings.partPivots],
  ] as const;
  return values
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}件`)
    .join('、');
}

function prepareCanvasTarget(options: {
  assets: Asset[];
  assetId: string;
  config: CanvasResizeBatchConfig;
  now: Date;
}): PreparedAssetBatchTarget {
  const asset = options.assets.find((candidate) => candidate.id === options.assetId);
  const label = asset?.displayName ?? options.assetId;
  const id = `canvas:${options.assetId}`;
  if (!asset) {
    return unavailableTarget(id, options.assetId, label, 'Assetを読み込めません。');
  }
  if (
    asset.canvasSize.width === options.config.size.width &&
    asset.canvasSize.height === options.config.size.height
  ) {
    return {
      id,
      assetId: asset.id,
      label,
      status: 'up-to-date',
      reasons: ['現在と同じcanvasサイズです。'],
      changes: [],
      estimatedChangeBytes: 0,
      beforeAsset: asset,
      afterAsset: asset,
      blobs: [],
      readExpectations: [],
    };
  }
  const afterAsset = resizeAssetCanvas(
    asset,
    options.config.size,
    options.config.anchor,
    options.now,
  );
  const warnings = inspectCanvasResizeOverflow(afterAsset);
  const reasons =
    warnings.total > 0
      ? [
          `変更後にcanvas外へ出るデータが${warnings.total}件あります（${warningDetails(warnings)}）。clamp、crop、削除は行いません。`,
        ]
      : [];
  return {
    id,
    assetId: asset.id,
    label,
    status: warnings.total > 0 ? 'warning' : 'ready',
    reasons,
    changes: [
      `${asset.canvasSize.width} × ${asset.canvasSize.height} → ${options.config.size.width} × ${options.config.size.height}`,
    ],
    estimatedChangeBytes: 0,
    beforeAsset: structuredClone(asset),
    afterAsset,
    blobs: [],
    readExpectations: [],
    canvasWarnings: warnings,
  };
}

function inputLabel(
  config: AssetBatchConfig,
  input: string | PaletteBatchTargetConfig,
  assets: Asset[],
): string {
  const assetId = typeof input === 'string' ? input : input.assetId;
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (config.type === 'palette' && typeof input !== 'string') {
    const layer = asset?.layers.find((candidate) => candidate.id === input.layerId);
    return `${asset?.displayName ?? assetId} / ${layer?.name ?? input.layerId}`;
  }
  return asset?.displayName ?? assetId;
}

export async function prepareAssetBatchPreview(options: {
  project: Project;
  assets: Asset[];
  config: AssetBatchConfig;
  signal: AbortSignal;
  dependencies: AssetBatchPreparationDependencies;
  onProgress?: (progress: AssetBatchProgress) => void;
  now?: Date;
}): Promise<AssetBatchPreview> {
  assertAssetBatchTargetCount(options.config);
  if (options.config.type === 'palette') {
    if (options.config.replacements.length < 1) {
      throw new Error('palette置換色を1件以上指定してください。');
    }
    if (
      !Number.isInteger(options.config.tolerance) ||
      options.config.tolerance < 0 ||
      options.config.tolerance > 255
    ) {
      throw new Error('palette toleranceは0〜255の整数にしてください。');
    }
  }
  if (options.config.type === 'canvas-resize') {
    const error = validateBlankCanvasSize(options.config.size);
    if (error) {
      throw new Error(error);
    }
  }

  const now = options.now ?? new Date();
  const inputs = configTargets(options.config);
  const targets = await prepareSequentialBatchTargets({
    inputs,
    signal: options.signal,
    labelFor: (input) => inputLabel(options.config, input, options.assets),
    onProgress: options.onProgress,
    prepare: async (input, onProgress) => {
      if (options.config.type === 'linked-refresh' && typeof input === 'string') {
        return prepareLinkedTarget({
          project: options.project,
          assets: options.assets,
          assetId: input,
          now,
          signal: options.signal,
          dependencies: options.dependencies,
          onProgress,
        });
      }
      if (options.config.type === 'palette' && typeof input !== 'string') {
        return preparePaletteTarget({
          assets: options.assets,
          target: input,
          config: options.config,
          now,
          signal: options.signal,
          dependencies: options.dependencies,
          onProgress,
        });
      }
      if (options.config.type === 'canvas-resize' && typeof input === 'string') {
        onProgress(0.5);
        const result = prepareCanvasTarget({
          assets: options.assets,
          assetId: input,
          config: options.config,
          now,
        });
        onProgress(1);
        return result;
      }
      throw new Error('一括処理configとtargetの組み合わせが不正です。');
    },
  });
  throwIfCancelled(options.signal);
  const storageUsage = await options.dependencies.getStorageUsage();
  throwIfCancelled(options.signal);
  return {
    operation: options.config.type,
    preparedAt: now.toISOString(),
    beforeProject: structuredClone(options.project),
    targets,
    storageUsage,
  };
}

export function isAssetBatchTargetSelectable(target: PreparedAssetBatchTarget): boolean {
  return (
    target.beforeAsset !== undefined &&
    target.afterAsset !== undefined &&
    (target.status === 'ready' ||
      target.status === 'warning' ||
      target.status === 'manual-adjusted')
  );
}

export function defaultAssetBatchTargetIds(preview: AssetBatchPreview): string[] {
  return preview.targets
    .filter((target) => target.status === 'ready' || target.status === 'warning')
    .map((target) => target.id);
}

export interface ProjectedBatchStorage {
  estimatedChangeBytes: number;
  projectedUsageBytes: number | null;
  projectedUsageRatio: number | null;
  warningLevel: StorageWarningLevel;
}

export function projectBatchStorage(
  preview: AssetBatchPreview,
  includedTargetIds: ReadonlySet<string>,
): ProjectedBatchStorage {
  const estimatedChangeBytes = preview.targets
    .filter((target) => includedTargetIds.has(target.id))
    .reduce((sum, target) => sum + target.estimatedChangeBytes, 0);
  const { usageBytes, quotaBytes, status } = preview.storageUsage;
  const projectedUsageBytes = usageBytes === null ? null : usageBytes + estimatedChangeBytes;
  const projectedUsageRatio =
    projectedUsageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? projectedUsageBytes / quotaBytes
      : null;
  const warningLevel = getStorageWarningLevel({
    status,
    usageBytes: projectedUsageBytes,
    quotaBytes,
    usageRatio: projectedUsageRatio,
  });
  return { estimatedChangeBytes, projectedUsageBytes, projectedUsageRatio, warningLevel };
}

function applyProjectTargetUpdates(
  beforeProject: Project,
  targets: PreparedAssetBatchTarget[],
  preparedAt: string,
): Project {
  let families = beforeProject.families ? structuredClone(beforeProject.families) : undefined;
  for (const target of targets) {
    const update = target.projectVariantUpdate;
    if (!update || !families) {
      continue;
    }
    families = families.map((family) =>
      family.id === update.familyId
        ? {
            ...family,
            variants: family.variants.map((variant) =>
              variant.assetId === update.variant.assetId ? update.variant : variant,
            ),
          }
        : family,
    );
  }
  const afterById = new Map(targets.map((target) => [target.assetId, target.afterAsset!]));
  return {
    ...structuredClone(beforeProject),
    assets: beforeProject.assets.map((entry) => {
      const asset = afterById.get(entry.id);
      return asset
        ? {
            ...entry,
            id: asset.id,
            name: asset.name,
            displayName: asset.displayName,
            assetType: asset.assetType,
          }
        : entry;
    }),
    ...(families ? { families } : {}),
    updatedAt: preparedAt,
  };
}

function mergeReadExpectations(targets: PreparedAssetBatchTarget[]): AssetBatchReadExpectation[] {
  const merged = new Map<
    string,
    { asset: Asset; blobs: Map<string, { key: string; expected: Blob }> }
  >();
  for (const target of targets) {
    for (const expectation of target.readExpectations) {
      const current = merged.get(expectation.asset.id) ?? {
        asset: expectation.asset,
        blobs: new Map<string, { key: string; expected: Blob }>(),
      };
      for (const blob of expectation.blobs ?? []) {
        current.blobs.set(blob.key, blob);
      }
      merged.set(expectation.asset.id, current);
    }
  }
  return [...merged.values()].map(({ asset, blobs }) => ({
    asset,
    blobs: [...blobs.values()],
  }));
}

function batchLabel(operation: AssetBatchOperation): string {
  switch (operation) {
    case 'linked-refresh':
      return '一括linked variant refresh';
    case 'palette':
      return '一括palette置換';
    case 'canvas-resize':
      return '一括canvasサイズ変更';
  }
}

export interface AssetBatchRevisionPlan {
  label: string;
  forward: SaveAssetBatchRevisionInput;
  undo: SaveAssetBatchRevisionInput;
  redo: SaveAssetBatchRevisionInput;
  beforeAssets: Asset[];
  afterAssets: Asset[];
  targetIds: string[];
}

export function buildAssetBatchRevisionPlan(
  preview: AssetBatchPreview,
  includedTargetIds: ReadonlySet<string>,
): AssetBatchRevisionPlan {
  const selected = preview.targets.filter((target) => includedTargetIds.has(target.id));
  if (selected.length < 1 || selected.length > MAX_ASSET_BATCH_REVISION_TARGETS) {
    throw new Error(`実行対象は1〜${MAX_ASSET_BATCH_REVISION_TARGETS}件にしてください。`);
  }
  for (const target of selected) {
    if (!isAssetBatchTargetSelectable(target)) {
      throw new Error(`実行できないtargetが含まれています: ${target.label}`);
    }
  }

  const afterProject = applyProjectTargetUpdates(
    preview.beforeProject,
    selected,
    preview.preparedAt,
  );
  const targets: AssetBatchRevisionTarget[] = selected.map((target) => ({
    beforeAsset: target.beforeAsset!,
    afterAsset: target.afterAsset!,
    blobs: target.blobs,
  }));
  const reverseTargets: AssetBatchRevisionTarget[] = targets.map((target) => ({
    beforeAsset: target.afterAsset,
    afterAsset: target.beforeAsset,
    blobs: target.blobs?.map((blob) => ({
      key: blob.key,
      before: blob.after,
      after: blob.before,
    })),
  }));
  const label = batchLabel(preview.operation);
  const forward: SaveAssetBatchRevisionInput = {
    beforeProject: preview.beforeProject,
    afterProject,
    targets,
    readExpectations: mergeReadExpectations(selected),
    snapshotLabel: `${label}前`,
  };
  return {
    label,
    forward,
    undo: {
      beforeProject: afterProject,
      afterProject: preview.beforeProject,
      targets: reverseTargets,
      allowProjectUpdatedAtDrift: true,
      historyReplay: true,
      snapshotLabel: '',
    },
    redo: {
      ...forward,
      allowProjectUpdatedAtDrift: true,
      historyReplay: true,
      snapshotLabel: '',
    },
    beforeAssets: selected.map((target) => target.beforeAsset!),
    afterAssets: selected.map((target) => target.afterAsset!),
    targetIds: selected.map((target) => target.assetId),
  };
}
