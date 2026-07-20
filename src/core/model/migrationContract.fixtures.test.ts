/**
 * 2D-1A-MIGRATION: docs/adr/0015-migration-detailed-contract.md の契約 fixture テスト
 * （§13 形式変更と migration の gate＝version 採番・移行手順の不変条件・
 * 独立 version・新形式の拒否・migrate → 検証の順序）。
 * 既存テスト（src/core/model/migrate.test.ts、
 * src/core/storage/storage.fixtures.test.ts）と独立に、version の進行と旧形式互換を固定する。
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

describe('ADR-0015 決定3: 4 つの version は独立に進行する', () => {
  it('asset だけが 0.2.0 へ進み、他の形式は 0.1.0 のままである', () => {
    expect(CURRENT_ASSET_VERSION).toBe('0.2.0');
    expect(CURRENT_PROJECT_VERSION).toBe('0.1.0');
    expect(CURRENT_EXPORT_PRESETS_VERSION).toBe('0.1.0');
    expect(CURRENT_ATLAS_VERSION).toBe('0.1.0');
    expect(ASSET_MIGRATIONS).toHaveLength(1);
    expect(ASSET_MIGRATIONS[0]).toMatchObject({ from: '0.1.0', to: '0.2.0' });
    expect(PROJECT_MIGRATIONS).toEqual([]);
    expect(EXPORT_PRESETS_MIGRATIONS).toEqual([]);
  });
});

describe('ADR-0015 決定5: migrate → 検証のパイプラインが旧データ（v0.1.0 fixture）で成立する', () => {
  it('v0.1.0 の asset fixture は既存フィールドを保ったまま 0.2.0 へ移行し、validateAsset を通る', () => {
    const result = migrateAsset(v010Asset);

    expect(result.appliedMigrations).toEqual([expect.stringContaining('0.1.0 -> 0.2.0')]);
    expect(result.data.version).toBe(CURRENT_ASSET_VERSION);
    expect(result.data).toEqual({ ...v010Asset, version: '0.2.0' });

    // migrate の結果が現行 version の schema（構造検証、ADR-0014）を満たす。
    const validation = validateAsset(result.data);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});

describe('ADR-0015 決定4: 現行より新しい version は拒否され、入力オブジェクトは破壊されない', () => {
  it('version 0.2.1 の asset は MigrationError（新しい形式）になり、元ファイルは温存される', () => {
    const newer = { ...(v010Asset as Record<string, unknown>), version: '0.2.1' };
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
