import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Asset, Project } from '../model';
import { exportCasproj, importCasproj } from './casproj';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '__fixtures__');

function readFixtureJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(fixturesDir, fileName), 'utf-8')) as T;
}

function readFixturePngBytes(): Uint8Array {
  const base64 = readFileSync(
    path.join(fixturesDir, 'v0.1.0-image-8x8.png.base64.txt'),
    'utf-8',
  ).trim();
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * 旧形式（v0.1.0、最初の形式）の最小プロジェクトを固定 fixture として持ち、
 * .casproj の読み込み → 書き出し → 再読み込みで主要フィールドが変化しないことを確認する
 * （2D-1B-STORAGE §F、ADR-0006 が要求する「旧データ fixture・unit test・roundtrip 確認」）。
 */
describe('旧 .casproj fixture の roundtrip（v0.1.0）', () => {
  it('fixture の project / asset / 画像を .casproj として読み書きしても内容が保たれる', async () => {
    const fixtureProject = readFixtureJson<Project>('v0.1.0-project.json');
    const fixtureAsset = readFixtureJson<Asset>('v0.1.0-asset.json');
    const pngBytes = readFixturePngBytes();
    expect(Array.from(pngBytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    // fflate で手組みの ZIP を作る（exportCasproj を経由しない「既存ファイル」を模す）。
    const zipped = zipSync({
      'project.json': strToU8(`${JSON.stringify(fixtureProject, null, 2)}\n`),
      [`assets/${fixtureAsset.id}/asset.json`]: strToU8(
        `${JSON.stringify(fixtureAsset, null, 2)}\n`,
      ),
      [`assets/${fixtureAsset.id}/textures/main.png`]: pngBytes,
    });

    const { bundle, appliedMigrations, warnings } = await importCasproj(zipped);
    expect(appliedMigrations).toEqual([expect.stringMatching(/asset\.json: 0\.1\.0 -> 0\.2\.0/)]);
    expect(bundle.project.version).toBe('0.1.0');
    expect(bundle.project.families).toBeUndefined();
    // 画像ファイルが揃っているため警告も出ない
    expect(warnings).toEqual([]);
    expect(bundle.project).toEqual(fixtureProject);
    const migratedAsset = { ...fixtureAsset, version: '0.2.0' };
    expect(bundle.assets).toEqual([migratedAsset]);
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0].path).toBe(`assets/${fixtureAsset.id}/textures/main.png`);
    expect(bundle.files[0].bytes).toEqual(pngBytes);

    // 書き出し -> 再読み込みで主要フィールドが deep-equal のまま保たれる（roundtrip）
    const exportedBlob = await exportCasproj(bundle);
    const reimported = await importCasproj(exportedBlob);
    expect(reimported.appliedMigrations).toEqual([]);
    expect(reimported.warnings).toEqual([]);
    expect(reimported.bundle.project).toEqual(fixtureProject);
    expect(reimported.bundle.project.families).toBeUndefined();
    expect(reimported.bundle.assets).toEqual([migratedAsset]);
    expect(reimported.bundle.files).toHaveLength(1);
    expect(reimported.bundle.files[0].bytes).toEqual(pngBytes);
  });
});
