import type { NativeCaptureGuard, NativeEditResult } from './editPort';
import type { RigPoseState } from './rigPosePort';
export interface AnimationState extends RigPoseState {
  clipId: string | null;
  time: number;
  playing: boolean;
}
export interface AnimationBinding {
  readonly state: AnimationState;
  subscribe(listener: () => void): () => void;
  select(clipId: string | null): NativeEditResult;
  seek(time: number): NativeEditResult;
  play(): NativeEditResult;
  pause(reason?: string): void;
  cancel(reason?: string): void;
  /** Renderer-owned requestAnimationFrame clock in milliseconds. */
  advance(timestamp: number): void;
  setAvailable(available: boolean): void;
  beginCapture(): NativeCaptureGuard;
}
