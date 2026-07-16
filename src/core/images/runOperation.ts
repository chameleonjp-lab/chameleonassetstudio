import { decodeImageSource } from './decodeImageSource';
import type { ImageOpsRequest, ImageOpsResponse } from '../../workers/imageOps.worker';
import {
  applyImageOperation,
  ImageOperationError,
  type ImageOperation,
  type PixelBuffer,
  type ProgressCallback,
} from './imageOperation';

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<
  number,
  {
    resolve: (buffer: PixelBuffer) => void;
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
      worker = new Worker(new URL('../../workers/imageOps.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<ImageOpsResponse>) => {
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
          entry.resolve({ width: message.width, height: message.height, data: message.data });
        } else {
          entry.reject(new ImageOperationError(message.message));
        }
      };
      worker.onerror = () => {
        // Worker 自体が壊れた場合は全リクエストを失敗させ、次回から同期実行にする
        for (const entry of pending.values()) {
          entry.reject(new ImageOperationError('画像処理ワーカーでエラーが発生しました。'));
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

/**
 * 画像処理を実行する。Web Worker が使える環境では UI スレッドを止めずに実行し、
 * 使えない環境では同期実行へフォールバックする。
 */
export function runImageOperation(
  buffer: PixelBuffer,
  operation: ImageOperation,
  onProgress?: ProgressCallback,
): Promise<PixelBuffer> {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return new Promise((resolve, reject) => {
      try {
        resolve(applyImageOperation(buffer, operation, onProgress));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  requestId += 1;
  const id = requestId;
  return new Promise<PixelBuffer>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const request: ImageOpsRequest = {
      id,
      width: buffer.width,
      height: buffer.height,
      // 転送せずコピーを渡す（元バッファは Undo 用に保持する）
      data: new Uint8ClampedArray(buffer.data),
      operation,
    };
    activeWorker.postMessage(request);
  });
}

/** Blob（PNG など）を PixelBuffer へ変換する。ブラウザ専用（Safari 系は Image フォールバック）。 */
export async function blobToPixelBuffer(blob: Blob): Promise<PixelBuffer> {
  const decoded = await decodeImageSource(blob);
  try {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(decoded.width, decoded.height)
        : (() => {
            const el = document.createElement('canvas');
            el.width = decoded.width;
            el.height = decoded.height;
            return el;
          })();
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!context) {
      throw new ImageOperationError('この環境では Canvas 2D が使えません。');
    }
    context.drawImage(decoded.source, 0, 0);
    const imageData = context.getImageData(0, 0, decoded.width, decoded.height);
    return { width: imageData.width, height: imageData.height, data: imageData.data };
  } finally {
    decoded.close();
  }
}

/** PixelBuffer を PNG Blob へ変換する。ブラウザ専用。 */
export async function pixelBufferToBlob(buffer: PixelBuffer): Promise<Blob> {
  const imageData = new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(buffer.width, buffer.height);
    const context = canvas.getContext('2d');
    if (context) {
      context.putImageData(imageData, 0, 0);
      return canvas.convertToBlob({ type: 'image/png' });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageOperationError('画像のエンコードに失敗しました。');
  }
  context.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), 'image/png'),
  );
  if (!blob) {
    throw new ImageOperationError('画像のエンコードに失敗しました。');
  }
  return blob;
}
