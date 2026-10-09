import type { Transform3D } from '../model/project';
import type { NativeCaptureGuard, NativeEditResult } from './editPort';

/** Transient local TRS overlays. Canonical nodes always retain the rest transforms. */
export interface RigPoseUpdate {
  nodeId: string;
  transform: Transform3D;
}
export interface RigPoseToken {
  projectId: string;
  revision: number;
  epoch: number;
}
export interface RigPoseState {
  projectId: string;
  revision: number;
  epoch: number;
  sequence: number;
  active: boolean;
  updates: RigPoseUpdate[];
  reason: string;
}
export interface RigPoseBinding {
  readonly state: RigPoseState;
  subscribe(listener: () => void): () => void;
  begin(): RigPoseToken;
  preview(token: RigPoseToken, updates: RigPoseUpdate[]): NativeEditResult;
  cancel(reason?: string): void;
  beginCapture(): NativeCaptureGuard;
}
