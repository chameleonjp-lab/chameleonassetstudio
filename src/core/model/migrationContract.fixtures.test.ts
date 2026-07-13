/**
 * 2D-1A-MIGRATION: docs/adr/0015-migration-detailed-contract.md の契約 fixture テスト
 * （§13 形式変更と migration の gate＝version 採番・移行手順の不変条件・
 * 独立 version・新形式の拒否・migrate → 検証の順序）。
 * 既存テスト（src/core/model/migrate.test.ts、
 * src/core/storage/storage.fixtures.test.ts）の期待値は変更せず、
 * ADR で固定した現行実装の意味を独立に固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import { CURRENT_ASSET_VERSION } from './asset';
import { CURRENT_PROJECT_VERSION } from './project';
import { CURRENT_EXPORT_PRESETS_VERSION } from './exportPreset';
import { CURRENT_ATLAS_VERSION } from '../export/atlas';
import {
  ASSET_MIGRATIONS,
  EXPORT_PRESETS_MIGRATIONS,
  MigrationError,
  PROJECT_MIGRATIONS,
  migrateAsset,
  type Migration,
} from './migrate';
import { validateAsset } from '../schema/validate';
import v010Asset from '../storage/__fixtures__/v0.1.0-asset.json';

describe('ADR-0015 決定3: 4 つの version は独立に定義され現行はいずれも 0.1.0、移行手順配列は空', () => {
  it('asset / project / export-presets / atlas の version が 0.1.0 で、3 つの移行手順配列が空である', () => {
    expect(CURRENT_ASSET_VERSION).toBe('0.1.0');
    expect(CURRENT_PROJECT_VERSION).toBe('0.1.0');
    expect(CURRENT_EXPORT_PRESETS_VERSION).toBe('0.1.0');
    expect(CURRENT_ATLAS_VERSION).toBe('0.1.0');
    // 現行はどの文書も version 進行を伴う migration を持たない（恒等）。
    expect(ASSET_MIGRATIONS).toEqual([]);
    expect(PROJECT_MIGRATIONS).toEqual([]);
    expect(EXPORT_PRESETS_MIGRATIONS).toEqual([]);
  });
});

describe('ADR-0015 決定5: migrate → 検証のパイプラインが現行データ（v0.1.0 fixture）で成立する', () => {
  it('v0.1.0 の asset fixture を migrateAsset に通すと恒等で返り、その結果が validateAsset を通る', () => {
    const result = migrateAsset(v010Asset);

    // migrate は恒等（現行 version 一致のため手順は適用されない）。
    expect(result.appliedMigrations).toEqual([]);
    expect(result.data.version).toBe(CURRENT_ASSET_VERSION);

    // migrate の結果が現行 version の schema（構造検証、ADR-0014）を満たす。
    const validation = validateAsset(result.data);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});

describe('ADR-0015 決定4: 現行より新しい version は拒否され、入力オブジェクトは破壊されない', () => {
  it('version 0.1.1 の asset は MigrationError（新しい形式）になり、元ファイルは温存される', () => {
    const newer = { ...(v010Asset as Record<string, unknown>), version: '0.1.1' };
    const snapshot = structuredClone(newer);

    expect(() => migrateAsset(newer)).toThrow(MigrationError);
    expect(() => migrateAsset(newer)).toThrow(/新しい形式/);
    // 例外時に入力を書き換えない（呼び出し側は何も書き込まず元ファイルを温存できる）。
    expect(newer).toEqual(snapshot);
  });
});

describe('ADR-0015 決定2(i): version を前進させない移行手順は拒否される', () => {
  it('to <= from の移行手順を渡すと MigrationError（バージョンが進んでいない）になる', () => {
    const nonAdvancing: Migration[] = [
      {
        from: '0.0.9',
        to: '0.0.9',
        description: '前進しない不正な手順',
        apply: (data) => data,
      },
    ];
    const old = { ...(v010Asset as Record<string, unknown>), version: '0.0.9' };

    expect(() => migrateAsset(old, nonAdvancing)).toThrow(MigrationError);
    expect(() => migrateAsset(old, nonAdvancing)).toThrow(/バージョンが進んでいません/);
  });
});
