import { InputSafetyError } from '../input/inputSafety';

export type DetectedImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function matches(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function detectImageMimeType(bytes: Uint8Array): DetectedImageMimeType | null {
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
  return null;
}

export async function assertFileImageSignature(file: File): Promise<void> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageMimeType(header);
  if (!detected) {
    throw new InputSafetyError(
      `画像の実体形式を確認できませんでした: ${file.name}`,
      'unsafe-input',
    );
  }
  if (detected !== file.type) {
    throw new InputSafetyError(
      `画像の宣言形式と実体が一致しません: ${file.name}（宣言 ${
        file.type || '不明'
      } / 実体 ${detected}）`,
      'unsafe-input',
    );
  }
}
