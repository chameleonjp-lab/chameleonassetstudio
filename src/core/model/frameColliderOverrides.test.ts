import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from './asset';
import {
  findFrameColliderOverride,
  frameColliderReferenceReason,
  inspectFrameColliderOverrides,
  resetFrameColliderGeometry,
  resetFrameColliderOverride,
  resolveFrameColliders,
  setFrameColliderGeometry,
  setFrameColliderVisible,
} from './frameColliderOverrides';

function fixture(): Asset {
  return structuredClone(characterAsset) as unknown as Asset;
}

describe('Frame collider overrideの意味検証', () => {
  it('field不在と空配列をvalidとして入力を変更しない', () => {
    const absent = fixture();
    const before = structuredClone(absent);
    expect(inspectFrameColliderOverrides(absent)).toEqual({ valid: true, issues: [] });
    expect(absent).toEqual(before);

    absent.frames![0].colliderOverrides = [];
    expect(inspectFrameColliderOverrides(absent)).toEqual({ valid: true, issues: [] });
  });

  it.each([
    {
      name: 'Asset collider ID重複',
      mutate(asset: Asset) {
        asset.colliders.push(structuredClone(asset.colliders[0]));
      },
      code: 'asset-collider-id-duplicate',
      path: '/colliders/2/id',
    },
    {
      name: 'Frame参照重複',
      mutate(asset: Asset) {
        asset.frames![0].colliderOverrides = [
          { colliderId: 'col_body', visible: true },
          { colliderId: 'col_body', visible: false },
        ];
      },
      code: 'frame-override-collider-id-duplicate',
      path: '/frames/0/colliderOverrides/1/colliderId',
    },
    {
      name: '参照切れ',
      mutate(asset: Asset) {
        asset.frames![0].colliderOverrides = [{ colliderId: 'col_missing', visible: true }];
      },
      code: 'frame-override-dangling-collider',
      path: '/frames/0/colliderOverrides/0/colliderId',
    },
    {
      name: 'shape不一致',
      mutate(asset: Asset) {
        asset.frames![0].colliderOverrides = [
          { colliderId: 'col_body', circle: { x: 1, y: 2, radius: 3 } },
        ];
      },
      code: 'frame-override-shape-mismatch',
      path: '/frames/0/colliderOverrides/0/circle',
    },
    {
      name: '非有限値',
      mutate(asset: Asset) {
        asset.frames![0].colliderOverrides = [
          {
            colliderId: 'col_body',
            rect: { x: Number.NaN, y: 2, width: 3, height: 4 },
          },
        ];
      },
      code: 'frame-override-non-finite',
      path: '/frames/0/colliderOverrides/0/rect/x',
    },
    {
      name: '非正寸法',
      mutate(asset: Asset) {
        asset.frames![0].colliderOverrides = [
          { colliderId: 'col_pickup', circle: { x: 1, y: 2, radius: 0 } },
        ];
      },
      code: 'frame-override-non-positive-size',
      path: '/frames/0/colliderOverrides/0/circle/radius',
    },
  ])('$nameをstable code/pathで返す', ({ mutate, code, path }) => {
    const asset = fixture();
    mutate(asset);
    const before = structuredClone(asset);
    const result = inspectFrameColliderOverrides(asset);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code, path, colliderId: expect.any(String) }),
      ]),
    );
    expect(asset).toEqual(before);
  });
});

describe('Frame collider overrideのfallbackと編集', () => {
  it('geometryとvisibleを独立fallbackし、共通のidentity/shapeを維持する', () => {
    const asset = fixture();
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 10, y: 20, width: 30, height: 40, futureGeometry: 'keep' },
      },
      { colliderId: 'col_pickup', visible: true },
    ];
    const resolved = resolveFrameColliders(asset, 'frame_idle_0');
    expect(resolved[0]).toMatchObject({
      id: 'col_body',
      name: 'body',
      purpose: 'body',
      shape: 'rect',
      visible: true,
      rect: { x: 10, y: 20, width: 30, height: 40, futureGeometry: 'keep' },
    });
    expect(resolved[1]).toMatchObject({
      id: 'col_pickup',
      shape: 'circle',
      visible: true,
      circle: asset.colliders[1].shape === 'circle' ? asset.colliders[1].circle : {},
    });
  });

  it('初回geometry編集は完全形を作り、visibleと未知fieldを非破壊で編集する', () => {
    const asset = fixture();
    const geometry = { x: 1, y: 2, width: 3, height: 4 };
    const geometryResult = setFrameColliderGeometry(
      asset,
      'frame_idle_0',
      'col_body',
      geometry,
      new Date('2026-08-02T01:00:00.000Z'),
    );
    expect(geometryResult.ok && geometryResult.changed).toBe(true);
    if (!geometryResult.ok) return;
    expect(findFrameColliderOverride(geometryResult.asset.frames![0], 'col_body')).toEqual({
      colliderId: 'col_body',
      rect: geometry,
    });

    const entry = geometryResult.asset.frames![0].colliderOverrides![0];
    entry.future = { exact: true };
    entry.name = 'reserved-is-unknown';
    const hidden = setFrameColliderVisible(geometryResult.asset, 'frame_idle_0', 'col_body', false);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.asset.frames![0].colliderOverrides![0]).toMatchObject({
      visible: false,
      future: { exact: true },
      name: 'reserved-is-unknown',
    });
  });

  it('正規化後no-opでは同じ参照を返す', () => {
    const asset = fixture();
    asset.frames![0].colliderOverrides = [{ colliderId: 'col_body', visible: false }];
    const result = setFrameColliderVisible(asset, 'frame_idle_0', 'col_body', false);
    expect(result).toEqual({ ok: true, changed: false, asset });
    expect(result.asset).toBe(asset);
  });

  it('field resetで未知fieldだけが残る場合は拒否し、明示全解除だけが削除する', () => {
    const asset = fixture();
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        future: { exact: true },
      },
    ];
    const rejected = resetFrameColliderGeometry(asset, 'frame_idle_0', 'col_body');
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.code).toBe('unknown-fields-would-remain');
    expect(rejected.asset).toBe(asset);

    const cleared = resetFrameColliderOverride(asset, 'frame_idle_0', 'col_body');
    expect(cleared.ok && cleared.changed).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.asset.frames![0]).not.toHaveProperty('colliderOverrides');
  });

  it('参照中の共通colliderには理由を返す', () => {
    const asset = fixture();
    asset.frames![1].colliderOverrides = [{ colliderId: 'col_body', visible: false }];
    expect(frameColliderReferenceReason(asset, 'col_body')).toContain('idle_1');
    expect(frameColliderReferenceReason(asset, 'col_pickup')).toBeUndefined();
  });
});
