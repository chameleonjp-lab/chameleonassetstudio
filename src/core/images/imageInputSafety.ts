import { InputSafetyError } from '../input/inputSafety';

export type DetectedImageMimeType =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'image/gif';

/** SVG の root 要素まで確認できるよう、バイナリ形式より広い先頭範囲を読む。 */
export const IMAGE_SIGNATURE_SNIFF_BYTES = 4096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const PNG_IEND = 'IEND';

export type AnimationRepetition = 'none' | 'finite' | 'infinite';

export interface AnimatedImagePreflight {
  frameCount: number;
  repetition: AnimationRepetition;
  width: number;
  height: number;
}

export interface PngAnimationInspection extends AnimatedImagePreflight {
  animated: boolean;
}

function matches(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function unsafeImage(message: string): never {
  throw new InputSafetyError(message, 'unsafe-input');
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function assertByteRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    unsafeImage(`${label}のbyte範囲が不正です。`);
  }
  if (offset > bytes.length || length > bytes.length - offset) {
    unsafeImage(`${label}がファイル終端を超えています。`);
  }
}

/**
 * PNG chunkを境界内だけ走査し、IDAT前の一意なacTLと宣言frame数を検査する。
 * pixel・filter・CRCの妥当性はbrowser decoderへ委ね、source bytesは変更しない。
 */
export function inspectPngAnimation(bytes: Uint8Array): PngAnimationInspection {
  if (bytes.length < PNG_SIGNATURE.length || !matches(bytes, PNG_SIGNATURE)) {
    unsafeImage('PNG署名を確認できませんでした。');
  }

  let offset = PNG_SIGNATURE.length;
  let sawIdat = false;
  let sawIend = false;
  let width: number | null = null;
  let height: number | null = null;
  let frameCount: number | null = null;
  let frameControlCount = 0;
  let repetition: AnimationRepetition = 'none';

  while (offset < bytes.length) {
    assertByteRange(bytes, offset, 12, 'PNG chunk');
    const dataLength = readUint32BigEndian(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    assertByteRange(bytes, dataOffset, dataLength + 4, `PNG ${type} chunk`);

    if (width === null && type !== 'IHDR') {
      unsafeImage('PNGの先頭chunkがIHDRではありません。');
    }
    if (type === 'IHDR') {
      if (width !== null || offset !== PNG_SIGNATURE.length) {
        unsafeImage('PNGのIHDR chunk位置または件数が不正です。');
      }
      if (dataLength !== 13) {
        unsafeImage('PNGのIHDR chunk lengthが13ではありません。');
      }
      width = readUint32BigEndian(bytes, dataOffset);
      height = readUint32BigEndian(bytes, dataOffset + 4);
      if (width < 1 || height < 1) {
        unsafeImage('PNGのIHDR画像サイズは1以上必要です。');
      }
    } else if (type === 'acTL') {
      if (frameCount !== null) {
        unsafeImage('APNGのacTL chunkが複数あります。');
      }
      if (sawIdat) {
        unsafeImage('APNGのacTL chunkはIDATより前に置いてください。');
      }
      if (dataLength !== 8) {
        unsafeImage('APNGのacTL chunk lengthが8ではありません。');
      }
      frameCount = readUint32BigEndian(bytes, dataOffset);
      const playCount = readUint32BigEndian(bytes, dataOffset + 4);
      if (frameCount < 1) {
        unsafeImage('APNGの宣言frame数は1件以上必要です。');
      }
      repetition = playCount === 0 ? 'infinite' : playCount === 1 ? 'none' : 'finite';
    } else if (type === 'fcTL') {
      if (dataLength !== 26) {
        unsafeImage('APNGのfcTL chunk lengthが26ではありません。');
      }
      const frameWidth = readUint32BigEndian(bytes, dataOffset + 4);
      const frameHeight = readUint32BigEndian(bytes, dataOffset + 8);
      const frameX = readUint32BigEndian(bytes, dataOffset + 12);
      const frameY = readUint32BigEndian(bytes, dataOffset + 16);
      if (frameWidth < 1 || frameHeight < 1) {
        unsafeImage('APNGのframe寸法は1以上必要です。');
      }
      if (
        width === null ||
        height === null ||
        frameX + frameWidth > width ||
        frameY + frameHeight > height
      ) {
        unsafeImage('APNGのframe範囲がIHDR canvasを超えています。');
      }
      frameControlCount += 1;
    } else if (type === 'IDAT') {
      sawIdat = true;
    } else if (type === PNG_IEND) {
      if (dataLength !== 0) {
        unsafeImage('PNGのIEND chunk lengthが0ではありません。');
      }
      sawIend = true;
      offset = dataOffset + dataLength + 4;
      break;
    }

    offset = dataOffset + dataLength + 4;
  }

  if (!sawIend) {
    unsafeImage('PNGのIEND chunkがありません。');
  }
  if (width === null || height === null) {
    unsafeImage('PNGのIHDR chunkがありません。');
  }
  if (frameCount === null) {
    return { animated: false, frameCount: 1, repetition: 'none', width, height };
  }
  if (frameControlCount !== frameCount) {
    unsafeImage(
      `APNGの宣言frame数とfcTL件数が一致しません（宣言 ${frameCount} / fcTL ${frameControlCount}）。`,
    );
  }
  return { animated: true, frameCount, repetition, width, height };
}

interface GifSubBlocks {
  nextOffset: number;
  loopCount: number | null;
}

function readGifSubBlocks(
  bytes: Uint8Array,
  startOffset: number,
  label: string,
  inspectLoopCount = false,
): GifSubBlocks {
  let offset = startOffset;
  let loopCount: number | null = null;
  while (true) {
    assertByteRange(bytes, offset, 1, label);
    const length = bytes[offset];
    offset += 1;
    if (length === 0) {
      return { nextOffset: offset, loopCount };
    }
    assertByteRange(bytes, offset, length, label);
    if (inspectLoopCount && loopCount === null && length >= 3 && bytes[offset] === 1) {
      loopCount = bytes[offset + 1] | (bytes[offset + 2] << 8);
    }
    offset += length;
  }
}

/** GIF block列をboundedに走査し、画像descriptor件数とloop metadataを返す。 */
export function inspectGifAnimation(bytes: Uint8Array): AnimatedImagePreflight {
  if (
    bytes.length < 13 ||
    (!matches(bytes, GIF87A_SIGNATURE) && !matches(bytes, GIF89A_SIGNATURE))
  ) {
    unsafeImage('GIF署名またはlogical screen descriptorを確認できませんでした。');
  }

  const width = readUint16LittleEndian(bytes, 6);
  const height = readUint16LittleEndian(bytes, 8);
  if (width < 1 || height < 1) {
    unsafeImage('GIFのlogical screen寸法は1以上必要です。');
  }

  let offset = 13;
  const packed = bytes[10];
  if ((packed & 0x80) !== 0) {
    const tableBytes = 3 * 2 ** ((packed & 0x07) + 1);
    assertByteRange(bytes, offset, tableBytes, 'GIF global color table');
    offset += tableBytes;
  }

  let frameCount = 0;
  let repetition: AnimationRepetition = 'none';
  let sawTrailer = false;

  while (offset < bytes.length) {
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (marker === 0x2c) {
      assertByteRange(bytes, offset, 9, 'GIF image descriptor');
      const frameX = readUint16LittleEndian(bytes, offset);
      const frameY = readUint16LittleEndian(bytes, offset + 2);
      const frameWidth = readUint16LittleEndian(bytes, offset + 4);
      const frameHeight = readUint16LittleEndian(bytes, offset + 6);
      if (frameWidth < 1 || frameHeight < 1) {
        unsafeImage('GIFのframe寸法は1以上必要です。');
      }
      if (frameX + frameWidth > width || frameY + frameHeight > height) {
        unsafeImage('GIFのframe範囲がlogical screenを超えています。');
      }
      const localPacked = bytes[offset + 8];
      offset += 9;
      if ((localPacked & 0x80) !== 0) {
        const tableBytes = 3 * 2 ** ((localPacked & 0x07) + 1);
        assertByteRange(bytes, offset, tableBytes, 'GIF local color table');
        offset += tableBytes;
      }
      assertByteRange(bytes, offset, 1, 'GIF LZW minimum code size');
      offset += 1;
      offset = readGifSubBlocks(bytes, offset, 'GIF image data').nextOffset;
      frameCount += 1;
      continue;
    }
    if (marker !== 0x21) {
      unsafeImage(`GIF block markerが不正です（0x${marker.toString(16)}）。`);
    }

    assertByteRange(bytes, offset, 1, 'GIF extension label');
    const extensionLabel = bytes[offset];
    offset += 1;
    if (extensionLabel !== 0xff) {
      offset = readGifSubBlocks(bytes, offset, 'GIF extension data').nextOffset;
      continue;
    }

    assertByteRange(bytes, offset, 1, 'GIF application extension');
    const applicationLength = bytes[offset];
    offset += 1;
    assertByteRange(bytes, offset, applicationLength, 'GIF application identifier');
    const applicationId = ascii(bytes, offset, applicationLength);
    offset += applicationLength;
    const isLoopExtension = applicationId === 'NETSCAPE2.0' || applicationId === 'ANIMEXTS1.0';
    const subBlocks = readGifSubBlocks(bytes, offset, 'GIF application data', isLoopExtension);
    offset = subBlocks.nextOffset;
    if (isLoopExtension && subBlocks.loopCount !== null) {
      repetition = subBlocks.loopCount === 0 ? 'infinite' : 'finite';
    }
  }

  if (!sawTrailer) {
    unsafeImage('GIF trailerがありません。');
  }
  if (frameCount < 1) {
    unsafeImage('GIFに画像frameがありません。');
  }
  return { frameCount, repetition, width, height };
}

const BANNED_SVG_ELEMENT_NAMES = [
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'link',
  'animate',
  'animatecolor',
  'animatemotion',
  'animatetransform',
  'set',
  'discard',
  'handler',
  'listener',
  'audio',
  'video',
  'source',
  'meta',
  'text',
  'tspan',
  'textpath',
  'font',
  'font-face',
  'glyph',
  'missing-glyph',
] as const;
const BANNED_SVG_ELEMENTS = new Set<string>(BANNED_SVG_ELEMENT_NAMES);
const BANNED_SVG_ELEMENT_PATTERN = new RegExp(
  `<\\s*(?:${BANNED_SVG_ELEMENT_NAMES.join('|')})\\b`,
  'i',
);

function svgCssSafetyViolation(value: string): string | null {
  if (value.includes('\\')) {
    return 'CSS escapeによる難読化を含むSVGには対応していません。';
  }
  if (/@import\b/i.test(value)) {
    return '外部CSSまたは外部URL参照を含むSVGには対応していません。';
  }
  if (
    /@(?:-[a-z0-9]+-)?keyframes\b/i.test(value) ||
    /(?:^|[;{])\s*(?:-[a-z0-9]+-)?(?:animation|transition)(?:-[a-z0-9-]+)?\s*:/i.test(value)
  ) {
    return 'CSS animationまたはtransitionを含むSVGには対応していません。';
  }
  if (/@font-face\b/i.test(value) || /(?:^|[;{])\s*font(?:-[a-z0-9-]+)?\s*:/i.test(value)) {
    return 'fontに依存するSVGには対応していません。';
  }
  if (/(?:^|[^a-z0-9_-])(?:-[a-z0-9]+-)?(?:image-set|cross-fade|image|paint)\s*\(/i.test(value)) {
    return '外部resourceを参照できるCSS画像関数を含むSVGには対応していません。';
  }
  for (const match of value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith('#')) {
      return '外部CSSまたは外部URL参照を含むSVGには対応していません。';
    }
  }
  return null;
}

const MALFORMED_SVG_MESSAGE = 'SVGのXML構造を解析できませんでした。';

export interface SvgSafetyInspection {
  message: string | null;
  kind: 'safe' | 'unsafe' | 'malformed';
}

/**
 * SVGをlive DOMへ挿入せず検査する。active要素は削除・書換えず、理由付き拒否する。
 * browserではDOMParserによる属性値decode後の検査も行い、Node fixtureでは字句検査を固定する。
 */
export function svgSafetyViolation(text: string): string | null {
  if (/<!DOCTYPE\b/i.test(text)) {
    return 'DOCTYPEを含むSVGには対応していません。';
  }
  if (/<\?(?!xml(?:\s|\?>))/i.test(text)) {
    return '外部処理命令を含むSVGには対応していません。';
  }
  if (BANNED_SVG_ELEMENT_PATTERN.test(text)) {
    return 'script・animation・埋め込みHTML・外部resource要素を含むSVGには対応していません。';
  }
  if (/\s(?:on[a-z0-9_.:-]+)\s*=/i.test(text)) {
    return 'event handler属性を含むSVGには対応していません。';
  }
  for (const match of text.matchAll(
    /\s(?:[a-z_][a-z0-9_.-]*:)?(?:href|src)\s*=\s*(['"])(.*?)\1/gi,
  )) {
    if (match[2].trim() !== '' && !match[2].trim().startsWith('#')) {
      return '外部hrefまたはsrc参照を含むSVGには対応していません。';
    }
  }
  if (/\s(?:xml:)?base\s*=\s*(['"])(.*?)\1/i.test(text)) {
    return 'base URLを指定するSVGには対応していません。';
  }
  const lexicalCssViolation = svgCssSafetyViolation(text);
  if (lexicalCssViolation) {
    return lexicalCssViolation;
  }

  if (typeof DOMParser === 'undefined') {
    return null;
  }
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    return MALFORMED_SVG_MESSAGE;
  }
  for (const element of document.querySelectorAll('*')) {
    if (BANNED_SVG_ELEMENTS.has(element.localName.toLowerCase())) {
      return `安全のためSVGの${element.localName}要素を取り込めません。`;
    }
    if (
      element.localName.toLowerCase() === 'style' &&
      svgCssSafetyViolation(element.textContent ?? '')
    ) {
      return svgCssSafetyViolation(element.textContent ?? '');
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) {
        return `安全のためSVGの${attribute.name}属性を取り込めません。`;
      }
      if ((name === 'href' || name === 'src') && value !== '' && !value.startsWith('#')) {
        return `外部参照を含むSVGには対応していません（${attribute.name}）。`;
      }
      if (name === 'base') {
        return `base URLを指定するSVGには対応していません（${attribute.name}）。`;
      }
      if (
        name === 'font' ||
        name.startsWith('font-') ||
        name === 'animation' ||
        name.startsWith('animation-') ||
        name === 'transition' ||
        name.startsWith('transition-')
      ) {
        return `fontまたはCSS animation属性を含むSVGには対応していません（${attribute.name}）。`;
      }
      const attributeCssViolation = svgCssSafetyViolation(value);
      if (attributeCssViolation) {
        return `${attributeCssViolation}（${attribute.name}）`;
      }
    }
  }
  return null;
}

export function inspectSvgSafety(text: string): SvgSafetyInspection {
  const message = svgSafetyViolation(text);
  if (message === null) {
    return { kind: 'safe', message: null };
  }
  return {
    kind: message === MALFORMED_SVG_MESSAGE ? 'malformed' : 'unsafe',
    message,
  };
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

export async function detectFileImageMimeType(file: File): Promise<DetectedImageMimeType> {
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
  return detected;
}

export async function assertFileImageSignature(file: File): Promise<DetectedImageMimeType> {
  const detected = await detectFileImageMimeType(file);
  if (!imageMimeTypesMatch(detected, file.type)) {
    throw new InputSafetyError(
      `画像の宣言形式と実体が一致しません: ${file.name}（宣言 ${
        file.type || '不明'
      } / 実体 ${detected}）`,
      'unsafe-input',
    );
  }
  return detected;
}
