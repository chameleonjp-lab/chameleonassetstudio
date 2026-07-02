import type { Vec2 } from './common';

export const PART_TYPES = [
  'head',
  'body',
  'arm_left',
  'arm_right',
  'leg_left',
  'leg_right',
  'weapon',
  'eye',
  'mouth',
  'shadow',
  'accessory',
  'other',
] as const;

export type PartType = (typeof PART_TYPES)[number];

/** 頭、胴体、腕、武器など、意味を持つ部位。複数レイヤーをまとめる。 */
export interface Part {
  id: string;
  name: string;
  partType: PartType;
  layerIds: string[];
  /** パーツの基準点（キャンバス座標）。回転や取り付けの基準に使う。 */
  pivot?: Vec2;
}
