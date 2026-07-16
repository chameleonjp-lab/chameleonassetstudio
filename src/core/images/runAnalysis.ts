import { inspectAlphaBounds, type AlphaInspection } from './layerRepair';
import { ImageOperationError, type PixelBuffer, type ProgressCallback } from './operations';
import type {
  ImageAnalysisRequest,
  ImageAnalysisResponse,
} from '../../workers/imageAnalysis.worker';

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<
  number,
  {
    resolve: (result: AlphaInspection) => void;
    reject: (error: Error) => void;
    onProgress?: ProgressCallback;
  }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (!worker) {
    try {
      worker = new Worker(new URL('../../workers/imageAnalysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<ImageAnalysisResponse>) => {
        const message = event.data;
        const entry = pending.get(message.id);
        if (!entry) {
          return;
        }
        if (message.type === 'progress') {
          entry.onProgress?.(message.progress);
          return;
        }
        pending.delete(message.id);
        if (message.type === 'done') {
          entry.resolve(message.result);
        } else {
          entry.reject(new ImageOperationError(message.message));
        }
      };
      worker.onerror = () => {
        for (const entry of pending.values()) {
          entry.reject(new ImageOperationError('画像分析ワーカーでエラーが発生しました。'));
        }
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

/** alpha bounds分析をWorkerで実行し、非対応環境では同期処理へfallbackする。 */
export function runAlphaInspection(
  buffer: PixelBuffer,
  alphaThreshold = 0,
  onProgress?: ProgressCallback,
): Promise<AlphaInspection> {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return new Promise((resolve, reject) => {
      try {
        resolve(inspectAlphaBounds(buffer, alphaThreshold, onProgress));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  requestId += 1;
  const id = requestId;
  return new Promise<AlphaInspection>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const request: ImageAnalysisRequest = {
      id,
      type: 'alphaBounds',
      width: buffer.width,
      height: buffer.height,
      data: new Uint8ClampedArray(buffer.data),
      alphaThreshold,
    };
    activeWorker.postMessage(request);
  });
}
