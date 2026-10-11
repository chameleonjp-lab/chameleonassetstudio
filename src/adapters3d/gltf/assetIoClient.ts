import type {
  AssetIoJob,
  AssetIoRequest,
  AssetIoResult,
  AssetIoProgress,
} from '../../core3d/ports/assetIoPort';
import {
  ASSET_IO_PROFILE as P,
  assertIoBudget,
  reserveAssetIoBytes,
} from '../../core3d/profile/assetIoProfile';
let active = false;
export function startAssetIo(
  request: AssetIoRequest,
  onProgress: (value: AssetIoProgress) => void = () => {},
  factory: () => Worker = () =>
    new Worker(new URL('./assetIo.worker.ts', import.meta.url), { type: 'module' }),
): AssetIoJob {
  if (active) throw new Error('Another asset I/O job is active');
  if (request.kind === 'import') {
    assertIoBudget(request.bytes.length, P.sourceBytes, 'GLB source');
    assertIoBudget(request.sidecar?.length ?? 0, P.jsonBytes, 'Sidecar');
  }
  const estimate =
    request.kind !== 'import'
      ? request.snapshot.estimatedBytes
      : request.bytes.length * 6 + (request.sidecar?.length ?? 0) * 4;
  assertIoBudget(estimate, P.estimatedPeakBytes, 'Worker peak estimate');
  let worker: Worker | undefined,
    settled = false,
    rejectPromise: (reason: unknown) => void = () => {};
  const releaseBudget = reserveAssetIoBytes(estimate);
  active = true;
  const release = () => {
    worker?.terminate();
    worker = undefined;
    active = false;
    releaseBudget();
  };
  const promise = new Promise<AssetIoResult>((resolve, reject) => {
    rejectPromise = reject;
    try {
      worker = factory();
      worker.onmessage = (event: MessageEvent) => {
        if (settled) return;
        const data = event.data as {
          kind: string;
          phase: string;
          fraction: number;
          result: AssetIoResult;
          message: string;
        };
        if (data.kind === 'progress') {
          try {
            onProgress({ phase: data.phase, fraction: data.fraction });
          } catch {
            /* Observers do not own the worker. */
          }
          return;
        }
        settled = true;
        release();
        if (data.kind === 'result') resolve(data.result);
        else reject(new Error(data.message ?? 'Invalid worker response'));
      };
      worker.onerror = () => {
        if (settled) return;
        settled = true;
        release();
        reject(new Error('Asset worker failed; original project retained'));
      };
      worker.onmessageerror = () => {
        if (settled) return;
        settled = true;
        release();
        reject(new Error('Invalid asset worker response'));
      };
      worker.postMessage(request);
    } catch (error) {
      settled = true;
      release();
      reject(error);
    }
  });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      release();
      rejectPromise(new DOMException('Asset job cancelled', 'AbortError'));
    },
  };
}
