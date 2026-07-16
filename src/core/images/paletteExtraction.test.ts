import { describe, expect, it, vi } from 'vitest';
import type { PixelBuffer } from './operations';
import { extractPalette } from './paletteExtraction';

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

describe('extractPalette', () => {
  it('透明pixelとalphaしきい値以下を除外する', () => {
    const source = makeBuffer(4, 1);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [255, 0, 0, 20]);
    setPixel(source, 2, 0, [0, 255, 0, 21]);
    setPixel(source, 3, 0, [0, 0, 255, 0]);

    const result = extractPalette(source, 8, 20);

    expect(result.visiblePixelCount).toBe(2);
    expect(result.transparentPixelCount).toBe(2);
    expect(result.colors).toEqual([
      { color: { r: 0, g: 255, b: 0 }, count: 1, coverage: 0.5 },
      { color: { r: 255, g: 0, b: 0 }, count: 1, coverage: 0.5 },
    ]);
  });

  it('同じ5-bit bucketの実色を平均し、頻度順で返す', () => {
    const source = makeBuffer(5, 1);
    setPixel(source, 0, 0, [8, 8, 8, 255]);
    setPixel(source, 1, 0, [15, 15, 15, 255]);
    setPixel(source, 2, 0, [8, 8, 8, 255]);
    setPixel(source, 3, 0, [240, 0, 0, 255]);
    setPixel(source, 4, 0, [240, 0, 0, 255]);

    const result = extractPalette(source, 8);

    expect(result.colors).toEqual([
      { color: { r: 10, g: 10, b: 10 }, count: 3, coverage: 0.6 },
      { color: { r: 240, g: 0, b: 0 }, count: 2, coverage: 0.4 },
    ]);
    expect(result.quantizationBits).toBe(5);
  });

  it('最大色数を適用し、同数時はbucket key順で決定的に並べる', () => {
    const source = makeBuffer(3, 1);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [0, 255, 0, 255]);
    setPixel(source, 2, 0, [0, 0, 255, 255]);

    const result = extractPalette(source, 2);

    expect(result.colors).toEqual([
      { color: { r: 0, g: 0, b: 255 }, count: 1, coverage: 1 / 3 },
      { color: { r: 0, g: 255, b: 0 }, count: 1, coverage: 1 / 3 },
    ]);
  });

  it('入力を変更せず、進捗の最後に1を通知する', () => {
    const source = makeBuffer(2, 65);
    setPixel(source, 0, 0, [1, 2, 3, 255]);
    const before = new Uint8ClampedArray(source.data);
    const onProgress = vi.fn();

    extractPalette(source, 8, 0, onProgress);

    expect(source.data).toEqual(before);
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('不正なBuffer、色数、alphaしきい値を理由付きで拒否する', () => {
    expect(() => extractPalette(makeBuffer(2, 2), 0)).toThrow('抽出色数');
    expect(() => extractPalette(makeBuffer(2, 2), 33)).toThrow('抽出色数');
    expect(() => extractPalette(makeBuffer(2, 2), 8, -1)).toThrow('alphaしきい値');
    expect(() => extractPalette({ width: 2, height: 2, data: new Uint8ClampedArray(3) })).toThrow(
      '画像データの長さ',
    );
  });
});
