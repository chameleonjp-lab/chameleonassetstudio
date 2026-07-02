import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import sampleProject from '../samples/project.sample.json';
import { CURRENT_ASSET_VERSION } from './asset';
import { MigrationError, migrateAsset, migrateProject, type Migration } from './migrate';

describe('migrateAsset', () => {
  it('現行バージョンのデータはそのまま返す', () => {
    const result = migrateAsset(minimalAsset);
    expect(result.appliedMigrations).toEqual([]);
    expect(result.data.version).toBe(CURRENT_ASSET_VERSION);
    expect(result.data.id).toBe(minimalAsset.id);
  });

  it('version が無いデータは MigrationError になる', () => {
    const broken = { ...minimalAsset, version: undefined };
    expect(() => migrateAsset(broken)).toThrow(MigrationError);
    expect(() => migrateAsset(broken)).toThrow(/version がありません/);
  });

  it('オブジェクトでないデータは MigrationError になる', () => {
    expect(() => migrateAsset(null)).toThrow(MigrationError);
    expect(() => migrateAsset([])).toThrow(MigrationError);
  });

  it('このアプリより新しいバージョンは MigrationError になる', () => {
    const future = { ...minimalAsset, version: '999.0.0' };
    expect(() => migrateAsset(future)).toThrow(/新しい形式/);
  });

  it('移行手順が無い古いバージョンは MigrationError になる', () => {
    const old = { ...minimalAsset, version: '0.0.1' };
    expect(() => migrateAsset(old)).toThrow(/移行手順がありません/);
  });

  it('登録した移行手順が順に適用される', () => {
    const migrations: Migration[] = [
      {
        from: '0.0.1',
        to: '0.0.2',
        description: 'tags を追加',
        apply: (data) => ({ ...data, tags: data.tags ?? [] }),
      },
      {
        from: '0.0.2',
        to: CURRENT_ASSET_VERSION,
        description: 'gameAttributes を追加',
        apply: (data) => ({ ...data, gameAttributes: data.gameAttributes ?? {} }),
      },
    ];
    const old: Record<string, unknown> = { ...minimalAsset, version: '0.0.1' };
    delete old.tags;
    delete old.gameAttributes;

    const result = migrateAsset(old, migrations);
    expect(result.data.version).toBe(CURRENT_ASSET_VERSION);
    expect(result.data.tags).toEqual([]);
    expect(result.data.gameAttributes).toEqual({});
    expect(result.appliedMigrations).toHaveLength(2);
    expect(result.appliedMigrations[0]).toContain('0.0.1 -> 0.0.2');
  });

  it('入力データを破壊しない', () => {
    const input = structuredClone(minimalAsset);
    migrateAsset(input);
    expect(input).toEqual(minimalAsset);
  });
});

describe('migrateProject', () => {
  it('現行バージョンの project はそのまま返す', () => {
    const result = migrateProject(sampleProject);
    expect(result.appliedMigrations).toEqual([]);
    expect(result.data.id).toBe(sampleProject.id);
  });

  it('version 形式が不正なら MigrationError になる', () => {
    const broken = { ...sampleProject, version: 'v1' };
    expect(() => migrateProject(broken)).toThrow(MigrationError);
  });
});
