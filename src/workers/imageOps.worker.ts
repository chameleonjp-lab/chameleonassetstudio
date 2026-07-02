/**
 * 画像編集処理を実行する Web Worker。
 * 重い処理を UI スレッドから逃がし、進捗を通知する（要件 12.1）。
 */
import { applyOperation, type ImageOperation, type PixelBuffer } from '../core/images/operations';

export interface ImageOpsRequest {
  id: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  operation: ImageOperation;
}

export type ImageOpsResponse =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'done'; width: number; height: number; data: Uint8ClampedArray }
  | { id: number; type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ImageOpsRequest>) => {
  const { id, width, height, data, operation } = event.data;
  try {
    const buffer: PixelBuffer = { width, height, data };
    const result = applyOperation(buffer, operation, (progress) => {
      const message: ImageOpsResponse = { id, type: 'progress', progress };
      self.postMessage(message);
    });
    const message: ImageOpsResponse = {
      id,
      type: 'done',
      width: result.width,
      height: result.height,
      data: result.data,
    };
    self.postMessage(message, { transfer: [result.data.buffer] });
  } catch (error) {
    const message: ImageOpsResponse = {
      id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};
