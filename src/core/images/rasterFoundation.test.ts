import { describe, expect, it } from 'vitest';
import type { PixelBuffer } from './operations';
import {
  clearSelectionPixels,
  copySelectionPixels,
  drawRasterEllipse,
  drawRasterRect,
  floodFill,
  moveSelectionPixels,
  paintBrush,
  pasteSelectionPixels,
} from './rasterFoundation';

function makeBuffer(
  width: number,
  height: number,
  rgba: [number, number, number, number] = [0, 0, 0, 0],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(rgba, index * 4);
  }
  return { width, height, data };
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

describe('paintBrush', () => {
  it('点列を補間して描画し、元bufferを変更しない', () => {
    const source = makeBuffer(16, 8);
    const result = paintBrush(
      source,
      [
        { x: 2, y: 4 },
        { x: 13, y: 4 },
      ],
      1,
      { r: 255, g: 0, b: 0 },
    );
    expect(pixelAt(result, 2, 4)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 8, 4)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 13, 4)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(source, 8, 4)).toEqual([0, 0, 0, 0]);
  });

  it('rectangular selectionの外へ描画しない', () => {
    const result = paintBrush(
      makeBuffer(12, 6),
      [
        { x: 1, y: 3 },
        { x: 10, y: 3 },
      ],
      1,
      { r: 0, g: 255, b: 0 },
      { rect: { x: 4, y: 1, width: 4, height: 4 } },
    );
    expect(pixelAt(result, 3, 3)[3]).toBe(0);
    expect(pixelAt(result, 4, 3)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(result, 7, 3)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(result, 8, 3)[3]).toBe(0);
  });

  it('不正な半径を理由付きで拒否する', () => {
    expect(() => paintBrush(makeBuffer(4, 4), [{ x: 1, y: 1 }], 0, { r: 0, g: 0, b: 0 })).toThrow(
      'ブラシ半径',
    );
  });
});

describe('floodFill', () => {
  it('4近傍の連続領域だけを塗る', () => {
    const source = makeBuffer(5, 3, [255, 255, 255, 255]);
    for (let y = 0; y < 3; y += 1) {
      source.data.set([0, 0, 0, 255], (y * 5 + 2) * 4);
    }
    const result = floodFill(source, { x: 0, y: 0 }, { r: 255, g: 0, b: 0 }, 0);
    expect(pixelAt(result, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 1, 2)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(result, 2, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(result, 4, 1)).toEqual([255, 255, 255, 255]);
  });

  it('selectionをfill境界として扱う', () => {
    const result = floodFill(
      makeBuffer(6, 2, [255, 255, 255, 255]),
      { x: 2, y: 0 },
      { r: 0, g: 0, b: 255 },
      0,
      { rect: { x: 2, y: 0, width: 2, height: 2 } },
    );
    expect(pixelAt(result, 1, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(result, 2, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(result, 3, 1)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(result, 4, 0)).toEqual([255, 255, 255, 255]);
  });
});

describe('raster shapes', () => {
  it('rectをselection内だけへ確定する', () => {
    const result = drawRasterRect(
      makeBuffer(8, 8),
      { x: 1, y: 1, width: 6, height: 6 },
      { r: 10, g: 20, b: 30 },
      { rect: { x: 3, y: 3, width: 2, height: 2 } },
    );
    expect(pixelAt(result, 3, 3)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(result, 4, 4)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(result, 2, 3)[3]).toBe(0);
  });

  it('ellipseの内側だけを塗る', () => {
    const result = drawRasterEllipse(
      makeBuffer(9, 9),
      { x: 1, y: 1, width: 7, height: 7 },
      { r: 200, g: 100, b: 50 },
    );
    expect(pixelAt(result, 4, 4)).toEqual([200, 100, 50, 255]);
    expect(pixelAt(result, 1, 1)[3]).toBe(0);
    expect(pixelAt(result, 7, 7)[3]).toBe(0);
  });
});

describe('single-layer rectangular selection', () => {
  it('copy bufferは選択範囲だけを保持する', () => {
    const source = makeBuffer(4, 3);
    source.data.set([255, 0, 0, 255], (1 * 4 + 1) * 4);
    source.data.set([0, 255, 0, 255], (1 * 4 + 2) * 4);
    const clipboard = copySelectionPixels(source, {
      rect: { x: 1, y: 1, width: 2, height: 1 },
    });
    expect(clipboard.width).toBe(2);
    expect(clipboard.height).toBe(1);
    expect(Array.from(clipboard.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('clearは選択範囲だけを透明にする', () => {
    const source = makeBuffer(4, 2, [255, 255, 255, 255]);
    const result = clearSelectionPixels(source, {
      rect: { x: 1, y: 0, width: 2, height: 2 },
    });
    expect(pixelAt(result, 0, 0)[3]).toBe(255);
    expect(pixelAt(result, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(result, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(result, 3, 1)[3]).toBe(255);
    expect(pixelAt(source, 1, 0)[3]).toBe(255);
  });

  it('copyを同一layerの別位置へ貼れる', () => {
    const source = makeBuffer(5, 3);
    source.data.set([0, 0, 255, 255], (1 * 5 + 1) * 4);
    const clipboard = copySelectionPixels(source, {
      rect: { x: 1, y: 1, width: 1, height: 1 },
    });
    const result = pasteSelectionPixels(source, clipboard, { x: 3, y: 1 });
    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(result, 3, 1)).toEqual([0, 0, 255, 255]);
  });

  it('moveは元位置をclearして貼り付ける', () => {
    const source = makeBuffer(6, 3);
    source.data.set([255, 0, 255, 255], (1 * 6 + 1) * 4);
    source.data.set([255, 0, 255, 255], (1 * 6 + 2) * 4);
    const result = moveSelectionPixels(
      source,
      { rect: { x: 1, y: 1, width: 2, height: 1 } },
      { x: 3, y: 1 },
    );
    expect(pixelAt(result, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(result, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(result, 3, 1)).toEqual([255, 0, 255, 255]);
    expect(pixelAt(result, 4, 1)).toEqual([255, 0, 255, 255]);
  });

  it('selectionとcopy bufferは既存Asset形式を必要としない一時データである', () => {
    const source = makeBuffer(2, 2, [1, 2, 3, 255]);
    const clipboard = copySelectionPixels(source, {
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(Object.keys(clipboard).sort()).toEqual(['data', 'height', 'width']);
  });
});
