import type { PartPose } from './part';

/** リグアニメーションのキーフレーム。time は 0〜1 の正規化時刻。 */
export interface RigKeyframe {
  time: number;
  poses: Record<string, PartPose>; // key は partId
}

/** 簡易リグのアニメーション（Phase 15）。焼き込んでフレームアニメーションにする。 */
export interface RigAnimation {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  durationMs: number;
  keyframes: RigKeyframe[];
}
