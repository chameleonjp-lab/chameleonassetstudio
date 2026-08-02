import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from './asset';
import type { FrameColliderOverride } from './animation';
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
  it('canonical型はrect / circle / visible-onlyを排他的に表す', () => {
    const visibleOnly: FrameColliderOverride = { colliderId: 'col_body', visible: false };
    // @ts-expect-error recognized override fieldなしはcanonical型ではない
    const missingRecognizedField: FrameColliderOverride = { colliderId: 'col_body' };
    // @ts-expect-error rectとcircleの同居はcanonical型ではない
    const mixedGeometry: FrameColliderOverride = {
      colliderId: 'col_body',
      rect: { x: 1, y: 2, width: 3, height: 4 },
      circle: { x: 1, y: 2, radius: 3 },
    };
    expect(visibleOnly.visible).toBe(false);
    expect(missingRecognizedField.colliderId).toBe('col_body');
    expect(mixedGeometry.colliderId).toBe('col_body');
  });

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

  it('circleを完全形で作り、shape不一致のgeometryは理由付きで拒否する', () => {
    const asset = fixture();
    const circle = setFrameColliderGeometry(asset, 'frame_idle_0', 'col_pickup', {
      x: 5,
      y: 6,
      radius: 7,
    });
    expect(circle.ok && circle.changed).toBe(true);
    if (!circle.ok) return;
    expect(findFrameColliderOverride(circle.asset.frames![0], 'col_pickup')).toEqual({
      colliderId: 'col_pickup',
      circle: { x: 5, y: 6, radius: 7 },
    });

    const mismatch = setFrameColliderGeometry(asset, 'frame_idle_0', 'col_body', {
      x: 5,
      y: 6,
      radius: 7,
    });
    expect(mismatch).toMatchObject({ ok: false, changed: false, code: 'shape-mismatch' });
    expect(mismatch.asset).toBe(asset);
  });

  it('未知geometryをdeep比較してsemantic no-opを抑止し、known値更新でもexact保持する', () => {
    const asset = fixture();
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          futureGeometry: { nested: ['exact', { keep: true }] },
        },
      },
    ];
    const noOp = setFrameColliderGeometry(asset, 'frame_idle_0', 'col_body', {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(noOp).toEqual({ ok: true, changed: false, asset });
    expect(noOp.asset).toBe(asset);

    const changed = setFrameColliderGeometry(asset, 'frame_idle_0', 'col_body', {
      x: 1,
      y: 2,
      width: 8,
      height: 4,
    });
    expect(changed.ok && changed.changed).toBe(true);
    if (!changed.ok) return;
    expect(changed.asset.frames![0].colliderOverrides![0]).toEqual({
      colliderId: 'col_body',
      rect: {
        x: 1,
        y: 2,
        width: 8,
        height: 4,
        futureGeometry: { nested: ['exact', { keep: true }] },
      },
    });
  });

  it('visible-onlyのhide/show/inheritとgeometryだけのresetをfield単位で扱う', () => {
    const asset = fixture();
    const hidden = setFrameColliderVisible(asset, 'frame_idle_0', 'col_body', false);
    expect(hidden.ok && hidden.changed).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.asset.frames![0].colliderOverrides).toEqual([
      { colliderId: 'col_body', visible: false },
    ]);

    const shown = setFrameColliderVisible(hidden.asset, 'frame_idle_0', 'col_body', true);
    expect(shown.ok && shown.changed).toBe(true);
    if (!shown.ok) return;
    expect(shown.asset.frames![0].colliderOverrides).toEqual([
      { colliderId: 'col_body', visible: true },
    ]);

    const inherited = setFrameColliderVisible(shown.asset, 'frame_idle_0', 'col_body', undefined);
    expect(inherited.ok && inherited.changed).toBe(true);
    if (!inherited.ok) return;
    expect(inherited.asset.frames![0]).not.toHaveProperty('colliderOverrides');

    const withGeometry = fixture();
    withGeometry.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        visible: false,
      },
    ];
    const geometryReset = resetFrameColliderGeometry(withGeometry, 'frame_idle_0', 'col_body');
    expect(geometryReset.ok && geometryReset.changed).toBe(true);
    if (!geometryReset.ok) return;
    expect(geometryReset.asset.frames![0].colliderOverrides).toEqual([
      { colliderId: 'col_body', visible: false },
    ]);
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
