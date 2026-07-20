import { describe, expect, it } from 'vitest';
import {
  assertFileImageSignature,
  detectImageMimeType,
  imageMimeTypesMatch,
} from './imageInputSafety';

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
    await expect(assertFileImageSignature(apng)).resolves.toBeUndefined();
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
