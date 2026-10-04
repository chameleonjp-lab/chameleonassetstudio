import type { Project3D, Transform3D, Vec3 } from '../model/project';

/** Ephemeral interaction settings; these are never native schema fields. */
export interface NativeEditOptions {
  mode: 'translate' | 'rotate' | 'scale';
  space: 'world' | 'local';
  /** Metres, radians, or scale-factor increments measured from gesture start. */
  snap: number | null;
}
export interface NativeEditContext {
  selection: string[];
  activeId: string | null;
  options: NativeEditOptions;
  readOnly: boolean;
  /** Reserved evaluation input; product sessions currently expose no lock mutation. */
  lockedIds: string[];
}
export interface NativeEditToken {
  readonly generation: number;
  readonly projectId: string;
  readonly revision: number;
}
export interface NativeEditFrame {
  position: Vec3;
  rotation: Transform3D['rotation'];
}
export interface NativeTransformUpdate {
  id: string;
  transform: Transform3D;
}
/** Math lives in a lazy adapter and does not require a WebGL context. */
export interface NativeTransformEvaluator {
  selectionFrame(project: Project3D, context: NativeEditContext): NativeEditFrame;
  evaluateDelta(
    project: Project3D,
    context: NativeEditContext,
    frame: NativeEditFrame,
    delta: Vec3,
  ): NativeTransformUpdate[];
}
export type NativeEditResult = { ok: true; changed?: boolean } | { ok: false; reason: string };
export type NativeEditStart =
  { ok: true; token: NativeEditToken; frame: NativeEditFrame } | { ok: false; reason: string };
export interface NativeTransformPreview {
  projectId: string;
  baseRevision: number;
  generation: number;
  sequence: number;
  updates: NativeTransformUpdate[];
}
export interface NativeEditState {
  projectId: string;
  revision: number;
  context: NativeEditContext;
  active: boolean;
  token: NativeEditToken | null;
  frame: NativeEditFrame | null;
  preview: NativeTransformPreview | null;
  /** Changes for preview, context and canonical project notifications. */
  sequence: number;
  /** Invalidates asynchronous capture on any intervening editing boundary. */
  epoch: number;
  lastReason: string;
  /** Last local observer failure; separate from the outcome of an authoring operation. */
  observerError: string | null;
  blocked: string[];
  evaluatorReady: boolean;
}
export interface NativeCaptureGuard {
  readonly epoch: number;
  isCurrent(): boolean;
  release(): void;
}
/** Only plain model data crosses this port. No history, repository, or renderer objects. */
export interface NativeEditBinding {
  readonly state: NativeEditState;
  getProject(): Project3D;
  getFrame(): NativeEditFrame;
  subscribe(listener: () => void): () => void;
  setEvaluator(evaluator: NativeTransformEvaluator): void;
  setSelection(ids: string[], activeId?: string | null): void;
  setOptions(options: NativeEditOptions): NativeEditResult;
  begin(): NativeEditStart;
  preview(token: NativeEditToken, delta: Vec3): NativeEditResult;
  commit(token: NativeEditToken): NativeEditResult;
  /** Supplying a stale token must never cancel a newer gesture. */
  cancel(reason?: string, token?: NativeEditToken): void;
  setBlocked(reason: string, blocked: boolean): void;
  /** Rejects active previews; nested guards block gestures until all release. Acquire/release preserve epoch. */
  beginCapture(): NativeCaptureGuard;
}
