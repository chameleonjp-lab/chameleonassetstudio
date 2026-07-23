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
  /** このフレームを表示する時間（ms）。未指定時は参照先Animationのfpsを使う。 */
  durationMs?: number;
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

export type AnimationEventPrimitive = string | number | boolean | null;

export type AnimationEventPayload =
  AnimationEventPrimitive | AnimationEventPrimitive[] | Record<string, AnimationEventPrimitive>;

/**
 * フレーム表示開始時にゲーム側へ伝える不活性なデータ。
 * name / payloadをアプリ内で実行したり、URLとして読み込んだりしない。
 */
export interface AnimationEvent {
  id: string;
  name: string;
  frameId: string;
  payload?: AnimationEventPayload;
}

/** 複数フレームを順に再生する設定。フレーム実体は Asset.frames が持つ。 */
export interface Animation {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  frameIds: string[];
  /** 参考用の合計時間。再生・検査・派生書き出しの時間計算には使わない。 */
  durationMs?: number;
  /** 対象Frameの表示開始時に、配列順で通知するイベント。 */
  events?: AnimationEvent[];
}
