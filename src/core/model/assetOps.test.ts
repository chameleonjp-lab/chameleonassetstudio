import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import { validateAsset } from '../schema/validate';
import type { Asset } from './asset';
import {
  addGuideLayer,
  createPart,
  moveLayerOrder,
  removeLayer,
  removePart,
  renameLayer,
  setLayerLocked,
  setLayerVisibility,
  updatePart,
} from './assetOps';

const baseAsset = characterAsset as unknown as Asset;

describe('レイヤー操作', () => {
  it('renameLayer は対象レイヤーだけ名前を変える', () => {
    const next = renameLayer(baseAsset, 'layer_body', '胴体');
    expect(next.layers.find((l) => l.id === 'layer_body')?.name).toBe('胴体');
    expect(next.layers.find((l) => l.id === 'layer_guide')?.name).toBe('guide');
    // 元のアセットは変更しない
    expect(baseAsset.layers.find((l) => l.id === 'layer_body')?.name).toBe('body');
  });

  it('表示とロックを切り替えられ、schema 検証を通る', () => {
    const hidden = setLayerVisibility(baseAsset, 'layer_body', false);
    expect(hidden.layers[0].visible).toBe(false);
    const locked = setLayerLocked(hidden, 'layer_body', true);
    expect(locked.layers[0].locked).toBe(true);
    expect(validateAsset(locked).valid).toBe(true);
  });

  it('moveLayerOrder で前面・背面へ動かせる', () => {
    // layer_body（先頭 = 最背面）を前面へ
    const forward = moveLayerOrder(baseAsset, 'layer_body', 'forward');
    expect(forward.layers.map((l) => l.id)).toEqual(['layer_guide', 'layer_body']);
    // 端にある場合は何もしない
    const noop = moveLayerOrder(forward, 'layer_body', 'forward');
    expect(noop.layers.map((l) => l.id)).toEqual(['layer_guide', 'layer_body']);
    const backward = moveLayerOrder(forward, 'layer_body', 'backward');
    expect(backward.layers.map((l) => l.id)).toEqual(['layer_body', 'layer_guide']);
  });

  it('removeLayer はパーツからの参照も外す', () => {
    const next = removeLayer(baseAsset, 'layer_body');
    expect(next.layers.some((l) => l.id === 'layer_body')).toBe(false);
    expect(next.parts.find((p) => p.id === 'part_body')?.layerIds).toEqual([]);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('addGuideLayer は最前面へガイドレイヤーを足す', () => {
    const next = addGuideLayer(baseAsset, '中心線');
    expect(next.layers).toHaveLength(3);
    const added = next.layers.at(-1)!;
    expect(added.layerType).toBe('guide');
    expect(added.name).toBe('中心線');
    expect(validateAsset(next).valid).toBe(true);
  });
});

describe('パーツ操作', () => {
  it('createPart は存在するレイヤーだけを紐づける', () => {
    const next = createPart(baseAsset, {
      name: '武器',
      partType: 'weapon',
      layerIds: ['layer_body', 'layer_missing'],
      pivot: { x: 10, y: 20 },
    });
    const part = next.parts.at(-1)!;
    expect(part.partType).toBe('weapon');
    expect(part.layerIds).toEqual(['layer_body']);
    expect(part.pivot).toEqual({ x: 10, y: 20 });
    expect(validateAsset(next).valid).toBe(true);
  });

  it('updatePart で種別と pivot を変更できる', () => {
    const next = updatePart(baseAsset, 'part_body', {
      partType: 'accessory',
      pivot: { x: 5, y: 6 },
      name: '飾り',
    });
    const part = next.parts.find((p) => p.id === 'part_body')!;
    expect(part.partType).toBe('accessory');
    expect(part.pivot).toEqual({ x: 5, y: 6 });
    expect(part.name).toBe('飾り');
    expect(validateAsset(next).valid).toBe(true);
  });

  it('removePart でパーツが消える（レイヤーは残る）', () => {
    const next = removePart(baseAsset, 'part_body');
    expect(next.parts).toHaveLength(0);
    expect(next.layers).toHaveLength(baseAsset.layers.length);
  });
});
