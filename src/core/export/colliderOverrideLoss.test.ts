import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from '../model';
import {
  ColliderOverrideExportLossError,
  assertColliderOverrideExportSafe,
  findColliderOverrideExportLosses,
  formatColliderOverrideExportLosses,
} from './colliderOverrideLoss';

function fixture(): Asset {
  return structuredClone(characterAsset) as unknown as Asset;
}

describe('Frame collider overrideのAtlas loss Gate', () => {
  it('field不在と空配列は拒否しない', () => {
    const absent = fixture();
    expect(findColliderOverrideExportLosses(absent)).toEqual([]);
    expect(() => assertColliderOverrideExportSafe(absent)).not.toThrow();

    absent.frames![0].colliderOverrides = [];
    expect(findColliderOverrideExportLosses(absent)).toEqual([]);
    expect(() => assertColliderOverrideExportSafe(absent)).not.toThrow();
  });

  it('Frame・collider・失われる情報と安全な代替形式を理由に含める', () => {
    const asset = fixture();
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        visible: false,
      },
    ];
    const losses = findColliderOverrideExportLosses(asset);
    expect(losses).toEqual([
      expect.objectContaining({
        frameId: 'frame_idle_0',
        frameName: 'idle_0',
        colliderIds: ['col_body'],
        colliderNames: ['body'],
        fields: ['位置・サイズ（rect）', 'Frame別表示状態'],
      }),
    ]);
    const message = formatColliderOverrideExportLosses(losses);
    expect(message).toContain('frame_idle_0');
    expect(message).toContain('col_body');
    expect(message).toContain('Frame別の当たり判定情報');
    expect(message).toContain('asset.json');
    expect(message).toContain('.casproj');
    expect(() => assertColliderOverrideExportSafe(asset)).toThrow(ColliderOverrideExportLossError);
  });
});
