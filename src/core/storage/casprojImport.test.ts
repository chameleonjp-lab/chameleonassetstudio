import 'fake-indexeddb/auto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, ExportPresetFile, Project } from '../model';
import {
  createFamilyVariantIdMap,
  createFamilyVariantWriteSet,
  createLinkedMirrorVariant,
} from '../model/familyTestFixtures';
import { flipCopyAsset } from '../model/flipCopy';
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

function sourceOnlyAsset(
  id: string,
  mimeType: 'image/svg+xml' | 'image/gif',
  extension: 'svg' | 'gif',
): Asset {
  const sourceTexture = {
    ...structuredClone(asset.textures[0]),
    id: `tex_${extension}_source`,
    kind: 'source' as const,
    name: 'original',
    mimeType,
    path: `source/original.${extension}`,
  };
  return {
    ...structuredClone(asset),
    version: '0.2.0',
    id,
    name: id,
    displayName: id,
    textures: [sourceTexture],
    layers: asset.layers.map((layer) => ({
      ...structuredClone(layer),
      textureId: sourceTexture.id,
    })),
  };
}

/** GIF89aの単色画像。clear codeを各pixel前に置き、code幅を3bitのまま保つ。 */
function solidGifBytes(width: number, height: number): Uint8Array {
  const codes = Array.from({ length: width * height }, () => [4, 0]).flat();
  codes.push(5);

  const imageData: number[] = [];
  let buffer = 0;
  let bitCount = 0;
  for (const code of codes) {
    buffer |= code << bitCount;
    bitCount += 3;
    while (bitCount >= 8) {
      imageData.push(buffer & 0xff);
      buffer >>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) {
    imageData.push(buffer & 0xff);
  }

  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0x80,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0xff,
    0xff,
    0xff,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0x00,
    0x02,
    imageData.length,
    ...imageData,
    0x00,
    0x3b,
  ]);
}

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
    expect(staged.appliedMigrations).toEqual([
      expect.stringMatching(/asset\.json: 0\.1\.0 -> 0\.2\.0/),
    ]);

    await commitStagedCasprojImport(staged);

    expect(await listProjects()).toEqual([
      expect.objectContaining({ id: 'project_copy_1', assetCount: 1 }),
    ]);
    expect((await loadAsset('asset_copy_1')).asset.id).toBe('asset_copy_1');
    expect(await loadBlob(`asset_copy_1/${asset.textures[0].path}`)).not.toBeNull();
  });

  it('rig反転copyの製品importはcontainer IDだけを替え、内部graphとBlob bytesを保持する', async () => {
    const source: Asset = {
      ...structuredClone(asset),
      version: '0.2.0',
      parts: [
        {
          id: 'part_import_left',
          name: 'arm_left',
          partType: 'arm_left',
          layerIds: [asset.layers[0].id],
          pivot: { x: 3, y: 4 },
          bindPose: {
            localPosition: { x: 1, y: -2 },
            localRotation: 15,
            localScale: { x: -1, y: 0.5 },
          },
          rotationLimit: { min: -30, max: 20 },
        },
      ],
      rigAnimations: [
        {
          id: 'rig_import_left',
          name: 'attack_left',
          fps: 2,
          loop: false,
          durationMs: 1000,
          keyframes: [
            {
              time: 0,
              poses: {
                part_import_left: {
                  localPosition: { x: 2, y: 3 },
                  localRotation: -12,
                },
              },
            },
          ],
        },
      ],
    };
    const flipped = flipCopyAsset(source, {
      now: new Date('2026-07-24T10:00:00.000Z'),
    });
    const sourceProject: Project = {
      ...project,
      assets: [
        {
          id: flipped.id,
          name: flipped.name,
          displayName: flipped.displayName,
          assetType: flipped.assetType,
        },
      ],
    };
    const exported = await exportCasproj({
      project: sourceProject,
      assets: [flipped],
      files: flipped.textures.map((texture) => ({
        path: `assets/${flipped.id}/${texture.path}`,
        bytes: imageBytes,
      })),
    });

    const staged = await stageCasprojImport(exported, deterministicIds());
    const stagedAsset = staged.assets[0];

    expect(staged.project.id).toBe('project_copy_1');
    expect(stagedAsset.id).toBe('asset_copy_1');
    expect({ ...stagedAsset, id: flipped.id }).toEqual(flipped);
    expect(staged.blobs.map(({ key }) => key)).toEqual([
      `asset_copy_1/${flipped.textures[0].path}`,
    ]);
    expect(new Uint8Array(await staged.blobs[0].blob.arrayBuffer())).toEqual(imageBytes);

    await commitStagedCasprojImport(staged);
    const reloaded = await loadAsset('asset_copy_1');
    expect({ ...reloaded.asset, id: flipped.id }).toEqual(flipped);
    expect(
      new Uint8Array(
        await (await loadBlob(`asset_copy_1/${flipped.textures[0].path}`))!.arrayBuffer(),
      ),
    ).toEqual(imageBytes);
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

  it('SVG / GIF sourceの宣言MIME・実体・verbatim bytesをstageから正本保存まで保持する', async () => {
    const svgAsset = sourceOnlyAsset('asset_svg_source', 'image/svg+xml', 'svg');
    const gifAsset = sourceOnlyAsset('asset_gif_source', 'image/gif', 'gif');
    const sourceProject: Project = {
      ...project,
      assets: [svgAsset, gifAsset].map((item) => ({
        id: item.id,
        name: item.name,
        displayName: item.displayName,
        assetType: item.assetType,
      })),
    };
    const svgBytes = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
    );
    const gifBytes = solidGifBytes(8, 8);
    const files = {
      [`assets/${svgAsset.id}/${svgAsset.textures[0].path}`]: svgBytes,
      [`assets/${gifAsset.id}/${gifAsset.textures[0].path}`]: gifBytes,
    };

    const staged = await stageCasprojImport(
      makeCasproj({ projectValue: sourceProject, assets: [svgAsset, gifAsset], files }),
      deterministicIds(),
    );

    expect(staged.appliedMigrations).toEqual([]);
    expect(staged.blobs.map(({ blob }) => blob.type)).toEqual(['image/svg+xml', 'image/gif']);
    expect(new Uint8Array(await staged.blobs[0].blob.arrayBuffer())).toEqual(svgBytes);
    expect(new Uint8Array(await staged.blobs[1].blob.arrayBuffer())).toEqual(gifBytes);

    await commitStagedCasprojImport(staged);
    const savedSvg = await loadBlob(`asset_copy_1/${svgAsset.textures[0].path}`);
    const savedGif = await loadBlob(`asset_copy_2/${gifAsset.textures[0].path}`);
    expect(savedSvg?.type).toBe('image/svg+xml');
    expect(savedGif?.type).toBe('image/gif');
    expect(new Uint8Array(await savedSvg!.arrayBuffer())).toEqual(svgBytes);
    expect(new Uint8Array(await savedGif!.arrayBuffer())).toEqual(gifBytes);

    const savedProject = (await loadProject(staged.project.id)).project;
    const savedAssets = await Promise.all(
      staged.assets.map(async (item) => (await loadAsset(item.id)).asset),
    );
    const reexported = await exportCasproj({
      project: savedProject,
      assets: savedAssets,
      files: [
        {
          path: `assets/asset_copy_1/${svgAsset.textures[0].path}`,
          bytes: new Uint8Array(await savedSvg!.arrayBuffer()),
        },
        {
          path: `assets/asset_copy_2/${gifAsset.textures[0].path}`,
          bytes: new Uint8Array(await savedGif!.arrayBuffer()),
        },
      ],
    });
    const restaged = await stageCasprojImport(reexported, deterministicIds());
    expect(restaged.appliedMigrations).toEqual([]);
    expect(restaged.blobs.map(({ blob }) => blob.type)).toEqual(['image/svg+xml', 'image/gif']);
    expect(new Uint8Array(await restaged.blobs[0].blob.arrayBuffer())).toEqual(svgBytes);
    expect(new Uint8Array(await restaged.blobs[1].blob.arrayBuffer())).toEqual(gifBytes);
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
