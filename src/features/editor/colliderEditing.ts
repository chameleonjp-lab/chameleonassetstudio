/**
 * 判定ツール（Phase 19-C）用の純関数群。
 * キャンバス上での当たり判定の選択・移動・リサイズ判定と、
 * それに伴うアセット更新をまとめる。UI 状態（選択中 id、ドラッグ中かどうか）は
 * ここでは持たず、呼び出し側（CanvasEditor）が管理する。
 */
import { updateCollider, type Asset } from '../../core/model';
import type { CircleCollider, Collider, RectCollider } from '../../core/model/collider';
import type { Vec2 } from '../../core/model/common';
import { snapToGrid, worldToScreen, type ViewTransform } from '../../renderers/canvas2d/view';

/** rect の四隅ハンドル。circle は中心右の 'radius' ハンドルのみ持つ。 */
export type ColliderRectHandle = 'nw' | 'ne' | 'sw' | 'se';
export type ColliderHandle = ColliderRectHandle | 'radius';

/** アンカードラッグと同じ、画面座標での許容距離（px）。 */
const HANDLE_HIT_RADIUS = 10;

export interface ColliderSnapOptions {
  enabled: boolean;
  gridSize: number;
}

/** スナップ ON ならグリッドへ、OFF なら整数へ丸める（既存 snapCoordinate と同じ規則）。 */
function snapValue(value: number, snap: ColliderSnapOptions): number {
  return snap.enabled ? snapToGrid(value, snap.gridSize) : Math.round(value);
}

function hitTestColliderBody(collider: Collider, worldPoint: Vec2): boolean {
  if (collider.shape === 'rect') {
    const { x, y, width, height } = collider.rect;
    return (
      worldPoint.x >= x &&
      worldPoint.x <= x + width &&
      worldPoint.y >= y &&
      worldPoint.y <= y + height
    );
  }
  const { x, y, radius } = collider.circle;
  return Math.hypot(worldPoint.x - x, worldPoint.y - y) <= radius;
}

/**
 * world 座標での当たり判定の本体ヒットテスト。非表示（visible: false）は対象外。
 * 選択中の判定を最優先し、次に配列の後ろ（描画で上になっているもの）から順に判定する。
 */
export function hitTestColliders(
  colliders: Collider[],
  worldPoint: Vec2,
  selectedColliderId: string | null,
): string | null {
  if (selectedColliderId) {
    const selected = colliders.find((collider) => collider.id === selectedColliderId);
    if (selected && selected.visible && hitTestColliderBody(selected, worldPoint)) {
      return selected.id;
    }
  }
  for (let i = colliders.length - 1; i >= 0; i -= 1) {
    const collider = colliders[i];
    if (collider.visible && hitTestColliderBody(collider, worldPoint)) {
      return collider.id;
    }
  }
  return null;
}

function screenHit(view: ViewTransform, worldPoint: Vec2, screenPoint: Vec2): boolean {
  const screen = worldToScreen(view, worldPoint);
  return Math.hypot(screen.x - screenPoint.x, screen.y - screenPoint.y) <= HANDLE_HIT_RADIUS;
}

/**
 * 選択中判定のハンドルヒットテスト（screen 座標、許容 10px）。
 * rect は四隅、circle は中心右 (x + radius, y) を判定する。
 * 非表示（visible: false）はハンドルも描画されないため、本体ヒットと同様に対象外。
 */
export function hitTestColliderHandle(
  collider: Collider,
  screenPoint: Vec2,
  view: ViewTransform,
): ColliderHandle | null {
  if (!collider.visible) {
    return null;
  }
  if (collider.shape === 'rect') {
    const { x, y, width, height } = collider.rect;
    const corners: Array<{ handle: ColliderRectHandle; point: Vec2 }> = [
      { handle: 'nw', point: { x, y } },
      { handle: 'ne', point: { x: x + width, y } },
      { handle: 'sw', point: { x, y: y + height } },
      { handle: 'se', point: { x: x + width, y: y + height } },
    ];
    for (const corner of corners) {
      if (screenHit(view, corner.point, screenPoint)) {
        return corner.handle;
      }
    }
    return null;
  }
  const { x, y, radius } = collider.circle;
  return screenHit(view, { x: x + radius, y }, screenPoint) ? 'radius' : null;
}

/**
 * ドラッグ開始時の collider（before）を基準に、world 座標の移動量（worldDelta）だけ動かす。
 * rect は x/y、circle は x/y のみ更新し、width/height/radius は変えない。
 */
export function moveColliderBy(
  asset: Asset,
  colliderId: string,
  before: Collider,
  worldDelta: Vec2,
  snap: ColliderSnapOptions,
): Asset {
  if (before.shape === 'rect') {
    return updateCollider(asset, colliderId, {
      rect: {
        x: snapValue(before.rect.x + worldDelta.x, snap),
        y: snapValue(before.rect.y + worldDelta.y, snap),
      },
    });
  }
  return updateCollider(asset, colliderId, {
    circle: {
      x: snapValue(before.circle.x + worldDelta.x, snap),
      y: snapValue(before.circle.y + worldDelta.y, snap),
    },
  });
}

/**
 * rect の四隅ハンドルによるリサイズ。掴んだ隅を worldPoint（snap 適用後）へ動かし、
 * 対角の隅は固定する。width / height は最小 1 に丸め、反転（隅の入れ替わり）はさせない。
 */
export function resizeColliderRect(
  asset: Asset,
  colliderId: string,
  before: RectCollider,
  handle: ColliderRectHandle,
  worldPoint: Vec2,
  snap: ColliderSnapOptions,
): Asset {
  const rect = before.rect;
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const draggedX = snapValue(worldPoint.x, snap);
  const draggedY = snapValue(worldPoint.y, snap);

  let x = left;
  let width = rect.width;
  if (handle === 'nw' || handle === 'sw') {
    // 対角（右辺）を固定し、左辺だけ動かす。右辺を越えないようクランプする。
    x = Math.min(draggedX, right - 1);
    width = right - x;
  } else {
    const newRight = Math.max(draggedX, left + 1);
    width = newRight - left;
  }

  let y = top;
  let height = rect.height;
  if (handle === 'nw' || handle === 'ne') {
    // 対角（下辺）を固定し、上辺だけ動かす。下辺を越えないようクランプする。
    y = Math.min(draggedY, bottom - 1);
    height = bottom - y;
  } else {
    const newBottom = Math.max(draggedY, top + 1);
    height = newBottom - top;
  }

  return updateCollider(asset, colliderId, {
    rect: {
      x,
      y,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
  });
}

/**
 * circle の半径ハンドルによるリサイズ。中心（before.circle）から worldPoint までの
 * 距離を新しい半径にする。中心は変更しない。
 */
export function resizeColliderRadius(
  asset: Asset,
  colliderId: string,
  before: CircleCollider,
  worldPoint: Vec2,
  snap: ColliderSnapOptions,
): Asset {
  const distance = Math.hypot(worldPoint.x - before.circle.x, worldPoint.y - before.circle.y);
  const radius = Math.max(1, Math.round(snapValue(distance, snap)));
  return updateCollider(asset, colliderId, { circle: { radius } });
}
