import { InputSafetyError } from '../input/inputSafety';

export type DetectedImageMimeType =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'image/gif';

/** SVG の root 要素まで確認できるよう、バイナリ形式より広い先頭範囲を読む。 */
export const IMAGE_SIGNATURE_SNIFF_BYTES = 4096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;

function matches(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasSvgRoot(bytes: Uint8Array, isTruncatedPrefix: boolean): boolean {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
      stream: isTruncatedPrefix,
    });
  } catch {
    return false;
  }

  const withoutPreamble = text
    .replace(/^\uFEFF/, '')
    .trimStart()
    .replace(/^(?:<\?xml[\s\S]*?\?>\s*)?/i, '')
    .replace(/^(?:(?:<!--[\s\S]*?-->|<!DOCTYPE\s+svg\b[^>]*>)\s*)*/i, '');
  return /^<svg(?:\s|\/?>)/i.test(withoutPreamble);
}

export function detectImageMimeType(
  bytes: Uint8Array,
  options: { isTruncatedPrefix?: boolean } = {},
): DetectedImageMimeType | null {
  if (bytes.length >= PNG_SIGNATURE.length && matches(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    matches(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (
    bytes.length >= GIF87A_SIGNATURE.length &&
    (matches(bytes, GIF87A_SIGNATURE) || matches(bytes, GIF89A_SIGNATURE))
  ) {
    return 'image/gif';
  }
  if (hasSvgRoot(bytes, options.isTruncatedPrefix === true)) {
    return 'image/svg+xml';
  }
  return null;
}

/** APNG は PNG コンテナなので、実体検査では image/png として正規化する。 */
export function imageMimeTypesMatch(detected: DetectedImageMimeType, declared: string): boolean {
  return detected === declared || (detected === 'image/png' && declared === 'image/apng');
}

export async function assertFileImageSignature(file: File): Promise<void> {
  const header = new Uint8Array(await file.slice(0, IMAGE_SIGNATURE_SNIFF_BYTES).arrayBuffer());
  const detected = detectImageMimeType(header, {
    isTruncatedPrefix: file.size > header.byteLength,
  });
  if (!detected) {
    throw new InputSafetyError(
      `画像の実体形式を確認できませんでした: ${file.name}`,
      'unsafe-input',
    );
  }
  if (!imageMimeTypesMatch(detected, file.type)) {
    throw new InputSafetyError(
      `画像の宣言形式と実体が一致しません: ${file.name}（宣言 ${
        file.type || '不明'
      } / 実体 ${detected}）`,
      'unsafe-input',
    );
  }
}
