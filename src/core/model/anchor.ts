import type { Vec2 } from './common';

export const ANCHOR_ROLES = [
  'foot',
  'center',
  'head',
  'hand_left',
  'hand_right',
  'weapon',
  'projectile_spawn',
  'damage_effect',
  'shadow_center',
  'custom',
] as const;

export type AnchorRole = (typeof ANCHOR_ROLES)[number];

/** 手、弾発射位置、影、エフェクト位置などの参照座標。 */
export interface Anchor {
  id: string;
  name: string;
  role: AnchorRole;
  position: Vec2;
}
