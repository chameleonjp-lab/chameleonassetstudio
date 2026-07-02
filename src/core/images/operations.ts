/**
 * 画像編集の中核処理（Phase 6）。
 * DOM に依存しない純粋関数として実装し、Web Worker からも直接使えるようにする。
 */

export interface PixelBuffer {
  width: number;
  height: number;
  /** RGBA 順、長さ width * height * 4。 */
  data: Uint8ClampedArray;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointLike {
  x: number;
  y: number;
}

export type ImageOperation =
  | { type: 'crop'; rect: Rect }
  | { type: 'removeBackground'; color: RgbColor; tolerance: number }
  | { type: 'erase'; points: PointLike[]; radius: number }
  | { type: 'adjustHsl'; hue: number; saturation: number; lightness: number }
  | { type: 'replaceColor'; from: RgbColor; to: RgbColor; tolerance: number }
  | { type: 'outline'; color: RgbColor; thickness: number };

export class ImageOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageOperationError';
  }
}

export type ProgressCallback = (progress: number) => void;

export function clonePixelBuffer(buffer: PixelBuffer): PixelBuffer {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data),
  };
}

/** #rrggbb 形式を RGB へ変換する。 */
export function hexToRgb(hex: string): RgbColor {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new ImageOperationError(`色の形式が不正です: ${hex}（例: #ff0000）`);
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** RGB を #rrggbb 形式へ変換する。 */
export function rgbToHex(color: RgbColor): string {
  const toHex = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** 2 色の距離（0〜255 に正規化したユークリッド距離）。 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
}

/** RGB (0-255) → HSL (h: 0-360, s: 0-1, l: 0-1) */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }
  return [h, s, l];
}

/** HSL → RGB (0-255) */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hn = hue / 360;
  return [
    Math.round(hueToRgb(hn + 1 / 3) * 255),
    Math.round(hueToRgb(hn) * 255),
    Math.round(hueToRgb(hn - 1 / 3) * 255),
  ];
}

function clampRectToBuffer(buffer: PixelBuffer, rect: Rect): Rect {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const width = Math.min(buffer.width - x, Math.round(rect.width));
  const height = Math.min(buffer.height - y, Math.round(rect.height));
  return { x, y, width, height };
}

/** 矩形トリミング。座標はテクスチャローカル（ピクセル）。 */
export function cropRect(buffer: PixelBuffer, rect: Rect): PixelBuffer {
  const clamped = clampRectToBuffer(buffer, rect);
  if (clamped.width < 1 || clamped.height < 1) {
    throw new ImageOperationError('トリミング範囲が画像の外です。');
  }
  const out = new Uint8ClampedArray(clamped.width * clamped.height * 4);
  for (let row = 0; row < clamped.height; row += 1) {
    const sourceStart = ((clamped.y + row) * buffer.width + clamped.x) * 4;
    out.set(
      buffer.data.subarray(sourceStart, sourceStart + clamped.width * 4),
      row * clamped.width * 4,
    );
  }
  return { width: clamped.width, height: clamped.height, data: out };
}

/** 指定色に近い画素を透明化する（単色背景の簡易透過）。tolerance は 0〜255。 */
export function removeBackgroundColor(
  buffer: PixelBuffer,
  color: RgbColor,
  tolerance: number,
  onProgress?: ProgressCallback,
): PixelBuffer {
  const result = clonePixelBuffer(buffer);
  const { data } = result;
  const rowStride = buffer.width * 4;
  for (let y = 0; y < buffer.height; y += 1) {
    const rowStart = y * rowStride;
    for (let i = rowStart; i < rowStart + rowStride; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      if (
        colorDistance(data[i], data[i + 1], data[i + 2], color.r, color.g, color.b) <= tolerance
      ) {
        data[i + 3] = 0;
      }
    }
    if (onProgress && (y & 63) === 0) {
      onProgress(y / buffer.height);
    }
  }
  return result;
}

/** ストローク（点列）に沿って円形に透明化する（手動消しゴム）。 */
export function erasePixels(buffer: PixelBuffer, points: PointLike[], radius: number): PixelBuffer {
  if (points.length === 0) {
    return clonePixelBuffer(buffer);
  }
  const result = clonePixelBuffer(buffer);
  const stamp = (cx: number, cy: number) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(result.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(result.height - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          result.data[(y * result.width + x) * 4 + 3] = 0;
        }
      }
    }
  };
  // 点と点の間を補間して途切れを防ぐ（連続ブラシ操作は 1 操作として扱う）
  let previous = points[0];
  stamp(previous.x, previous.y);
  for (const point of points.slice(1)) {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      stamp(previous.x + (point.x - previous.x) * t, previous.y + (point.y - previous.y) * t);
    }
    previous = point;
  }
  return result;
}

/**
 * 色相（-180〜180 度）、彩度（-100〜100）、明度（-100〜100）を変更する。
 * 透明画素はそのまま残す。
 */
export function adjustHsl(
  buffer: PixelBuffer,
  adjustment: { hue: number; saturation: number; lightness: number },
  onProgress?: ProgressCallback,
): PixelBuffer {
  const result = clonePixelBuffer(buffer);
  const { data } = result;
  const rowStride = buffer.width * 4;
  for (let y = 0; y < buffer.height; y += 1) {
    const rowStart = y * rowStride;
    for (let i = rowStart; i < rowStart + rowStride; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      const [r, g, b] = hslToRgb(
        h + adjustment.hue,
        Math.min(1, Math.max(0, s + adjustment.saturation / 100)),
        Math.min(1, Math.max(0, l + adjustment.lightness / 100)),
      );
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    if (onProgress && (y & 63) === 0) {
      onProgress(y / buffer.height);
    }
  }
  return result;
}

/** 指定色に近い画素を別の色へ置き換える（パレット置換）。 */
export function replaceColor(
  buffer: PixelBuffer,
  from: RgbColor,
  to: RgbColor,
  tolerance: number,
  onProgress?: ProgressCallback,
): PixelBuffer {
  const result = clonePixelBuffer(buffer);
  const { data } = result;
  const rowStride = buffer.width * 4;
  for (let y = 0; y < buffer.height; y += 1) {
    const rowStart = y * rowStride;
    for (let i = rowStart; i < rowStart + rowStride; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      if (colorDistance(data[i], data[i + 1], data[i + 2], from.r, from.g, from.b) <= tolerance) {
        data[i] = to.r;
        data[i + 1] = to.g;
        data[i + 2] = to.b;
      }
    }
    if (onProgress && (y & 63) === 0) {
      onProgress(y / buffer.height);
    }
  }
  return result;
}

const MAX_OUTLINE_THICKNESS = 16;

/**
 * 不透明領域の外側に輪郭線を描く。
 * 8 近傍の膨張を thickness 回繰り返す簡易実装（角はやや角ばる）。
 */
export function addOutline(
  buffer: PixelBuffer,
  color: RgbColor,
  thickness: number,
  onProgress?: ProgressCallback,
): PixelBuffer {
  const steps = Math.min(MAX_OUTLINE_THICKNESS, Math.max(1, Math.round(thickness)));
  const { width, height } = buffer;
  const result = clonePixelBuffer(buffer);

  // 0: 透明, 1: 元から不透明, 2: 輪郭
  let mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    mask[index] = buffer.data[index * 4 + 3] > 0 ? 1 : 0;
  }

  for (let step = 0; step < steps; step += 1) {
    const next = new Uint8Array(mask);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (mask[index] !== 0) {
          continue;
        }
        let touching = false;
        for (let dy = -1; dy <= 1 && !touching; dy += 1) {
          for (let dx = -1; dx <= 1 && !touching; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx] !== 0) {
              touching = true;
            }
          }
        }
        if (touching) {
          next[index] = 2;
        }
      }
    }
    mask = next;
    onProgress?.((step + 1) / steps);
  }

  for (let index = 0; index < width * height; index += 1) {
    if (mask[index] === 2) {
      const offset = index * 4;
      result.data[offset] = color.r;
      result.data[offset + 1] = color.g;
      result.data[offset + 2] = color.b;
      result.data[offset + 3] = 255;
    }
  }
  return result;
}

/** 操作種別で分岐して適用する。Worker からも直接呼ぶ。 */
export function applyOperation(
  buffer: PixelBuffer,
  operation: ImageOperation,
  onProgress?: ProgressCallback,
): PixelBuffer {
  switch (operation.type) {
    case 'crop':
      return cropRect(buffer, operation.rect);
    case 'removeBackground':
      return removeBackgroundColor(buffer, operation.color, operation.tolerance, onProgress);
    case 'erase':
      return erasePixels(buffer, operation.points, operation.radius);
    case 'adjustHsl':
      return adjustHsl(buffer, operation, onProgress);
    case 'replaceColor':
      return replaceColor(buffer, operation.from, operation.to, operation.tolerance, onProgress);
    case 'outline':
      return addOutline(buffer, operation.color, operation.thickness, onProgress);
  }
}

/** 操作の日本語ラベル（履歴とエラー表示に使う）。 */
export function operationLabel(operation: ImageOperation): string {
  switch (operation.type) {
    case 'crop':
      return 'トリミング';
    case 'removeBackground':
      return '背景の透過';
    case 'erase':
      return '消しゴム';
    case 'adjustHsl':
      return '色調整';
    case 'replaceColor':
      return 'パレット置換';
    case 'outline':
      return '輪郭線の追加';
  }
}
