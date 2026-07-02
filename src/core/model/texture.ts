import type { Size } from './common';

export const TEXTURE_KINDS = ['source', 'edit', 'thumbnail'] as const;

/**
 * source: 取り込んだ元画像。破壊的編集をしない。
 * edit: 編集用画像。書き出しの元になる。
 * thumbnail: 一覧表示用サムネイル。
 */
export type TextureKind = (typeof TEXTURE_KINDS)[number];

export const TEXTURE_MIME_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const;

export type TextureMimeType = (typeof TEXTURE_MIME_TYPES)[number];

/** アセットが参照する画像 1 枚のメタ情報。画像本体は別ファイル / Blob として保持する。 */
export interface TextureRef {
  id: string;
  kind: TextureKind;
  name: string;
  mimeType: TextureMimeType;
  size: Size;
  /** `.casproj` 内の相対パス、または IndexedDB の Blob キー。 */
  path: string;
}
