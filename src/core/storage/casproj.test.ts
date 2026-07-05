import { strToU8, zip, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Asset, ExportPresetFile, Project } from '../model';
import characterAsset from '../samples/asset.character.json';
import exportPresets from '../samples/export-presets.sample.json';
import sampleProject from '../samples/project.sample.json';
import { CasprojError, exportCasproj, importCasproj, type CasprojBundle } from './casproj';

const project = sampleProject as unknown as Project;
const asset = characterAsset as unknown as Asset;
const presets = exportPresets as unknown as ExportPresetFile;

function zipAsync(data: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(data, (error, output) => (error ? reject(error) : resolve(output)));
  });
}

describe('casproj の書き出しと読み込み', () => {
  it('書き出した casproj を読み込むと内容が一致する（往復テスト）', async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const bundle: CasprojBundle = {
      project,
      assets: [asset],
      exportPresets: presets,
      files: [
        { path: `assets/${asset.id}/source/original.png`, bytes: imageBytes },
        { path: `assets/${asset.id}/textures/main.png`, bytes: imageBytes },
      ],
    };

    const blob = await exportCasproj(bundle);
    expect(blob.type).toBe('application/zip');

    const { bundle: imported, appliedMigrations } = await importCasproj(blob);
    expect(appliedMigrations).toEqual([]);
    expect(imported.project).toEqual(project);
    expect(imported.assets).toEqual([asset]);
    expect(imported.exportPresets).toEqual(presets);
    expect(imported.files).toHaveLength(2);
    expect(imported.files.map((file) => file.path).sort()).toEqual([
      `assets/${asset.id}/source/original.png`,
      `assets/${asset.id}/textures/main.png`,
    ]);
    expect(imported.files[0].bytes).toEqual(imageBytes);
    expect(imported.readme).toContain('Chameleon Asset Studio');
  });

  it('project.json が無い ZIP は理由付きで失敗する', async () => {
    const zipped = await zipAsync({ 'note.txt': strToU8('not a casproj') });
    await expect(importCasproj(zipped)).rejects.toThrow(CasprojError);
    await expect(importCasproj(zipped)).rejects.toThrow(/project\.json が見つかりません/);
  });

  it('JSON として読めない project.json は理由付きで失敗する', async () => {
    const zipped = await zipAsync({ 'project.json': strToU8('{ broken json') });
    await expect(importCasproj(zipped)).rejects.toThrow(/JSON として読めません/);
  });

  it('schema 検証に落ちる asset.json は理由付きで失敗する', async () => {
    const brokenAsset = { ...asset, assetType: 'spaceship' };
    const zipped = await zipAsync({
      'project.json': strToU8(JSON.stringify(project)),
      'assets/asset_x/asset.json': strToU8(JSON.stringify(brokenAsset)),
    });
    await expect(importCasproj(zipped)).rejects.toThrow(/assetType/);
  });

  it('不正なプロジェクトの書き出しは検証で落ちる', async () => {
    const brokenProject = { ...project, name: '' } as Project;
    const bundle: CasprojBundle = { project: brokenProject, assets: [], files: [] };
    await expect(exportCasproj(bundle)).rejects.toThrow(/project\.json の内容が不正です/);
  });

  it('危険なパスを含むファイルの書き出しは拒否する', async () => {
    const bundle: CasprojBundle = {
      project,
      assets: [],
      files: [{ path: '../evil.png', bytes: new Uint8Array([1]) }],
    };
    await expect(exportCasproj(bundle)).rejects.toThrow(/パスが不正です/);
  });

  it('読み込み時に危険なパスのエントリは無視する', async () => {
    const zipped = await zipAsync({
      'project.json': strToU8(JSON.stringify(project)),
      '../evil.png': new Uint8Array([1, 2, 3]),
    });
    const { bundle } = await importCasproj(zipped);
    expect(bundle.files).toEqual([]);
  });

  it('テクスチャの画像ファイルが欠けていると書き出しを拒否する（Phase 15.5-A）', async () => {
    const bundle: CasprojBundle = {
      project,
      assets: [asset],
      files: [{ path: `assets/${asset.id}/textures/main.png`, bytes: new Uint8Array([1]) }],
    };
    await expect(exportCasproj(bundle)).rejects.toThrow(
      new RegExp(
        `画像 Blob が見つかりません: asset=${asset.id} texture=.+ path=source/original\\.png`,
      ),
    );
  });

  it('読み込みは画像ファイル欠落を許容し、欠落一覧を warnings で返す（Phase 17-B）', async () => {
    const zipped = await zipAsync({
      'project.json': strToU8(JSON.stringify(project)),
      [`assets/${asset.id}/asset.json`]: strToU8(JSON.stringify(asset)),
    });
    const { bundle, warnings } = await importCasproj(zipped);
    expect(bundle.assets).toHaveLength(1);
    expect(bundle.files).toEqual([]);
    expect(warnings).toHaveLength(asset.textures.length);
    expect(warnings[0]).toMatch(
      new RegExp(`一部の画像が見つかりませんでした: asset=${asset.id} texture=.+ path=.+`),
    );
  });

  it('画像ファイルが揃った .casproj では warnings が空になる', async () => {
    const imageBytes = new Uint8Array([1, 2, 3]);
    const bundle: CasprojBundle = {
      project,
      assets: [asset],
      files: asset.textures.map((texture) => ({
        path: `assets/${asset.id}/${texture.path}`,
        bytes: imageBytes,
      })),
    };
    const blob = await exportCasproj(bundle);
    const { warnings } = await importCasproj(blob);
    expect(warnings).toEqual([]);
  });
});
