import { describe, expect, it } from 'vitest';
import { validateAsset } from '../schema/validate';
import { ASSET_TYPES } from './asset';
import {
  ASSET_CREATION_TEMPLATES,
  assetCreationTemplatesForType,
  createBlankAsset,
  defaultAssetCreationTemplateId,
  type AssetCreationTemplateId,
} from './factories';

describe('新規作成template（2D-2-CREATE A+B+X）', () => {
  it.each(ASSET_TYPES)('%s は blank と自型starterだけを選べる', (assetType) => {
    const templates = assetCreationTemplatesForType(assetType);
    expect(templates.map((template) => template.id)).toContain('blank');
    expect(
      templates.every(
        (template) => template.assetType === null || template.assetType === assetType,
      ),
    ).toBe(true);
  });

  it('character は既存starter、他型は blank が既定になる', () => {
    expect(defaultAssetCreationTemplateId('character')).toBe('character-basic');
    for (const assetType of ASSET_TYPES.filter((type) => type !== 'character')) {
      expect(defaultAssetCreationTemplateId(assetType)).toBe('blank');
    }
  });

  it('character blank はcolliderとPartを無断追加しない', () => {
    const asset = createBlankAsset({
      name: 'blank_character',
      assetType: 'character',
      canvasSize: { width: 64, height: 64 },
      templateId: 'blank',
    });
    expect(asset.colliders).toEqual([]);
    expect(asset.parts).toEqual([]);
  });

  it('character-basic はbody colliderを追加し、body Partは明示時だけ追加する', () => {
    const withoutPart = createBlankAsset({
      name: 'character_without_part',
      assetType: 'character',
      canvasSize: { width: 64, height: 96 },
      templateId: 'character-basic',
    });
    expect(withoutPart.colliders.map((collider) => collider.purpose)).toEqual(['body']);
    expect(withoutPart.parts).toEqual([]);

    const withPart = createBlankAsset({
      name: 'character_with_part',
      assetType: 'character',
      canvasSize: { width: 64, height: 96 },
      templateId: 'character-basic',
      createCharacterBodyPart: true,
    });
    expect(withPart.parts).toHaveLength(1);
    expect(withPart.parts[0]).toMatchObject({
      name: 'body',
      partType: 'body',
      layerIds: [withPart.layers[0].id],
    });
    expect(withPart.parts[0].parentId).toBeUndefined();
    expect(withPart.parts[0].bindPose).toBeUndefined();
  });

  it.each([
    ['item', 'item-pickup'],
    ['background', 'background-loop'],
    ['tile', 'tile-floor'],
    ['gimmick', 'gimmick-platform'],
    ['effect', 'effect-spark'],
  ] as const)('%s starterは現行schemaの通常フィールドだけを作る', (assetType, templateId) => {
    const asset = createBlankAsset({
      name: `${assetType}_starter`,
      assetType,
      canvasSize: { width: 128, height: 64 },
      templateId,
    });
    expect(validateAsset(asset).valid).toBe(true);
    expect(asset).not.toHaveProperty('templateId');

    if (assetType === 'item') {
      expect(asset.colliders.some((collider) => collider.purpose === 'pickup')).toBe(true);
      expect(asset.tags).toContain('item');
    } else if (assetType === 'background') {
      expect(asset.layers[0].background).toMatchObject({ loopX: true, role: 'mid' });
    } else if (assetType === 'tile') {
      expect(asset.tile).toEqual({
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      });
    } else if (assetType === 'gimmick') {
      expect(asset.gimmick).toEqual({ movementPreset: 'none' });
      expect(asset.tags).toContain('platform');
      expect(asset.colliders.some((collider) => collider.purpose === 'body')).toBe(true);
    } else {
      expect(asset.effect).toEqual({
        effectType: 'spark',
        durationMs: 500,
        loop: false,
        blendMode: 'normal',
      });
    }
  });

  it('別のAsset type用starterは拒否する', () => {
    expect(() =>
      createBlankAsset({
        name: 'wrong_template',
        assetType: 'item',
        canvasSize: { width: 64, height: 64 },
        templateId: 'tile-floor',
      }),
    ).toThrow('item アセットには適用できません');
  });

  it('body Part要求はcharacter-basic以外で拒否する', () => {
    expect(() =>
      createBlankAsset({
        name: 'invalid_part',
        assetType: 'character',
        canvasSize: { width: 64, height: 64 },
        templateId: 'blank',
        createCharacterBodyPart: true,
      }),
    ).toThrow('body Part');
  });

  it('fixture IDは重複しない', () => {
    const ids = ASSET_CREATION_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全fixture IDがAssetCreationTemplateIdとして利用できる', () => {
    const ids: AssetCreationTemplateId[] = ASSET_CREATION_TEMPLATES.map((template) => template.id);
    expect(ids).toHaveLength(7);
  });
});
