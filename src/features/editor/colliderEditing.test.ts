import { describe, expect, it } from 'vitest';
import characterAsset from '../../core/samples/asset.character.json';
import { validateAsset } from '../../core/schema/validate';
import type { Asset } from '../../core/model';
import type { CircleCollider, RectCollider } from '../../core/model/collider';
import type { ViewTransform } from '../../renderers/canvas2d/view';
import {
  hitTestColliderHandle,
  hitTestColliders,
  moveColliderBy,
  resizeColliderRadius,
  resizeColliderRect,
} from './colliderEditing';

const baseAsset = characterAsset as unknown as Asset;
const identityView: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

function withColliders(colliders: Asset['colliders']): Asset {
  return { ...baseAsset, colliders };
}

const rectA: RectCollider = {
  id: 'a',
  name: 'a',
  purpose: 'body',
  shape: 'rect',
  visible: true,
  rect: { x: 0, y: 0, width: 10, height: 10 },
};

const rectB: RectCollider = {
  id: 'b',
  name: 'b',
  purpose: 'attack',
  shape: 'rect',
  visible: true,
  rect: { x: 5, y: 5, width: 10, height: 10 },
};

const circleC: CircleCollider = {
  id: 'c',
  name: 'c',
  purpose: 'pickup',
  shape: 'circle',
  visible: true,
  circle: { x: 20, y: 20, radius: 5 },
};

const hiddenD: RectCollider = {
  id: 'd',
  name: 'd',
  purpose: 'sensor',
  shape: 'rect',
  visible: false,
  rect: { x: 0, y: 0, width: 10, height: 10 },
};

describe('hitTestColliders', () => {
  it('rect の内外を判定する', () => {
    expect(hitTestColliders([rectA], { x: 5, y: 5 }, null)).toBe('a');
    expect(hitTestColliders([rectA], { x: 15, y: 15 }, null)).toBeNull();
  });

  it('circle の内外を判定する', () => {
    expect(hitTestColliders([circleC], { x: 20, y: 23 }, null)).toBe('c');
    expect(hitTestColliders([circleC], { x: 20, y: 30 }, null)).toBeNull();
  });

  it('visible: false の判定は対象外にする', () => {
    expect(hitTestColliders([hiddenD], { x: 5, y: 5 }, null)).toBeNull();
  });

  it('選択中の判定を最優先する', () => {
    // a と b は (5,5)-(10,10) の範囲で重なる
    expect(hitTestColliders([rectA, rectB], { x: 7, y: 7 }, null)).toBe('b');
    expect(hitTestColliders([rectA, rectB], { x: 7, y: 7 }, 'a')).toBe('a');
  });

  it('選択が重ならない場合は配列の後ろ（描画で上）から順に判定する', () => {
    expect(hitTestColliders([rectA, rectB], { x: 2, y: 2 }, null)).toBe('a');
    expect(hitTestColliders([rectA, rectB], { x: 12, y: 12 }, null)).toBe('b');
  });
});

describe('hitTestColliderHandle', () => {
  // 隣り合う隅が許容 10px の範囲で重ならないよう、辺の長い矩形で検証する
  const handleRect: RectCollider = {
    id: 'handle-rect',
    name: 'handle-rect',
    purpose: 'body',
    shape: 'rect',
    visible: true,
    rect: { x: 0, y: 0, width: 40, height: 40 },
  };

  it('rect の四隅ハンドルを検出する', () => {
    expect(hitTestColliderHandle(handleRect, { x: 0, y: 0 }, identityView)).toBe('nw');
    expect(hitTestColliderHandle(handleRect, { x: 40, y: 0 }, identityView)).toBe('ne');
    expect(hitTestColliderHandle(handleRect, { x: 0, y: 40 }, identityView)).toBe('sw');
    expect(hitTestColliderHandle(handleRect, { x: 40, y: 40 }, identityView)).toBe('se');
    expect(hitTestColliderHandle(handleRect, { x: 20, y: 20 }, identityView)).toBeNull();
  });

  it('circle の半径ハンドルを検出する', () => {
    expect(hitTestColliderHandle(circleC, { x: 25, y: 20 }, identityView)).toBe('radius');
    expect(hitTestColliderHandle(circleC, { x: 0, y: 0 }, identityView)).toBeNull();
  });

  it('visible: false の判定はハンドルも対象外にする（本体ヒットと対称）', () => {
    const hiddenRect: RectCollider = { ...handleRect, visible: false };
    expect(hitTestColliderHandle(hiddenRect, { x: 0, y: 0 }, identityView)).toBeNull();
    const hiddenCircle = { ...circleC, visible: false };
    expect(hitTestColliderHandle(hiddenCircle, { x: 25, y: 20 }, identityView)).toBeNull();
  });
});

describe('moveColliderBy', () => {
  it('rect は x/y だけ変化し、width/height は変わらない', () => {
    const asset = withColliders([rectA]);
    const next = moveColliderBy(
      asset,
      'a',
      rectA,
      { x: 5, y: 3 },
      { enabled: false, gridSize: 16 },
    );
    const moved = next.colliders.find((c) => c.id === 'a') as RectCollider;
    expect(moved.rect.x).toBe(5);
    expect(moved.rect.y).toBe(3);
    expect(moved.rect.width).toBe(rectA.rect.width);
    expect(moved.rect.height).toBe(rectA.rect.height);
  });

  it('circle は x/y だけ変化し、radius は変わらない', () => {
    const asset = withColliders([circleC]);
    const next = moveColliderBy(
      asset,
      'c',
      circleC,
      { x: 4, y: -2 },
      {
        enabled: false,
        gridSize: 16,
      },
    );
    const moved = next.colliders.find((c) => c.id === 'c') as CircleCollider;
    expect(moved.circle.x).toBe(24);
    expect(moved.circle.y).toBe(18);
    expect(moved.circle.radius).toBe(circleC.circle.radius);
  });

  it('スナップ ON では grid サイズへ丸める', () => {
    const asset = withColliders([rectA]);
    const next = moveColliderBy(
      asset,
      'a',
      rectA,
      { x: 37, y: 21 },
      {
        enabled: true,
        gridSize: 16,
      },
    );
    const moved = next.colliders.find((c) => c.id === 'a') as RectCollider;
    expect(moved.rect.x).toBe(32);
    expect(moved.rect.y).toBe(16);
  });

  it('スナップ OFF では整数へ丸める', () => {
    const asset = withColliders([rectA]);
    const next = moveColliderBy(
      asset,
      'a',
      rectA,
      { x: 5.6, y: 3.2 },
      {
        enabled: false,
        gridSize: 16,
      },
    );
    const moved = next.colliders.find((c) => c.id === 'a') as RectCollider;
    expect(moved.rect.x).toBe(6);
    expect(moved.rect.y).toBe(3);
  });
});

describe('resizeColliderRect', () => {
  const base: RectCollider = {
    id: 'r',
    name: 'r',
    purpose: 'body',
    shape: 'rect',
    visible: true,
    rect: { x: 10, y: 10, width: 20, height: 30 },
  };
  const snapOff = { enabled: false, gridSize: 16 };

  it('nw ハンドルは対角（se）を固定する', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(asset, 'r', base, 'nw', { x: 5, y: 5 }, snapOff);
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    expect(rect).toEqual({ x: 5, y: 5, width: 25, height: 35 });
  });

  it('ne ハンドルは対角（sw）を固定する', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(asset, 'r', base, 'ne', { x: 40, y: 5 }, snapOff);
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    expect(rect).toEqual({ x: 10, y: 5, width: 30, height: 35 });
  });

  it('sw ハンドルは対角（ne）を固定する', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(asset, 'r', base, 'sw', { x: 5, y: 50 }, snapOff);
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    expect(rect).toEqual({ x: 5, y: 10, width: 25, height: 40 });
  });

  it('se ハンドルは対角（nw）を固定する', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(asset, 'r', base, 'se', { x: 50, y: 60 }, snapOff);
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    expect(rect).toEqual({ x: 10, y: 10, width: 40, height: 50 });
  });

  it('対角を越えて動かしても反転せず、最小サイズ 1 でクランプする', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(asset, 'r', base, 'nw', { x: 100, y: 100 }, snapOff);
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    // 対角（右下 = 30, 40）は固定されたまま、最小サイズ 1 に収まる
    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
    expect(rect.x).toBe(29);
    expect(rect.y).toBe(39);
  });

  it('スナップ ON では grid サイズへ丸める', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRect(
      asset,
      'r',
      base,
      'se',
      { x: 53, y: 61 },
      {
        enabled: true,
        gridSize: 16,
      },
    );
    const rect = (next.colliders.find((c) => c.id === 'r') as RectCollider).rect;
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(10);
    expect(rect.width).toBe(48 - 10);
    expect(rect.height).toBe(64 - 10);
  });
});

describe('resizeColliderRadius', () => {
  const base: CircleCollider = {
    id: 'c',
    name: 'c',
    purpose: 'body',
    shape: 'circle',
    visible: true,
    circle: { x: 50, y: 50, radius: 10 },
  };

  it('中心からの距離を新しい半径にし、中心は変えない', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRadius(
      asset,
      'c',
      base,
      { x: 50, y: 76 },
      {
        enabled: false,
        gridSize: 16,
      },
    );
    const circle = (next.colliders.find((col) => col.id === 'c') as CircleCollider).circle;
    expect(circle.radius).toBe(26);
    expect(circle.x).toBe(50);
    expect(circle.y).toBe(50);
  });

  it('最小半径は 1 にクランプする', () => {
    const asset = withColliders([base]);
    const next = resizeColliderRadius(
      asset,
      'c',
      base,
      { x: 50, y: 50 },
      {
        enabled: false,
        gridSize: 16,
      },
    );
    const circle = (next.colliders.find((col) => col.id === 'c') as CircleCollider).circle;
    expect(circle.radius).toBe(1);
  });

  it('更新後のアセットは schema 検証を通る', () => {
    const asset = withColliders([base, rectA]);
    const next = resizeColliderRadius(
      asset,
      'c',
      base,
      { x: 50, y: 66 },
      {
        enabled: false,
        gridSize: 16,
      },
    );
    expect(validateAsset(next).valid).toBe(true);
  });
});
