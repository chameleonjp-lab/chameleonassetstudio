import { inspectAlphaBounds, type AlphaInspection } from '../core/images/layerRepair';
import { extractPalette, type PaletteExtraction } from '../core/images/paletteExtraction';
import type { PixelBuffer } from '../core/images/operations';

interface BaseImageAnalysisRequest {
  id: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ImageAnalysisRequest =
  | (BaseImageAnalysisRequest & {
      type: 'alphaBounds';
      alphaThreshold: number;
    })
  | (BaseImageAnalysisRequest & {
      type: 'palette';
      maxColors: number;
      alphaThreshold: number;
    });

export type ImageAnalysisResult = AlphaInspection | PaletteExtraction;

export type ImageAnalysisResponse =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'done'; result: ImageAnalysisResult }
  | { id: number; type: 'error'; message: string };

self.onmessage = (event: MessageEvent<ImageAnalysisRequest>) => {
  const request = event.data;
  const { id, width, height, data } = request;
  try {
    const buffer: PixelBuffer = { width, height, data };
    const onProgress = (progress: number) => {
      const message: ImageAnalysisResponse = { id, type: 'progress', progress };
      self.postMessage(message);
    };
    const result =
      request.type === 'alphaBounds'
        ? inspectAlphaBounds(buffer, request.alphaThreshold, onProgress)
        : extractPalette(buffer, request.maxColors, request.alphaThreshold, onProgress);
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
