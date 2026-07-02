import type { AssetType } from './asset';
import type { IsoDateTimeString, VersionString } from './common';

export const PROJECT_FORMAT = 'chameleon-project' as const;

/** project.json の現行バージョン。破壊的変更時は上げて migrate を用意する。 */
export const CURRENT_PROJECT_VERSION: VersionString = '0.1.0';

/** プロジェクト一覧表示用のアセットサマリー。実体は assets/<id>/asset.json が持つ。 */
export interface ProjectAssetEntry {
  id: string;
  name: string;
  displayName?: string;
  assetType: AssetType;
}

/** 1 つ以上のアセットをまとめる作業単位。`project.json` に対応する。 */
export interface Project {
  format: typeof PROJECT_FORMAT;
  version: VersionString;
  id: string;
  name: string;
  assets: ProjectAssetEntry[];
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}
