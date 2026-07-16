import { describe, expect, it, vi } from 'vitest';
import type { PixelBuffer } from './operations';
import { inspectAlphaBounds, padLayerImage, resizeLayerImage } from './layerRepair';

function makeBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(
  buffer: PixelBuffer,
  x: number,
  y: number,
  rgba: [number, number, number, number],
): void {
  buffer.data.set(rgba, (y * buffer.width + x) * 4);
}

function pixelAt(buffer: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const offset = (y * buffer.width + x) * 4;
  return [
    buffer.data[offset],
    buffer.data[offset + 1],
    buffer.data[offset + 2],
    buffer.data[offset + 3],
  ];
}

function setAlpha(buffer: PixelBuffer, x: number, y: number, alpha: number): void {
  buffer.data[(y * buffer.width + x) * 4 + 3] = alpha;
}

describe('inspectAlphaBounds', () => {
  it('全透明画像は空として報告し、入力を変更しない', () => {
    const source = makeBuffer(4, 3);
    const before = new Uint8ClampedArray(source.data);
    const result = inspectAlphaBounds(source);

    expect(result).toEqual({
      alphaThreshold: 0,
      bounds: null,
      margins: null,
      touchesEdge: { top: false, right: false, bottom: false, left: false },
      visiblePixelCount: 0,
      totalPixelCount: 12,
      hasTransparentMargin: false,
      isEmpty: true,
    });
    expect(source.data).toEqual(before);
  });

  it('表示pixelの外接矩形、透明余白、端接触を返す', () => {
    const source = makeBuffer(8, 6);
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 2; x <= 7; x += 1) {
        setAlpha(source, x, y, 255);
      }
    }

    const result = inspectAlphaBounds(source);

    expect(result.bounds).toEqual({ x: 2, y: 1, width: 6, height: 4 });
    expect(result.margins).toEqual({ top: 1, right: 0, bottom: 1, left: 2 });
    expect(result.touchesEdge).toEqual({ top: false, right: true, bottom: false, left: false });
    expect(result.visiblePixelCount).toBe(24);
    expect(result.hasTransparentMargin).toBe(true);
    expect(result.isEmpty).toBe(false);
  });

  it('alphaしきい値以下を透明として扱う', () => {
    const source = makeBuffer(3, 2);
    setAlpha(source, 0, 0, 10);
    setAlpha(source, 2, 1, 11);

    expect(inspectAlphaBounds(source, 10).bounds).toEqual({ x: 2, y: 1, width: 1, height: 1 });
    expect(inspectAlphaBounds(source, 11).isEmpty).toBe(true);
  });

  it('進捗を通知し、最後は1になる', () => {
    const onProgress = vi.fn();
    inspectAlphaBounds(makeBuffer(2, 65), 0, onProgress);
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('不正なthresholdとBufferを理由付きで拒否する', () => {
    expect(() => inspectAlphaBounds(makeBuffer(2, 2), -1)).toThrow('alphaしきい値');
    expect(() => inspectAlphaBounds(makeBuffer(2, 2), 1.5)).toThrow('alphaしきい値');
    expect(() =>
      inspectAlphaBounds({ width: 2, height: 2, data: new Uint8ClampedArray(3) }),
    ).toThrow('画像データの長さ');
  });
});

describe('padLayerImage', () => {
  it('指定した上下左右へ透明paddingを追加し、元画像を変更しない', () => {
    const source = makeBuffer(2, 2);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 1, [0, 255, 0, 255]);
    const before = new Uint8ClampedArray(source.data);

    const result = padLayerImage(source, { top: 1, right: 2, bottom: 3, left: 4 });

    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
    expect(pixelAt(result, 4, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 5, 2)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(source.data).toEqual(before);
  });

  it('0 paddingは新しいBufferを返し、進捗1を通知する', () => {
    const source = makeBuffer(2, 2);
    const onProgress = vi.fn();
    const result = padLayerImage(source, { top: 0, right: 0, bottom: 0, left: 0 }, onProgress);
    expect(result).not.toBe(source);
    expect(result.data).not.toBe(source.data);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('負数、非整数、4096超の出力を拒否する', () => {
    expect(() =>
      padLayerImage(makeBuffer(2, 2), { top: -1, right: 0, bottom: 0, left: 0 }),
    ).toThrow('0以上の整数');
    expect(() =>
      padLayerImage(makeBuffer(2, 2), { top: 0.5, right: 0, bottom: 0, left: 0 }),
    ).toThrow('0以上の整数');
    expect(() =>
      padLayerImage(makeBuffer(4096, 1), { top: 0, right: 1, bottom: 0, left: 0 }),
    ).toThrow('4096以下');
  });
});

describe('resizeLayerImage', () => {
  it('nearestは元pixelを整数倍率で複製する', () => {
    const source = makeBuffer(2, 2);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [0, 255, 0, 255]);
    setPixel(source, 0, 1, [0, 0, 255, 255]);
    setPixel(source, 1, 1, [255, 255, 0, 255]);

    const result = resizeLayerImage(source, 4, 4, 'nearest');

    expect(pixelAt(result, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 3, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(result, 0, 3)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(result, 3, 3)).toEqual([255, 255, 0, 255]);
  });

  it('smoothはpremultiplied alphaで透明色のにじみを避ける', () => {
    const source = makeBuffer(2, 1);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [0, 0, 255, 0]);

    const result = resizeLayerImage(source, 3, 1, 'smooth');

    expect(pixelAt(result, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 1, 0)).toEqual([255, 0, 0, 128]);
    expect(pixelAt(result, 2, 0)).toEqual([0, 0, 0, 0]);
  });

  it('元Bufferを変更せず、最後に進捗1を通知する', () => {
    const source = makeBuffer(3, 2);
    setPixel(source, 1, 1, [1, 2, 3, 4]);
    const before = new Uint8ClampedArray(source.data);
    const onProgress = vi.fn();
    resizeLayerImage(source, 5, 7, 'nearest', onProgress);
    expect(source.data).toEqual(before);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('不正な寸法と補間方法を拒否する', () => {
    expect(() => resizeLayerImage(makeBuffer(2, 2), 0, 2, 'nearest')).toThrow('1以上');
    expect(() => resizeLayerImage(makeBuffer(2, 2), 4097, 2, 'nearest')).toThrow('4096以下');
    expect(() => resizeLayerImage(makeBuffer(2, 2), 2, 2, 'cubic' as 'nearest')).toThrow(
      'nearestまたはsmooth',
    );
  });
});
