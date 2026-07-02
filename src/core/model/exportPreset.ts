import type { VersionString } from './common';

export const EXPORT_TARGETS = ['generic', 'canvas2d', 'pixijs', 'phaser'] as const;

export type ExportTarget = (typeof EXPORT_TARGETS)[number];

export const EXPORT_IMAGE_FORMATS = ['png', 'webp'] as const;

export type ExportImageFormat = (typeof EXPORT_IMAGE_FORMATS)[number];

/** 書き出し設定 1 件。書き出し先ごとの差はエクスポータ層で吸収する。 */
export interface ExportPreset {
  id: string;
  name: string;
  target: ExportTarget;
  imageFormats: ExportImageFormat[];
  includeAssetJson: boolean;
  includeSpriteSheet: boolean;
  includeSampleHtml: boolean;
  /** 書き出し時の拡大率。1 で等倍。 */
  scale: number;
}

export const EXPORT_PRESETS_FORMAT = 'chameleon-export-presets' as const;

/** export.json の現行バージョン。破壊的変更時は上げて migrate を用意する。 */
export const CURRENT_EXPORT_PRESETS_VERSION: VersionString = '0.1.0';

/** `settings/export-presets.json` に対応するファイル全体。 */
export interface ExportPresetFile {
  format: typeof EXPORT_PRESETS_FORMAT;
  version: VersionString;
  presets: ExportPreset[];
}
