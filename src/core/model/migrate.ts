import { CURRENT_ASSET_VERSION } from './asset';
import { CURRENT_EXPORT_PRESETS_VERSION } from './exportPreset';
import { CURRENT_PROJECT_VERSION } from './project';

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

/** 1 バージョン分の移行手順。from のデータを to の形式へ変換する。 */
export interface Migration {
  from: string;
  to: string;
  description: string;
  apply(data: Record<string, unknown>): Record<string, unknown>;
}

export interface MigrationResult {
  data: Record<string, unknown>;
  /** 適用した移行の説明。ログ表示に使う。 */
  appliedMigrations: string[];
}

/** asset.json の移行手順。破壊的変更を入れるときにここへ追加する。 */
export const ASSET_MIGRATIONS: Migration[] = [];

/** project.json の移行手順。 */
export const PROJECT_MIGRATIONS: Migration[] = [];

/** export-presets.json の移行手順。 */
export const EXPORT_PRESETS_MIGRATIONS: Migration[] = [];

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new MigrationError(`version "${version}" の形式が不正です（例: 0.1.0）`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) {
      return va[i] < vb[i] ? -1 : 1;
    }
  }
  return 0;
}

export interface MigrateOptions {
  /** エラーメッセージに使う文書名（例: asset）。 */
  label: string;
  currentVersion: string;
  migrations: Migration[];
}

/**
 * migrate 関数の入口。version を確認し、必要な移行手順を順に適用する。
 * 現行バージョンならそのまま返す。移行手順が無い古い形式や、
 * このアプリより新しい形式は MigrationError にする。
 */
export function migrateDocument(raw: unknown, options: MigrateOptions): MigrationResult {
  const { label, currentVersion, migrations } = options;

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MigrationError(`${label}: オブジェクトではありません`);
  }

  const source = raw as Record<string, unknown>;
  const version = source.version;
  if (typeof version !== 'string') {
    throw new MigrationError(`${label}: version がありません`);
  }

  if (compareVersions(version, currentVersion) > 0) {
    throw new MigrationError(
      `${label}: version ${version} はこのアプリが扱える ${currentVersion} より新しい形式です`,
    );
  }

  let data: Record<string, unknown> = { ...source };
  let currentFrom = version;
  const appliedMigrations: string[] = [];

  while (currentFrom !== currentVersion) {
    const migration = migrations.find((m) => m.from === currentFrom);
    if (!migration) {
      throw new MigrationError(
        `${label}: version ${currentFrom} から ${currentVersion} への移行手順がありません`,
      );
    }
    if (compareVersions(migration.to, migration.from) <= 0) {
      throw new MigrationError(
        `${label}: 移行手順 ${migration.from} -> ${migration.to} はバージョンが進んでいません`,
      );
    }
    data = { ...migration.apply(data), version: migration.to };
    appliedMigrations.push(`${migration.from} -> ${migration.to}: ${migration.description}`);
    currentFrom = migration.to;
  }

  return { data, appliedMigrations };
}

export function migrateAsset(
  raw: unknown,
  migrations: Migration[] = ASSET_MIGRATIONS,
): MigrationResult {
  return migrateDocument(raw, {
    label: 'asset',
    currentVersion: CURRENT_ASSET_VERSION,
    migrations,
  });
}

export function migrateProject(
  raw: unknown,
  migrations: Migration[] = PROJECT_MIGRATIONS,
): MigrationResult {
  return migrateDocument(raw, {
    label: 'project',
    currentVersion: CURRENT_PROJECT_VERSION,
    migrations,
  });
}

export function migrateExportPresets(
  raw: unknown,
  migrations: Migration[] = EXPORT_PRESETS_MIGRATIONS,
): MigrationResult {
  return migrateDocument(raw, {
    label: 'export-presets',
    currentVersion: CURRENT_EXPORT_PRESETS_VERSION,
    migrations,
  });
}
