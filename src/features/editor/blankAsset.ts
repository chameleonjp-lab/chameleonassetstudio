/**
 * 画像を取り込まず、型とサイズだけで新規アセットを作る UI 側ユーティリティ（2D-2-CREATE-01）。
 * Asset JSON の組み立ては core/model の createBlankAsset（DOM 非依存、unit test 可能）に委譲し、
 * ここでは実体の透明 PNG Blob をブラウザの Canvas 2D で生成して対にする。
 * source / edit / thumbnail の 3 つの Blob は、空キャンバスで内容に差がないため同じ画像を使い回す。
 */
import { blobKeyFor } from '../../core/images/importImage';
import { createBlankAsset, type Asset, type AssetType } from '../../core/model';

/** 新規作成フォームで選べる正方形キャンバスサイズのプリセット。 */
export const BLANK_CANVAS_SIZE_PRESETS = [32, 64, 128, 256] as const;
export type BlankCanvasSizePreset = (typeof BLANK_CANVAS_SIZE_PRESETS)[number];

/** 新規作成フォームの既定サイズ。 */
export const DEFAULT_BLANK_CANVAS_SIZE: BlankCanvasSizePreset = 64;

export interface CreateBlankAssetBundleOptions {
  name: string;
  displayName?: string;
  assetType: AssetType;
  size: BlankCanvasSizePreset;
  now?: Date;
}

export interface BlankAssetBundle {
  asset: Asset;
  /** saveProjectBundle へそのまま渡せる Blob 一式（元画像・編集用・サムネイル）。 */
  blobs: Array<{ key: string; blob: Blob }>;
}

/** 透明な PNG 1 枚をブラウザの Canvas 2D で作る。 */
async function createTransparentPngBlob(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('この環境では Canvas 2D が使えません。');
  }
  context.clearRect(0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('空キャンバス画像の生成に失敗しました。'));
      }
    }, 'image/png');
  });
}

/**
 * 空キャンバスの新規アセットと、それに対応する透明 PNG Blob 一式を作る。
 * 呼び出し側は `saveProjectBundle(project, [asset], blobs)` で一括保存する想定。
 */
export async function createBlankAssetBundle(
  options: CreateBlankAssetBundleOptions,
): Promise<BlankAssetBundle> {
  const size = { width: options.size, height: options.size };
  const asset = createBlankAsset({
    name: options.name,
    displayName: options.displayName,
    assetType: options.assetType,
    canvasSize: size,
    now: options.now,
  });
  const blob = await createTransparentPngBlob(size.width, size.height);
  const blobs = asset.textures.map((texture) => ({
    key: blobKeyFor(asset.id, texture.path),
    blob,
  }));
  return { asset, blobs };
}
