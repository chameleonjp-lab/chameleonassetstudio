import type { Asset, Collider, ColliderCircle, ColliderRect, Vec2 } from '../../core/model';
import { snapToGrid } from '../../renderers/canvas2d/view';

export type ColliderHandle =
  'body' | 'center' | 'radius' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface ColliderHit {
  colliderId: string;
  handle: ColliderHandle;
}
export const MIN_COLLIDER_SIZE = 1;

export function colliderLineDash(purpose: string): number[] {
  return purpose === 'sensor' ? [6, 4] : [];
}
const snap = (value: number, enabled: boolean, gridSize: number) =>
  enabled ? snapToGrid(value, gridSize) : Math.round(value);
export function hitTestCollider(
  collider: Collider,
  point: Vec2,
  tolerance = 6,
): ColliderHandle | null {
  if (!collider.visible) return null;
  if (collider.shape === 'rect') {
    const r = collider.rect;
    const x2 = r.x + r.width;
    const y2 = r.y + r.height;
    const handles: Array<[ColliderHandle, Vec2]> = [
      ['nw', { x: r.x, y: r.y }],
      ['ne', { x: x2, y: r.y }],
      ['sw', { x: r.x, y: y2 }],
      ['se', { x: x2, y: y2 }],
      ['n', { x: r.x + r.width / 2, y: r.y }],
      ['s', { x: r.x + r.width / 2, y: y2 }],
      ['w', { x: r.x, y: r.y + r.height / 2 }],
      ['e', { x: x2, y: r.y + r.height / 2 }],
    ];
    for (const [h, p] of handles)
      if (Math.hypot(point.x - p.x, point.y - p.y) <= tolerance) return h;
    const inX = point.x >= r.x - tolerance && point.x <= x2 + tolerance;
    const inY = point.y >= r.y - tolerance && point.y <= y2 + tolerance;
    const nearEdge =
      Math.abs(point.x - r.x) <= tolerance ||
      Math.abs(point.x - x2) <= tolerance ||
      Math.abs(point.y - r.y) <= tolerance ||
      Math.abs(point.y - y2) <= tolerance;
    if (
      inX &&
      inY &&
      (nearEdge || (point.x >= r.x && point.x <= x2 && point.y >= r.y && point.y <= y2))
    )
      return 'body';
  } else {
    const c = collider.circle;
    const distance = Math.hypot(point.x - c.x, point.y - c.y);
    if (Math.abs(distance - c.radius) <= tolerance) return 'radius';
    if (distance <= Math.max(tolerance, c.radius)) return 'center';
  }
  return null;
}
export function hitTestColliders(
  colliders: Collider[],
  point: Vec2,
  tolerance = 6,
): ColliderHit | null {
  for (let i = colliders.length - 1; i >= 0; i--) {
    const h = hitTestCollider(colliders[i], point, tolerance);
    if (h) return { colliderId: colliders[i].id, handle: h };
  }
  return null;
}
export function moveRect(
  rect: ColliderRect,
  dx: number,
  dy: number,
  snapEnabled: boolean,
  gridSize: number,
): ColliderRect {
  return {
    ...rect,
    x: snap(rect.x + dx, snapEnabled, gridSize),
    y: snap(rect.y + dy, snapEnabled, gridSize),
  };
}
export function resizeRect(
  rect: ColliderRect,
  handle: ColliderHandle,
  dx: number,
  dy: number,
  snapEnabled: boolean,
  gridSize: number,
): ColliderRect {
  let left = rect.x,
    top = rect.y,
    right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;
  if (snapEnabled) {
    left = snapToGrid(left, gridSize);
    top = snapToGrid(top, gridSize);
    right = snapToGrid(right, gridSize);
    bottom = snapToGrid(bottom, gridSize);
  } else {
    left = Math.round(left);
    top = Math.round(top);
    right = Math.round(right);
    bottom = Math.round(bottom);
  }
  if (right - left < MIN_COLLIDER_SIZE) {
    if (handle.includes('w')) {
      left = right - MIN_COLLIDER_SIZE;
    } else {
      right = left + MIN_COLLIDER_SIZE;
    }
  }
  if (bottom - top < MIN_COLLIDER_SIZE) {
    if (handle.includes('n')) {
      top = bottom - MIN_COLLIDER_SIZE;
    } else {
      bottom = top + MIN_COLLIDER_SIZE;
    }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function moveCircle(
  circle: ColliderCircle,
  dx: number,
  dy: number,
  snapEnabled: boolean,
  gridSize: number,
): ColliderCircle {
  return {
    ...circle,
    x: snap(circle.x + dx, snapEnabled, gridSize),
    y: snap(circle.y + dy, snapEnabled, gridSize),
  };
}
export function resizeCircle(
  circle: ColliderCircle,
  point: Vec2,
  snapEnabled: boolean,
  gridSize: number,
): ColliderCircle {
  const raw = Math.max(MIN_COLLIDER_SIZE, Math.hypot(point.x - circle.x, point.y - circle.y));
  const radius = Math.max(MIN_COLLIDER_SIZE, snap(raw, snapEnabled, gridSize));
  return { ...circle, radius };
}
export function updateAssetCollider(
  asset: Asset,
  colliderId: string,
  updater: (c: Collider) => Collider,
): Asset {
  return {
    ...asset,
    updatedAt: new Date().toISOString(),
    colliders: asset.colliders.map((c) => (c.id === colliderId ? updater(c) : c)),
  };
}
