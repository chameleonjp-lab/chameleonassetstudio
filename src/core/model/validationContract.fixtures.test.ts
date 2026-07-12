/**
 * 2D-1A-VALIDATION: docs/adr/0014-validation-staging.md の契約 fixture テスト
 * （§12 検証の段階＝構造検証 / 意味検証 / 出力検証の境界）。
 * 既存テスト（src/core/model/contract.fixtures.test.ts、
 * src/core/model/targetContract.fixtures.test.ts、
 * src/core/model/provenanceContract.fixtures.test.ts、
 * src/core/storage/casproj.test.ts）の期待値は変更せず、ADR で固定した
 * 現行実装の意味を独立に固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import type { Asset } from './asset';
import { buildAtlas, computeSheetLayout } from '../export/atlas';
import { validateAsset } from '../schema/validate';
import { CasprojError, exportCasproj, type CasprojBundle } from '../storage/casproj';
import sampleProject from '../samples/project.sample.json';
import type { Project } from './project';

const baseAsset = minimalAsset as unknown as Asset;
const baseProject = sampleProject as unknown as Project;

describe('ADR-0014 決定1/2: 構造検証（schema）は必須フィールド欠落を検出する', () => {
  it('name を欠いた asset は validateAsset で valid: false になる', () => {
    const withoutName = { ...baseAsset } as Record<string, unknown>;
    delete withoutName.name;

    const result = validateAsset(withoutName);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((message) => message.includes('name'))).toBe(true);
  });

  it('textures を欠いた asset は validateAsset で valid: false になる', () => {
    const withoutTextures = { ...baseAsset } as Record<string, unknown>;
    delete withoutTextures.textures;

    const result = validateAsset(withoutTextures);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((message) => message.includes('textures'))).toBe(true);
  });
});

describe('ADR-0014 決定2/3: 意味検証（参照整合性）は構造検証（schema）に含まれない', () => {
  it('存在しない textureId を参照する image layer を持つ asset は validateAsset を通る（dangling ref を schema は検出しない）', () => {
    const assetWithDanglingRef: Asset = {
      ...baseAsset,
      textures: [],
      layers: [
        {
          id: 'layer_body',
          name: 'body',
          layerType: 'image',
          visible: true,
          locked: false,
          opacity: 1,
          transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
          textureId: 'tex_does_not_exist',
        },
      ],
    };

    const result = validateAsset(assetWithDanglingRef);

    // 実挙動: asset.schema.json の layer 定義（textureId: { "type": "string", "minLength": 1 }）は
    // 参照先 texture の実在を検査しないため、dangling ref のまま schema を通る。
    // 統一意味検証パス（ADR-0014 決定2/3）が未実装である現状を固定する。
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('ADR-0014 決定2/4: 意味検証の予防（export 時 Blob 完全性チェック）は現行 exportCasproj に存在する', () => {
  it('texture の Blob ファイルが bundle.files に無い場合、exportCasproj は CasprojError を throw する', async () => {
    const assetWithTexture: Asset = {
      ...baseAsset,
      textures: [
        {
          id: 'tex_001',
          kind: 'source',
          name: 'main.png',
          mimeType: 'image/png',
          size: { width: 2, height: 2 },
          path: 'source/main.png',
        },
      ],
    };
    const bundle: CasprojBundle = {
      project: baseProject,
      assets: [assetWithTexture],
      files: [], // texture が参照する source/main.png を欠落させる
    };

    await expect(exportCasproj(bundle)).rejects.toThrow(CasprojError);
    await expect(exportCasproj(bundle)).rejects.toThrow(/画像 Blob が見つかりません/);
  });
});

describe('ADR-0014 決定2/3: 出力検証（preflight）は未実装で buildAtlas は重複名を検出しない', () => {
  it('同じ name を持つ 2 frame を含む asset を buildAtlas に渡すと、出力 frames に同名が 2 つそのまま出る', () => {
    const assetWithDuplicateFrameNames: Asset = {
      ...baseAsset,
      frames: [
        { id: 'frame_1', name: 'idle', layerStates: [] },
        { id: 'frame_2', name: 'idle', layerStates: [] },
      ],
    };
    const layout = computeSheetLayout(['frame_1', 'frame_2'], 32, 32);

    const atlas = buildAtlas(assetWithDuplicateFrameNames, layout);

    // 実挙動: buildAtlas（atlas.ts:82, atlas.ts:92 の nameById.get(...) ?? position.frameId）は
    // frame name の一意性を検証・dedup せず、重複名をそのまま出力する。
    // 出力用一意名検証（preflight、ADR-0014 決定2/3 の「出力検証」）が未実装である現状を固定する。
    expect(atlas.frames.map((frame) => frame.name)).toEqual(['idle', 'idle']);
    expect(atlas.frames).toHaveLength(2);
  });
});
