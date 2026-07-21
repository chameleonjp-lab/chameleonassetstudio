import type { Size } from './common';

export const TEXTURE_KINDS = ['source', 'edit', 'thumbnail'] as const;

/**
 * source: 取り込んだ元画像。破壊的編集をしない。
 * edit: 編集用画像。書き出しの元になる。
 * thumbnail: 一覧表示用サムネイル。
 */
export type TextureKind = (typeof TEXTURE_KINDS)[number];

/** edit / thumbnail としてブラウザー内で生成するラスター画像形式。 */
export const RASTER_TEXTURE_MIME_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const;

/** source として原本保持できる画像形式。 */
export const SOURCE_TEXTURE_MIME_TYPES = [
  ...RASTER_TEXTURE_MIME_TYPES,
  'image/svg+xml',
  'image/gif',
] as const;

export const TEXTURE_MIME_TYPES = SOURCE_TEXTURE_MIME_TYPES;

export type TextureMimeType = (typeof TEXTURE_MIME_TYPES)[number];
export type RasterTextureMimeType = (typeof RASTER_TEXTURE_MIME_TYPES)[number];

interface TextureRefBase {
  id: string;
  name: string;
  size: Size;
  /** `.casproj` 内の相対パス、または IndexedDB の Blob キー。 */
  path: string;
}

/** 取り込んだ元ファイルを変換せず保持する参照。 */
export interface SourceTextureRef extends TextureRefBase {
  kind: 'source';
  mimeType: TextureMimeType;
}

/** 編集・サムネイル用にブラウザー内で生成するラスター画像の参照。 */
export interface RasterTextureRef extends TextureRefBase {
  kind: 'edit' | 'thumbnail';
  mimeType: RasterTextureMimeType;
}

/** アセットが参照する画像 1 枚のメタ情報。画像本体は別ファイル / Blob として保持する。 */
export type TextureRef = SourceTextureRef | RasterTextureRef;
