import 'fake-indexeddb/auto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset, ExportPresetFile, Project } from '../model';
import exportPresetsJson from '../samples/export-presets.sample.json';
import v010AssetJson from './__fixtures__/v0.1.0-asset.json';
import v010ProjectJson from './__fixtures__/v0.1.0-project.json';
import { CasprojError } from './casproj';
import { commitStagedCasprojImport, importCasproj, stageCasprojImport } from './casprojImport';
import { resetDbForTests } from './db';
import { listProjects, loadAsset, loadBlob } from './projectStore';

const asset = v010AssetJson as unknown as Asset;
const project = v010ProjectJson as unknown as Project;
const exportPresets = exportPresetsJson as unknown as ExportPresetFile;
const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function makeCasproj({
  projectValue = project,
  assets = [asset],
  files,
  presets,
}: {
  projectValue?: Project | Record<string, unknown>;
  assets?: Asset[];
  files?: Record<string, Uint8Array>;
  presets?: ExportPresetFile;
} = {}): Uint8Array {
  const entries: Zippable = { 'project.json': jsonBytes(projectValue) };
  for (const item of assets) {
    entries[`assets/${item.id}/asset.json`] = jsonBytes(item);
  }
  const defaultFiles = Object.fromEntries(
    assets.flatMap((item) =>
      item.textures.map((texture) => [`assets/${item.id}/${texture.path}`, imageBytes] as const),
    ),
  );
  Object.assign(entries, files ?? defaultFiles);
  if (presets) {
    entries['settings/export-presets.json'] = jsonBytes(presets);
  }
  return zipSync(entries);
}

function deterministicIds(): (prefix: string) => string {
  let projectCount = 0;
  let assetCount = 0;
  return (prefix) => {
    if (prefix === 'project') {
      projectCount += 1;
      return `project_copy_${projectCount}`;
    }
    assetCount += 1;
    return `asset_copy_${assetCount}`;
  };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('2D-1B-CASPROJ staged import', () => {
  it('stageでは正本へ書かず、同じID mappingでProject・Asset・Blobを準備してcommitする', async () => {
    const staged = await stageCasprojImport(makeCasproj(), deterministicIds());

    expect(await listProjects()).toEqual([]);
    expect(staged.project.id).toBe('project_copy_1');
    expect(staged.project.assets).toEqual([
      expect.objectContaining({ id: 'asset_copy_1', name: asset.name }),
    ]);
    expect(staged.assets).toEqual([expect.objectContaining({ id: 'asset_copy_1' })]);
    expect(staged.blobs.map((entry) => entry.key)).toEqual([
      `asset_copy_1/${asset.textures[0].path}`,
    ]);
    expect(staged.appliedMigrations).toEqual([]);

    await commitStagedCasprojImport(staged);

    expect(await listProjects()).toEqual([
      expect.objectContaining({ id: 'project_copy_1', assetCount: 1 }),
    ]);
    expect((await loadAsset('asset_copy_1')).asset.id).toBe('asset_copy_1');
    expect(await loadBlob(`asset_copy_1/${asset.textures[0].path}`)).not.toBeNull();
  });

  it('future versionをCasprojErrorとして拒否し、正本を変更しない', async () => {
    const futureProject = { ...project, version: '0.1.1' };
    const error = await stageCasprojImport(makeCasproj({ projectValue: futureProject })).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(CasprojError);
    expect((error as CasprojError).code).toBe('unsupported-version');
    expect((error as Error).message).toMatch(/新しい形式/);
    expect(await listProjects()).toEqual([]);
  });

  it('参照Assetの画像欠落をcommit前に拒否する', async () => {
    const promise = stageCasprojImport(makeCasproj({ files: {} }), deterministicIds());

    await expect(promise).rejects.toMatchObject({ code: 'incomplete-bundle' });
    await expect(promise).rejects.toThrow(/画像ファイルが不足/);
    expect(await listProjects()).toEqual([]);
  });

  it('canonical storeに保存できないexport presetsは検証後にwarningを返す', async () => {
    const staged = await stageCasprojImport(
      makeCasproj({ presets: exportPresets }),
      deterministicIds(),
    );

    expect(staged.warnings).toEqual([
      expect.stringContaining('settings/export-presets.jsonは検証しました'),
    ]);
    expect(await listProjects()).toEqual([]);
  });

  it('Project参照の重複・asset欠落・summary不一致を拒否する', async () => {
    const duplicateProject: Project = {
      ...project,
      assets: [...project.assets, project.assets[0]],
    };
    await expect(
      stageCasprojImport(makeCasproj({ projectValue: duplicateProject })),
    ).rejects.toThrow(/同じAsset ID/);

    await expect(stageCasprojImport(makeCasproj({ assets: [], files: {} }))).rejects.toThrow(
      /asset\.jsonがありません/,
    );

    const mismatchedProject: Project = {
      ...project,
      assets: [{ ...project.assets[0], name: 'different' }],
    };
    await expect(
      stageCasprojImport(makeCasproj({ projectValue: mismatchedProject })),
    ).rejects.toThrow(/summaryとasset\.jsonが一致しません/);

    const missingDisplayName: Project = {
      ...project,
      assets: [{ ...project.assets[0], displayName: undefined }],
    };
    await expect(
      stageCasprojImport(makeCasproj({ projectValue: missingDisplayName })),
    ).rejects.toThrow(/summaryとasset\.jsonが一致しません/);
  });

  it('asset.jsonのdirectory IDと文書内IDの不一致を拒否する', async () => {
    const entries: Zippable = {
      'project.json': jsonBytes(project),
      'assets/wrong_directory/asset.json': jsonBytes(asset),
      [`assets/${asset.id}/${asset.textures[0].path}`]: imageBytes,
    };
    await expect(stageCasprojImport(zipSync(entries))).rejects.toMatchObject({
      code: 'inconsistent-bundle',
    });
  });

  it('未参照Asset・そのfile・orphan fileをwarning付きでcanonical対象から除外する', async () => {
    const unreferenced: Asset = {
      ...asset,
      id: 'asset_unreferenced',
      name: 'unreferenced',
      displayName: '未参照',
    };
    const files = {
      [`assets/${asset.id}/${asset.textures[0].path}`]: imageBytes,
      [`assets/${asset.id}/orphan.bin`]: new Uint8Array([9]),
      [`assets/${unreferenced.id}/${unreferenced.textures[0].path}`]: imageBytes,
    };

    const imported = await importCasproj(makeCasproj({ assets: [asset, unreferenced], files }));
    expect(imported.bundle.assets.map((item) => item.id)).toEqual([asset.id]);
    expect(imported.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Projectから参照されないAsset'),
        expect.stringContaining('未参照Assetのfile'),
      ]),
    );

    const staged = await stageCasprojImport(
      makeCasproj({ assets: [asset, unreferenced], files }),
      deterministicIds(),
    );
    expect(staged.assets).toHaveLength(1);
    expect(staged.blobs).toHaveLength(1);
    expect(staged.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('TextureRefから参照されないfile')]),
    );
  });

  it('commitがID衝突で失敗しても既存正本だけを維持する', async () => {
    const first = await stageCasprojImport(makeCasproj(), deterministicIds());
    await commitStagedCasprojImport(first);

    const collidingAssetIds = (prefix: string) =>
      prefix === 'project' ? 'project_copy_2' : 'asset_copy_1';
    const second = await stageCasprojImport(makeCasproj(), collidingAssetIds);

    await expect(commitStagedCasprojImport(second)).rejects.toThrow(/同じ Asset ID/);
    expect(await listProjects()).toEqual([
      expect.objectContaining({ id: 'project_copy_1', assetCount: 1 }),
    ]);
    expect((await loadAsset('asset_copy_1')).asset.id).toBe('asset_copy_1');
  });
});
