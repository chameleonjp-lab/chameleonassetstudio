import { describe, expect, it } from 'vitest';
import { assertFileImageSignature, detectImageMimeType } from './imageInputSafety';

describe('image input signature', () => {
  it('PNG / JPEG / WebPをmagic bytesで識別する', () => {
    expect(
      detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectImageMimeType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image/webp');
    expect(detectImageMimeType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('宣言MIMEと実体が違うfileを拒否する', async () => {
    const spoofed = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'spoofed.jpg',
      { type: 'image/jpeg' },
    );
    await expect(assertFileImageSignature(spoofed)).rejects.toThrow(/一致しません/);
  });
});
