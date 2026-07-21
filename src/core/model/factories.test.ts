import { describe, expect, it } from 'vitest';
import { validateAsset } from '../schema/validate';
import { ASSET_TYPES, type AssetType } from './asset';
import { addRectCollider } from './assetOps';
import { createBlankAsset, createImageAsset } from './factories';

describe('createImageAsset source MIME contract', () => {
  it('SVG原本をsourceだけに保持し、edit / thumbnailはraster MIMEで作る', () => {
    const asset = createImageAsset({
      name: 'svg_source',
      size: { width: 64, height: 32 },
      sourceMimeType: 'image/svg+xml',
      sourceExtension: 'svg',
    });

    expect(asset.version).toBe('0.2.0');
    expect(asset.textures.find((texture) => texture.kind === 'source')).toMatchObject({
      mimeType: 'image/svg+xml',
      path: 'source/original.svg',
    });
    expect(
      asset.textures
        .filter((texture) => texture.kind !== 'source')
        .map((texture) => texture.mimeType),
    ).toEqual(['image/png', 'image/webp']);
    expect(validateAsset(asset)).toEqual({ valid: true, errors: [] });
  });
});

describe('createBlankAsset（2D-2-CREATE-01）', () => {
  it('validateAsset を通る Asset JSON を作る', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
    });
    const result = validateAsset(asset);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('canvasSize と assetType が反映される', () => {
    const asset = createBlankAsset({
      name: 'blank_item',
      assetType: 'item',
      canvasSize: { width: 128, height: 128 },
    });
    expect(asset.canvasSize).toEqual({ width: 128, height: 128 });
    expect(asset.assetType).toBe('item');
  });

  it('原点は既存既定の下中央になる（要件 11.6）', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 128 },
    });
    expect(asset.origin).toEqual({ x: 32, y: 128 });
  });

  it('レイヤーは透明画像 1 枚、position は {0,0}', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
    });
    expect(asset.layers).toHaveLength(1);
    const layer = asset.layers[0];
    expect(layer.layerType).toBe('image');
    expect(layer.transform.position).toEqual({ x: 0, y: 0 });
    expect(layer.transform.scale).toEqual({ x: 1, y: 1 });
    expect(layer.transform.rotation).toBe(0);
    // レイヤーが参照するテクスチャが存在する
    expect(asset.textures.some((texture) => texture.id === layer.textureId)).toBe(true);
  });

  it('source / edit / thumbnail の 3 TextureRef 構成になる', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
    });
    const kinds = asset.textures.map((texture) => texture.kind).sort();
    expect(kinds).toEqual(['edit', 'source', 'thumbnail']);
    for (const texture of asset.textures) {
      expect(texture.size).toEqual({ width: 64, height: 64 });
    }
  });

  it('character には starter の body 矩形当たり判定が 1 つ付く', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
    });
    expect(asset.colliders).toHaveLength(1);
    const collider = asset.colliders[0];
    expect(collider.shape).toBe('rect');
    expect(collider.purpose).toBe('body');
    expect(collider.name).toBe('body');
  });

  it('starter の body 当たり判定は assetOps.addRectCollider(asset, "body") の結果と id 以外一致する（値の重複定義がないことの固定、レビュー対応）', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
    });
    const [templateCollider] = asset.colliders;

    // addRectCollider は同じ canvasSize の空 colliders から 'body' を追加する
    const viaAddRectCollider = addRectCollider({ ...asset, colliders: [] }, 'body');
    const [addRectColliderResult] = viaAddRectCollider.colliders;

    expect(templateCollider.id).not.toBe(addRectColliderResult.id);
    const omitId = (collider: typeof templateCollider): unknown => {
      const rest: Record<string, unknown> = { ...collider };
      delete rest.id;
      return rest;
    };
    expect(omitId(templateCollider)).toEqual(omitId(addRectColliderResult));
  });

  it.each(ASSET_TYPES.filter((type): type is AssetType => type !== 'character'))(
    '%s には当たり判定が付かない（character 以外は空キャンバスのみ）',
    (assetType) => {
      const asset = createBlankAsset({
        name: `blank_${assetType}`,
        assetType,
        canvasSize: { width: 64, height: 64 },
      });
      expect(asset.colliders).toHaveLength(0);
    },
  );

  it('displayName を省略すると name を使う', () => {
    const asset = createBlankAsset({
      name: 'blank_tile',
      assetType: 'tile',
      canvasSize: { width: 32, height: 32 },
    });
    expect(asset.displayName).toBe('blank_tile');
  });

  it('displayName を指定すればそれを使う', () => {
    const asset = createBlankAsset({
      name: 'blank_tile',
      displayName: '空のタイル',
      assetType: 'tile',
      canvasSize: { width: 32, height: 32 },
    });
    expect(asset.displayName).toBe('空のタイル');
  });
});
