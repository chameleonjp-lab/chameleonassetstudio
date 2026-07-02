import { createImageAsset, type Asset } from '../model';
import { formatBytes } from '../storage/storageUsage';

/** 1 枚あたりの最大ファイルサイズ（要件 11.2）。 */
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;

/** 画像の最大辺長（要件 11.2）。 */
export const MAX_IMPORT_DIMENSION = 4096;

/** サムネイルの最大辺長。 */
export const THUMBNAIL_MAX_DIMENSION = 256;

export const SUPPORTED_IMPORT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type SupportedImportMimeType = (typeof SUPPORTED_IMPORT_MIME_TYPES)[number];

export class ImageImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageImportError';
  }
}

/** ファイル選択直後の制限チェック。問題があれば理由の文章を返す。 */
export function checkImportFile(file: Pick<File, 'size' | 'type' | 'name'>): string | null {
  if (!(SUPPORTED_IMPORT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `対応していないファイル形式です（${file.type || '不明'}）。PNG / JPG / WebP を選んでください。`;
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return `ファイルサイズが大きすぎます（${formatBytes(file.size)}）。1 枚あたり ${formatBytes(
      MAX_IMPORT_FILE_BYTES,
    )} までです。`;
  }
  return null;
}

/** デコード後の寸法チェック。問題があれば理由の文章を返す。 */
export function checkImageDimensions(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) {
    return '画像サイズを取得できませんでした。';
  }
  if (width > MAX_IMPORT_DIMENSION || height > MAX_IMPORT_DIMENSION) {
    return `画像サイズが大きすぎます（${width} x ${height}）。最大 ${MAX_IMPORT_DIMENSION} x ${MAX_IMPORT_DIMENSION} までです。`;
  }
  return null;
}

/** ファイル名から拡張子を除いたアセット名を作る。 */
export function assetNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base === '' ? 'image' : base;
}

export function extensionForMimeType(mimeType: SupportedImportMimeType): 'png' | 'jpg' | 'webp' {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

/** createImageBitmap でデコードする。非対応環境では HTMLImageElement へフォールバックする。 */
async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      throw new ImageImportError(
        '画像をデコードできませんでした。ファイルが壊れている可能性があります。',
        {
          cause: error,
        },
      );
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new ImageImportError(
            '画像をデコードできませんでした。ファイルが壊れている可能性があります。',
          ),
        );
      el.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

interface DrawTarget {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
}

function createDrawTarget(width: number, height: number): DrawTarget {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context) {
      return { canvas, context };
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageImportError('この環境では Canvas 2D が使えません。');
  }
  return { canvas, context };
}

async function encodeCanvas(
  target: DrawTarget,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> {
  if (target.canvas instanceof (globalThis.OffscreenCanvas ?? class {})) {
    const canvas = target.canvas as OffscreenCanvas;
    try {
      const blob = await canvas.convertToBlob({ type: mimeType, quality });
      return blob.type === mimeType ? blob : null;
    } catch {
      return null;
    }
  }
  const canvas = target.canvas as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), mimeType, quality),
  );
  return blob && blob.type === mimeType ? blob : null;
}

/** 希望順に画像形式でエンコードし、最初に成功した Blob を返す。 */
async function encodeWithFallback(
  target: DrawTarget,
  preferredTypes: string[],
  quality?: number,
): Promise<Blob> {
  for (const type of preferredTypes) {
    const blob = await encodeCanvas(target, type, quality);
    if (blob) {
      return blob;
    }
  }
  throw new ImageImportError('画像のエンコードに失敗しました。');
}

/** アセット ID とテクスチャ相対パスから、IndexedDB 用の Blob キーを作る。 */
export function blobKeyFor(assetId: string, texturePath: string): string {
  return `${assetId}/${texturePath}`;
}

export interface ImportImageResult {
  asset: Asset;
  /** 保存すべき Blob 一式（元画像・編集用・サムネイル）。 */
  blobs: Array<{ key: string; blob: Blob }>;
  /** プレビュー表示に使う編集用画像。 */
  editBlob: Blob;
}

/**
 * 画像ファイル 1 枚をキャラクターアセットへ変換する。
 * 元画像はそのまま保持し、編集用画像（PNG に正規化、透明維持）と
 * サムネイル（WebP、非対応環境は PNG）を別に作る（要件 11.2）。
 */
export async function importImageFile(file: File): Promise<ImportImageResult> {
  const fileError = checkImportFile(file);
  if (fileError) {
    throw new ImageImportError(fileError);
  }
  const mimeType = file.type as SupportedImportMimeType;

  const decoded = await decodeImage(file);
  try {
    const dimensionError = checkImageDimensions(decoded.width, decoded.height);
    if (dimensionError) {
      throw new ImageImportError(dimensionError);
    }

    // 編集用画像: PNG に正規化して透明情報を維持する
    const editTarget = createDrawTarget(decoded.width, decoded.height);
    editTarget.context.drawImage(decoded.source, 0, 0);
    const editBlob = await encodeWithFallback(editTarget, ['image/png']);

    // サムネイル
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const thumbWidth = Math.max(1, Math.round(decoded.width * scale));
    const thumbHeight = Math.max(1, Math.round(decoded.height * scale));
    const thumbTarget = createDrawTarget(thumbWidth, thumbHeight);
    thumbTarget.context.drawImage(decoded.source, 0, 0, thumbWidth, thumbHeight);
    const thumbBlob = await encodeWithFallback(thumbTarget, ['image/webp', 'image/png'], 0.85);

    const name = assetNameFromFileName(file.name);
    const asset = createImageAsset({
      name,
      displayName: name,
      size: { width: decoded.width, height: decoded.height },
      sourceMimeType: mimeType,
      sourceExtension: extensionForMimeType(mimeType),
      thumbnailMimeType: thumbBlob.type === 'image/webp' ? 'image/webp' : 'image/png',
    });

    const sourceTexture = asset.textures.find((tex) => tex.kind === 'source');
    const editTexture = asset.textures.find((tex) => tex.kind === 'edit');
    const thumbTexture = asset.textures.find((tex) => tex.kind === 'thumbnail');
    if (!sourceTexture || !editTexture || !thumbTexture) {
      throw new ImageImportError('アセットのテクスチャ定義が不正です。');
    }

    return {
      asset,
      blobs: [
        { key: blobKeyFor(asset.id, sourceTexture.path), blob: file },
        { key: blobKeyFor(asset.id, editTexture.path), blob: editBlob },
        { key: blobKeyFor(asset.id, thumbTexture.path), blob: thumbBlob },
      ],
      editBlob,
    };
  } finally {
    decoded.close();
  }
}
