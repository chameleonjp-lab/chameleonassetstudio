import { inspectAlphaBounds, type AlphaInspection } from '../core/images/layerRepair';
import type { PixelBuffer } from '../core/images/operations';

export interface ImageAnalysisRequest {
  id: number;
  type: 'alphaBounds';
  width: number;
  height: number;
  data: Uint8ClampedArray;
  alphaThreshold: number;
}

export type ImageAnalysisResponse =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'done'; result: AlphaInspection }
  | { id: number; type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ImageAnalysisRequest>) => {
  const { id, width, height, data, alphaThreshold } = event.data;
  try {
    const buffer: PixelBuffer = { width, height, data };
    const result = inspectAlphaBounds(buffer, alphaThreshold, (progress) => {
      const message: ImageAnalysisResponse = { id, type: 'progress', progress };
      self.postMessage(message);
    });
    const message: ImageAnalysisResponse = { id, type: 'done', result };
    self.postMessage(message);
  } catch (error) {
    const message: ImageAnalysisResponse = {
      id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};
