import { describe, expect, it, vi } from 'vitest';
import {
  assertFileImageSignature,
  detectImageMimeType,
  imageMimeTypesMatch,
  inspectSvgSafety,
  inspectGifAnimation,
  inspectPngAnimation,
  svgSafetyViolation,
} from './imageInputSafety';

function uint32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type: string, data: number[] = []): number[] {
  return [...uint32(data.length), ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0];
}

function pngBytes(
  options: {
    width?: number;
    height?: number;
    frames?: number;
    plays?: number;
    frameControls?: number;
    frameWidth?: number;
    frameHeight?: number;
    frameX?: number;
    frameY?: number;
  } = {},
) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const ihdr = pngChunk('IHDR', [...uint32(width), ...uint32(height), 8, 6, 0, 0, 0]);
  const animation =
    options.frames === undefined
      ? []
      : [
          ...pngChunk('acTL', [...uint32(options.frames), ...uint32(options.plays ?? 0)]),
          ...Array.from({ length: options.frameControls ?? options.frames }, (_, index) =>
            pngChunk('fcTL', [
              ...uint32(index),
              ...uint32(options.frameWidth ?? width),
              ...uint32(options.frameHeight ?? height),
              ...uint32(options.frameX ?? 0),
              ...uint32(options.frameY ?? 0),
              0,
              1,
              0,
              10,
              0,
              0,
            ]),
          ).flat(),
        ];
  return new Uint8Array([
    ...signature,
    ...ihdr,
    ...animation,
    ...pngChunk('IDAT', [0]),
    ...pngChunk('IEND'),
  ]);
}

function gifBytes(frameCount: number, loopCount: number | null): Uint8Array {
  const images = Array.from({ length: frameCount }, () => [
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0, 0,
  ]).flat();
  const loop =
    loopCount === null
      ? []
      : [
          0x21,
          0xff,
          0x0b,
          ...new TextEncoder().encode('NETSCAPE2.0'),
          3,
          1,
          loopCount & 0xff,
          (loopCount >> 8) & 0xff,
          0,
        ];
  return new Uint8Array([
    ...new TextEncoder().encode('GIF89a'),
    1,
    0,
    1,
    0,
    0,
    0,
    0,
    ...loop,
    ...images,
    0x3b,
  ]);
}

describe('image input signature', () => {
  it('PNG / JPEG / WebP / GIF / SVGを実体から識別する', () => {
    expect(
      detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectImageMimeType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image/webp');
    expect(
      detectImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])),
    ).toBe('image/gif');
    expect(
      detectImageMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00])),
    ).toBe('image/gif');
    expect(
      detectImageMimeType(
        new TextEncoder().encode(
          '\uFEFF<?xml version="1.0"?>\n<!-- source -->\n<svg xmlns="http://www.w3.org/2000/svg">',
        ),
      ),
    ).toBe('image/svg+xml');
    expect(detectImageMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(detectImageMimeType(new TextEncoder().encode('<html><svg></svg></html>'))).toBeNull();
  });

  it('宣言MIMEと実体が違うfileを拒否する', async () => {
    const spoofed = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'spoofed.jpg',
      { type: 'image/jpeg' },
    );
    await expect(assertFileImageSignature(spoofed)).rejects.toThrow(/一致しません/);
  });

  it('PNG実体とimage/apng宣言を同じコンテナとして許容する', async () => {
    expect(imageMimeTypesMatch('image/png', 'image/apng')).toBe(true);
    const apng = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'animated.png',
      { type: 'image/apng' },
    );
    await expect(assertFileImageSignature(apng)).resolves.toBe('image/png');
  });

  it('SVG root確認後のUTF-8文字がsniff末尾で分断されてもprefixとして識別する', () => {
    const encoder = new TextEncoder();
    for (const character of ['¢', 'あ', '😀']) {
      const text = '<svg>'.padEnd(4095, ' ') + character + '</svg>';
      const prefix = encoder.encode(text).subarray(0, 4096);
      expect(detectImageMimeType(prefix, { isTruncatedPrefix: true })).toBe('image/svg+xml');
      expect(detectImageMimeType(prefix)).toBeNull();
    }

    expect(detectImageMimeType(encoder.encode('<svg/>'))).toBe('image/svg+xml');
    expect(
      detectImageMimeType(new Uint8Array([...encoder.encode('<svg>'), 0xff]), {
        isTruncatedPrefix: true,
      }),
    ).toBeNull();
  });
});

describe('optional animated image preflight', () => {
  it('通常PNGとAPNGをacTLで区別し、frame数とrepeatを返す', () => {
    expect(inspectPngAnimation(pngBytes())).toEqual({
      animated: false,
      frameCount: 1,
      repetition: 'none',
      width: 1,
      height: 1,
    });
    expect(inspectPngAnimation(pngBytes({ frames: 2, plays: 0 }))).toEqual({
      animated: true,
      frameCount: 2,
      repetition: 'infinite',
      width: 1,
      height: 1,
    });
    expect(inspectPngAnimation(pngBytes({ frames: 3, plays: 2 }))).toEqual({
      animated: true,
      frameCount: 3,
      repetition: 'finite',
      width: 1,
      height: 1,
    });
  });

  it('APNGの宣言frame数とfcTL件数が違えば拒否する', () => {
    expect(() => inspectPngAnimation(pngBytes({ frames: 2, frameControls: 1 }))).toThrow(
      /一致しません/,
    );
  });

  it('acTLの重複・IDAT後配置と終端を超えるchunkをboundedに拒否する', () => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = pngChunk('IHDR', [...uint32(1), ...uint32(1), 8, 6, 0, 0, 0]);
    const control = pngChunk('acTL', [...uint32(1), ...uint32(0)]);
    const frame = pngChunk('fcTL', [
      ...uint32(0),
      ...uint32(1),
      ...uint32(1),
      ...uint32(0),
      ...uint32(0),
      0,
      1,
      0,
      10,
      0,
      0,
    ]);
    expect(() =>
      inspectPngAnimation(
        new Uint8Array([
          ...signature,
          ...ihdr,
          ...control,
          ...control,
          ...frame,
          ...pngChunk('IEND'),
        ]),
      ),
    ).toThrow(/複数/);
    expect(() =>
      inspectPngAnimation(
        new Uint8Array([
          ...signature,
          ...ihdr,
          ...pngChunk('IDAT', [0]),
          ...control,
          ...frame,
          ...pngChunk('IEND'),
        ]),
      ),
    ).toThrow(/IDATより前/);
    expect(() => inspectPngAnimation(pngBytes({ frames: 1 }).subarray(0, -2))).toThrow(/終端/);
  });

  it('GIFのimage descriptorを数え、loop metadataを分類する', () => {
    expect(inspectGifAnimation(gifBytes(2, 0))).toEqual({
      frameCount: 2,
      repetition: 'infinite',
      width: 1,
      height: 1,
    });
    expect(inspectGifAnimation(gifBytes(3, 2))).toEqual({
      frameCount: 3,
      repetition: 'finite',
      width: 1,
      height: 1,
    });
    expect(inspectGifAnimation(gifBytes(1, null))).toEqual({
      frameCount: 1,
      repetition: 'none',
      width: 1,
      height: 1,
    });
  });

  it('codec起動前にcanvas寸法を返し、canvas外frameを拒否する', () => {
    expect(inspectPngAnimation(pngBytes({ width: 5000, height: 3 }))).toMatchObject({
      width: 5000,
      height: 3,
    });
    expect(() =>
      inspectPngAnimation(pngBytes({ width: 2, height: 2, frames: 1, frameWidth: 2, frameX: 1 })),
    ).toThrow(/canvasを超えています/);

    const oversizedGif = gifBytes(1, null);
    oversizedGif[6] = 0x88;
    oversizedGif[7] = 0x13;
    expect(inspectGifAnimation(oversizedGif)).toMatchObject({ width: 5000, height: 1 });

    const outsideGif = gifBytes(1, null);
    outsideGif[15] = 1;
    expect(() => inspectGifAnimation(outsideGif)).toThrow(/logical screenを超えています/);
  });
});

describe('SVG safety profile', () => {
  it('active構造を含むmalformed XMLもunsafeより先にmalformedへ分類する', () => {
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString(): Document {
          return {
            documentElement: { localName: 'svg' },
            querySelector: (selector: string) => (selector === 'parsererror' ? {} : null),
          } as unknown as Document;
        }
      },
    );

    try {
      expect(inspectSvgSafety('<svg><script></svg>')).toEqual({
        kind: 'malformed',
        message: 'SVGのXML構造を解析できませんでした。',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('self-containedなshapeとlocal fragment参照を許可する', () => {
    expect(
      svgSafetyViolation(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>',
      ),
    ).toBeNull();
  });

  it.each([
    ['script', '<svg><script>alert(1)</script></svg>'],
    [
      'animated external href',
      '<svg><image id="target" href="#safe"/><animate href="#target" attributeName="href" values="#safe;https://example.invalid/a.png"/></svg>',
    ],
    ['event', '<svg onload="alert(1)"></svg>'],
    ['foreignObject', '<svg><foreignObject><div>html</div></foreignObject></svg>'],
    ['DOCTYPE', '<!DOCTYPE svg><svg></svg>'],
    ['external href', '<svg><image href="https://example.invalid/a.png"/></svg>'],
    ['base URL', '<svg xml:base="https://example.invalid/"><use href="#safe"/></svg>'],
    ['CSS import', '<svg><style>@import "https://example.invalid/a.css";</style></svg>'],
    ['external CSS url', '<svg><rect fill="url(https://example.invalid/a.svg#x)"/></svg>'],
    [
      'external CSS image-set',
      '<svg><style>rect{mask-image:image-set("https://example.invalid/a.png" 1x)}</style><rect/></svg>',
    ],
    [
      'CSS animation',
      '<svg><style>@keyframes pulse{to{opacity:0}}rect{animation:pulse 1s infinite}</style><rect/></svg>',
    ],
    ['font-face', '<svg><style>@font-face{font-family:x;src:local(Arial)}</style></svg>'],
    ['rendered text', '<svg><text font-family="serif">unsafe font</text></svg>'],
  ])('%sを理由付きで拒否する', (_label, svg) => {
    expect(svgSafetyViolation(svg)).not.toBeNull();
  });
});
