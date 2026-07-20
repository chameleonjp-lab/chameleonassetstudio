/**
 * 2D-1A-PROVENANCE: docs/adr/0013-provenance-and-ai-record-boundary.md の契約 fixture テスト
 * （来歴・利用条件・AI 送信記録の保存境界）。
 * 既存テスト（src/core/model/contract.fixtures.test.ts、
 * src/core/model/targetContract.fixtures.test.ts、src/core/storage/casproj.test.ts）の
 * 期待値は変更せず、ADR で固定した現行実装の意味を独立に固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import sampleProject from '../samples/project.sample.json';
import v010Asset from '../storage/__fixtures__/v0.1.0-asset.json';
import type { Asset } from './asset';
import type { Project } from './project';
import { exportAssetJson } from '../export/exportAsset';
import { buildAtlas, computeSheetLayout } from '../export/atlas';
import { validateAsset } from '../schema/validate';
import { exportCasproj, importCasproj, type CasprojBundle } from '../storage/casproj';
import { migrateAsset } from './migrate';

const baseAsset = minimalAsset as unknown as Asset;
const baseProject = sampleProject as unknown as Project;

describe('ADR-0013: 未知 root フィールド provenance を持つ asset が現行 validator を通る', () => {
  it('§11 候補フィールド（元ファイル名・形式・ハッシュ・取得元・利用条件・作成日）を持つ provenance レコード配列が validateAsset を通る', () => {
    const asset = {
      ...baseAsset,
      provenance: [
        {
          id: 'prov_001',
          textureId: 'tex_source_001',
          originalFileName: 'tomato.png',
          format: 'image/png',
          hash: 'sha256:deadbeef',
          source: 'https://example.com/tomato.png',
          license: 'CC-BY-4.0',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('Slice B P1: 正式source-file recordと旧0.1.0互換', () => {
  it('正式fieldを持つrecordがschemaを通り、asset.jsonへverbatimで出る', async () => {
    const record = {
      sourceFileName: 'tomato.png',
      mimeType: 'image/png',
      byteLength: 1234,
      hash: `sha256:${'c'.repeat(64)}`,
      importedAt: '2026-07-20T00:00:00.000Z',
      origin: 'local-file',
      license: 'CC-BY-4.0',
    };
    const asset = { ...baseAsset, provenance: [record] } as Asset;

    expect(validateAsset(asset)).toEqual({ valid: true, errors: [] });
    const exported = JSON.parse(await exportAssetJson(asset).text()) as Asset;
    expect(exported.provenance).toEqual([record]);
  });

  it('provenance不在のv0.1.0 Assetをmigrateしても遡及生成しない', () => {
    const migrated = migrateAsset(v010Asset);
    expect(migrated.appliedMigrations).toEqual([expect.stringContaining('0.1.0 -> 0.2.0')]);
    expect(migrated.data).toEqual({ ...v010Asset, version: '0.2.0' });
    expect(migrated.data).not.toHaveProperty('provenance');
  });
});

describe('ADR-0013: texture 側の未知フィールド（入れ子レベルの unknown data）が現行 validator を通る', () => {
  it('textures[0] に provenance 相当の未知フィールドを足した asset が validateAsset を通る', () => {
    const asset = {
      ...baseAsset,
      textures: [
        {
          id: 'tex_source_001',
          kind: 'source',
          name: 'main.png',
          mimeType: 'image/png',
          size: { width: 2, height: 2 },
          path: 'source/original.png',
          provenance: { source: 'local-file' },
        },
      ],
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ADR-0013: casproj roundtrip での root provenance と texture 内未知フィールドの保持有無（実挙動の固定）', () => {
  it('root provenance と textures[0] の未知フィールドを持つ asset を exportCasproj → importCasproj すると両方とも保持される', async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const assetWithProvenance = {
      ...baseAsset,
      provenance: [
        {
          id: 'prov_001',
          textureId: 'tex_source_001',
          originalFileName: 'tomato.png',
          format: 'image/png',
          hash: 'sha256:deadbeef',
          source: 'https://example.com/tomato.png',
          license: 'CC-BY-4.0',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      textures: [
        {
          id: 'tex_source_001',
          kind: 'source',
          name: 'main.png',
          mimeType: 'image/png',
          size: { width: 2, height: 2 },
          path: 'source/original.png',
          provenance: { source: 'local-file' },
        },
      ],
    };
    const bundle: CasprojBundle = {
      project: baseProject,
      assets: [assetWithProvenance as unknown as Asset],
      files: [{ path: `assets/${baseAsset.id}/source/original.png`, bytes: imageBytes }],
    };

    const blob = await exportCasproj(bundle);
    const { bundle: imported, appliedMigrations } = await importCasproj(blob);

    expect(appliedMigrations).toEqual([]);
    expect(imported.assets).toHaveLength(1);
    const importedAsset = imported.assets[0] as unknown as Record<string, unknown>;
    // 現状の実装（migrateDocument のオブジェクトスプレッドと、ajv の removeAdditional 未設定の
    // validateAsset）では、root の未知フィールドだけでなく、texture 配列要素内の未知フィールド
    // （入れ子レベルの unknown data）も失われず保持される。ADR-0013 の「現状の制限」に、
    // この事実（保持される）が編集経路依存であり保証ではないことを記録した。
    expect(importedAsset.provenance).toEqual([
      {
        id: 'prov_001',
        textureId: 'tex_source_001',
        originalFileName: 'tomato.png',
        format: 'image/png',
        hash: 'sha256:deadbeef',
        source: 'https://example.com/tomato.png',
        license: 'CC-BY-4.0',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    const importedTextures = importedAsset.textures as Array<Record<string, unknown>>;
    expect(importedTextures[0]?.provenance).toEqual({ source: 'local-file' });
  });
});

describe('ADR-0013: buildAtlas の出力に provenance が現行でも出ない', () => {
  it('root provenance を持つ asset でも atlas のトップレベルキー集合に provenance を含まない', () => {
    const asset = {
      ...baseAsset,
      provenance: [{ id: 'prov_001', originalFileName: 'tomato.png' }],
    } as unknown as Asset;
    const layout = computeSheetLayout([], 32, 32);

    const atlas = buildAtlas(asset, layout);

    expect(Object.keys(atlas)).not.toContain('provenance');
  });
});
