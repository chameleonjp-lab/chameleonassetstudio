import { describe, expect, it, vi } from 'vitest';
import { applyImageOperation, imageOperationLabel, type PixelBuffer } from './imageOperation';

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

describe('applyImageOperation', () => {
  it('legacy operationを既存dispatcherへ委譲する', () => {
    const result = applyImageOperation(makeBuffer(4, 4, [255, 0, 0, 255]), {
      type: 'crop',
      rect: { x: 1, y: 1, width: 2, height: 2 },
    });
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('raster foundation operationを統合入口から実行する', () => {
    const source = makeBuffer(8, 4);
    const onProgress = vi.fn();
    const result = applyImageOperation(
      source,
      {
        type: 'paintBrush',
        points: [
          { x: 1, y: 2 },
          { x: 6, y: 2 },
        ],
        radius: 1,
        color: { r: 0, g: 255, b: 0 },
      },
      onProgress,
    );
    expect(pixelAt(result, 4, 2)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(source, 4, 2)).toEqual([0, 0, 0, 0]);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('selection clear / moveもPixelBufferを返す統合操作になる', () => {
    const source = makeBuffer(5, 3);
    source.data.set([255, 0, 255, 255], (1 * 5 + 1) * 4);
    const moved = applyImageOperation(source, {
      type: 'selectionMove',
      selection: { rect: { x: 1, y: 1, width: 1, height: 1 } },
      target: { x: 3, y: 1 },
    });
    expect(pixelAt(moved, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(moved, 3, 1)).toEqual([255, 0, 255, 255]);
  });

  it('stampImageは既存pixelsを保ったまま不透明部分だけを合成する（raster text確定用）', () => {
    const source = makeBuffer(3, 1, [1, 2, 3, 255]);
    const result = applyImageOperation(source, {
      type: 'stampImage',
      clipboard: { width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) },
      target: { x: 1, y: 0 },
    });
    expect(pixelAt(result, 1, 0)).toEqual([9, 9, 9, 255]);
    expect(pixelAt(result, 0, 0)).toEqual([1, 2, 3, 255]);
  });
});

describe('imageOperationLabel', () => {
  it('新旧operationへ日本語ラベルを返す', () => {
    expect(
      imageOperationLabel({
        type: 'floodFill',
        start: { x: 0, y: 0 },
        color: { r: 0, g: 0, b: 0 },
        tolerance: 0,
      }),
    ).toBe('塗りつぶし');
    expect(
      imageOperationLabel({
        type: 'outline',
        color: { r: 0, g: 0, b: 0 },
        thickness: 1,
      }),
    ).toBe('輪郭線の追加');
    expect(
      imageOperationLabel({
        type: 'stampImage',
        clipboard: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
        target: { x: 0, y: 0 },
      }),
    ).toBe('テキストを確定');
  });
});
