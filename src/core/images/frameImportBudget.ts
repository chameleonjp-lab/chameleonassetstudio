import { INPUT_SAFETY_LIMITS } from '../input/inputSafety';

export interface FrameImportOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export function assertFrameImportActive(options: FrameImportOptions) {
  if (options.signal?.aborted)
    throw new DOMException(
      '取り込みを取り消しました。保存済みの素材は変更されていません。',
      'AbortError',
    );
}

export function assertFramePixelBudget(pixels: number) {
  if (
    !Number.isSafeInteger(pixels) ||
    pixels < 0 ||
    pixels * 4 > INPUT_SAFETY_LIMITS.maxAnimationDecodedBytes
  ) {
    throw new Error(
      'コマの展開後の画像容量は合計64MiBまでです。画像を小さくするか、コマを分けて取り込んでください。',
    );
  }
}

export function assertFrameEncodedBudget(bytes: number) {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    bytes > INPUT_SAFETY_LIMITS.maxAnimationStoredBytes
  ) {
    throw new Error(
      '元画像とコマ画像の合計容量は128MiBまでです。画像を小さくするか、コマを分けて取り込んでください。',
    );
  }
}

export async function frameImportCheckpoint(
  options: FrameImportOptions,
  completed: number,
  total: number,
) {
  assertFrameImportActive(options);
  options.onProgress?.(completed, total);
  // Yield so mobile users can cancel during a long sequence of encodes.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assertFrameImportActive(options);
}
