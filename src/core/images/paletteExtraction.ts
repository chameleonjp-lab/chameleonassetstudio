import {
  ImageOperationError,
  type PixelBuffer,
  type ProgressCallback,
  type RgbColor,
} from './operations';

export const MAX_PALETTE_COLORS = 32;
export const PALETTE_QUANTIZATION_BITS = 5;

export interface ExtractedPaletteColor {
  color: RgbColor;
  count: number;
  coverage: number;
}

export interface PaletteExtraction {
  colors: ExtractedPaletteColor[];
  alphaThreshold: number;
  maxColors: number;
  visiblePixelCount: number;
  transparentPixelCount: number;
  quantizationBits: number;
}

interface PaletteBucket {
  key: number;
  count: number;
  redTotal: number;
  greenTotal: number;
  blueTotal: number;
}

function assertPixelBuffer(buffer: PixelBuffer): void {
  if (
    !Number.isInteger(buffer.width) ||
    !Number.isInteger(buffer.height) ||
    buffer.width <= 0 ||
    buffer.height <= 0
  ) {
    throw new ImageOperationError('画像サイズは1以上の整数にしてください。');
  }
  if (buffer.data.length !== buffer.width * buffer.height * 4) {
    throw new ImageOperationError('画像データの長さが画像サイズと一致しません。');
  }
}

function assertOptions(maxColors: number, alphaThreshold: number): void {
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > MAX_PALETTE_COLORS) {
    throw new ImageOperationError(`抽出色数は1〜${MAX_PALETTE_COLORS}の整数にしてください。`);
  }
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new ImageOperationError('alphaしきい値は0〜255の整数にしてください。');
  }
}

/**
 * 表示pixelを5-bit RGB bucketへ量子化し、頻度順で代表色を返す。
 * 入力Bufferは変更せず、結果は一時的な分析値として扱う。
 */
export function extractPalette(
  buffer: PixelBuffer,
  maxColors = 8,
  alphaThreshold = 0,
  onProgress?: ProgressCallback,
): PaletteExtraction {
  assertPixelBuffer(buffer);
  assertOptions(maxColors, alphaThreshold);

  const buckets = new Map<number, PaletteBucket>();
  let visiblePixelCount = 0;
  let transparentPixelCount = 0;

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const offset = (y * buffer.width + x) * 4;
      const alpha = buffer.data[offset + 3];
      if (alpha <= alphaThreshold) {
        transparentPixelCount += 1;
        continue;
      }

      const red = buffer.data[offset];
      const green = buffer.data[offset + 1];
      const blue = buffer.data[offset + 2];
      const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
      const bucket = buckets.get(key) ?? {
        key,
        count: 0,
        redTotal: 0,
        greenTotal: 0,
        blueTotal: 0,
      };
      bucket.count += 1;
      bucket.redTotal += red;
      bucket.greenTotal += green;
      bucket.blueTotal += blue;
      buckets.set(key, bucket);
      visiblePixelCount += 1;
    }
    if (y % 32 === 0 || y === buffer.height - 1) {
      onProgress?.((y + 1) / buffer.height);
    }
  }

  const colors = [...buckets.values()]
    .sort((left, right) => right.count - left.count || left.key - right.key)
    .slice(0, maxColors)
    .map((bucket) => ({
      color: {
        r: Math.round(bucket.redTotal / bucket.count),
        g: Math.round(bucket.greenTotal / bucket.count),
        b: Math.round(bucket.blueTotal / bucket.count),
      },
      count: bucket.count,
      coverage: visiblePixelCount === 0 ? 0 : bucket.count / visiblePixelCount,
    }));

  onProgress?.(1);
  return {
    colors,
    alphaThreshold,
    maxColors,
    visiblePixelCount,
    transparentPixelCount,
    quantizationBits: PALETTE_QUANTIZATION_BITS,
  };
}
