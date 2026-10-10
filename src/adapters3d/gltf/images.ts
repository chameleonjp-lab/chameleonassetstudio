import {
  inspectNativeImage,
  validateNativeImageDimensions,
} from '../../core3d/model/nativeImageMetadata';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
/** Worker-only conversion for non-GLB image sources; encoded PNG/JPEG originals remain exact. */
export async function convertAssetImage(
  source: Uint8Array,
  verifyPixels = false,
): Promise<Uint8Array> {
  try {
    const info = inspectNativeImage(source);
    if (verifyPixels) {
      if (typeof createImageBitmap !== 'function')
        throw new Error('Worker image decoder unavailable; original retained');
      const bitmap = await createImageBitmap(
        new Blob([source.slice().buffer], { type: info.mimeType }),
        { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' },
      );
      try {
        if (bitmap.width !== info.width || bitmap.height !== info.height)
          throw new Error('Decoded image dimensions mismatch');
      } finally {
        bitmap.close();
      }
    }
    return source.slice();
  } catch (error) {
    const webp =
      String.fromCharCode(...source.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...source.subarray(8, 12)) === 'WEBP';
    if (!webp) throw error;
  }
  // Bound WebP dimensions before any decoder allocation.
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (source.length < 30 || view.getUint32(4, true) + 8 !== source.length)
    throw new Error('Invalid WebP header');
  for (let offset = 12; offset < source.length;) {
    if (offset + 8 > source.length) throw new Error('Truncated WebP chunk');
    const type = String.fromCharCode(...source.subarray(offset, offset + 4)),
      size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > source.length) throw new Error('Invalid WebP chunk range');
    if (['EXIF', 'ICCP', 'XMP ', 'ANIM', 'ANMF'].includes(type))
      throw new Error('WebP metadata/animation requires explicit source-only handling');
    offset += 8 + size + (size % 2);
    if (offset > source.length) throw new Error('Invalid WebP padding');
  }
  const kind = String.fromCharCode(...source.subarray(12, 16));
  let width = 0,
    height = 0;
  if (kind === 'VP8X') {
    if (source[20] & 2) throw new Error('Animated WebP is source-only');
    width = 1 + source[24] + source[25] * 256 + source[26] * 65536;
    height = 1 + source[27] + source[28] * 256 + source[29] * 65536;
  } else if (kind === 'VP8L') {
    if (source[20] !== 0x2f) throw new Error('Invalid WebP lossless header');
    const bits = view.getUint32(21, true);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (kind === 'VP8 ') {
    if (source[23] !== 0x9d || source[24] !== 1 || source[25] !== 0x2a)
      throw new Error('Invalid WebP frame');
    width = view.getUint16(26, true) & 0x3fff;
    height = view.getUint16(28, true) & 0x3fff;
  } else throw new Error('Unsupported WebP frame');
  validateNativeImageDimensions(width, height);
  if (source.length > NATIVE_TEXTURE_PROFILE.maxFileBytes) throw new Error('Image exceeds profile');
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function')
    throw new Error('Worker image encoder unavailable; original retained');
  const bitmap = await createImageBitmap(new Blob([source.slice().buffer]), {
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    validateNativeImageDimensions(bitmap.width, bitmap.height);
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error('Decoded image dimensions mismatch');
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
      context = canvas.getContext('2d');
    if (!context) throw new Error('Worker canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const output = new Uint8Array(await blob.arrayBuffer());
    inspectNativeImage(output);
    canvas.width = canvas.height = 0;
    return output;
  } finally {
    bitmap.close();
  }
}
