import 'fake-indexeddb/auto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, ExportPresetFile, Project } from '../model';
import {
  createFamilyVariantIdMap,
  createFamilyVariantWriteSet,
  createLinkedMirrorVariant,
} from '../model/familyTestFixtures';
import exportPresetsJson from '../samples/export-presets.sample.json';
import v010AssetJson from './__fixtures__/v0.1.0-asset.json';
import v010ProjectJson from './__fixtures__/v0.1.0-project.json';
import { CasprojError, exportCasproj } from './casproj';
import { commitStagedCasprojImport, importCasproj, stageCasprojImport } from './casprojImport';
import { resetDbForTests } from './db';
import { listProjects, loadAsset, loadBlob, loadProject } from './projectStore';

const asset = v010AssetJson as unknown as Asset;
const project = v010ProjectJson as unknown as Project;
const exportPresets = exportPresetsJson as unknown as ExportPresetFile;
const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('画像のmagic bytes、decode、TextureRef実寸法をcommit前に検査する', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await expect(
      stageCasprojImport(
        makeCasproj({
          files: { [`assets/${asset.id}/${asset.textures[0].path}`]: jpegBytes },
        }),
      ),
    ).rejects.toMatchObject({ code: 'unsafe-input' });

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => Promise.reject(new Error('decode'))),
    );
    await expect(stageCasprojImport(makeCasproj())).rejects.toMatchObject({
      code: 'unsafe-input',
    });

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 9, height: 8, close: vi.fn() })),
    );
    await expect(stageCasprojImport(makeCasproj())).rejects.toMatchObject({
      code: 'unsafe-input',
    });
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

  it('Family付きexport→import→save→exportでAsset参照だけを付替え、内部IDとstandaloneを保持する', async () => {
    const variant: Asset = {
      ...structuredClone(asset),
      id: 'asset_family_variant',
      name: 'family_variant',
      displayName: 'Family Variant',
    };
    const standalone: Asset = {
      ...structuredClone(asset),
      id: 'asset_standalone',
      name: 'standalone',
      displayName: 'Standalone',
    };
    const linked = createLinkedMirrorVariant(variant.id);
    linked.recipe.idMap = {
      ...createFamilyVariantIdMap(),
      // 内部IDが旧Asset IDと同じ文字列でもimport時に付替えないことを固定する。
      layers: { [asset.id]: variant.id },
    };
    linked.recipe.writeSet = {
      ...createFamilyVariantWriteSet(),
      layers: [variant.id],
    };
    const familyProject = {
      ...project,
      assets: [asset, variant, standalone].map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        assetType: item.assetType,
      })),
      families: [
        {
          id: 'family_fixture',
          name: 'Fixture Family',
          baseAssetId: asset.id,
          variants: [linked],
        },
      ],
      futureProjectField: { preserved: true },
    } as Project;

    const staged = await stageCasprojImport(
      makeCasproj({ projectValue: familyProject, assets: [asset, variant, standalone] }),
      deterministicIds(),
    );

    expect(staged.project.assets.map((entry) => entry.id)).toEqual([
      'asset_copy_1',
      'asset_copy_2',
      'asset_copy_3',
    ]);
    expect(staged.project.families?.[0]).toMatchObject({
      id: 'family_fixture',
      baseAssetId: 'asset_copy_1',
      variants: [{ assetId: 'asset_copy_2' }],
    });
    const stagedVariant = staged.project.families?.[0].variants[0];
    expect(stagedVariant?.kind).toBe('linked-mirror');
    if (stagedVariant?.kind === 'linked-mirror') {
      expect(stagedVariant.recipe.idMap.layers).toEqual({
        [asset.id]: variant.id,
      });
      expect(stagedVariant.recipe.writeSet.layers).toEqual([variant.id]);
      expect(stagedVariant.fingerprint).toEqual(linked.fingerprint);
    }
    expect(
      staged.project.families?.some(
        (family) =>
          family.baseAssetId === 'asset_copy_3' ||
          family.variants.some((item) => item.assetId === 'asset_copy_3'),
      ),
    ).toBe(false);

    await commitStagedCasprojImport(staged);
    const savedProject = (await loadProject(staged.project.id)).project;
    const savedAssets = await Promise.all(
      savedProject.assets.map(async (entry) => (await loadAsset(entry.id)).asset),
    );
    const savedFiles = await Promise.all(
      savedAssets.flatMap((savedAsset) =>
        savedAsset.textures.map(async (texture) => {
          const blob = await loadBlob(`${savedAsset.id}/${texture.path}`);
          if (!blob) {
            throw new Error(`fixture Blob missing: ${savedAsset.id}/${texture.path}`);
          }
          return {
            path: `assets/${savedAsset.id}/${texture.path}`,
            bytes: new Uint8Array(await blob.arrayBuffer()),
          };
        }),
      ),
    );

    const reexported = await exportCasproj({
      project: savedProject,
      assets: savedAssets,
      files: savedFiles,
    });
    const reimported = await importCasproj(reexported);

    expect(reimported.bundle.project).toEqual(savedProject);
    expect(reimported.bundle.project.families).toEqual(staged.project.families);
    expect(
      (reimported.bundle.project as unknown as Record<string, unknown>).futureProjectField,
    ).toEqual({ preserved: true });
  });

  it('不正なFamily参照をstageで拒否し、正本を変更しない', async () => {
    const invalidProject: Project = {
      ...project,
      families: [
        {
          id: 'family_invalid',
          name: 'Invalid',
          baseAssetId: asset.id,
          variants: [{ assetId: 'asset_missing', kind: 'manual' }],
        },
      ],
    };

    await expect(
      stageCasprojImport(makeCasproj({ projectValue: invalidProject })),
    ).rejects.toMatchObject({ code: 'inconsistent-bundle' });
    expect(await listProjects()).toEqual([]);
  });
});
