import { strToU8, zip, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Asset, ExportPresetFile, Project } from '../model';
import { replacePartLayerIds } from '../model';
import {
  createFamilyVariantIdMap,
  createFamilyVariantWriteSet,
  createLinkedMirrorVariant,
} from '../model/familyTestFixtures';
import { flipCopyAsset } from '../model/flipCopy';
import characterAsset from '../samples/asset.character.json';
import exportPresets from '../samples/export-presets.sample.json';
import sampleProject from '../samples/project.sample.json';
import { CasprojError, exportCasproj, importCasproj, type CasprojBundle } from './casproj';

const asset = characterAsset as unknown as Asset;
const project = {
  ...(sampleProject as unknown as Project),
  assets: [
    {
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    },
  ],
};
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

  it('Frame時間・event・payloadをIDごとexact roundtripする', async () => {
    const motionAsset = structuredClone(asset);
    motionAsset.frames![0].durationMs = 175;
    motionAsset.animations[0].events = [
      {
        id: 'event_roundtrip',
        name: 'attack_start',
        frameId: motionAsset.frames![0].id,
        payload: { power: 3, critical: false, note: null },
      },
    ];
    (motionAsset.animations[0].events[0] as unknown as Record<string, unknown>).futureEventField = {
      preserved: true,
    };
    const imageBytes = new Uint8Array([1, 2, 3]);
    const bundle: CasprojBundle = {
      project,
      assets: [motionAsset],
      files: motionAsset.textures.map((texture) => ({
        path: `assets/${motionAsset.id}/${texture.path}`,
        bytes: imageBytes,
      })),
    };

    const exported = await exportCasproj(bundle);
    const imported = await importCasproj(exported);

    expect(imported.appliedMigrations).toEqual([]);
    expect(imported.bundle.assets).toEqual([motionAsset]);
    expect(
      imported.bundle.assets[0].animations[0].events?.[0] as unknown as Record<string, unknown>,
    ).toMatchObject({ futureEventField: { preserved: true } });
    expect(imported.bundle.assets[0].version).toBe('0.2.0');
  });

  it('rig反転copyを内部ID・参照・順序・Blob bytesごとexact roundtripする', async () => {
    const source = structuredClone(asset);
    source.parts[0].pivot = { x: 230, y: 250 };
    source.parts[0].bindPose = {
      localPosition: { x: 4, y: -2 },
      localRotation: 12,
      localScale: { x: -1, y: 1.5 },
    };
    source.parts[0].rotationLimit = { min: -25, max: 40 };
    source.rigAnimations = [
      {
        id: 'rig_casproj_left',
        name: 'idle_left',
        fps: 4,
        loop: true,
        durationMs: 1000,
        keyframes: [
          {
            time: 0,
            poses: {
              [source.parts[0].id]: {
                localPosition: { x: 3, y: 1 },
                localRotation: -10,
              },
            },
          },
          { time: 1, poses: { [source.parts[0].id]: { localScale: { x: -2, y: 0.5 } } } },
        ],
      },
    ];
    const flipped = flipCopyAsset(source, {
      now: new Date('2026-07-24T10:00:00.000Z'),
    });
    const flippedProject: Project = {
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
    const bytesByPath = new Map(
      flipped.textures.map((texture, index) => [
        `assets/${flipped.id}/${texture.path}`,
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, index, 2, 3, 4]),
      ]),
    );
    const bundle: CasprojBundle = {
      project: flippedProject,
      assets: [flipped],
      files: [...bytesByPath].map(([path, bytes]) => ({ path, bytes })),
    };

    const exported = await exportCasproj(bundle);
    const imported = await importCasproj(exported);

    expect(imported.appliedMigrations).toEqual([]);
    expect(imported.bundle.project).toEqual(flippedProject);
    expect(imported.bundle.assets).toEqual([flipped]);
    expect(imported.bundle.files).toEqual(bundle.files);
    for (const file of imported.bundle.files) {
      expect(file.bytes).toEqual(bytesByPath.get(file.path));
    }
  });

  it('Part構成レイヤー差し替えをversion・内部ID・画像bytesごとexact roundtripする', async () => {
    const replaced = replacePartLayerIds(
      asset,
      'part_body',
      ['layer_guide', 'layer_body'],
      new Date('2026-07-23T12:34:56.000Z'),
    );
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) {
      return;
    }
    const imageBytes = new Uint8Array([4, 3, 2, 1]);
    const bundle: CasprojBundle = {
      project,
      assets: [replaced.asset],
      files: replaced.asset.textures.map((texture) => ({
        path: `assets/${replaced.asset.id}/${texture.path}`,
        bytes: imageBytes,
      })),
    };

    const exported = await exportCasproj(bundle);
    const imported = await importCasproj(exported);

    expect(imported.appliedMigrations).toEqual([]);
    expect(imported.bundle.assets).toEqual([replaced.asset]);
    expect(imported.bundle.assets[0].parts[0].layerIds).toEqual(['layer_body', 'layer_guide']);
    expect(imported.bundle.assets[0].version).toBe('0.2.0');
    expect(imported.bundle.files).toEqual(bundle.files);
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
      project: { ...project, assets: [] },
      assets: [],
      files: [{ path: '../evil.png', bytes: new Uint8Array([1]) }],
    };
    await expect(exportCasproj(bundle)).rejects.toThrow(/パスが不正です/);
  });

  it('読み込み時に危険なパスのエントリがあればarchive全体を拒否する', async () => {
    const zipped = await zipAsync({
      'project.json': strToU8(JSON.stringify(project)),
      '../evil.png': new Uint8Array([1, 2, 3]),
    });
    await expect(importCasproj(zipped)).rejects.toMatchObject({ code: 'unsafe-input' });
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

  it('future versionのproject / asset / export presetsを理由付きで拒否する', async () => {
    const futureProject = await zipAsync({
      'project.json': strToU8(JSON.stringify({ ...project, version: '0.1.1' })),
    });
    await expect(importCasproj(futureProject)).rejects.toMatchObject({
      code: 'unsupported-version',
    });

    const futureAsset = await zipAsync({
      'project.json': strToU8(JSON.stringify(project)),
      [`assets/${asset.id}/asset.json`]: strToU8(JSON.stringify({ ...asset, version: '0.2.1' })),
    });
    await expect(importCasproj(futureAsset)).rejects.toMatchObject({
      code: 'unsupported-version',
    });
    await expect(importCasproj(futureAsset)).rejects.toThrow(/新しい形式/);

    const futurePresets = await zipAsync({
      'project.json': strToU8(JSON.stringify({ ...project, assets: [] })),
      'settings/export-presets.json': strToU8(JSON.stringify({ ...presets, version: '0.1.1' })),
    });
    await expect(importCasproj(futurePresets)).rejects.toMatchObject({
      code: 'unsupported-version',
    });
  });

  it('Project参照とAssetが不整合なbundleや予約済みfile pathの書き出しを拒否する', async () => {
    await expect(exportCasproj({ project, assets: [], files: [] })).rejects.toMatchObject({
      code: 'incomplete-bundle',
    });
    await expect(
      exportCasproj({
        project: { ...project, assets: [] },
        assets: [],
        files: [{ path: 'project.json', bytes: new Uint8Array([1]) }],
      }),
    ).rejects.toMatchObject({ code: 'inconsistent-bundle' });
  });

  it('Family・recipe・fingerprint・standalone Asset・未知fieldを往復保持する（Slice A）', async () => {
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
      layers: Object.fromEntries(
        asset.layers.map((layer, index) => [layer.id, variant.layers[index]?.id ?? layer.id]),
      ),
    };
    linked.recipe.writeSet = {
      ...createFamilyVariantWriteSet(),
      layers: variant.layers.map((layer) => layer.id),
    };
    (linked.recipe.writeSet as unknown as Record<string, unknown>).futureSelector = {
      preserved: true,
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
          id: 'family_hero',
          name: 'Hero',
          baseAssetId: asset.id,
          variants: [linked],
          futureFamilyField: { preserved: true },
        },
      ],
      futureProjectField: { preserved: true },
    } as unknown as Project;
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const familyBundle: CasprojBundle = {
      project: familyProject,
      assets: [asset, variant, standalone],
      files: [asset, variant, standalone].flatMap((item) =>
        item.textures.map((texture) => ({
          path: `assets/${item.id}/${texture.path}`,
          bytes: imageBytes,
        })),
      ),
    };

    const exported = await exportCasproj(familyBundle);
    const imported = await importCasproj(exported);

    expect(imported.bundle.project).toEqual(familyProject);
    expect(imported.bundle.project.families).toEqual(familyProject.families);
    expect(imported.bundle.project.assets.map((entry) => entry.id)).toContain(standalone.id);
    expect(
      (imported.bundle.project as unknown as Record<string, unknown>).futureProjectField,
    ).toEqual({ preserved: true });
  });

  it('欠落Family参照をexport / import境界でinconsistent-bundleとして拒否する', async () => {
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
    const completeFiles = asset.textures.map((texture) => ({
      path: `assets/${asset.id}/${texture.path}`,
      bytes: new Uint8Array([1, 2, 3]),
    }));

    await expect(
      exportCasproj({ project: invalidProject, assets: [asset], files: completeFiles }),
    ).rejects.toMatchObject({ code: 'inconsistent-bundle' });

    const zipped = await zipAsync({
      'project.json': strToU8(JSON.stringify(invalidProject)),
      [`assets/${asset.id}/asset.json`]: strToU8(JSON.stringify(asset)),
    });
    await expect(importCasproj(zipped)).rejects.toMatchObject({ code: 'inconsistent-bundle' });
  });
});
