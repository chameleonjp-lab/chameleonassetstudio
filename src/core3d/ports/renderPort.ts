import type { Project3D } from '../model/project';

export type NativeViewportResult = { ok: true } | { ok: false; reason: string };
export type NativeCameraAction =
  | 'orbit-left'
  | 'orbit-right'
  | 'orbit-up'
  | 'orbit-down'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out';
export interface NativeViewportStatus {
  state:
    | 'empty'
    | 'active'
    | 'hidden'
    | 'frozen'
    | 'suspended'
    | 'context-lost'
    | 'unavailable'
    | 'unsupported'
    | 'error'
    | 'disposed';
  reason?: string;
}
export interface NativeViewportSuspensionContract {
  persistedRevision: number | null;
  currentRevision: number;
  sourcesComplete: boolean;
}

/** Structural boundary only: this panel does not import or select a renderer. */
export interface NativeViewportPort {
  readonly status: NativeViewportStatus;
  setProject(project: Project3D): NativeViewportResult;
  resetCamera(): void;
  fitCamera(): void;
  cameraAction(action: NativeCameraAction): NativeViewportResult;
  suspend(contract: NativeViewportSuspensionContract): NativeViewportResult;
  resume(contract: NativeViewportSuspensionContract): NativeViewportResult;
  capturePng(): Promise<Blob>;
  dispose(): void;
}

/**
 * A factory owns partial allocations until it resolves, and must clean them up if it rejects.
 * Keep its identity stable; replacing the factory intentionally replaces the controller.
 */
export type NativeViewportFactory = (
  host: HTMLElement,
  onStatus: (status: NativeViewportStatus) => void,
) => Promise<NativeViewportPort>;
