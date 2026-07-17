/**
 * 2D-2-VARIANT Slice A: F1+C1+V1+T1の永続契約fixture。
 * Family UIやrefresh処理ではなく、既存0.1.0互換・参照不変条件・独立copy境界を固定する。
 */
import { describe, expect, it } from 'vitest';
import { exportAssetJson } from '../export/exportAsset';
import characterAsset from '../samples/asset.character.json';
import sampleProject from '../samples/project.sample.json';
import type { Asset } from './asset';
import { duplicateAsset } from './duplicateAsset';
import type { AssetFamily, AssetFamilyVariant } from './family';
import { remapAssetFamilies, validateProjectFamilies } from './family';
import {
  createFamilyVariantIdMap,
  createFamilyVariantWriteSet,
  createLinkedMirrorVariant,
} from './familyTestFixtures';
import { flipCopyAsset } from './flipCopy';
import { migrateProject } from './migrate';
import { CURRENT_PROJECT_VERSION, type Project } from './project';

const baseAsset = characterAsset as unknown as Asset;

function projectWithFamily(): Project {
  const base = sampleProject as unknown as Project;
  return {
    ...base,
    assets: [
      { id: 'asset_base', name: 'base', displayName: 'Base', assetType: 'character' },
      { id: 'asset_variant', name: 'variant', displayName: 'Variant', assetType: 'character' },
      {
        id: 'asset_standalone',
        name: 'standalone',
        displayName: 'Standalone',
        assetType: 'item',
      },
    ],
    families: [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: 'asset_base',
        variants: [createLinkedMirrorVariant('asset_variant')],
      },
    ],
  };
}

describe('C1: 既存0.1.0とunknown fieldの恒等読込', () => {
  it('families不在のProjectをmigrationなし・version据え置き・unknown field保持で読む', () => {
    const legacy = {
      ...(sampleProject as unknown as Project),
      futureRoot: { owner: 'legacy-client' },
    };

    const migrated = migrateProject(legacy);

    expect(CURRENT_PROJECT_VERSION).toBe('0.1.0');
    expect(migrated.appliedMigrations).toEqual([]);
    expect(migrated.data).toEqual(legacy);
    expect(migrated.data.families).toBeUndefined();
    expect(migrated.data.futureRoot).toEqual({ owner: 'legacy-client' });
  });
});

describe('F1/V1: Family参照・linked recipe不変条件', () => {
  it('base + linked variant + standalone Assetの有効fixtureを受理する', () => {
    expect(validateProjectFamilies(projectWithFamily())).toEqual([]);
  });

  it('Project Asset ID重複、欠落参照、self reference、重複membershipを拒否する', () => {
    const valid = projectWithFamily();
    const duplicateAsset = {
      ...valid,
      assets: [...valid.assets, valid.assets[0]],
    };
    expect(validateProjectFamilies(duplicateAsset).join('\n')).toContain('同じAsset ID');

    const missingBase = structuredClone(valid);
    missingBase.families![0].baseAssetId = 'asset_missing';
    expect(validateProjectFamilies(missingBase).join('\n')).toContain('baseAssetId');

    const selfReference = structuredClone(valid);
    selfReference.families![0].variants = [createLinkedMirrorVariant('asset_base')];
    expect(validateProjectFamilies(selfReference).join('\n')).toContain('self reference');

    const duplicateMembership = structuredClone(valid);
    duplicateMembership.families!.push({
      id: 'family_other',
      name: 'Other',
      baseAssetId: 'asset_standalone',
      variants: [{ assetId: 'asset_variant', kind: 'manual' }],
    });
    expect(validateProjectFamilies(duplicateMembership).join('\n')).toContain('複数Family');

    const cycle = structuredClone(valid);
    cycle.families = [
      {
        id: 'family_a',
        name: 'A',
        baseAssetId: 'asset_base',
        variants: [{ assetId: 'asset_variant', kind: 'manual' }],
      },
      {
        id: 'family_b',
        name: 'B',
        baseAssetId: 'asset_variant',
        variants: [{ assetId: 'asset_base', kind: 'manual' }],
      },
    ];
    expect(validateProjectFamilies(cycle).join('\n')).toContain('複数Family');
  });

  it('family idの空文字列とProject内重複を拒否する（SHOULD-4）', () => {
    const valid = projectWithFamily();

    const emptyFamilyId = structuredClone(valid);
    emptyFamilyId.families![0].id = '';
    expect(validateProjectFamilies(emptyFamilyId).join('\n')).toContain('family idが空です');

    const duplicateFamilyId = structuredClone(valid);
    duplicateFamilyId.families!.push({
      id: duplicateFamilyId.families![0].id,
      name: 'Duplicate Hero',
      baseAssetId: 'asset_standalone',
      variants: [],
    });
    expect(validateProjectFamilies(duplicateFamilyId).join('\n')).toContain(
      'family idがProject内で重複しています',
    );
  });

  it('linkedのrecipe/fingerprint欠落とmanualのrecipe/fingerprint混入を拒否する', () => {
    const missingLinkedData = projectWithFamily();
    missingLinkedData.families![0].variants = [
      { assetId: 'asset_variant', kind: 'linked-mirror' } as unknown as AssetFamilyVariant,
    ];
    expect(validateProjectFamilies(missingLinkedData).join('\n')).toMatch(/recipe|fingerprint/);

    const manualWithLinkedData = projectWithFamily();
    manualWithLinkedData.families![0].variants = [
      {
        ...createLinkedMirrorVariant('asset_variant'),
        kind: 'manual',
      } as unknown as AssetFamilyVariant,
    ];
    const errors = validateProjectFamilies(manualWithLinkedData).join('\n');
    expect(errors).toContain('recipeを持てません');
    expect(errors).toContain('fingerprintを持てません');
  });

  it('idMap targetとwrite-set内の重複を拒否する', () => {
    const project = projectWithFamily();
    const variant = project.families![0].variants[0];
    if (variant.kind !== 'linked-mirror') {
      throw new Error('fixture kind mismatch');
    }
    variant.recipe.idMap.layers = { base_layer_a: 'variant_layer', base_layer_b: 'variant_layer' };
    variant.recipe.writeSet.layers = ['variant_layer', 'variant_layer'];

    const errors = validateProjectFamilies(project).join('\n');
    expect(errors).toContain('idMap.layers');
    expect(errors).toContain('writeSet.layers');
  });
});

describe('.casproj import用Family Asset ID remap', () => {
  it('Asset参照だけを付け替え、内部ID・write-set・fingerprint・Family IDを保持する', () => {
    const idMap = createFamilyVariantIdMap();
    // 内部IDが偶然旧Asset IDと同じでもAsset ID名前空間として変換してはいけない。
    idMap.layers.asset_base = 'asset_variant';
    const writeSet = createFamilyVariantWriteSet();
    writeSet.layers = ['asset_variant'];
    const families: AssetFamily[] = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: 'asset_base',
        variants: [
          {
            ...createLinkedMirrorVariant('asset_variant'),
            recipe: { type: 'mirror' as const, idMap, writeSet },
          },
        ],
      },
    ];

    const remapped = remapAssetFamilies(
      families,
      new Map([
        ['asset_base', 'asset_copy_1'],
        ['asset_variant', 'asset_copy_2'],
      ]),
    );

    expect(remapped[0]).toMatchObject({
      id: 'family_hero',
      baseAssetId: 'asset_copy_1',
      variants: [{ assetId: 'asset_copy_2' }],
    });
    const variant = remapped[0].variants[0];
    expect(variant.kind).toBe('linked-mirror');
    if (variant.kind === 'linked-mirror') {
      expect(variant.recipe.idMap.layers).toEqual({ asset_base: 'asset_variant' });
      expect(variant.recipe.writeSet.layers).toEqual(['asset_variant']);
      expect(variant.fingerprint).toEqual(families[0].variants[0].fingerprint);
    }
    expect(remapped).not.toBe(families);
  });

  it('assetIdMapに対応が無い参照IDは黙って残さずthrowする（NOTE-1）', () => {
    const families: AssetFamily[] = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: 'asset_base',
        variants: [{ assetId: 'asset_variant', kind: 'manual' }],
      },
    ];

    expect(() =>
      remapAssetFamilies(families, new Map([['asset_base', 'asset_copy_1']])),
    ).toThrow(/asset_variant/);
  });
});

describe('T1: 既存copyとproduct exportの独立境界', () => {
  it('duplicate / flip copyをFamilyへ自動登録せず、asset.jsonへFamily metadataを出さない', async () => {
    const project = projectWithFamily();
    const familiesBefore = structuredClone(project.families);
    const duplicate = duplicateAsset(baseAsset, { now: new Date('2026-07-17T00:00:00.000Z') });
    const flipped = flipCopyAsset(baseAsset, { now: new Date('2026-07-17T00:00:00.000Z') });

    expect(duplicate.id).not.toBe(baseAsset.id);
    expect(flipped.id).not.toBe(baseAsset.id);
    expect(project.families).toEqual(familiesBefore);
    expect(project.families?.some((family) => family.baseAssetId === duplicate.id)).toBe(false);
    expect(project.families?.some((family) => family.baseAssetId === flipped.id)).toBe(false);

    const exported = JSON.parse(await exportAssetJson(duplicate).text()) as Record<string, unknown>;
    expect(exported.families).toBeUndefined();
    expect(exported.familyId).toBeUndefined();
  });
});
