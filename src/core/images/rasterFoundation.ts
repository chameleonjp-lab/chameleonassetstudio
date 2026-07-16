import {
  ImageOperationError,
  clonePixelBuffer,
  colorDistance,
  type PixelBuffer,
  type PointLike,
  type Rect,
  type RgbColor,
} from './operations';

export interface RasterSelection {
  rect: Rect;
}

export interface SelectionClipboard {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function assertFinitePoint(point: PointLike, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new ImageOperationError(`${label}の座標は有限値にしてください。`);
  }
}

function assertColor(color: RgbColor): void {
  for (const value of [color.r, color.g, color.b]) {
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      throw new ImageOperationError('色は0〜255の有限値にしてください。');
    }
  }
}

function normalizeBounds(buffer: PixelBuffer, rect?: Rect): Bounds {
  if (!rect) {
    return { left: 0, top: 0, right: buffer.width, bottom: buffer.height };
  }
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    throw new ImageOperationError('選択範囲は有限値にしてください。');
  }
  const x1 = Math.floor(Math.min(rect.x, rect.x + rect.width));
  const y1 = Math.floor(Math.min(rect.y, rect.y + rect.height));
  const x2 = Math.ceil(Math.max(rect.x, rect.x + rect.width));
  const y2 = Math.ceil(Math.max(rect.y, rect.y + rect.height));
  return {
    left: Math.max(0, Math.min(buffer.width, x1)),
    top: Math.max(0, Math.min(buffer.height, y1)),
    right: Math.max(0, Math.min(buffer.width, x2)),
    bottom: Math.max(0, Math.min(buffer.height, y2)),
  };
}

function contains(bounds: Bounds, x: number, y: number): boolean {
  return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
}

function offsetFor(buffer: PixelBuffer, x: number, y: number): number {
  return (y * buffer.width + x) * 4;
}

function setPixel(buffer: PixelBuffer, x: number, y: number, color: RgbColor): void {
  const offset = offsetFor(buffer, x, y);
  buffer.data[offset] = Math.round(color.r);
  buffer.data[offset + 1] = Math.round(color.g);
  buffer.data[offset + 2] = Math.round(color.b);
  buffer.data[offset + 3] = 255;
}

function stampCircle(
  buffer: PixelBuffer,
  center: PointLike,
  radius: number,
  color: RgbColor,
  bounds: Bounds,
): void {
  const left = Math.max(bounds.left, Math.floor(center.x - radius));
  const right = Math.min(bounds.right - 1, Math.ceil(center.x + radius));
  const top = Math.max(bounds.top, Math.floor(center.y - radius));
  const bottom = Math.min(bounds.bottom - 1, Math.ceil(center.y + radius));
  const radiusSquared = radius * radius;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(buffer, x, y, color);
      }
    }
  }
}

/**
 * 点列に沿って不透明なbrushを描く。selectionは一時的なmaskであり保存データではない。
 */
export function paintBrush(
  buffer: PixelBuffer,
  points: PointLike[],
  radius: number,
  color: RgbColor,
  selection?: RasterSelection,
): PixelBuffer {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new ImageOperationError('ブラシ半径は0より大きい有限値にしてください。');
  }
  assertColor(color);
  for (const point of points) {
    assertFinitePoint(point, 'ブラシ');
  }
  const result = clonePixelBuffer(buffer);
  if (points.length === 0) {
    return result;
  }
  const bounds = normalizeBounds(buffer, selection?.rect);
  let previous = points[0];
  stampCircle(result, previous, radius, color, bounds);
  for (const point of points.slice(1)) {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      stampCircle(
        result,
        {
          x: previous.x + (point.x - previous.x) * ratio,
          y: previous.y + (point.y - previous.y) * ratio,
        },
        radius,
        color,
        bounds,
      );
    }
    previous = point;
  }
  return result;
}

/** 4近傍の連続領域を塗りつぶす。 */
export function floodFill(
  buffer: PixelBuffer,
  start: PointLike,
  color: RgbColor,
  tolerance: number,
  selection?: RasterSelection,
): PixelBuffer {
  assertFinitePoint(start, '塗りつぶし');
  assertColor(color);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) {
    throw new ImageOperationError('塗りつぶし許容量は0〜255にしてください。');
  }
  const result = clonePixelBuffer(buffer);
  const bounds = normalizeBounds(buffer, selection?.rect);
  const startX = Math.floor(start.x);
  const startY = Math.floor(start.y);
  if (!contains(bounds, startX, startY)) {
    return result;
  }
  const startOffset = offsetFor(buffer, startX, startY);
  const source = {
    r: buffer.data[startOffset],
    g: buffer.data[startOffset + 1],
    b: buffer.data[startOffset + 2],
    a: buffer.data[startOffset + 3],
  };
  if (
    source.r === Math.round(color.r) &&
    source.g === Math.round(color.g) &&
    source.b === Math.round(color.b) &&
    source.a === 255
  ) {
    return result;
  }
  const visited = new Uint8Array(buffer.width * buffer.height);
  const queueX: number[] = [startX];
  const queueY: number[] = [startY];
  let cursor = 0;
  while (cursor < queueX.length) {
    const x = queueX[cursor];
    const y = queueY[cursor];
    cursor += 1;
    if (!contains(bounds, x, y)) {
      continue;
    }
    const index = y * buffer.width + x;
    if (visited[index]) {
      continue;
    }
    visited[index] = 1;
    const offset = index * 4;
    const rgbDistance = colorDistance(
      buffer.data[offset],
      buffer.data[offset + 1],
      buffer.data[offset + 2],
      source.r,
      source.g,
      source.b,
    );
    const alphaDistance = Math.abs(buffer.data[offset + 3] - source.a);
    if (rgbDistance > tolerance || alphaDistance > tolerance) {
      continue;
    }
    setPixel(result, x, y, color);
    queueX.push(x - 1, x + 1, x, x);
    queueY.push(y, y, y - 1, y + 1);
  }
  return result;
}

export function drawRasterRect(
  buffer: PixelBuffer,
  rect: Rect,
  color: RgbColor,
  selection?: RasterSelection,
): PixelBuffer {
  assertColor(color);
  const result = clonePixelBuffer(buffer);
  const drawingBounds = normalizeBounds(buffer, rect);
  const selectionBounds = normalizeBounds(buffer, selection?.rect);
  for (let y = drawingBounds.top; y < drawingBounds.bottom; y += 1) {
    for (let x = drawingBounds.left; x < drawingBounds.right; x += 1) {
      if (contains(selectionBounds, x, y)) {
        setPixel(result, x, y, color);
      }
    }
  }
  return result;
}

export function drawRasterEllipse(
  buffer: PixelBuffer,
  rect: Rect,
  color: RgbColor,
  selection?: RasterSelection,
): PixelBuffer {
  assertColor(color);
  const result = clonePixelBuffer(buffer);
  const drawingBounds = normalizeBounds(buffer, rect);
  const selectionBounds = normalizeBounds(buffer, selection?.rect);
  const radiusX = (drawingBounds.right - drawingBounds.left) / 2;
  const radiusY = (drawingBounds.bottom - drawingBounds.top) / 2;
  if (radiusX <= 0 || radiusY <= 0) {
    return result;
  }
  const centerX = drawingBounds.left + radiusX;
  const centerY = drawingBounds.top + radiusY;
  for (let y = drawingBounds.top; y < drawingBounds.bottom; y += 1) {
    for (let x = drawingBounds.left; x < drawingBounds.right; x += 1) {
      const normalizedX = (x + 0.5 - centerX) / radiusX;
      const normalizedY = (y + 0.5 - centerY) / radiusY;
      if (
        normalizedX * normalizedX + normalizedY * normalizedY <= 1 &&
        contains(selectionBounds, x, y)
      ) {
        setPixel(result, x, y, color);
      }
    }
  }
  return result;
}

export function copySelectionPixels(
  buffer: PixelBuffer,
  selection: RasterSelection,
): SelectionClipboard {
  const bounds = normalizeBounds(buffer, selection.rect);
  const width = Math.max(0, bounds.right - bounds.left);
  const height = Math.max(0, bounds.bottom - bounds.top);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((bounds.top + y) * buffer.width + bounds.left) * 4;
    data.set(buffer.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return { width, height, data };
}

export function clearSelectionPixels(buffer: PixelBuffer, selection: RasterSelection): PixelBuffer {
  const result = clonePixelBuffer(buffer);
  const bounds = normalizeBounds(buffer, selection.rect);
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      const offset = offsetFor(result, x, y);
      result.data[offset] = 0;
      result.data[offset + 1] = 0;
      result.data[offset + 2] = 0;
      result.data[offset + 3] = 0;
    }
  }
  return result;
}

export function pasteSelectionPixels(
  buffer: PixelBuffer,
  clipboard: SelectionClipboard,
  target: PointLike,
): PixelBuffer {
  assertFinitePoint(target, '貼り付け');
  const result = clonePixelBuffer(buffer);
  const targetX = Math.floor(target.x);
  const targetY = Math.floor(target.y);
  for (let y = 0; y < clipboard.height; y += 1) {
    for (let x = 0; x < clipboard.width; x += 1) {
      const destinationX = targetX + x;
      const destinationY = targetY + y;
      if (
        destinationX < 0 ||
        destinationY < 0 ||
        destinationX >= buffer.width ||
        destinationY >= buffer.height
      ) {
        continue;
      }
      const sourceOffset = (y * clipboard.width + x) * 4;
      const destinationOffset = offsetFor(result, destinationX, destinationY);
      result.data.set(clipboard.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
    }
  }
  return result;
}

/** 同一layer内のselectionを1操作として移動する。 */
export function moveSelectionPixels(
  buffer: PixelBuffer,
  selection: RasterSelection,
  target: PointLike,
): PixelBuffer {
  const clipboard = copySelectionPixels(buffer, selection);
  const cleared = clearSelectionPixels(buffer, selection);
  return pasteSelectionPixels(cleared, clipboard, target);
}

/**
 * RGBAをsource-overで合成して重ねる。pasteSelectionPixelsと異なり透明部分は上書きしないため、
 * textなど既存pixelsを保ったまま一部だけ確定するstamp操作に使う。
 */
export function compositeStampPixels(
  buffer: PixelBuffer,
  stamp: SelectionClipboard,
  target: PointLike,
): PixelBuffer {
  assertFinitePoint(target, 'スタンプ');
  const result = clonePixelBuffer(buffer);
  const targetX = Math.floor(target.x);
  const targetY = Math.floor(target.y);
  for (let y = 0; y < stamp.height; y += 1) {
    for (let x = 0; x < stamp.width; x += 1) {
      const destinationX = targetX + x;
      const destinationY = targetY + y;
      if (
        destinationX < 0 ||
        destinationY < 0 ||
        destinationX >= buffer.width ||
        destinationY >= buffer.height
      ) {
        continue;
      }
      const sourceOffset = (y * stamp.width + x) * 4;
      const srcAlpha = stamp.data[sourceOffset + 3] / 255;
      if (srcAlpha <= 0) {
        continue;
      }
      const destinationOffset = offsetFor(result, destinationX, destinationY);
      if (srcAlpha >= 1) {
        result.data.set(stamp.data.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
        continue;
      }
      const dstAlpha = result.data[destinationOffset + 3] / 255;
      const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
      if (outAlpha <= 0) {
        result.data[destinationOffset] = 0;
        result.data[destinationOffset + 1] = 0;
        result.data[destinationOffset + 2] = 0;
        result.data[destinationOffset + 3] = 0;
        continue;
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const srcChannel = stamp.data[sourceOffset + channel];
        const dstChannel = result.data[destinationOffset + channel];
        result.data[destinationOffset + channel] = Math.round(
          (srcChannel * srcAlpha + dstChannel * dstAlpha * (1 - srcAlpha)) / outAlpha,
        );
      }
      result.data[destinationOffset + 3] = Math.round(outAlpha * 255);
    }
  }
  return result;
}
