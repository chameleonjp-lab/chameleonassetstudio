import { createResourceOwner } from '../../core3d/profile/resourceLedger';

export const THUMBNAIL_IMAGE_LIMITS = {
  sourceBytes: 16 * 1024 * 1024,
  sourcePixels: 4 * 1024 * 1024,
  sourceEdge: 4096,
  edge: 192,
  bytes: 256 * 1024,
} as const;

interface ThumbnailBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}
export interface ThumbnailImageDependencies {
  decode(blob: Blob): Promise<ThumbnailBitmap>;
  encode(bitmap: ThumbnailBitmap, width: number, height: number): Promise<Blob>;
}
export interface NativeThumbnailImage {
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  dispose(): void;
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('サムネイル作成を取り消しました。', 'AbortError');
}
function dimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value))
    throw new Error('サムネイルには表示から作成したPNGが必要です。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || bytes.slice(12, 16).join(',') !== '73,72,68,82')
    throw new Error('PNGの寸法を確認できませんでした。');
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height) throw new Error('PNGの寸法を確認できませんでした。');
  return { width, height };
}
const browserDependencies: ThumbnailImageDependencies = {
  async decode(blob) {
    if (typeof createImageBitmap !== 'function')
      throw new Error('この環境ではサムネイル画像を準備できません。PNG保存を利用してください。');
    return createImageBitmap(blob);
  },
  async encode(bitmap, width, height) {
    if (typeof document === 'undefined') throw new Error('画像作成用の画面を利用できません。');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像作成用の画面を利用できません。');
      context.drawImage(bitmap as ImageBitmap, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error('サムネイルのPNG化に失敗しました。')),
          'image/png',
        );
      });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  },
};

/** Derived display image only. No source/project mutation, storage, network, or early-abort cleanup. */
export async function createNativeThumbnail(
  source: Blob,
  options: { signal?: AbortSignal; dependencies?: ThumbnailImageDependencies } = {},
): Promise<NativeThumbnailImage> {
  const { signal, dependencies = browserDependencies } = options;
  abort(signal);
  if (
    !(source instanceof Blob) ||
    source.type !== 'image/png' ||
    source.size < 33 ||
    source.size > THUMBNAIL_IMAGE_LIMITS.sourceBytes
  )
    throw new Error('表示画像の形式またはサイズがサムネイル上限外です。');
  const working = createResourceOwner('texture', source.size + 33);
  let bitmap: ThumbnailBitmap | undefined;
  let output: ReturnType<typeof createResourceOwner> | undefined;
  try {
    const sourceSize = dimensions(new Uint8Array(await source.slice(0, 33).arrayBuffer()));
    abort(signal);
    if (
      sourceSize.width > THUMBNAIL_IMAGE_LIMITS.sourceEdge ||
      sourceSize.height > THUMBNAIL_IMAGE_LIMITS.sourceEdge ||
      sourceSize.width * sourceSize.height > THUMBNAIL_IMAGE_LIMITS.sourcePixels
    )
      throw new Error('表示画像の寸法がサムネイル作成上限外です。');
    const ratio = Math.min(
      1,
      THUMBNAIL_IMAGE_LIMITS.edge / Math.max(sourceSize.width, sourceSize.height),
    );
    const width = Math.max(1, Math.round(sourceSize.width * ratio));
    const height = Math.max(1, Math.round(sourceSize.height * ratio));
    working.resize(
      source.size +
        33 +
        sourceSize.width * sourceSize.height * 8 +
        width * height * 8 +
        THUMBNAIL_IMAGE_LIMITS.bytes,
    );
    bitmap = await dependencies.decode(source);
    abort(signal);
    if (bitmap.width !== sourceSize.width || bitmap.height !== sourceSize.height)
      throw new Error('PNGの寸法と読込結果が一致しません。');
    const encoded = await dependencies.encode(bitmap, width, height);
    abort(signal);
    if (
      !(encoded instanceof Blob) ||
      encoded.type !== 'image/png' ||
      encoded.size < 33 ||
      encoded.size > THUMBNAIL_IMAGE_LIMITS.bytes
    )
      throw new Error('サムネイルのPNG出力が上限外です。');
    output = createResourceOwner('storage', encoded.size);
    let bytes: Uint8Array | undefined = new Uint8Array(await encoded.arrayBuffer());
    abort(signal);
    const resultSize = dimensions(bytes);
    if (resultSize.width !== width || resultSize.height !== height)
      throw new Error('サムネイルの出力寸法が一致しません。');
    const completedBitmap = bitmap;
    bitmap = undefined;
    completedBitmap.close();
    const retained = output;
    output = undefined;
    return {
      width,
      height,
      get bytes() {
        if (!bytes) throw new Error('サムネイルの参照は終了しています。');
        return bytes;
      },
      dispose() {
        bytes = undefined;
        retained.release();
      },
    };
  } finally {
    try {
      bitmap?.close();
    } finally {
      output?.release();
      working.release();
    }
  }
}
