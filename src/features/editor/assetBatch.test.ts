import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyProject,
  createLinkedMirrorVariantDraft,
  createLinkedVariantFingerprint,
  type Asset,
  type LinkedAssetFamilyVariant,
  type Project,
} from '../../core/model';
import characterAsset from '../../core/samples/asset.character.json';
import {
  AssetBatchCancelledError,
  assertAssetBatchTargetCount,
  buildAssetBatchRevisionPlan,
  defaultAssetBatchTargetIds,
  prepareAssetBatchPreview,
  prepareSequentialBatchTargets,
  projectBatchStorage,
  type AssetBatchPreview,
} from './assetBatch';

const BEFORE_TIME = '2026-07-19T00:00:00.000Z';
const AFTER_TIME = '2026-07-19T01:00:00.000Z';

function assetWithId(id: string): Asset {
  const asset = structuredClone(characterAsset) as unknown as Asset;
  return {
    ...asset,
    id,
    name: id,
    displayName: id,
    updatedAt: BEFORE_TIME,
  };
}

function projectFor(assets: Asset[]): Project {
  return {
    ...createEmptyProject('Asset batch'),
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    })),
    updatedAt: BEFORE_TIME,
  };
}

const unusedDependencies = {
  loadAssetBlobs: vi.fn(async () => new Map<string, Blob>()),
  loadBlob: vi.fn(async () => null),
  transformPaletteBlob: vi.fn(async (blob: Blob) => ({ blob, changed: true })),
  getStorageUsage: vi.fn(async () => ({
    status: 'available' as const,
    usageBytes: 100,
    quotaBytes: 1_000,
    usageRatio: 0.1,
  })),
};

describe('Slice D Asset batch preparation', () => {
  it('0件・17件・同じAssetの重複targetを準備前に拒否する', () => {
    expect(() =>
      assertAssetBatchTargetCount({ type: 'linked-refresh', targetAssetIds: [] }),
    ).toThrow(/1〜16件/);
    expect(() =>
      assertAssetBatchTargetCount({
        type: 'canvas-resize',
        targetAssetIds: Array.from({ length: 17 }, (_, index) => `asset_${index}`),
        size: { width: 10, height: 10 },
        anchor: 'center',
      }),
    ).toThrow(/1〜16件/);
    expect(() =>
      assertAssetBatchTargetCount({
        type: 'palette',
        targets: [
          { assetId: 'asset_a', layerId: 'layer_a' },
          { assetId: 'asset_a', layerId: 'layer_b' },
        ],
        replacements: [{ from: '#000000', to: '#ffffff' }],
        tolerance: 0,
      }),
    ).toThrow(/1 Assetにつき1 target/);
  });

  it('targetを直列準備し、取消時は準備結果を返さない', async () => {
    const controller = new AbortController();
    const prepare = vi.fn(async (value: number) => {
      if (value === 1) {
        controller.abort();
      }
      return value * 2;
    });

    await expect(
      prepareSequentialBatchTargets({
        inputs: [1, 2, 3],
        signal: controller.signal,
        labelFor: String,
        prepare,
      }),
    ).rejects.toBeInstanceOf(AssetBatchCancelledError);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('canvas resizeを対象別previewし、除外targetをrevision planへ含めない', async () => {
    const first = assetWithId('asset_first');
    const second = assetWithId('asset_second');
    const project = projectFor([first, second]);
    const preview = await prepareAssetBatchPreview({
      project,
      assets: [first, second],
      config: {
        type: 'canvas-resize',
        targetAssetIds: [first.id, second.id],
        size: { width: 32, height: 32 },
        anchor: 'top-left',
      },
      signal: new AbortController().signal,
      dependencies: unusedDependencies,
      now: new Date(AFTER_TIME),
    });

    expect(preview.targets).toHaveLength(2);
    expect(preview.targets.every((target) => target.changes.length === 1)).toBe(true);
    const selectedId = preview.targets[0].id;
    const plan = buildAssetBatchRevisionPlan(preview, new Set([selectedId]));
    expect(plan.forward.targets).toHaveLength(1);
    expect(plan.targetIds).toEqual([first.id]);
    expect(plan.forward.afterProject.assets[1]).toEqual(project.assets[1]);
    expect(plan.undo).toMatchObject({
      allowProjectUpdatedAtDrift: true,
      historyReplay: true,
      snapshotLabel: '',
    });
    expect(plan.redo).toMatchObject({
      allowProjectUpdatedAtDrift: true,
      historyReplay: true,
      snapshotLabel: '',
    });
  });

  it('stale linked variantをbatch previewし、Family fingerprintを同じ原子planへ含める', async () => {
    const syncedBase = assetWithId('asset_linked_base');
    const draft = createLinkedMirrorVariantDraft(syncedBase, {
      now: new Date(BEFORE_TIME),
    });
    const blobsFor = (asset: Asset) =>
      new Map(
        asset.textures.map((texture, index) => [
          texture.path,
          new Blob([new Uint8Array([index + 1])], { type: texture.mimeType }),
        ]),
      );
    const baseBlobs = blobsFor(syncedBase);
    const variantBlobs = blobsFor(draft.asset);
    const variant: LinkedAssetFamilyVariant = {
      assetId: draft.asset.id,
      kind: 'linked-mirror',
      recipe: draft.recipe,
      fingerprint: await createLinkedVariantFingerprint({
        base: syncedBase,
        variant: draft.asset,
        recipe: draft.recipe,
        baseBlobs,
        variantBlobs,
        now: new Date(BEFORE_TIME),
      }),
    };
    const staleBase = structuredClone(syncedBase);
    staleBase.layers[0].opacity = 0.5;
    staleBase.updatedAt = AFTER_TIME;
    const project: Project = {
      ...projectFor([staleBase, draft.asset]),
      families: [
        {
          id: 'family_linked_batch',
          name: 'Linked batch',
          baseAssetId: staleBase.id,
          variants: [variant],
        },
      ],
      updatedAt: AFTER_TIME,
    };
    const loadAssetBlobs = vi.fn(async (asset: Asset) =>
      asset.id === staleBase.id ? baseBlobs : variantBlobs,
    );

    const preview = await prepareAssetBatchPreview({
      project,
      assets: [staleBase, draft.asset],
      config: { type: 'linked-refresh', targetAssetIds: [draft.asset.id] },
      signal: new AbortController().signal,
      dependencies: { ...unusedDependencies, loadAssetBlobs },
      now: new Date('2026-07-19T02:00:00.000Z'),
    });

    expect(preview.targets[0]).toMatchObject({
      assetId: draft.asset.id,
      status: 'ready',
    });
    expect(loadAssetBlobs).toHaveBeenCalledTimes(2);
    const plan = buildAssetBatchRevisionPlan(preview, new Set(defaultAssetBatchTargetIds(preview)));
    const nextVariant = plan.forward.afterProject.families?.[0].variants[0];
    expect(nextVariant?.assetId).toBe(variant.assetId);
    expect(nextVariant?.kind).toBe('linked-mirror');
    if (nextVariant?.kind === 'linked-mirror') {
      expect(nextVariant.fingerprint.base).not.toBe(variant.fingerprint.base);
    }
  });

  it('manual-adjustedは既定除外し、選択targetだけの変更byteと容量warningを算出する', () => {
    const project = projectFor([assetWithId('asset_a'), assetWithId('asset_b')]);
    const preview: AssetBatchPreview = {
      operation: 'linked-refresh',
      preparedAt: AFTER_TIME,
      beforeProject: project,
      storageUsage: {
        status: 'available',
        usageBytes: 750,
        quotaBytes: 1_000,
        usageRatio: 0.75,
      },
      targets: [
        {
          id: 'ready',
          assetId: 'asset_a',
          label: 'ready',
          status: 'ready',
          reasons: [],
          changes: ['change'],
          estimatedChangeBytes: 60,
          beforeAsset: project.assets[0] as unknown as Asset,
          afterAsset: project.assets[0] as unknown as Asset,
          blobs: [],
          readExpectations: [],
        },
        {
          id: 'manual',
          assetId: 'asset_b',
          label: 'manual',
          status: 'manual-adjusted',
          reasons: ['manual'],
          changes: ['change'],
          estimatedChangeBytes: 100,
          beforeAsset: project.assets[1] as unknown as Asset,
          afterAsset: project.assets[1] as unknown as Asset,
          blobs: [],
          readExpectations: [],
        },
      ],
    };

    expect(defaultAssetBatchTargetIds(preview)).toEqual(['ready']);
    expect(projectBatchStorage(preview, new Set(['ready']))).toEqual({
      estimatedChangeBytes: 60,
      projectedUsageBytes: 810,
      projectedUsageRatio: 0.81,
      warningLevel: 'warning',
    });
  });
});
