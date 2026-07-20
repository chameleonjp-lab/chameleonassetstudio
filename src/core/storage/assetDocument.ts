import { migrateAsset, type Asset } from '../model';
import { validateAsset } from '../schema/validate';
import { StorageError } from './db';

export interface CurrentAssetDocument {
  asset: Asset;
  appliedMigrations: string[];
}

/** 保存・復旧境界でAssetを現行versionへ移行してからschema検証する。 */
export function migrateAndValidateAssetDocument(
  raw: unknown,
  label = 'asset',
): CurrentAssetDocument {
  const { data, appliedMigrations } = migrateAsset(raw);
  const result = validateAsset(data);
  if (!result.valid) {
    throw new StorageError(`${label} の内容が不正です: ${result.errors.join(' / ')}`);
  }
  return { asset: data as unknown as Asset, appliedMigrations };
}
