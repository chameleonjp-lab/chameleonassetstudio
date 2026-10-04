import { NATIVE_TEXTURE_PROFILE } from './textureProfile';

export interface NativeImageInfo {
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

function invalid(message: string): never {
  throw new Error(`3D画像: ${message}`);
}

export function validateNativeImageDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > NATIVE_TEXTURE_PROFILE.maxEdge ||
    height > NATIVE_TEXTURE_PROFILE.maxEdge ||
    width * height > NATIVE_TEXTURE_PROFILE.maxTotalPixels
  ) {
    invalid(`画像の各辺は1〜${NATIVE_TEXTURE_PROFILE.maxEdge}pxである必要があります`);
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Only canonical orientation is accepted, including on browsers that ignore
 * imageOrientation: 'none'. No EXIF rotation/reflection is silently applied.
 * TIFF offsets are relative to this bounded metadata segment, never a URI.
 */
function inspectExif(bytes: Uint8Array): void {
  if (bytes.byteLength < 8) invalid('EXIFヘッダーが破損しています');
  const order = ascii(bytes, 0, 2);
  if (order !== 'II' && order !== 'MM') invalid('EXIFバイト順に対応していません');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = order === 'II';
  if (view.getUint16(2, little) !== 42) invalid('EXIF形式に対応していません');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length) invalid('EXIF参照範囲が不正です');
  const count = view.getUint16(offset, little);
  if (offset + 2 + count * 12 + 4 > bytes.length) invalid('EXIF項目が途中で切れています');
  let orientationSeen = false;
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (
      orientationSeen ||
      view.getUint16(entry + 2, little) !== 3 ||
      view.getUint32(entry + 4, little) !== 1 ||
      view.getUint16(entry + 8, little) !== 1
    ) {
      invalid('EXIF回転・反転画像は未対応です。正しい向きのPNG/JPEGに変換してください');
    }
    orientationSeen = true;
  }
}

function inspectPng(bytes: Uint8Array): NativeImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let dataSeen = false;
  let dataEnded = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalid('PNGチャンクが途中で切れています');
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) invalid('PNGチャンクの長さが不正です');
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) invalid('PNGチャンク名が不正です');
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
      invalid('APNG（アニメーションPNG）には対応していません');
    }
    if (offset === 8 && type !== 'IHDR') invalid('PNGの先頭にIHDRがありません');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) invalid('PNGのIHDRが不正です');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      validateNativeImageDimensions(width, height);
      const depth = bytes[offset + 16];
      const color = bytes[offset + 17];
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !validDepths[color]?.includes(depth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      ) {
        invalid('PNGの画素形式に対応していません');
      }
    } else if (type === 'IDAT') {
      if (dataEnded) invalid('PNGのIDATが連続していません');
      dataSeen = true;
    } else {
      if (dataSeen) dataEnded = true;
      if (type === 'IEND') {
        if (length !== 0 || end !== bytes.length || !dataSeen) {
          invalid('PNGの終端が不正です');
        }
        return { mimeType: 'image/png', width, height };
      }
      if (type === 'eXIf') inspectExif(bytes.subarray(offset + 8, offset + 8 + length));
      if (type !== 'PLTE' && type[0] === type[0].toUpperCase()) {
        invalid(`PNGの必須チャンク ${type} には対応していません`);
      }
    }
    offset = end;
  }
  return invalid('PNGの終端がありません');
}

function inspectJpeg(bytes: Uint8Array): NativeImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  let width = 0;
  let height = 0;
  let components = 0;
  let scanSeen = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalid('JPEGマーカーが不正です');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!scanSeen || offset !== bytes.length) invalid('JPEGの終端が不正です');
      return { mimeType: 'image/jpeg', width, height };
    }
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd8)
    ) {
      invalid('JPEGマーカーに対応していません');
    }
    if (offset + 2 > bytes.length) invalid('JPEG項目が途中で切れています');
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) invalid('JPEG項目の長さが不正です');
    // Only 8-bit baseline and progressive, grayscale or RGB/YCbCr JPEG.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (width || ![0xc0, 0xc2].includes(marker) || length < 8) {
        invalid('JPEGのフレーム形式に対応していません');
      }
      height = view.getUint16(offset + 3);
      width = view.getUint16(offset + 5);
      components = bytes[offset + 7];
      if (
        bytes[offset + 2] !== 8 ||
        ![1, 3].includes(components) ||
        length !== 8 + components * 3
      ) {
        invalid('JPEGは8bitのグレー/RGB画像のみ対応しています');
      }
      validateNativeImageDimensions(width, height);
    }
    if ([0xc8, 0xcc, 0xdc, 0xde, 0xdf].includes(marker)) {
      invalid('JPEGの拡張方式には対応していません');
    }
    if (marker === 0xe1 && ascii(bytes, offset + 2, 6) === 'Exif\0\0') {
      inspectExif(bytes.subarray(offset + 8, end));
    }
    offset = end;
    if (marker === 0xda) {
      const count = bytes[end - length + 2];
      if (!width || length < 6 || count < 1 || count > components || length !== 6 + count * 2) {
        invalid('JPEGのスキャンヘッダーが不正です');
      }
      scanSeen = true;
      // Scan entropy without decoding, accepting only stuffed bytes and restart markers.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        let next = offset + 1;
        while (bytes[next] === 0xff) next++;
        if (bytes[next] === 0 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) {
          offset = next + 1;
        } else {
          break;
        }
      }
    }
  }
  return invalid('JPEGの終端がありません');
}

/** Inspect local encoded bytes before any browser decoder, canvas or URL exists. */
export function inspectNativeImage(bytes: Uint8Array): NativeImageInfo {
  if (bytes.byteLength > NATIVE_TEXTURE_PROFILE.maxFileBytes) {
    invalid('ファイルは16MiB以内にしてください');
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 137 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    return inspectPng(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  return invalid('PNG/JPEGのローカル画像のみ対応しています（SVG・外部URLは未対応）');
}
