import type { Vec2 } from './common';

export const LAYER_TYPES = ['image', 'shape', 'guide'] as const;

export type LayerType = (typeof LAYER_TYPES)[number];

/** レイヤーやフレーム内レイヤー状態が持つ変形情報。rotation の単位は度。 */
export interface LayerTransform {
  position: Vec2;
  scale: Vec2;
  rotation: number;
}

/**
 * 表示順を持つ編集要素。表示順は Asset.layers の配列順で表す（先頭が最背面）。
 * ズーム倍率や選択状態などの UI 状態は含めない。
 */
export interface Layer {
  id: string;
  name: string;
  layerType: LayerType;
  visible: boolean;
  locked: boolean;
  /** 不透明度。0〜1。 */
  opacity: number;
  transform: LayerTransform;
  /** image レイヤーが参照する TextureRef の id。 */
  textureId?: string;
}
