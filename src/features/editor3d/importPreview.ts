import type {
  NativeCameraAction,
  NativeViewportFactory,
  NativeViewportPort,
  NativeViewportResult,
  NativeViewportStatus,
} from '../../core3d/ports/renderPort';
import type { NativeImportReview } from './importReview';
import { NativeTexturePreparer } from './textureSnapshot';

export interface NativeImportPreviewState {
  readonly state: NativeViewportStatus['state'] | 'loading';
  readonly ready: boolean;
  readonly reason?: string;
}

export interface NativeImportPreviewDependencies {
  factory: NativeViewportFactory;
  createTexturePreparer?: () => Pick<NativeTexturePreparer, 'prepare' | 'cancel'>;
}

export interface NativeImportPreviewController {
  readonly state: NativeImportPreviewState;
  /** Initialization, including a late factory/decoder's cleanup after cancellation. */
  readonly settled: Promise<void>;
  fit(): NativeViewportResult;
  cameraAction(action: NativeCameraAction): NativeViewportResult;
  dispose(): void;
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const notReady = (): NativeViewportResult => ({
  ok: false,
  reason: '取り込み内容の3D表示を確認できるまで操作できません。',
});

/**
 * An unsaved, rest-geometry-only view. No session, editing, animation or save binding exists
 * here, and no fake persisted revision is passed to the renderer. A single borrowed candidate
 * survives the asynchronous factory, actual decoder completion and the entire renderer life.
 */
export function mountNativeImportPreview(
  host: HTMLElement,
  review: NativeImportReview,
  onState: (state: NativeImportPreviewState) => void,
  dependencies: NativeImportPreviewDependencies,
): NativeImportPreviewController {
  const borrow = review.borrow();
  let port: NativeViewportPort | null = null;
  let preparer: Pick<NativeTexturePreparer, 'prepare' | 'cancel'> | null = null;
  let disposed = false;
  let failed = false;
  let accepted = false;
  let interrupted = false;
  let initialized = false;
  let released = false;
  let state: NativeImportPreviewState = Object.freeze({ state: 'loading', ready: false });
  const current = () => !disposed && !review.disposed;
  function publish(status: NativeViewportStatus | { state: 'loading'; reason?: string }) {
    if (!current() || failed) return;
    if (accepted && status.state !== 'active') {
      accepted = false;
      interrupted = true;
    }
    state = Object.freeze({
      ...status,
      ...(interrupted && status.state === 'active'
        ? {
            reason:
              '表示が中断されました。未保存候補を取り消し、もう一度取り込んで表示を確認してください。',
          }
        : {}),
      ready: accepted && status.state === 'active' && port?.status.state === 'active',
    });
    try {
      onState(state);
    } catch {
      // A rendering observer must not strand a source or GPU owner.
    }
  }
  function release() {
    if (released) return;
    released = true;
    borrow.release();
  }
  function clearPreparer() {
    try {
      preparer?.cancel(true);
    } catch {
      // Continue disposing independent owners if one cleanup fails.
    }
  }
  function clearPort() {
    const retired = port;
    port = null;
    try {
      retired?.dispose();
    } catch {
      // Disposal is best-effort, but must not skip the remaining cleanup.
    }
  }
  function fail(cause: unknown) {
    if (!current() || failed) return;
    accepted = false;
    publish({ state: 'error', reason: message(cause) });
    failed = true;
    clearPort();
    clearPreparer();
  }
  function ready() {
    if (!current() || failed || !accepted || !port) return false;
    const activePort = port;
    if (activePort.status.state !== state.state || activePort.status.reason !== state.reason)
      publish(activePort.status);
    return (
      current() &&
      !failed &&
      port === activePort &&
      state.ready &&
      activePort.status.state === 'active'
    );
  }
  const settled = Promise.resolve()
    .then(async () => {
      if (!current()) return;
      publish({ state: 'loading' });
      if (!current()) return;
      preparer = dependencies.createTexturePreparer?.() ?? new NativeTexturePreparer();
      if (!current()) return;
      port = await dependencies.factory(host, (status) => publish(status));
      if (!current()) return;
      const result = borrow.result;
      const textures = await preparer.prepare(result.project, (hash) =>
        result.blobs.get(hash)?.slice(),
      );
      if (!current()) return;
      const outcome = port.setProject(result.project, textures);
      if (!current()) return;
      if (!outcome.ok) throw new Error(outcome.reason);
      // A synchronous callback during setProject cannot announce readiness early.
      port.fitCamera();
      if (!current()) return;
      if (!port.renderInspectionFrame)
        throw new Error('初回描画を確認できないため、この候補の保存確認はできません。');
      const rendered = port.renderInspectionFrame();
      if (!current()) return;
      if (!rendered.ok) throw new Error(rendered.reason);
      accepted = true;
      publish(port.status);
    })
    .catch(fail)
    .finally(() => {
      initialized = true;
      if (!current() || failed) {
        clearPort();
        clearPreparer();
        preparer = null;
        release();
      }
    });
  return Object.freeze<NativeImportPreviewController>({
    get state() {
      if (!current()) return Object.freeze({ state: 'disposed', ready: false });
      return state;
    },
    settled,
    fit() {
      if (!ready()) return notReady();
      try {
        const activePort = port!;
        activePort.fitCamera();
        publish(activePort.status);
        return ready() ? { ok: true } : notReady();
      } catch (cause) {
        fail(cause);
        if (initialized) release();
        return { ok: false, reason: message(cause) };
      }
    },
    cameraAction(action) {
      if (!ready()) return notReady();
      try {
        const activePort = port!;
        const result = activePort.cameraAction(action);
        publish(activePort.status);
        return result.ok && !ready() ? notReady() : result;
      } catch (cause) {
        fail(cause);
        if (initialized) release();
        return { ok: false, reason: message(cause) };
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      accepted = false;
      state = Object.freeze({ state: 'disposed', ready: false });
      clearPort();
      clearPreparer();
      // Aborting a decoder is only a request. Its pending promise must actually settle first.
      if (initialized) {
        preparer = null;
        release();
      }
    },
  });
}
