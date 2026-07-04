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

/** パーツのローカルポーズ（Phase 15 簡易リグ）。 */
export interface PartPose {
  localPosition?: Vec2;
  localRotation?: number; // 度
  localScale?: Vec2;
}

/** 頭、胴体、腕、武器など、意味を持つ部位。複数レイヤーをまとめる。 */
export interface Part {
  id: string;
  name: string;
  partType: PartType;
  layerIds: string[];
  /** パーツの基準点（キャンバス座標）。回転や取り付けの基準に使う。 */
  pivot?: Vec2;
  /** 親パーツ ID（Phase 15 簡易リグ）。未設定はルート。循環は禁止（UI とバリデーションで防ぐ）。 */
  parentId?: string;
  /**
   * 基準ポーズ（Phase 15 簡易リグ）。未設定は
   * `{ localPosition: {x:0,y:0}, localRotation: 0, localScale: {x:1,y:1} }` として扱う。
   */
  bindPose?: PartPose;
  /** localRotation の可動域（度、Phase 15 簡易リグ）。UI 入力時に clamp する。 */
  rotationLimit?: { min: number; max: number };
}
