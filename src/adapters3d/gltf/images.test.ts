import { expect, it } from 'vitest';
import { convertAssetImage } from './images';
it('does not hand malformed image bytes to a browser decoder', async () => {
  await expect(convertAssetImage(new Uint8Array([1, 2, 3]))).rejects.toThrow();
});

it('rejects oversized or oriented WebP before createImageBitmap', async () => {
  const source = new Uint8Array(30);
  source.set(new TextEncoder().encode('RIFF'), 0);
  source.set(new TextEncoder().encode('WEBPVP8X'), 8);
  const view = new DataView(source.buffer);
  view.setUint32(4, 22, true);
  view.setUint32(16, 10, true);
  source[24] = 255;
  source[25] = 255;
  source[26] = 255;
  source[27] = 1;
  await expect(convertAssetImage(source)).rejects.toThrow('各辺');
  const exif = new Uint8Array(38);
  exif.set(source);
  new DataView(exif.buffer).setUint32(4, 30, true);
  exif[24] = 1;
  exif[25] = exif[26] = 0;
  exif.set(new TextEncoder().encode('EXIF'), 30);
  await expect(convertAssetImage(exif)).rejects.toThrow('source-only');
});
