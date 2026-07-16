import {
  ImageOperationError,
  type PixelBuffer,
  type ProgressCallback,
  type Rect,
} from './operations';

export interface AlphaMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AlphaEdgeContact {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface AlphaInspection {
  alphaThreshold: number;
  bounds: Rect | null;
  margins: AlphaMargins | null;
  touchesEdge: AlphaEdgeContact;
  visiblePixelCount: number;
  totalPixelCount: number;
  hasTransparentMargin: boolean;
  isEmpty: boolean;
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

function assertAlphaThreshold(alphaThreshold: number): void {
  if (
    !Number.isFinite(alphaThreshold) ||
    !Number.isInteger(alphaThreshold) ||
    alphaThreshold < 0 ||
    alphaThreshold > 255
  ) {
    throw new ImageOperationError('alphaしきい値は0〜255の整数にしてください。');
  }
}

/**
 * alphaがしきい値より大きいpixelの最小外接矩形と透明余白を調べる。
 * 入力Bufferは変更せず、結果は保存形式へ含めない一時的な分析値として返す。
 */
export function inspectAlphaBounds(
  buffer: PixelBuffer,
  alphaThreshold = 0,
  onProgress?: ProgressCallback,
): AlphaInspection {
  assertPixelBuffer(buffer);
  assertAlphaThreshold(alphaThreshold);

  let minX = buffer.width;
  let minY = buffer.height;
  let maxX = -1;
  let maxY = -1;
  let visiblePixelCount = 0;

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const alpha = buffer.data[(y * buffer.width + x) * 4 + 3];
      if (alpha <= alphaThreshold) {
        continue;
      }
      visiblePixelCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (y % 32 === 0 || y === buffer.height - 1) {
      onProgress?.((y + 1) / buffer.height);
    }
  }

  const totalPixelCount = buffer.width * buffer.height;
  if (visiblePixelCount === 0) {
    onProgress?.(1);
    return {
      alphaThreshold,
      bounds: null,
      margins: null,
      touchesEdge: { top: false, right: false, bottom: false, left: false },
      visiblePixelCount,
      totalPixelCount,
      hasTransparentMargin: false,
      isEmpty: true,
    };
  }

  const bounds: Rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const margins: AlphaMargins = {
    top: minY,
    right: buffer.width - 1 - maxX,
    bottom: buffer.height - 1 - maxY,
    left: minX,
  };
  const touchesEdge: AlphaEdgeContact = {
    top: margins.top === 0,
    right: margins.right === 0,
    bottom: margins.bottom === 0,
    left: margins.left === 0,
  };

  onProgress?.(1);
  return {
    alphaThreshold,
    bounds,
    margins,
    touchesEdge,
    visiblePixelCount,
    totalPixelCount,
    hasTransparentMargin:
      margins.top > 0 || margins.right > 0 || margins.bottom > 0 || margins.left > 0,
    isEmpty: false,
  };
}
