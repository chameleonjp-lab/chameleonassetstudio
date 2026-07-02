import { describe, expect, it } from 'vitest';
import {
  ImageOperationError,
  addOutline,
  adjustHsl,
  applyOperation,
  colorDistance,
  cropRect,
  erasePixels,
  hexToRgb,
  hslToRgb,
  operationLabel,
  removeBackgroundColor,
  replaceColor,
  rgbToHsl,
  type PixelBuffer,
} from './operations';

/** 単色で塗ったテスト用バッファを作る。 */
function makeBuffer(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set(rgba, i * 4);
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

describe('色ユーティリティ', () => {
  it('hexToRgb が #rrggbb を解釈する', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(() => hexToRgb('red')).toThrow(ImageOperationError);
  });

  it('rgbToHsl と hslToRgb が往復する', () => {
    const [h, s, l] = rgbToHsl(200, 100, 50);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(Math.abs(r - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 50)).toBeLessThanOrEqual(2);
  });

  it('colorDistance は同色で 0、白黒で 255 になる', () => {
    expect(colorDistance(10, 20, 30, 10, 20, 30)).toBe(0);
    expect(colorDistance(0, 0, 0, 255, 255, 255)).toBeCloseTo(255);
  });
});

describe('cropRect', () => {
  it('指定範囲だけ残る', () => {
    const buffer = makeBuffer(8, 8, [255, 0, 0, 255]);
    // 左上 2x2 を緑にする
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      buffer.data.set([0, 255, 0, 255], (y * 8 + x) * 4);
    }
    const cropped = cropRect(buffer, { x: 0, y: 0, width: 2, height: 2 });
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(pixelAt(cropped, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(cropped, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it('画像外の範囲はエラーになる', () => {
    const buffer = makeBuffer(4, 4, [0, 0, 0, 255]);
    expect(() => cropRect(buffer, { x: 10, y: 10, width: 2, height: 2 })).toThrow(
      ImageOperationError,
    );
  });

  it('はみ出した範囲は画像内へ切り詰める', () => {
    const buffer = makeBuffer(4, 4, [0, 0, 0, 255]);
    const cropped = cropRect(buffer, { x: 2, y: 2, width: 10, height: 10 });
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
  });
});

describe('removeBackgroundColor', () => {
  it('指定色に近い画素だけ透明になる', () => {
    const buffer = makeBuffer(4, 1, [255, 255, 255, 255]);
    buffer.data.set([200, 0, 0, 255], 0); // 左端だけ赤
    const result = removeBackgroundColor(buffer, { r: 255, g: 255, b: 255 }, 10);
    expect(pixelAt(result, 0, 0)[3]).toBe(255); // 赤は残る
    expect(pixelAt(result, 1, 0)[3]).toBe(0); // 白は消える
    // 元バッファは変更されない
    expect(pixelAt(buffer, 1, 0)[3]).toBe(255);
  });

  it('tolerance が広いと近い色も消える', () => {
    const buffer = makeBuffer(2, 1, [240, 240, 240, 255]);
    const strict = removeBackgroundColor(buffer, { r: 255, g: 255, b: 255 }, 5);
    expect(pixelAt(strict, 0, 0)[3]).toBe(255);
    const loose = removeBackgroundColor(buffer, { r: 255, g: 255, b: 255 }, 30);
    expect(pixelAt(loose, 0, 0)[3]).toBe(0);
  });
});

describe('erasePixels', () => {
  it('ストローク周辺が透明になり、離れた場所は残る', () => {
    const buffer = makeBuffer(16, 16, [0, 0, 255, 255]);
    const result = erasePixels(buffer, [{ x: 4, y: 8 }], 2);
    expect(pixelAt(result, 4, 8)[3]).toBe(0);
    expect(pixelAt(result, 12, 8)[3]).toBe(255);
  });

  it('点と点の間が補間されて途切れない', () => {
    const buffer = makeBuffer(32, 8, [0, 0, 255, 255]);
    const result = erasePixels(
      buffer,
      [
        { x: 2, y: 4 },
        { x: 28, y: 4 },
      ],
      2,
    );
    // 中間点も消えている
    expect(pixelAt(result, 15, 4)[3]).toBe(0);
  });
});

describe('adjustHsl', () => {
  it('明度 -100 で黒になる', () => {
    const buffer = makeBuffer(2, 2, [180, 90, 40, 255]);
    const result = adjustHsl(buffer, { hue: 0, saturation: 0, lightness: -100 });
    expect(pixelAt(result, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('色相 120 度で赤が緑になる', () => {
    const buffer = makeBuffer(1, 1, [255, 0, 0, 255]);
    const result = adjustHsl(buffer, { hue: 120, saturation: 0, lightness: 0 });
    const [r, g, b] = pixelAt(result, 0, 0);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(50);
    expect(b).toBeLessThan(50);
  });

  it('透明画素は変更しない', () => {
    const buffer = makeBuffer(1, 1, [255, 0, 0, 0]);
    const result = adjustHsl(buffer, { hue: 0, saturation: 0, lightness: 100 });
    expect(pixelAt(result, 0, 0)[3]).toBe(0);
  });
});

describe('replaceColor', () => {
  it('近い色だけ置き換える', () => {
    const buffer = makeBuffer(2, 1, [255, 0, 0, 255]);
    buffer.data.set([0, 0, 255, 255], 4); // 右は青
    const result = replaceColor(buffer, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, 20);
    expect(pixelAt(result, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(result, 1, 0)).toEqual([0, 0, 255, 255]);
  });
});

describe('addOutline', () => {
  it('不透明領域の外側に輪郭が付き、内部は変わらない', () => {
    const buffer = makeBuffer(9, 9, [0, 0, 0, 0]);
    // 中央 3x3 を赤にする
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        buffer.data.set([255, 0, 0, 255], (y * 9 + x) * 4);
      }
    }
    const result = addOutline(buffer, { r: 0, g: 0, b: 0 }, 1);
    expect(pixelAt(result, 4, 4)).toEqual([255, 0, 0, 255]); // 内部は元のまま
    expect(pixelAt(result, 2, 4)).toEqual([0, 0, 0, 255]); // 左隣に輪郭
    expect(pixelAt(result, 4, 2)).toEqual([0, 0, 0, 255]); // 上隣に輪郭
    expect(pixelAt(result, 0, 0)[3]).toBe(0); // 遠い場所は透明のまま
  });

  it('太さの分だけ輪郭が広がる', () => {
    const buffer = makeBuffer(11, 11, [0, 0, 0, 0]);
    buffer.data.set([255, 0, 0, 255], (5 * 11 + 5) * 4); // 中央 1px
    const result = addOutline(buffer, { r: 0, g: 255, b: 0 }, 3);
    expect(pixelAt(result, 2, 5)[3]).toBe(255); // 3px 左
    expect(pixelAt(result, 1, 5)[3]).toBe(0); // 4px 左は透明
  });
});

describe('applyOperation / operationLabel', () => {
  it('種別で分岐して適用される', () => {
    const buffer = makeBuffer(4, 4, [255, 255, 255, 255]);
    const cropped = applyOperation(buffer, {
      type: 'crop',
      rect: { x: 0, y: 0, width: 2, height: 2 },
    });
    expect(cropped.width).toBe(2);
  });

  it('日本語ラベルを返す', () => {
    expect(operationLabel({ type: 'crop', rect: { x: 0, y: 0, width: 1, height: 1 } })).toBe(
      'トリミング',
    );
    expect(
      operationLabel({ type: 'removeBackground', color: { r: 0, g: 0, b: 0 }, tolerance: 0 }),
    ).toBe('背景の透過');
    expect(operationLabel({ type: 'erase', points: [], radius: 1 })).toBe('消しゴム');
    expect(operationLabel({ type: 'adjustHsl', hue: 0, saturation: 0, lightness: 0 })).toBe(
      '色調整',
    );
    expect(
      operationLabel({
        type: 'replaceColor',
        from: { r: 0, g: 0, b: 0 },
        to: { r: 0, g: 0, b: 0 },
        tolerance: 0,
      }),
    ).toBe('パレット置換');
    expect(operationLabel({ type: 'outline', color: { r: 0, g: 0, b: 0 }, thickness: 1 })).toBe(
      '輪郭線の追加',
    );
  });
});
