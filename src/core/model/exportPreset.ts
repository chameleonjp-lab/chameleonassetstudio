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
  /** Optional richer distribution output; legacy exporters ignore it. */
  distribution?: RichDistributionSettings;
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

/** Additive distribution 0.2 settings; absent in legacy presets. */
export interface RichDistributionSettings {
  format: 'distribution-0.2.0';
  profile: 'fixed-grid' | 'packed';
  padding: number;
  target: 'canvas2d' | 'pixijs' | 'phaser';
  scale: number;
}

export const DEFAULT_RICH_DISTRIBUTION_SETTINGS: Readonly<RichDistributionSettings> = {
  format: 'distribution-0.2.0',
  profile: 'fixed-grid',
  padding: 2,
  target: 'canvas2d',
  scale: 1,
};

export function readRichDistributionSettings(file?: ExportPresetFile): RichDistributionSettings {
  return {
    ...DEFAULT_RICH_DISTRIBUTION_SETTINGS,
    ...file?.presets.find((preset) => preset.distribution)?.distribution,
  };
}

/** Replace only the rich preset, retaining all legacy and unrelated presets. */
export function withRichDistributionSettings(
  file: ExportPresetFile | undefined,
  settings: RichDistributionSettings,
): ExportPresetFile {
  const presets = file?.presets ?? [];
  const index = presets.findIndex((preset) => preset.distribution);
  let id = 'rich-distribution';
  for (let suffix = 2; presets.some((preset) => preset.id === id); suffix += 1) {
    id = `rich-distribution-${suffix}`;
  }
  const preset: ExportPreset = {
    ...(index >= 0 ? presets[index] : { id, name: '配布用ZIP 0.2' }),
    target: settings.target,
    imageFormats: ['png'],
    includeAssetJson: true,
    includeSpriteSheet: true,
    includeSampleHtml: true,
    scale: settings.scale,
    distribution: { ...settings },
  };
  return {
    ...(file ?? { format: EXPORT_PRESETS_FORMAT, version: CURRENT_EXPORT_PRESETS_VERSION }),
    presets:
      index < 0 ? [...presets, preset] : presets.map((item, i) => (i === index ? preset : item)),
  };
}
