import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import effectAsset from '../samples/asset.effect.json';
import minimalAsset from '../samples/asset.minimal.json';
import exportPresets from '../samples/export-presets.sample.json';
import sampleProject from '../samples/project.sample.json';
import {
  createFamilyVariantIdMap,
  createFamilyVariantWriteSet,
  createLinkedMirrorVariant,
} from '../model/familyTestFixtures';
import {
  validateAnimation,
  validateAsset,
  validateExportPresets,
  validateProject,
} from './validate';

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('validateAsset', () => {
  it('最小サンプル asset が検証を通る', () => {
    const result = validateAsset(minimalAsset);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('フルサンプル asset（レイヤー、アンカー、当たり判定、アニメーション付き）が検証を通る', () => {
    const result = validateAsset(characterAsset);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('id が無い asset は検証で落ちる', () => {
    const broken = clone(minimalAsset) as Record<string, unknown>;
    delete broken.id;
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('id');
  });

  it('version が無い asset は検証で落ちる', () => {
    const broken = clone(minimalAsset) as Record<string, unknown>;
    delete broken.version;
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('version');
  });

  it('不正な assetType は検証で落ちる', () => {
    const broken = clone(minimalAsset) as Record<string, unknown>;
    broken.assetType = 'spaceship';
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/assetType');
  });

  it('canvasSize の width が 0 以下なら検証で落ちる', () => {
    const broken = clone(minimalAsset);
    broken.canvasSize.width = 0;
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/canvasSize/width');
  });

  it('rect 判定なのに rect が無い collider は検証で落ちる', () => {
    const broken = clone(characterAsset) as {
      colliders: Array<Record<string, unknown>>;
    };
    delete broken.colliders[0].rect;
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/colliders/0');
  });

  it('opacity が 1 を超えるレイヤーは検証で落ちる', () => {
    const broken = clone(characterAsset);
    broken.layers[0].opacity = 2;
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/layers/0/opacity');
  });

  it('未対応の追加プロパティがあっても検証エラーにしない', () => {
    const extended = clone(minimalAsset) as Record<string, unknown>;
    extended.futureFeature = { bones: [] };
    const result = validateAsset(extended);
    expect(result.valid).toBe(true);
  });

  it('オブジェクトでない値は検証で落ちる', () => {
    expect(validateAsset(null).valid).toBe(false);
    expect(validateAsset('asset').valid).toBe(false);
  });

  it('background 設定付き layer / tile 設定付き asset / gimmick 設定付き asset が検証を通る', () => {
    const backgroundLayer = clone(minimalAsset) as Record<string, unknown>;
    backgroundLayer.layers = [
      {
        id: 'layer_1',
        name: '遠景',
        layerType: 'image',
        textureId: 'tex_1',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
        background: {
          role: 'far',
          parallaxSpeed: { x: 0.2, y: 0 },
          loopX: true,
          loopY: false,
        },
      },
    ];
    expect(validateAsset(backgroundLayer).valid).toBe(true);

    const tileAsset = clone(minimalAsset) as Record<string, unknown>;
    tileAsset.assetType = 'tile';
    tileAsset.tile = {
      tileSize: { width: 32, height: 32 },
      collisionType: 'solid',
      visualType: 'floor',
    };
    expect(validateAsset(tileAsset).valid).toBe(true);

    const gimmickAsset = clone(minimalAsset) as Record<string, unknown>;
    gimmickAsset.assetType = 'gimmick';
    gimmickAsset.gimmick = { movementPreset: 'horizontal' };
    expect(validateAsset(gimmickAsset).valid).toBe(true);
  });

  it('effect サンプルが検証を通り、不正な blendMode は落ちる（Phase 17-C）', () => {
    expect(validateAsset(effectAsset).valid).toBe(true);

    const broken = clone(effectAsset) as Record<string, unknown>;
    (broken.effect as Record<string, unknown>).blendMode = 'multiply';
    const result = validateAsset(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('blendMode');
  });

  it('image レイヤーは textureId 必須、guide / shape は不要（Phase 15.5-C）', () => {
    const baseLayer = {
      id: 'layer_1',
      name: 'レイヤー',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
    };

    const imageNoTexture = clone(minimalAsset) as Record<string, unknown>;
    imageNoTexture.layers = [{ ...baseLayer, layerType: 'image' }];
    const result = validateAsset(imageNoTexture);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('textureId');

    const guideLayer = clone(minimalAsset) as Record<string, unknown>;
    guideLayer.layers = [{ ...baseLayer, layerType: 'guide' }];
    expect(validateAsset(guideLayer).valid).toBe(true);

    const shapeLayer = clone(minimalAsset) as Record<string, unknown>;
    shapeLayer.layers = [{ ...baseLayer, layerType: 'shape' }];
    expect(validateAsset(shapeLayer).valid).toBe(true);
  });

  it('不正な background.role / tile.collisionType は検証で落ちる', () => {
    const backgroundLayer = clone(minimalAsset) as Record<string, unknown>;
    backgroundLayer.layers = [
      {
        id: 'layer_1',
        name: '遠景',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
        background: {
          role: 'invalid_role',
          parallaxSpeed: { x: 0.2, y: 0 },
          loopX: true,
          loopY: false,
        },
      },
    ];
    const backgroundResult = validateAsset(backgroundLayer);
    expect(backgroundResult.valid).toBe(false);
    expect(backgroundResult.errors.join('\n')).toContain('/layers/0/background/role');

    const tileAsset = clone(minimalAsset) as Record<string, unknown>;
    tileAsset.assetType = 'tile';
    tileAsset.tile = {
      tileSize: { width: 32, height: 32 },
      collisionType: 'invalid_type',
      visualType: 'floor',
    };
    const tileResult = validateAsset(tileAsset);
    expect(tileResult.valid).toBe(false);
    expect(tileResult.errors.join('\n')).toContain('/tile/collisionType');
  });
});

describe('validateAnimation', () => {
  it('正しいアニメーションが検証を通る', () => {
    const result = validateAnimation(characterAsset.animations[0]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('fps が 0 のアニメーションは検証で落ちる', () => {
    const broken = clone(characterAsset.animations[0]);
    broken.fps = 0;
    const result = validateAnimation(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/fps');
  });

  it('loop が無いアニメーションは検証で落ちる', () => {
    const broken = clone(characterAsset.animations[0]) as Record<string, unknown>;
    delete broken.loop;
    const result = validateAnimation(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('loop');
  });
});

describe('validateProject', () => {
  it('サンプル project が検証を通る', () => {
    const result = validateProject(sampleProject);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('format が違う project は検証で落ちる', () => {
    const broken = clone(sampleProject) as Record<string, unknown>;
    broken.format = 'other-format';
    const result = validateProject(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('/format');
  });

  it('linked mirrorはrecipe・write-set・fingerprintを含めると検証を通る', () => {
    const project = clone(sampleProject) as Record<string, unknown>;
    const assets = project.assets as Array<Record<string, unknown>>;
    const base = assets[0];
    assets.push({ ...base, id: 'asset_variant', name: 'variant', displayName: 'Variant' });
    project.families = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: base.id,
        variants: [createLinkedMirrorVariant('asset_variant')],
      },
    ];

    expect(validateProject(project)).toEqual({ valid: true, errors: [] });
  });

  it('linked variantのrecipe / fingerprint欠落とmanualへの混入を拒否する', () => {
    const makeProject = (variant: Record<string, unknown>): Record<string, unknown> => {
      const project = clone(sampleProject) as Record<string, unknown>;
      const assets = project.assets as Array<Record<string, unknown>>;
      const base = assets[0];
      assets.push({ ...base, id: 'asset_variant', name: 'variant', displayName: 'Variant' });
      project.families = [
        {
          id: 'family_hero',
          name: 'Hero',
          baseAssetId: base.id,
          variants: [variant],
        },
      ];
      return project;
    };

    expect(
      validateProject(makeProject({ assetId: 'asset_variant', kind: 'linked-mirror' })).valid,
    ).toBe(false);
    expect(
      validateProject(
        makeProject({
          assetId: 'asset_variant',
          kind: 'manual',
          recipe: createLinkedMirrorVariant('asset_variant').recipe,
        }),
      ).valid,
    ).toBe(false);
    expect(
      validateProject(
        makeProject({
          assetId: 'asset_variant',
          kind: 'manual',
          fingerprint: createLinkedMirrorVariant('asset_variant').fingerprint,
        }),
      ).valid,
    ).toBe(false);
  });

  it('paletteは対象layer・置換・0〜255 toleranceを要求する', () => {
    const project = clone(sampleProject) as Record<string, unknown>;
    const assets = project.assets as Array<Record<string, unknown>>;
    const base = assets[0];
    assets.push({ ...base, id: 'asset_variant', name: 'variant', displayName: 'Variant' });
    const variant = {
      assetId: 'asset_variant',
      kind: 'linked-palette',
      recipe: {
        type: 'palette',
        idMap: createFamilyVariantIdMap(),
        baseLayerIds: ['layer_base'],
        writeSet: { ...createFamilyVariantWriteSet(), blobPaths: ['textures/main.png'] },
        replacements: [{ from: '#112233', to: '#aabbccdd' }],
        tolerance: 255,
      },
      fingerprint: createLinkedMirrorVariant('asset_variant').fingerprint,
    };
    project.families = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: base.id,
        variants: [variant],
      },
    ];

    expect(validateProject(project).valid).toBe(true);

    const tooWide = clone(project) as Record<string, unknown>;
    const tooWideRecipe = (
      (tooWide.families as Array<Record<string, unknown>>)[0].variants as Array<
        Record<string, unknown>
      >
    )[0].recipe as Record<string, unknown>;
    tooWideRecipe.tolerance = 256;
    expect(validateProject(tooWide).valid).toBe(false);

    const noTargets = clone(project) as Record<string, unknown>;
    const noTargetsRecipe = (
      (noTargets.families as Array<Record<string, unknown>>)[0].variants as Array<
        Record<string, unknown>
      >
    )[0].recipe as Record<string, unknown>;
    noTargetsRecipe.baseLayerIds = [];
    noTargetsRecipe.replacements = [];
    expect(validateProject(noTargets).valid).toBe(false);
  });

  it('mirrorへのpalette専用field、空idMap key、write-set重複を拒否し、未知fieldは保持可能にする', () => {
    const project = clone(sampleProject) as Record<string, unknown>;
    const assets = project.assets as Array<Record<string, unknown>>;
    const base = assets[0];
    assets.push({ ...base, id: 'asset_variant', name: 'variant', displayName: 'Variant' });
    const variant = createLinkedMirrorVariant('asset_variant') as unknown as Record<
      string,
      unknown
    >;
    project.families = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: base.id,
        variants: [variant],
        futureFamilyField: { preserved: true },
      },
    ];
    project.futureProjectField = { preserved: true };
    expect(validateProject(project).valid).toBe(true);

    const mirrorWithPaletteFields = clone(project) as Record<string, unknown>;
    const mirrorRecipe = (
      (mirrorWithPaletteFields.families as Array<Record<string, unknown>>)[0].variants as Array<
        Record<string, unknown>
      >
    )[0].recipe as Record<string, unknown>;
    mirrorRecipe.replacements = [{ from: '#000000', to: '#ffffff' }];
    expect(validateProject(mirrorWithPaletteFields).valid).toBe(false);

    const invalidIds = clone(project) as Record<string, unknown>;
    const invalidRecipe = (
      (invalidIds.families as Array<Record<string, unknown>>)[0].variants as Array<
        Record<string, unknown>
      >
    )[0].recipe as Record<string, unknown>;
    (invalidRecipe.idMap as Record<string, Record<string, string>>).layers = { '': 'target' };
    (invalidRecipe.writeSet as Record<string, string[]>).layers = ['target', 'target'];
    expect(validateProject(invalidIds).valid).toBe(false);
  });
});

describe('validateExportPresets', () => {
  it('サンプル export presets が検証を通る', () => {
    const result = validateExportPresets(exportPresets);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('scale が 0 のプリセットは検証で落ちる', () => {
    const broken = clone(exportPresets);
    broken.presets[0].scale = 0;
    const result = validateExportPresets(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('scale');
  });
});
