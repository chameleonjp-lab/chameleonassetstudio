import { describe, expect, it, vi } from 'vitest';
import type { PixelBuffer } from './operations';
import { inspectAlphaBounds } from './layerRepair';

function makeBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
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
