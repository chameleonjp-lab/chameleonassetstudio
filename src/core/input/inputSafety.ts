export const MEBIBYTE = 1024 * 1024;

/** 2D-1B-INPUT-SAFETY accepted profile B（balanced）。 */
export const INPUT_SAFETY_LIMITS = {
  maxCasprojCompressedBytes: 128 * MEBIBYTE,
  maxArchiveExpandedBytes: 256 * MEBIBYTE,
  maxArchiveEntries: 1024,
  maxArchiveEntryBytes: 25 * MEBIBYTE,
  maxJsonDocumentBytes: 4 * MEBIBYTE,
  maxJsonDepth: 64,
  maxArchivePathCodePoints: 512,
  maxCompressionRatio: 100,
  compressionRatioMinimumExpandedBytes: MEBIBYTE,
  maxImageBatchFiles: 16,
} as const;

export type InputSafetyErrorKind = 'input-limit' | 'unsafe-input';

export class InputSafetyError extends Error {
  readonly kind: InputSafetyErrorKind;

  constructor(message: string, kind: InputSafetyErrorKind, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InputSafetyError';
    this.kind = kind;
  }
}

export interface ZipEntryMetadata {
  name: string;
  size: number;
  originalSize: number;
  compression: number;
}

function formatMiB(bytes: number): string {
  const value = bytes / MEBIBYTE;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}MiB`;
}

export function assertCasprojCompressedSize(size: number): void {
  if (!Number.isFinite(size) || size < 0) {
    throw new InputSafetyError('入力ファイルのsizeが不正です。', 'unsafe-input');
  }
  if (size > INPUT_SAFETY_LIMITS.maxCasprojCompressedBytes) {
    throw new InputSafetyError(
      `.casprojが大きすぎます（${formatMiB(size)}）。圧縮状態で${formatMiB(
        INPUT_SAFETY_LIMITS.maxCasprojCompressedBytes,
      )}までです。`,
      'input-limit',
    );
  }
}

function archivePathError(path: string): string | null {
  if (Array.from(path).length > INPUT_SAFETY_LIMITS.maxArchivePathCodePoints) {
    return `ZIP内pathが長すぎます（上限${INPUT_SAFETY_LIMITS.maxArchivePathCodePoints}文字）: ${path}`;
  }
  if (
    Array.from(path).some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    return `ZIP内pathに制御文字があります: ${path}`;
  }
  if (path.startsWith('/') || path.includes('\\')) {
    return `ZIP内pathが相対pathではありません: ${path}`;
  }
  const withoutDirectorySlash = path.endsWith('/') ? path.slice(0, -1) : path;
  if (withoutDirectorySlash === '') {
    return `ZIP内pathが空です: ${path}`;
  }
  if (
    withoutDirectorySlash
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return `ZIP内pathに不正なsegmentがあります: ${path}`;
  }
  return null;
}

/** ZIP central-directory entryを展開前に逐次検査する。 */
export class ArchivePreflight {
  private readonly paths = new Set<string>();
  private entryCount = 0;
  private expandedBytes = 0;

  add(entry: ZipEntryMetadata): void {
    this.entryCount += 1;
    if (this.entryCount > INPUT_SAFETY_LIMITS.maxArchiveEntries) {
      throw new InputSafetyError(
        `ZIP内file数が多すぎます（上限${INPUT_SAFETY_LIMITS.maxArchiveEntries}件、directory含む）。`,
        'input-limit',
      );
    }

    const pathError = archivePathError(entry.name);
    if (pathError) {
      throw new InputSafetyError(pathError, 'unsafe-input');
    }
    if (this.paths.has(entry.name)) {
      throw new InputSafetyError(`ZIP内に同じpathが複数あります: ${entry.name}`, 'unsafe-input');
    }
    this.paths.add(entry.name);

    if (entry.compression !== 0 && entry.compression !== 8) {
      throw new InputSafetyError(
        `ZIP内fileのcompression methodに対応していません: ${entry.name}（method ${entry.compression}）`,
        'unsafe-input',
      );
    }
    if (
      !Number.isFinite(entry.size) ||
      !Number.isFinite(entry.originalSize) ||
      entry.size < 0 ||
      entry.originalSize < 0
    ) {
      throw new InputSafetyError(
        `ZIP内fileのsize metadataが不正です: ${entry.name}`,
        'unsafe-input',
      );
    }
    if (entry.originalSize > INPUT_SAFETY_LIMITS.maxArchiveEntryBytes) {
      throw new InputSafetyError(
        `ZIP内fileが大きすぎます: ${entry.name}（展開後${formatMiB(
          entry.originalSize,
        )}、上限${formatMiB(INPUT_SAFETY_LIMITS.maxArchiveEntryBytes)}）`,
        'input-limit',
      );
    }
    if (
      entry.name.endsWith('.json') &&
      entry.originalSize > INPUT_SAFETY_LIMITS.maxJsonDocumentBytes
    ) {
      throw new InputSafetyError(
        `JSON文書が大きすぎます: ${entry.name}（上限${formatMiB(
          INPUT_SAFETY_LIMITS.maxJsonDocumentBytes,
        )}）`,
        'input-limit',
      );
    }

    this.expandedBytes += entry.originalSize;
    if (this.expandedBytes > INPUT_SAFETY_LIMITS.maxArchiveExpandedBytes) {
      throw new InputSafetyError(
        `ZIPの展開後合計sizeが大きすぎます（上限${formatMiB(
          INPUT_SAFETY_LIMITS.maxArchiveExpandedBytes,
        )}）。`,
        'input-limit',
      );
    }

    if (entry.originalSize >= INPUT_SAFETY_LIMITS.compressionRatioMinimumExpandedBytes) {
      const ratio = entry.originalSize / Math.max(1, entry.size);
      if (ratio > INPUT_SAFETY_LIMITS.maxCompressionRatio) {
        throw new InputSafetyError(
          `ZIP内fileの圧縮率が高すぎます: ${entry.name}（${ratio.toFixed(1)}:1、上限${
            INPUT_SAFETY_LIMITS.maxCompressionRatio
          }:1）`,
          'input-limit',
        );
      }
    }
  }
}

/** 展開器のmetadataを信用せず、実際に得たentryを再検査する。 */
export function assertExpandedEntries(entries: Array<{ path: string; size: number }>): void {
  if (entries.length > INPUT_SAFETY_LIMITS.maxArchiveEntries) {
    throw new InputSafetyError(
      `ZIP内file数が多すぎます（上限${INPUT_SAFETY_LIMITS.maxArchiveEntries}件）。`,
      'input-limit',
    );
  }
  let total = 0;
  for (const entry of entries) {
    const pathError = archivePathError(entry.path);
    if (pathError) {
      throw new InputSafetyError(pathError, 'unsafe-input');
    }
    if (entry.size > INPUT_SAFETY_LIMITS.maxArchiveEntryBytes) {
      throw new InputSafetyError(`ZIP内fileが大きすぎます: ${entry.path}`, 'input-limit');
    }
    if (entry.path.endsWith('.json') && entry.size > INPUT_SAFETY_LIMITS.maxJsonDocumentBytes) {
      throw new InputSafetyError(`JSON文書が大きすぎます: ${entry.path}`, 'input-limit');
    }
    total += entry.size;
    if (total > INPUT_SAFETY_LIMITS.maxArchiveExpandedBytes) {
      throw new InputSafetyError('ZIPの展開後合計sizeが大きすぎます。', 'input-limit');
    }
  }
}

function assertJsonDepth(text: string, path: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > INPUT_SAFETY_LIMITS.maxJsonDepth) {
        throw new InputSafetyError(
          `JSONのnestingが深すぎます: ${path}（上限${INPUT_SAFETY_LIMITS.maxJsonDepth}）`,
          'input-limit',
        );
      }
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1);
    }
  }
}

export function parseBoundedJson(path: string, bytes: Uint8Array): unknown {
  if (bytes.byteLength > INPUT_SAFETY_LIMITS.maxJsonDocumentBytes) {
    throw new InputSafetyError(
      `JSON文書が大きすぎます: ${path}（上限${formatMiB(
        INPUT_SAFETY_LIMITS.maxJsonDocumentBytes,
      )}）`,
      'input-limit',
    );
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new InputSafetyError(`JSONが正しいUTF-8ではありません: ${path}`, 'unsafe-input', {
      cause: error,
    });
  }
  assertJsonDepth(text, path);
  return JSON.parse(text);
}

export function assertImageBatchCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new InputSafetyError('画像の選択件数が不正です。', 'unsafe-input');
  }
  if (count > INPUT_SAFETY_LIMITS.maxImageBatchFiles) {
    throw new InputSafetyError(
      `一度に選べる画像は${INPUT_SAFETY_LIMITS.maxImageBatchFiles}件までです（選択${count}件）。`,
      'input-limit',
    );
  }
}
