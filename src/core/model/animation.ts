import type { LayerTransform } from './layer';

/** フレーム内での 1 レイヤーの状態。省略した項目はレイヤー本体の値を使う。 */
export interface FrameLayerState {
  layerId: string;
  visible?: boolean;
  transform?: LayerTransform;
  /** 不透明度。0〜1。 */
  opacity?: number;
}

/** アニメーションの 1 枚の状態。順序は Asset.frames の配列順で表す。 */
export interface Frame {
  id: string;
  name: string;
  layerStates: FrameLayerState[];
}

export const ANIMATION_NAME_SUGGESTIONS = [
  'idle',
  'walk',
  'run',
  'jump',
  'fall',
  'attack',
  'damage',
  'dead',
  'win',
  'lose',
] as const;

/** 複数フレームを順に再生する設定。フレーム実体は Asset.frames が持つ。 */
export interface Animation {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  frameIds: string[];
  /** 再生時間（ミリ秒）。未指定時は frameIds.length / fps から導出する。 */
  durationMs?: number;
}
