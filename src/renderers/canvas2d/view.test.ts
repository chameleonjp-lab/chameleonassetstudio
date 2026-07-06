import { describe, expect, it } from 'vitest';
import type { Layer } from '../../core/model';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitView,
  hitTestLayer,
  hitTestLayers,
  layerLocalPoint,
  panBy,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomAt,
} from './view';

function makeLayer(
  overrides?: Partial<Layer['transform']> & { locked?: boolean; visible?: boolean; id?: string },
): Layer {
  return {
    id: overrides?.id ?? 'layer_1',
    name: 'main',
    layerType: 'image',
    visible: overrides?.visible ?? true,
    locked: overrides?.locked ?? false,
    opacity: 1,
    transform: {
      position: overrides?.position ?? { x: 0, y: 0 },
      scale: overrides?.scale ?? { x: 1, y: 1 },
      rotation: overrides?.rotation ?? 0,
    },
  };
}

describe('ビュー変換', () => {
  const view = { scale: 2, offsetX: 100, offsetY: 50 };

  it('worldToScreen と screenToWorld が往復する', () => {
    const world = { x: 30, y: -20 };
    const screen = worldToScreen(view, world);
    expect(screen).toEqual({ x: 160, y: 10 });
    expect(screenToWorld(view, screen)).toEqual(world);
  });

  it('clampZoom は範囲内へ収める', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('fitView はキャンバス全体を中央に収める', () => {
    const fitted = fitView({ width: 1000, height: 500 }, { width: 200, height: 100 }, 50);
    // スケールは (500-100)/100 = 4 と (1000-100)/200 = 4.5 の小さい方
    expect(fitted.scale).toBe(4);
    const topLeft = worldToScreen(fitted, { x: 0, y: 0 });
    const bottomRight = worldToScreen(fitted, { x: 200, y: 100 });
    // 中央配置
    expect(topLeft.x).toBeCloseTo(1000 - bottomRight.x);
    expect(topLeft.y).toBeCloseTo(500 - bottomRight.y);
  });

  it('zoomAt はアンカー点の world 座標を固定する', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(view, anchor);
    const zoomed = zoomAt(view, anchor, 4);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.scale).toBe(4);
  });

  it('panBy はオフセットだけ動かす', () => {
    const panned = panBy(view, 10, -5);
    expect(panned).toEqual({ scale: 2, offsetX: 110, offsetY: 45 });
  });

  it('snapToGrid はグリッド（px）の最も近い倍数へ丸める', () => {
    expect(snapToGrid(13, 16)).toBe(16);
    expect(snapToGrid(23, 16)).toBe(16);
    expect(snapToGrid(24, 16)).toBe(32);
    expect(snapToGrid(13.4, 0)).toBe(13);
    expect(snapToGrid(13.6, -5)).toBe(14);
  });
});

describe('レイヤーの当たり判定', () => {
  const size = { width: 100, height: 60 };

  it('平行移動したレイヤーに当たる', () => {
    const layer = makeLayer({ position: { x: 50, y: 20 } });
    expect(hitTestLayer(layer, size, { x: 100, y: 50 })).toBe(true); // 中心
    expect(hitTestLayer(layer, size, { x: 49, y: 50 })).toBe(false); // 左外
    expect(hitTestLayer(layer, size, { x: 150, y: 80 })).toBe(true); // 右下角
    expect(hitTestLayer(layer, size, { x: 151, y: 80 })).toBe(false);
  });

  it('拡大したレイヤーは広い範囲に当たる', () => {
    const layer = makeLayer({ scale: { x: 2, y: 2 } });
    // 中心 (50,30)、半径 100x60 に拡大
    expect(hitTestLayer(layer, size, { x: -49, y: 30 })).toBe(true);
    expect(hitTestLayer(layer, size, { x: -51, y: 30 })).toBe(false);
  });

  it('90 度回転したレイヤーは縦横が入れ替わる', () => {
    const layer = makeLayer({ rotation: 90 });
    // 中心 (50,30)。回転後は幅 60、高さ 100 の領域になる
    expect(hitTestLayer(layer, size, { x: 50, y: 79 })).toBe(true);
    expect(hitTestLayer(layer, size, { x: 50, y: 81 })).toBe(false);
    expect(hitTestLayer(layer, size, { x: 81, y: 30 })).toBe(false);
  });

  it('layerLocalPoint は中心原点のローカル座標を返す', () => {
    const layer = makeLayer({ position: { x: 10, y: 10 } });
    const local = layerLocalPoint(layer, size, { x: 60, y: 40 });
    expect(local.x).toBeCloseTo(0);
    expect(local.y).toBeCloseTo(0);
  });

  it('hitTestLayers は前面（末尾）を優先し、非表示・ロックを飛ばす', () => {
    const back = makeLayer({ id: 'back' });
    const front = makeLayer({ id: 'front' });
    const hiddenFront = makeLayer({ id: 'hidden', visible: false });
    const lockedFront = makeLayer({ id: 'locked', locked: true });

    const point = { x: 50, y: 30 };
    expect(
      hitTestLayers(
        [
          { layer: back, textureSize: size },
          { layer: front, textureSize: size },
        ],
        point,
      ),
    ).toBe('front');
    expect(
      hitTestLayers(
        [
          { layer: back, textureSize: size },
          { layer: hiddenFront, textureSize: size },
          { layer: lockedFront, textureSize: size },
        ],
        point,
      ),
    ).toBe('back');
    expect(hitTestLayers([{ layer: back, textureSize: size }], { x: 500, y: 500 })).toBeNull();
  });
});
