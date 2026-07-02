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
}
