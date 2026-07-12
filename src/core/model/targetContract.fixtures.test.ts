/**
 * 2D-1A-TARGET: docs/adr/0012-target-extension-and-unknown-data.md の契約 fixture テスト
 * （target 固有 extension と unknown data の境界）。
 * 既存テスト（src/core/model/contract.fixtures.test.ts、
 * src/core/model/motionContract.fixtures.test.ts、src/core/storage/casproj.test.ts）の
 * 期待値は変更せず、ADR で固定した現行実装の意味を独立に固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import sampleProject from '../samples/project.sample.json';
import type { Asset } from './asset';
import type { Project } from './project';
import { EXPORT_TARGETS } from './exportPreset';
import { buildAtlas, computeSheetLayout } from '../export/atlas';
import { validateAsset } from '../schema/validate';
import { exportCasproj, importCasproj, type CasprojBundle } from '../storage/casproj';

const baseAsset = minimalAsset as unknown as Asset;
const baseProject = sampleProject as unknown as Project;

describe('ADR-0012: gameAttributes は自由 object（ネストした値を許容する）', () => {
  it('文字列・数値・配列・オブジェクト混在のネスト値を持つ gameAttributes が validateAsset を通る', () => {
    const asset: Asset = {
      ...baseAsset,
      gameAttributes: {
        rarity: 'legendary',
        hp: 42,
        tags: ['fire', 'boss'],
        drops: { item: 'coin', amount: 10 },
      },
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ADR-0012: 未知 root フィールド extensions を持つデータが現行 validator を通る（ADR-0011 の系を extensions 名指しで固定）', () => {
  it('extensions（unity 名前空間）を持つ asset が validateAsset を通る', () => {
    const asset = {
      ...baseAsset,
      extensions: { unity: { pixelsPerUnit: 100 } },
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ADR-0012: casproj roundtrip での未知 root フィールド extensions の保持有無（実挙動の固定）', () => {
  it('extensions 付き asset を exportCasproj → importCasproj すると extensions は保持される', async () => {
    const assetWithExtensions = {
      ...baseAsset,
      extensions: { unity: { pixelsPerUnit: 100 }, 'rpgmaker-mz': { switchId: 7 } },
    };
    const bundle: CasprojBundle = {
      project: baseProject,
      assets: [assetWithExtensions as unknown as Asset],
      files: [],
    };

    const blob = await exportCasproj(bundle);
    const { bundle: imported, appliedMigrations } = await importCasproj(blob);

    expect(appliedMigrations).toEqual([]);
    expect(imported.assets).toHaveLength(1);
    // 現状の実装（migrateDocument のオブジェクトスプレッドと、ajv の removeAdditional 未設定の
    // validateAsset）では、未知 root フィールドは失われず保持される。ADR-0012 の
    // 「現状の制限」に、この事実（保持される）が編集経路依存であり保証ではないことを記録した。
    expect((imported.assets[0] as unknown as Record<string, unknown>).extensions).toEqual({
      unity: { pixelsPerUnit: 100 },
      'rpgmaker-mz': { switchId: 7 },
    });
  });
});

describe('ADR-0012: EXPORT_TARGETS の現行値集合', () => {
  it("['generic', 'canvas2d', 'pixijs', 'phaser'] で固定されている", () => {
    expect(EXPORT_TARGETS).toEqual(['generic', 'canvas2d', 'pixijs', 'phaser']);
  });
});

describe('ADR-0012: buildAtlas の出力に gameAttributes / extensions が現行でも出ない', () => {
  it('gameAttributes に値を持つ asset でも atlas のトップレベルキー集合に gameAttributes / extensions を含まない', () => {
    const asset = {
      ...baseAsset,
      gameAttributes: { rarity: 'legendary' },
      extensions: { unity: { pixelsPerUnit: 100 } },
    } as unknown as Asset;
    const layout = computeSheetLayout([], 32, 32);

    const atlas = buildAtlas(asset, layout);

    expect(Object.keys(atlas)).not.toContain('gameAttributes');
    expect(Object.keys(atlas)).not.toContain('extensions');
  });
});
