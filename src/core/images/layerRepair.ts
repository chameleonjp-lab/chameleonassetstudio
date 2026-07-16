import {
  ImageOperationError,
  type PixelBuffer,
  type ProgressCallback,
  type Rect,
} from './operations';

export const MAX_LAYER_IMAGE_EDGE = 4096;
export const MAX_LAYER_IMAGE_PIXELS = MAX_LAYER_IMAGE_EDGE * MAX_LAYER_IMAGE_EDGE;

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

export interface LayerImagePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type LayerResizeInterpolation = 'nearest' | 'smooth';

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

function assertOutputSize(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new ImageOperationError('変更後の画像サイズは1以上の整数にしてください。');
  }
  if (width > MAX_LAYER_IMAGE_EDGE || height > MAX_LAYER_IMAGE_EDGE) {
    throw new ImageOperationError(
      `変更後の画像の幅と高さは${MAX_LAYER_IMAGE_EDGE}以下にしてください。`,
    );
  }
  if (width * height > MAX_LAYER_IMAGE_PIXELS) {
    throw new ImageOperationError(
      `変更後の画像の総pixel数は${MAX_LAYER_IMAGE_EDGE} x ${MAX_LAYER_IMAGE_EDGE}以下にしてください。`,
    );
  }
}

function assertPadding(padding: LayerImagePadding): void {
  for (const [name, value] of Object.entries(padding)) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new ImageOperationError(`paddingの${name}は0以上の整数にしてください。`);
    }
  }
}

function clonePixelBuffer(buffer: PixelBuffer): PixelBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
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

/** 選択layer画像の周囲へ透明pixelを追加する。元Bufferは変更しない。 */
export function padLayerImage(
  buffer: PixelBuffer,
  padding: LayerImagePadding,
  onProgress?: ProgressCallback,
): PixelBuffer {
  assertPixelBuffer(buffer);
  assertPadding(padding);
  const width = buffer.width + padding.left + padding.right;
  const height = buffer.height + padding.top + padding.bottom;
  assertOutputSize(width, height);

  if (padding.top === 0 && padding.right === 0 && padding.bottom === 0 && padding.left === 0) {
    onProgress?.(1);
    return clonePixelBuffer(buffer);
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < buffer.height; y += 1) {
    const sourceStart = y * buffer.width * 4;
    const targetStart = ((y + padding.top) * width + padding.left) * 4;
    data.set(buffer.data.subarray(sourceStart, sourceStart + buffer.width * 4), targetStart);
    if (y % 32 === 0 || y === buffer.height - 1) {
      onProgress?.((y + 1) / buffer.height);
    }
  }
  onProgress?.(1);
  return { width, height, data };
}

function nearestSourceIndex(targetIndex: number, sourceSize: number, targetSize: number): number {
  return Math.min(sourceSize - 1, Math.floor(((targetIndex + 0.5) * sourceSize) / targetSize));
}

function smoothSample(
  buffer: PixelBuffer,
  sourceX: number,
  sourceY: number,
): [number, number, number, number] {
  const clampedX = Math.max(0, Math.min(buffer.width - 1, sourceX));
  const clampedY = Math.max(0, Math.min(buffer.height - 1, sourceY));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(buffer.width - 1, x0 + 1);
  const y1 = Math.min(buffer.height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const weights = [
    [(1 - tx) * (1 - ty), x0, y0],
    [tx * (1 - ty), x1, y0],
    [(1 - tx) * ty, x0, y1],
    [tx * ty, x1, y1],
  ] as const;

  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [weight, x, y] of weights) {
    const offset = (y * buffer.width + x) * 4;
    const sourceAlpha = buffer.data[offset + 3] / 255;
    alpha += sourceAlpha * weight;
    red += buffer.data[offset] * sourceAlpha * weight;
    green += buffer.data[offset + 1] * sourceAlpha * weight;
    blue += buffer.data[offset + 2] * sourceAlpha * weight;
  }

  if (alpha <= 0) {
    return [0, 0, 0, 0];
  }
  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round(alpha * 255),
  ];
}

/** 選択layer画像をnearestまたはpremultiplied-alpha smoothでリサイズする。 */
export function resizeLayerImage(
  buffer: PixelBuffer,
  width: number,
  height: number,
  interpolation: LayerResizeInterpolation,
  onProgress?: ProgressCallback,
): PixelBuffer {
  assertPixelBuffer(buffer);
  assertOutputSize(width, height);
  if (interpolation !== 'nearest' && interpolation !== 'smooth') {
    throw new ImageOperationError('補間方法はnearestまたはsmoothを選択してください。');
  }
  if (width === buffer.width && height === buffer.height) {
    onProgress?.(1);
    return clonePixelBuffer(buffer);
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    if (interpolation === 'nearest') {
      const sourceY = nearestSourceIndex(y, buffer.height, height);
      for (let x = 0; x < width; x += 1) {
        const sourceX = nearestSourceIndex(x, buffer.width, width);
        const sourceOffset = (sourceY * buffer.width + sourceX) * 4;
        data.set(buffer.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
      }
    } else {
      const sourceY = ((y + 0.5) * buffer.height) / height - 0.5;
      for (let x = 0; x < width; x += 1) {
        const sourceX = ((x + 0.5) * buffer.width) / width - 0.5;
        data.set(smoothSample(buffer, sourceX, sourceY), (y * width + x) * 4);
      }
    }
    if (y % 32 === 0 || y === height - 1) {
      onProgress?.((y + 1) / height);
    }
  }
  onProgress?.(1);
  return { width, height, data };
}
