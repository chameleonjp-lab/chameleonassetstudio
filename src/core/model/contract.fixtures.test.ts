/**
 * 2D-1A-CONTRACT: docs/adr/ の契約 fixture テスト（データ層）。
 * 既存テストの期待値は変更せず、ADR で固定した現行実装の意味を独立に数値で固定する。
 * 対応する ADR は各 describe に ADR 番号として記す。
 */
import { describe, expect, it } from 'vitest';
import { layerWorldPoint } from '../../renderers/canvas2d/view';
import type { Asset } from './asset';
import characterAsset from '../samples/asset.character.json';
import type { Layer, LayerTransform } from './layer';
import { flipCopyAsset } from './flipCopy';
import { MigrationError, migrateAsset } from './migrate';
import type { Size } from './common';

const baseAsset = characterAsset as unknown as Asset;

function makeLayer(transform: LayerTransform): Layer {
  return {
    id: 'layer_fixture',
    name: 'fixture',
    layerType: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform,
  };
}

describe('ADR-0001: layerWorldPoint（座標と変形の意味）', () => {
  it('position + scale（回転なし）の world 座標は中心基準のスケール適用で決まる', () => {
    const layer = makeLayer({
      position: { x: 100, y: 50 },
      scale: { x: 2, y: 3 },
      rotation: 0,
    });
    const textureSize: Size = { width: 40, height: 20 };
    // 中心 = position + textureSize/2 = (120, 60)
    expect(layerWorldPoint(layer, textureSize, { x: 0, y: 0 })).toEqual({ x: 120, y: 60 });
    // ローカル (10, -5) はスケール適用後 (20, -15) が中心へ加算される
    expect(layerWorldPoint(layer, textureSize, { x: 10, y: -5 })).toEqual({ x: 140, y: 45 });
  });

  it('scale.x が負（反転相当）の場合、x 方向だけ符号が反転して加算される', () => {
    const layer = makeLayer({
      position: { x: 100, y: 50 },
      scale: { x: -2, y: 3 },
      rotation: 0,
    });
    const textureSize: Size = { width: 40, height: 20 };
    expect(layerWorldPoint(layer, textureSize, { x: 10, y: -5 })).toEqual({ x: 100, y: 45 });
  });

  it('rotation=90 度は中心を軸に時計回り相当で回転する（textureSize=0 の点回転）', () => {
    const layer = makeLayer({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 90,
    });
    const textureSize: Size = { width: 0, height: 0 };
    const world = layerWorldPoint(layer, textureSize, { x: 10, y: 0 });
    expect(world.x).toBeCloseTo(0, 9);
    expect(world.y).toBeCloseTo(10, 9);
  });

  it('position + scale（負を含む）+ rotation=90 度の組み合わせを固定する', () => {
    const layer = makeLayer({
      position: { x: 50, y: 50 },
      scale: { x: 2, y: -1 },
      rotation: 90,
    });
    const textureSize: Size = { width: 0, height: 0 };
    // 中心 = (50, 50)。scaled local = (10*2, 4*-1) = (20, -4)。
    const world = layerWorldPoint(layer, textureSize, { x: 10, y: 4 });
    expect(world.x).toBeCloseTo(54, 9);
    expect(world.y).toBeCloseTo(70, 9);
  });
});

describe('ADR-0002: flipCopyAsset の ID・参照の張り替え', () => {
  it('parts→layers、frames→layers、animations→frames の全参照が新 ID で解決でき、旧 ID が残らない', () => {
    const originalLayerIds = new Set(baseAsset.layers.map((layer) => layer.id));
    const originalFrameIds = new Set((baseAsset.frames ?? []).map((frame) => frame.id));

    const flipped = flipCopyAsset(baseAsset);
    const newLayerIds = new Set(flipped.layers.map((layer) => layer.id));
    const newFrameIds = new Set((flipped.frames ?? []).map((frame) => frame.id));

    // レイヤー・フレームの ID そのものが新規採番されている（旧 ID を再利用しない）
    for (const id of newLayerIds) {
      expect(originalLayerIds.has(id)).toBe(false);
    }
    for (const id of newFrameIds) {
      expect(originalFrameIds.has(id)).toBe(false);
    }
    expect(flipped.parts.length).toBeGreaterThan(0);
    expect((flipped.frames ?? []).length).toBeGreaterThan(0);
    expect(flipped.animations.length).toBeGreaterThan(0);

    // part.layerIds は新レイヤー ID の集合に完全に含まれ、旧 ID は 1 つも含まれない
    for (const part of flipped.parts) {
      for (const layerId of part.layerIds) {
        expect(newLayerIds.has(layerId)).toBe(true);
        expect(originalLayerIds.has(layerId)).toBe(false);
      }
    }
    // frame.layerStates.layerId も同様
    for (const frame of flipped.frames ?? []) {
      for (const state of frame.layerStates) {
        expect(newLayerIds.has(state.layerId)).toBe(true);
        expect(originalLayerIds.has(state.layerId)).toBe(false);
      }
    }
    // animation.frameIds も同様
    for (const animation of flipped.animations) {
      for (const frameId of animation.frameIds) {
        expect(newFrameIds.has(frameId)).toBe(true);
        expect(originalFrameIds.has(frameId)).toBe(false);
      }
    }
  });
});

describe('ADR-0005: 反転コピーの反転式（origin.x を軸にした anchor / rect / circle / role 入れ替え）', () => {
  const axis = 20;
  const fixtureAsset: Asset = {
    ...baseAsset,
    origin: { x: axis, y: baseAsset.origin.y },
    anchors: [
      {
        id: 'anchor_hand_left_fixture',
        name: 'hand_left',
        role: 'hand_left',
        position: { x: 5, y: 40 },
      },
    ],
    colliders: [
      {
        id: 'col_rect_fixture',
        name: 'body',
        purpose: 'body',
        shape: 'rect',
        visible: true,
        rect: { x: 0, y: 0, width: 10, height: 30 },
      },
      {
        id: 'col_circle_fixture',
        name: 'pickup',
        purpose: 'pickup',
        shape: 'circle',
        visible: true,
        circle: { x: 30, y: 50, radius: 5 },
      },
    ],
  };

  it('anchor 点は newX = axisX - (oldX - axisX) で反射し、左右 role・名前を入れ替える', () => {
    const flipped = flipCopyAsset(fixtureAsset);
    const anchor = flipped.anchors[0];
    // newX = 2*20 - 5 = 35
    expect(anchor.position).toEqual({ x: 35, y: 40 });
    expect(anchor.role).toBe('hand_right');
    expect(anchor.name).toBe('hand_right');
  });

  it('rect collider は右端反転で新しい左端になり、width は不変', () => {
    const flipped = flipCopyAsset(fixtureAsset);
    const rect = flipped.colliders.find((c) => c.shape === 'rect');
    expect(rect?.shape).toBe('rect');
    if (rect?.shape === 'rect') {
      // newRectX = 2*20 - (0 + 10) = 30
      expect(rect.rect).toEqual({ x: 30, y: 0, width: 10, height: 30 });
    }
  });

  it('circle collider は中心 x を反射し、radius は不変', () => {
    const flipped = flipCopyAsset(fixtureAsset);
    const circle = flipped.colliders.find((c) => c.shape === 'circle');
    expect(circle?.shape).toBe('circle');
    if (circle?.shape === 'circle') {
      // newCircleX = 2*20 - 30 = 10
      expect(circle.circle).toEqual({ x: 10, y: 50, radius: 5 });
    }
  });
});

describe('ADR-0001/0006: migrate 入口は現行 version を変更せず、未知の将来 version は拒否する', () => {
  it('現行 version の asset.json を migrateAsset へ通しても座標・構造が一切変わらない（deep equal）', () => {
    const input = structuredClone(characterAsset);
    const result = migrateAsset(input);
    expect(result.appliedMigrations).toEqual([]);
    expect(result.data).toEqual(characterAsset);
    const migrated = result.data as unknown as Asset;
    expect(migrated.origin).toEqual(baseAsset.origin);
    expect(migrated.anchors).toEqual(baseAsset.anchors);
    expect(migrated.colliders).toEqual(baseAsset.colliders);
    expect(migrated.layers).toEqual(baseAsset.layers);
  });

  it('未知の将来 version（例: 99.0.0）は MigrationError で拒否される', () => {
    const future = { ...structuredClone(characterAsset), version: '99.0.0' };
    expect(() => migrateAsset(future)).toThrow(MigrationError);
    expect(() => migrateAsset(future)).toThrow(/新しい形式/);
  });
});
