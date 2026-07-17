import { describe, expect, it } from 'vitest';
import type { LayerTransform } from '../../core/model/layer';
import {
  alignLayers,
  distributeLayers,
  excludeActiveTarget,
  layerWorldBounds,
  resolveReferenceBounds,
  unionBounds,
  MIN_ACTIVE_ALIGN_TARGETS,
  MIN_ALIGN_TARGETS,
  MIN_DISTRIBUTE_TARGETS,
  ALIGN_NO_TARGETS_REASON,
  DISTRIBUTE_MIN_TARGETS_REASON,
  type AlignTarget,
} from './layerAlign';

function transform(overrides: Partial<LayerTransform> = {}): LayerTransform {
  return {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    ...overrides,
  };
}

function target(
  id: string,
  overrides: Partial<LayerTransform> = {},
  size = { width: 20, height: 20 },
): AlignTarget {
  return { id, transform: transform(overrides), textureSize: size };
}

describe('layerWorldBounds', () => {
  it('rotation なし・scale 1 のときテクスチャそのままの AABB になる', () => {
    const bounds = layerWorldBounds(transform({ position: { x: 10, y: 20 } }), {
      width: 100,
      height: 50,
    });
    expect(bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
  });

  it('負 scale（flip）でも AABB は変わらない', () => {
    const flipped = layerWorldBounds(
      transform({ position: { x: 0, y: 0 }, scale: { x: -1, y: 1 } }),
      { width: 100, height: 50 },
    );
    const notFlipped = layerWorldBounds(
      transform({ position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } }),
      { width: 100, height: 50 },
    );
    expect(flipped).toEqual(notFlipped);
    expect(flipped).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it('90度回転すると幅と高さが入れ替わった AABB になる', () => {
    const bounds = layerWorldBounds(transform({ position: { x: 0, y: 0 }, rotation: 90 }), {
      width: 100,
      height: 50,
    });
    // 中心 (50, 25) を軸に90度回転すると、half-width/half-heightが入れ替わる。
    expect(bounds.minX).toBeCloseTo(25);
    expect(bounds.maxX).toBeCloseTo(75);
    expect(bounds.minY).toBeCloseTo(-25);
    expect(bounds.maxY).toBeCloseTo(75);
  });

  it('負 scale と回転を組み合わせても中心と大きさは変わらない', () => {
    const withoutFlip = layerWorldBounds(transform({ position: { x: 0, y: 0 }, rotation: 30 }), {
      width: 80,
      height: 40,
    });
    const withFlip = layerWorldBounds(
      transform({ position: { x: 0, y: 0 }, rotation: 30, scale: { x: -1, y: -1 } }),
      { width: 80, height: 40 },
    );
    expect(withFlip.minX).toBeCloseTo(withoutFlip.minX);
    expect(withFlip.maxX).toBeCloseTo(withoutFlip.maxX);
    expect(withFlip.minY).toBeCloseTo(withoutFlip.minY);
    expect(withFlip.maxY).toBeCloseTo(withoutFlip.maxY);
  });
});

describe('unionBounds', () => {
  it('空配列は null を返す', () => {
    expect(unionBounds([])).toBeNull();
  });

  it('複数の AABB を包含する合成 bounds を返す', () => {
    const merged = unionBounds([
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      { minX: 5, minY: -5, maxX: 20, maxY: 8 },
    ]);
    expect(merged).toEqual({ minX: 0, minY: -5, maxX: 20, maxY: 10 });
  });
});

describe('alignLayers', () => {
  // A: position (0,0) textureSize 100x50 -> bounds 0..100, 0..50
  // B: position (200,300) textureSize 40x40 -> bounds 200..240, 300..340
  const a = target('a', { position: { x: 0, y: 0 } }, { width: 100, height: 50 });
  const b = target('b', { position: { x: 200, y: 300 } }, { width: 40, height: 40 });
  const selectionBounds = unionBounds([
    layerWorldBounds(a.transform, a.textureSize),
    layerWorldBounds(b.transform, b.textureSize),
  ]);

  it('対象が0件なら no-op で理由を返す', () => {
    const outcome = alignLayers([], selectionBounds, 'left');
    expect(outcome.changes).toEqual([]);
    expect(outcome.reason).toBe(ALIGN_NO_TARGETS_REASON);
    expect(MIN_ALIGN_TARGETS).toBe(2);
    expect(MIN_ACTIVE_ALIGN_TARGETS).toBe(1);
  });

  it('referenceBounds が無ければ no-op で理由を返す', () => {
    const outcome = alignLayers([a, b], null, 'left');
    expect(outcome.changes).toEqual([]);
    expect(outcome.reason).toBeTruthy();
  });

  it('左揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'left');
    expect(outcome.reason).toBeUndefined();
    expect(outcome.changes).toEqual([
      { layerId: 'a', newPosition: { x: 0, y: 0 } },
      { layerId: 'b', newPosition: { x: 0, y: 300 } },
    ]);
  });

  it('水平中央揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'centerX');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.x).toBeCloseTo(70);
    expect(changeA.newPosition.y).toBe(0);
    expect(changeB.newPosition.x).toBeCloseTo(100);
    expect(changeB.newPosition.y).toBe(300);
  });

  it('右揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'right');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.x).toBeCloseTo(140);
    expect(changeB.newPosition.x).toBeCloseTo(200);
  });

  it('上揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'top');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.y).toBeCloseTo(0);
    expect(changeB.newPosition.y).toBeCloseTo(0);
  });

  it('垂直中央揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'centerY');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.y).toBeCloseTo(145);
    expect(changeB.newPosition.y).toBeCloseTo(150);
  });

  it('下揃え（選択bounds基準）', () => {
    const outcome = alignLayers([a, b], selectionBounds, 'bottom');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.y).toBeCloseTo(290);
    expect(changeB.newPosition.y).toBeCloseTo(300);
  });

  it('canvas基準で右揃え', () => {
    const canvasSize = { width: 400, height: 200 };
    const referenceBounds = resolveReferenceBounds({
      basis: 'canvas',
      canvasSize,
      selectionTargets: [a, b],
      activeTarget: null,
    });
    const outcome = alignLayers([a, b], referenceBounds, 'right');
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.x).toBeCloseTo(300);
    expect(changeB.newPosition.x).toBeCloseTo(360);
  });

  it('active基準では active layer 自身が移動対象から除外される', () => {
    const active = target('c', { position: { x: 1000, y: 1000 } }, { width: 20, height: 20 });
    const checked = [a, b, active];
    const moveTargets = excludeActiveTarget(checked, 'active', 'c');
    expect(moveTargets.map((t) => t.id)).toEqual(['a', 'b']);

    const referenceBounds = resolveReferenceBounds({
      basis: 'active',
      canvasSize: { width: 1, height: 1 },
      selectionTargets: [],
      activeTarget: active,
    });
    const outcome = alignLayers(moveTargets, referenceBounds, 'left');
    expect(outcome.changes.some((c) => c.layerId === 'c')).toBe(false);
    const changeA = outcome.changes.find((c) => c.layerId === 'a')!;
    const changeB = outcome.changes.find((c) => c.layerId === 'b')!;
    expect(changeA.newPosition.x).toBeCloseTo(1000);
    expect(changeB.newPosition.x).toBeCloseTo(1000);
  });

  it('active基準では active を除いた移動対象が1件でも整列できる', () => {
    const active = target('active', { position: { x: 1000, y: 1000 } });
    const movable = target('movable', { position: { x: 100, y: 200 } });
    const moveTargets = excludeActiveTarget([active, movable], 'active', active.id);
    const referenceBounds = resolveReferenceBounds({
      basis: 'active',
      canvasSize: { width: 1, height: 1 },
      selectionTargets: [],
      activeTarget: active,
    });

    const outcome = alignLayers(moveTargets, referenceBounds, 'left');

    expect(outcome.reason).toBeUndefined();
    expect(outcome.changes).toEqual([{ layerId: 'movable', newPosition: { x: 1000, y: 200 } }]);
  });

  it('入力を変更しない（非破壊）', () => {
    const before = JSON.parse(JSON.stringify([a, b]));
    alignLayers([a, b], selectionBounds, 'left');
    expect([a, b]).toEqual(before);
  });
});

describe('excludeActiveTarget', () => {
  const a = target('a');
  const b = target('b');

  it('selection基準では何も除外しない', () => {
    expect(excludeActiveTarget([a, b], 'selection', 'a')).toEqual([a, b]);
  });

  it('active基準でも activeLayerId が無ければ除外しない', () => {
    expect(excludeActiveTarget([a, b], 'active', null)).toEqual([a, b]);
  });
});

describe('distributeLayers', () => {
  it('対象が3件未満なら no-op で理由を返す', () => {
    const t1 = target('1', { position: { x: 0, y: 0 } });
    const t2 = target('2', { position: { x: 100, y: 0 } });
    const outcome = distributeLayers([t1, t2], 'horizontal');
    expect(outcome.changes).toEqual([]);
    expect(outcome.reason).toBe(DISTRIBUTE_MIN_TARGETS_REASON);
    expect(MIN_DISTRIBUTE_TARGETS).toBe(3);
  });

  it('水平方向: 両端を固定し中心を等間隔配置する', () => {
    // 半径10（textureSize 20x20）なので中心 = position + 10。
    // 中心: A=10, B=110, C=270 -> 等間隔なら 10, 140, 270
    const a = target('a', { position: { x: 0, y: 5 } });
    const b = target('b', { position: { x: 100, y: 5 } });
    const c = target('c', { position: { x: 260, y: 5 } });
    const outcome = distributeLayers([a, b, c], 'horizontal');
    expect(outcome.reason).toBeUndefined();
    const changeA = outcome.changes.find((ch) => ch.layerId === 'a')!;
    const changeB = outcome.changes.find((ch) => ch.layerId === 'b')!;
    const changeC = outcome.changes.find((ch) => ch.layerId === 'c')!;
    // 両端は固定（元の position のまま）
    expect(changeA.newPosition).toEqual({ x: 0, y: 5 });
    expect(changeC.newPosition).toEqual({ x: 260, y: 5 });
    // 中央は中心が 140 になるよう x だけ動く。y は変えない。
    expect(changeB.newPosition.x).toBeCloseTo(130);
    expect(changeB.newPosition.y).toBe(5);
  });

  it('垂直方向: 両端を固定し中心を等間隔配置する', () => {
    const a = target('a', { position: { x: 5, y: 0 } });
    const b = target('b', { position: { x: 5, y: 100 } });
    const c = target('c', { position: { x: 5, y: 260 } });
    const outcome = distributeLayers([a, b, c], 'vertical');
    const changeB = outcome.changes.find((ch) => ch.layerId === 'b')!;
    expect(changeB.newPosition.y).toBeCloseTo(130);
    expect(changeB.newPosition.x).toBe(5);
  });

  it('同率tiebreak: AABB中心が同値の場合は配列順（Asset.layers順）で決定される', () => {
    // t1(center 50), t2(center 150), t3(center 150), t4(center 250)
    // t2 と t3 が同値タイ。配列順は t2 が先、t3 が後。
    const t1 = target('t1', { position: { x: 40, y: 0 } });
    const t2 = target('t2', { position: { x: 140, y: 0 } });
    const t3 = target('t3', { position: { x: 140, y: 0 } });
    const t4 = target('t4', { position: { x: 240, y: 0 } });
    const outcome = distributeLayers([t1, t2, t3, t4], 'horizontal');
    expect(outcome.reason).toBeUndefined();
    const changeT2 = outcome.changes.find((ch) => ch.layerId === 't2')!;
    const changeT3 = outcome.changes.find((ch) => ch.layerId === 't3')!;
    // step = (250 - 50) / 3 = 66.666...
    // t2（sorted position 1）の目標中心 = 50 + 66.666... = 116.666...
    // t3（sorted position 2）の目標中心 = 50 + 133.333... = 183.333...
    expect(changeT2.newPosition.x).toBeCloseTo(140 + (116.6666667 - 150), 3);
    expect(changeT3.newPosition.x).toBeCloseTo(140 + (183.3333333 - 150), 3);
    expect(changeT2.newPosition.x).toBeLessThan(changeT3.newPosition.x);
  });

  it('入力を変更しない（非破壊）', () => {
    const a = target('a', { position: { x: 0, y: 5 } });
    const b = target('b', { position: { x: 100, y: 5 } });
    const c = target('c', { position: { x: 260, y: 5 } });
    const before = JSON.parse(JSON.stringify([a, b, c]));
    distributeLayers([a, b, c], 'horizontal');
    expect([a, b, c]).toEqual(before);
  });
});

describe('resolveReferenceBounds', () => {
  const a = target('a', { position: { x: 0, y: 0 } }, { width: 100, height: 50 });
  const b = target('b', { position: { x: 200, y: 300 } }, { width: 40, height: 40 });

  it('canvas基準', () => {
    const bounds = resolveReferenceBounds({
      basis: 'canvas',
      canvasSize: { width: 400, height: 200 },
      selectionTargets: [a, b],
      activeTarget: null,
    });
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 200 });
  });

  it('selection基準（既定）', () => {
    const bounds = resolveReferenceBounds({
      basis: 'selection',
      canvasSize: { width: 1, height: 1 },
      selectionTargets: [a, b],
      activeTarget: null,
    });
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 240, maxY: 340 });
  });

  it('active基準で active layer が無ければ null', () => {
    const bounds = resolveReferenceBounds({
      basis: 'active',
      canvasSize: { width: 1, height: 1 },
      selectionTargets: [a, b],
      activeTarget: null,
    });
    expect(bounds).toBeNull();
  });

  it('active基準で active layer の bounds を返す', () => {
    const bounds = resolveReferenceBounds({
      basis: 'active',
      canvasSize: { width: 1, height: 1 },
      selectionTargets: [a, b],
      activeTarget: b,
    });
    expect(bounds).toEqual({ minX: 200, minY: 300, maxX: 240, maxY: 340 });
  });
});
