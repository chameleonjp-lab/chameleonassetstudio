import { describe, expect, it } from 'vitest';
import characterAsset from '../../core/samples/asset.character.json';
import type { Asset, Project } from '../../core/model';
import type { RenderLayer } from '../../renderers/canvas2d/render';
import {
  buildDetailedGameImpact,
  buildGameCheckColliders,
  buildGameCheckRenderLayers,
  resolveGameCheckPresentation,
} from './gameCheckContract';

const baseAsset = characterAsset as unknown as Asset;
const project = {
  format: 'chameleon-project',
  version: '0.1.0',
  id: 'project_game_check_contract',
  name: 'game-check-contract',
  assets: [{ id: baseAsset.id, name: baseAsset.name, assetType: baseAsset.assetType }],
  createdAt: baseAsset.createdAt,
  updatedAt: baseAsset.updatedAt,
} satisfies Project;

const previewState = {
  animationId: 'anim_idle',
  frameId: 'frame_idle_0',
  isPlaying: false,
  visibleOverlays: ['origin', 'anchor', 'collider'],
  parallaxPosition: 0,
  impactOpen: true,
};

function renderLayersFor(asset: Asset): RenderLayer[] {
  return asset.layers.map((layer) => ({
    layer,
    textureSize: asset.textures.find((texture) => texture.id === layer.textureId)?.size ?? null,
    bitmap: null,
  }));
}

describe('Group 14 post-merge contract guards', () => {
  it('tileSizeとcanvasが一致する場合だけ実画像レイヤーを9セルへ複製する', () => {
    const tileAsset: Asset = {
      ...baseAsset,
      assetType: 'tile',
      canvasSize: { width: 32, height: 32 },
      colliders: [
        {
          id: 'col_body',
          name: 'body',
          purpose: 'body',
          shape: 'rect',
          visible: true,
          rect: { x: 8, y: 4, width: 16, height: 24 },
        },
      ],
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      },
    };
    const overlay = {
      groundLineY: null,
      tile: { tileWidth: 32, tileHeight: 32, collisionType: 'solid', cellCount: 9 as const },
      background: [],
      gimmickPreset: null,
      effect: null,
    };
    const layers = buildGameCheckRenderLayers(renderLayersFor(tileAsset), tileAsset, overlay);

    expect(layers).toHaveLength(tileAsset.layers.length * 9);
    const bodyCopies = layers.filter((entry) => entry.layer.id.startsWith('layer_body__game_check_'));
    expect(bodyCopies.map((entry) => entry.layer.transform.position)).toEqual(
      expect.arrayContaining([
        { x: -32, y: -32 },
        { x: 0, y: 0 },
        { x: 32, y: 32 },
      ]),
    );
    expect(tileAsset.layers[0]?.transform.position).toEqual({ x: 0, y: 0 });
    const colliders = buildGameCheckColliders(tileAsset, overlay);
    expect(colliders).toHaveLength(tileAsset.colliders.length * 9);
    expect(colliders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'col_body__game_check_-1_-1',
          rect: expect.objectContaining({ x: -24, y: -28 }),
        }),
      ]),
    );
    expect(tileAsset.colliders[0]).toMatchObject({ id: 'col_body', rect: { x: 8, y: 4 } });
  });

  it('tileSize不一致は推測で切り出さず単体表示と理由へ変換する', () => {
    const tileAsset: Asset = {
      ...baseAsset,
      assetType: 'tile',
      canvasSize: { width: 64, height: 64 },
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      },
    };
    const overlay = {
      groundLineY: null,
      tile: { tileWidth: 32, tileHeight: 32, collisionType: 'solid', cellCount: 9 as const },
      background: [],
      gimmickPreset: null,
      effect: null,
    };
    const resolved = resolveGameCheckPresentation(tileAsset, overlay);

    expect(resolved.overlay.tile).toBeNull();
    expect(resolved.issues).toContainEqual(
      expect.objectContaining({ code: 'tile-size-mismatch', kind: 'invalid' }),
    );
    expect(buildGameCheckRenderLayers(renderLayersFor(tileAsset), tileAsset, resolved.overlay)).toHaveLength(
      tileAsset.layers.length,
    );
  });

  it('Impactの全行に対象・未確認範囲・再確認条件を付け、source/editを推測しない', () => {
    const impact = buildDetailedGameImpact(baseAsset, project, [baseAsset], previewState);
    const sourceEdit = impact.find((item) => item.id === 'asset:source-edit-current');

    expect(sourceEdit).toMatchObject({
      targetLabel: 'source / edit関係',
      confidence: '未評価',
    });
    expect(sourceEdit?.checked).toContain('tex_source');
    expect(sourceEdit?.checked).toContain('tex_main');
    expect(sourceEdit?.unchecked).toContain('推測しません');
    expect(impact.every((item) => item.targetLabel && item.unchecked && item.recheck)).toBe(true);
    expect(impact.find((item) => item.kind === 'preview')?.checked).toContain('Frame=frame_idle_0');
  });

  it('linked variantは既存fingerprint検査の現在状態をImpactへ表示する', () => {
    const variantAsset: Asset = {
      ...structuredClone(baseAsset),
      id: 'asset_game_check_variant',
      name: 'game_check_variant',
      displayName: 'Game Check Variant',
    };
    const familyProject = {
      ...project,
      assets: [
        ...project.assets,
        {
          id: variantAsset.id,
          name: variantAsset.name,
          displayName: variantAsset.displayName,
          assetType: variantAsset.assetType,
        },
      ],
      families: [
        {
          id: 'family_game_check',
          name: 'Game Check Family',
          baseAssetId: baseAsset.id,
          variants: [
            {
              assetId: variantAsset.id,
              kind: 'linked-mirror',
              recipe: {} as never,
              fingerprint: {
                base: 'sha256:base',
                variant: 'sha256:variant',
                syncedAt: baseAsset.updatedAt,
              },
            },
          ],
        },
      ],
    } as Project;
    const impact = buildDetailedGameImpact(
      baseAsset,
      familyProject,
      [baseAsset, variantAsset],
      previewState,
      {
        [variantAsset.id]: {
          state: 'ready',
          inspection: {
            status: 'ready',
            stale: true,
            manualAdjusted: false,
            reasons: ['baseのrecipe対象が最終同期後に変更されています。'],
            currentBaseHash: 'sha256:current-base',
            currentVariantHash: 'sha256:variant',
          },
        },
      },
    );
    const variant = impact.find(
      (item) => item.kind === 'variant' && item.path.includes(variantAsset.id),
    );

    expect(variant).toMatchObject({
      relationStatus: '更新候補（stale）',
      confidence: '確定',
    });
    expect(variant?.checked).toContain('関係状態=更新候補（stale）');
    expect(variant?.reason).toContain('baseのrecipe対象が最終同期後に変更されています。');
  });
});
