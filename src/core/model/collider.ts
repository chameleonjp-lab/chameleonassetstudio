export const COLLIDER_PURPOSES = ['body', 'attack', 'pickup', 'sensor', 'custom'] as const;

export type ColliderPurpose = (typeof COLLIDER_PURPOSES)[number];

export const COLLIDER_SHAPES = ['rect', 'circle'] as const;

export type ColliderShape = (typeof COLLIDER_SHAPES)[number];

export interface ColliderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColliderCircle {
  x: number;
  y: number;
  radius: number;
}

interface ColliderBase {
  id: string;
  name: string;
  purpose: ColliderPurpose;
  /** 編集画面で判定を表示するかどうか。 */
  visible: boolean;
}

export interface RectCollider extends ColliderBase {
  shape: 'rect';
  rect: ColliderRect;
}

export interface CircleCollider extends ColliderBase {
  shape: 'circle';
  circle: ColliderCircle;
}

/** 接触判定用の矩形または円。 */
export type Collider = RectCollider | CircleCollider;
