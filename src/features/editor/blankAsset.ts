/**
 * 画像を取り込まず、型・size・明示templateから新規アセットを作る UI 側ユーティリティ。
 * Asset JSON は core/model の純粋関数で組み立て、size を検査した後だけ Canvas / Blob を生成する。
 */
import { blobKeyFor } from '../../core/images/importImage';
import {
  createBlankAsset,
  type Asset,
  type AssetCreationTemplateId,
  type AssetType,
  type Size,
} from '../../core/model';

export const MAX_BLANK_CANVAS_EDGE = 4096;
export const MAX_BLANK_CANVAS_PIXELS = MAX_BLANK_CANVAS_EDGE * MAX_BLANK_CANVAS_EDGE;

/** 既存利用との互換性を維持する正方形preset。 */
export const BLANK_CANVAS_SIZE_PRESETS = [32, 64, 128, 256] as const;
export type BlankCanvasSizePreset = (typeof BLANK_CANVAS_SIZE_PRESETS)[number];
export const DEFAULT_BLANK_CANVAS_SIZE: BlankCanvasSizePreset = 64;

export const BLANK_CANVAS_PRESETS = [
  ...BLANK_CANVAS_SIZE_PRESETS.map((size) => ({
    id: String(size),
    label: `${size} x ${size}`,
    size: { width: size, height: size },
  })),
  {
    id: '256x128',
    label: '256 x 128（横長）',
    size: { width: 256, height: 128 },
  },
  {
    id: '128x256',
    label: '128 x 256（縦長）',
    size: { width: 128, height: 256 },
  },
] as const;

export type BlankCanvasPresetId = (typeof BLANK_CANVAS_PRESETS)[number]['id'] | 'custom';
export const DEFAULT_BLANK_CANVAS_PRESET_ID: BlankCanvasPresetId = String(
  DEFAULT_BLANK_CANVAS_SIZE,
) as BlankCanvasPresetId;

export function blankCanvasSizeForPreset(presetId: string): Size | null {
  const preset = BLANK_CANVAS_PRESETS.find((entry) => entry.id === presetId);
  return preset ? { ...preset.size } : null;
}

/** null は妥当。文字列は生成前に表示する拒否理由。値を丸めたり clamp したりしない。 */
export function validateBlankCanvasSize(size: Size): string | null {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return 'キャンバスの幅と高さには有限の数値を入力してください。';
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return 'キャンバスの幅と高さは整数で入力してください。';
  }
  if (width < 1 || height < 1) {
    return 'キャンバスの幅と高さは1以上にしてください。';
  }
  if (width > MAX_BLANK_CANVAS_EDGE || height > MAX_BLANK_CANVAS_EDGE) {
    return `キャンバスの幅と高さは${MAX_BLANK_CANVAS_EDGE}以下にしてください。`;
  }
  if (width * height > MAX_BLANK_CANVAS_PIXELS) {
    return `キャンバスの総pixel数は${MAX_BLANK_CANVAS_EDGE} x ${MAX_BLANK_CANVAS_EDGE}以下にしてください。`;
  }
  return null;
}

export function assertBlankCanvasSize(size: Size): void {
  const error = validateBlankCanvasSize(size);
  if (error) {
    throw new Error(error);
  }
}

export interface CreateBlankAssetBundleOptions {
  name: string;
  displayName?: string;
  assetType: AssetType;
  size: Size | BlankCanvasSizePreset;
  templateId?: AssetCreationTemplateId;
  createCharacterBodyPart?: boolean;
  now?: Date;
}

export interface BlankAssetBundle {
  asset: Asset;
  /** saveProjectBundle へそのまま渡せる Blob 一式（元画像・編集用・サムネイル）。 */
  blobs: Array<{ key: string; blob: Blob }>;
}

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

export async function createBlankAssetBundle(
  options: CreateBlankAssetBundleOptions,
): Promise<BlankAssetBundle> {
  const size =
    typeof options.size === 'number'
      ? { width: options.size, height: options.size }
      : options.size;
  assertBlankCanvasSize(size);

  const asset = createBlankAsset({
    name: options.name,
    displayName: options.displayName,
    assetType: options.assetType,
    canvasSize: size,
    templateId: options.templateId,
    createCharacterBodyPart: options.createCharacterBodyPart,
    now: options.now,
  });
  const blob = await createTransparentPngBlob(size.width, size.height);
  const blobs = asset.textures.map((texture) => ({
    key: blobKeyFor(asset.id, texture.path),
    blob,
  }));
  return { asset, blobs };
}
