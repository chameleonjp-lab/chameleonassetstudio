import { describe, expect, it } from 'vitest';
import characterAsset from '../../core/samples/asset.character.json';
import type { Asset } from '../../core/model';
import {
  formatReadonlyGameAttribute,
  gameAttributeTypeLabel,
  isEditableGameAttribute,
  retainedTypeSettings,
} from './gameDataSafety';

const baseAsset = characterAsset as unknown as Asset;

describe('game data safety', () => {
  it('文字列と有限数値だけを通常編集対象にする', () => {
    expect(isEditableGameAttribute('value')).toBe(true);
    expect(isEditableGameAttribute(0)).toBe(true);
    expect(isEditableGameAttribute(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isEditableGameAttribute(false)).toBe(false);
    expect(isEditableGameAttribute(null)).toBe(false);
    expect(isEditableGameAttribute([])).toBe(false);
    expect(isEditableGameAttribute({ nested: true })).toBe(false);
  });

  it('構造値、boolean、nullを型付きJSON表示へ整形する', () => {
    expect(gameAttributeTypeLabel(['a'])).toBe('array');
    expect(gameAttributeTypeLabel({ nested: true })).toBe('object');
    expect(gameAttributeTypeLabel(false)).toBe('boolean');
    expect(gameAttributeTypeLabel(null)).toBe('null');
    expect(formatReadonlyGameAttribute({ nested: [1, true] })).toBe(
      '{\n  "nested": [\n    1,\n    true\n  ]\n}',
    );
    expect(formatReadonlyGameAttribute(null)).toBe('null');
  });

  it('現在種別と一致しない設定を全Layer分含めて列挙する', () => {
    const asset: Asset = {
      ...baseAsset,
      assetType: 'item',
      tile: { tileSize: { width: 32, height: 32 }, collisionType: 'solid', visualType: 'floor' },
      gimmick: { movementPreset: 'horizontal' },
      effect: { effectType: 'spark', durationMs: 500, loop: false, blendMode: 'normal' },
      layers: baseAsset.layers.map((layer, index) => ({
        ...layer,
        background:
          index < 2
            ? { role: 'mid', parallaxSpeed: { x: index, y: 0 }, loopX: true, loopY: false }
            : undefined,
      })),
    };

    const retained = retainedTypeSettings(asset);
    expect(retained.map((setting) => setting.kind)).toEqual([
      'tile',
      'gimmick',
      'effect',
      'background',
      'background',
    ]);
    expect(
      retained.filter((setting) => setting.kind === 'background').map((setting) => setting.label),
    ).toEqual(['背景設定（レイヤー: body）', '背景設定（レイヤー: guide）']);
  });
});
