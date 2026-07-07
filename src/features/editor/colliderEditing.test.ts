import { describe, expect, test } from 'vitest';
import type { Collider } from '../../core/model';
import {
  colliderLineDash,
  hitTestCollider,
  moveCircle,
  moveRect,
  resizeCircle,
  resizeRect,
} from './colliderEditing';

const rect: Collider = {
  id: 'r',
  name: 'body',
  purpose: 'body',
  visible: true,
  shape: 'rect',
  rect: { x: 10, y: 20, width: 30, height: 40 },
};
const circle: Collider = {
  id: 'c',
  name: 'sensor',
  purpose: 'sensor',
  visible: true,
  shape: 'circle',
  circle: { x: 50, y: 60, radius: 10 },
};

describe('collider canvas editing helpers', () => {
  test('rect の選択判定は本体とリサイズハンドルを返す', () => {
    expect(hitTestCollider(rect, { x: 20, y: 30 })).toBe('body');
    expect(hitTestCollider(rect, { x: 40, y: 60 })).toBe('se');
    expect(hitTestCollider({ ...rect, visible: false }, { x: 20, y: 30 })).toBeNull();
  });

  test('circle の選択判定は中心移動と半径ハンドルを返す', () => {
    expect(hitTestCollider(circle, { x: 50, y: 60 })).toBe('center');
    expect(hitTestCollider(circle, { x: 60, y: 60 })).toBe('radius');
  });

  test('rect の移動・リサイズは安全な最小サイズに丸める', () => {
    expect(moveRect(rect.rect, 5.4, -3.2, false, 16)).toEqual({
      x: 15,
      y: 17,
      width: 30,
      height: 40,
    });
    expect(resizeRect(rect.rect, 'nw', 100, 100, false, 16)).toEqual({
      x: 39,
      y: 59,
      width: 1,
      height: 1,
    });
  });

  test('circle の移動・radius 変更は安全な最小半径に丸める', () => {
    expect(moveCircle(circle.circle, 5.4, -3.2, false, 16)).toEqual({ x: 55, y: 57, radius: 10 });
    expect(resizeCircle(circle.circle, { x: 50, y: 60 }, false, 16).radius).toBe(1);
  });

  test('sensor は破線、snap ON/OFF は更新値に差が出る', () => {
    expect(colliderLineDash('sensor')).toEqual([6, 4]);
    expect(colliderLineDash('body')).toEqual([]);
    expect(moveRect(rect.rect, 5, 5, true, 16).x).toBe(16);
    expect(moveRect(rect.rect, 5, 5, false, 16).x).toBe(15);
  });
});
