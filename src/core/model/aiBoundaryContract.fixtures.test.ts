/**
 * 2D-2-AI-BOUNDARY: docs/adr/0017-ai-boundary.md の契約 fixture テスト。
 * AI 送信記録（送信先・モデル名・生成日時・承認状態）を ADR-0013 決定 3 の族
 * （provenance と同じ asset 紐づき optional メタデータ）として保存する場合の受け皿挙動と、
 * engine 向け派生出力へ出さない境界を現行実装のまま固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import sampleProject from '../samples/project.sample.json';
import type { Asset } from './asset';
import type { Project } from './project';
import { buildAtlas, computeSheetLayout } from '../export/atlas';
import { validateAsset } from '../schema/validate';
import { exportCasproj, importCasproj, type CasprojBundle } from '../storage/casproj';

const baseAsset = minimalAsset as unknown as Asset;
const baseProject = sampleProject as unknown as Project;

const AI_RECORD = {
  id: 'prov_ai_001',
  origin: 'ai',
  destination: 'https://example.invalid/ai-endpoint',
  model: 'example-image-model-1',
  generatedAt: '2026-07-19T00:00:00.000Z',
  approval: 'approved',
} as const;

describe('ADR-0017: AI 送信記録候補 field を持つ provenance レコードが現行 validator を通る', () => {
  it('送信先・モデル名・生成日時・承認状態を持つレコード配列が validateAsset を通る（同族保存の受け皿確認）', () => {
    const asset = {
      ...baseAsset,
      provenance: [AI_RECORD],
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ADR-0017: casproj roundtrip で AI 送信記録相当の未知フィールドが保持される', () => {
  it('AI 送信記録を含む provenance を持つ asset を exportCasproj → importCasproj すると保持される', async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const assetWithAiRecord = {
      ...baseAsset,
      provenance: [AI_RECORD],
    };
    const bundle: CasprojBundle = {
      project: baseProject,
      assets: [assetWithAiRecord as unknown as Asset],
      files: [{ path: `assets/${baseAsset.id}/source/original.png`, bytes: imageBytes }],
    };

    const blob = await exportCasproj(bundle);
    const { bundle: imported, appliedMigrations } = await importCasproj(blob);

    expect(appliedMigrations).toEqual([]);
    expect(imported.assets).toHaveLength(1);
    const importedAsset = imported.assets[0] as unknown as Record<string, unknown>;
    expect(importedAsset.provenance).toEqual([AI_RECORD]);
  });
});

describe('ADR-0017: engine 向け派生出力へ AI 送信記録を出さない', () => {
  it('AI 送信記録を含む provenance を持つ asset でも atlas のトップレベルキー集合に provenance を含まない', () => {
    const asset = {
      ...baseAsset,
      provenance: [AI_RECORD],
    } as unknown as Asset;
    const layout = computeSheetLayout([], 32, 32);

    const atlas = buildAtlas(asset, layout);

    expect(Object.keys(atlas)).not.toContain('provenance');
  });
});
