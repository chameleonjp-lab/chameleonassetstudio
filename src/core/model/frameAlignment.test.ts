import { describe, expect, it } from 'vitest';
import type { Asset } from './asset';
import {
  applyFrameAlignment,
  frameAlignmentFrameCandidates,
  inspectFrameAlignment,
  previewFrameAlignment,
  type FrameAlignmentSelection,
} from './frameAlignment';

function completeAsset(): Asset {
  return {
    format: 'chameleon-asset',
    version: '0.2.0',
    id: 'asset_alignment',
    assetType: 'character',
    name: 'alignment',
    displayName: '位置合わせ',
    canvasSize: { width: 64, height: 64 },
    origin: { x: 32, y: 64 },
    textures: [],
    layers: [
      {
        id: 'layer_body',
        name: 'body',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      },
      {
        id: 'layer_guide',
        name: 'guide',
        layerType: 'guide',
        visible: false,
        locked: true,
        opacity: 0.5,
        transform: {
          position: { x: 2, y: 3 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      },
    ],
    parts: [],
    anchors: [],
    colliders: [],
    frames: [
      {
        id: 'frame_reference',
        name: 'same-name',
        layerStates: [
          {
            layerId: 'layer_body',
            visible: true,
            opacity: 1,
            transform: {
              position: { x: 10, y: 20 },
              scale: { x: 1, y: 1 },
              rotation: 0,
            },
          },
          {
            layerId: 'layer_guide',
            visible: false,
            opacity: 0.5,
            transform: {
              position: { x: 12, y: 23 },
              scale: { x: 1, y: 1 },
              rotation: 0,
            },
          },
        ],
      },
      {
        id: 'frame_target',
        name: 'same-name',
        durationMs: 80,
        layerStates: [
          {
            layerId: 'layer_body',
            visible: true,
            opacity: 0.8,
            transform: {
              position: { x: 30.25, y: 40.5 },
              scale: { x: -1, y: 1.5 },
              rotation: 12,
            },
          },
          {
            layerId: 'layer_guide',
            visible: false,
            opacity: 0.25,
            transform: {
              position: { x: -5, y: 70 },
              scale: { x: 0.5, y: 2 },
              rotation: -8,
            },
          },
        ],
      },
      {
        id: 'frame_other',
        name: 'other',
        layerStates: [
          {
            layerId: 'layer_body',
            transform: {
              position: { x: 1, y: 2 },
              scale: { x: 1, y: 1 },
              rotation: 0,
            },
          },
          {
            layerId: 'layer_guide',
            transform: {
              position: { x: 3, y: 4 },
              scale: { x: 1, y: 1 },
              rotation: 0,
            },
          },
        ],
      },
    ],
    animations: [
      {
        id: 'animation_selected',
        name: 'selected',
        fps: 12,
        loop: true,
        frameIds: ['frame_reference', 'frame_target', 'frame_reference', 'missing'],
        events: [
          {
            id: 'event_keep',
            name: 'keep',
            frameId: 'frame_target',
            payload: { power: 2 },
          },
        ],
      },
      {
        id: 'animation_shared',
        name: 'shared',
        fps: 8,
        loop: false,
        frameIds: ['frame_target', 'frame_other', 'frame_target'],
      },
    ],
    tags: ['keep'],
    gameAttributes: { future: true },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function selection(patch: Partial<FrameAlignmentSelection> = {}): FrameAlignmentSelection {
  return {
    assetId: 'asset_alignment',
    animationId: 'animation_selected',
    referenceFrameId: 'frame_reference',
    targetFrameId: 'frame_target',
    ...patch,
  };
}

describe('frameAlignmentFrameCandidates', () => {
  it('実在Frameだけを最初の出現順で重複除去する', () => {
    expect(frameAlignmentFrameCandidates(completeAsset(), 'animation_selected')).toEqual({
      ok: true,
      value: [
        { id: 'frame_reference', name: 'same-name', firstOccurrenceIndex: 0 },
        { id: 'frame_target', name: 'same-name', firstOccurrenceIndex: 1 },
      ],
    });
  });

  it('選択Animation IDの不在と重複を理由付きで拒否する', () => {
    const source = completeAsset();
    expect(frameAlignmentFrameCandidates(source, 'missing')).toMatchObject({
      ok: false,
      code: 'animation-not-unique',
    });
    source.animations.push({ ...source.animations[0] });
    expect(frameAlignmentFrameCandidates(source, 'animation_selected')).toMatchObject({
      ok: false,
      code: 'animation-not-unique',
    });
  });
});

describe('inspectFrameAlignment', () => {
  it('共有FrameのAnimation数と総出現数をFrame ID単位で数える', () => {
    expect(inspectFrameAlignment(completeAsset(), selection())).toMatchObject({
      ok: true,
      value: {
        impact: { animationCount: 2, occurrenceCount: 3 },
      },
    });
  });

  it.each([
    ['別Assetへ切替', selection({ assetId: 'other' }), 'asset-changed'],
    ['Animation外Frame', selection({ targetFrameId: 'frame_other' }), 'frame-not-in-animation'],
    ['同一Frame', selection({ targetFrameId: 'frame_reference' }), 'same-frame'],
  ])('%sを拒否する', (_label, targetSelection, code) => {
    expect(inspectFrameAlignment(completeAsset(), targetSelection)).toMatchObject({
      ok: false,
      code,
    });
  });

  it('選択した基準・対象Frame IDの重複を拒否する', () => {
    const referenceDuplicate = completeAsset();
    referenceDuplicate.frames!.push({ ...referenceDuplicate.frames![0] });
    expect(inspectFrameAlignment(referenceDuplicate, selection())).toMatchObject({
      ok: false,
      code: 'frame-not-unique',
    });

    const targetDuplicate = completeAsset();
    targetDuplicate.frames!.push({ ...targetDuplicate.frames![1] });
    expect(inspectFrameAlignment(targetDuplicate, selection())).toMatchObject({
      ok: false,
      code: 'frame-not-unique',
    });
  });

  it('Layer 0件とAsset Layer ID重複を拒否する', () => {
    const noLayers = completeAsset();
    noLayers.layers = [];
    expect(inspectFrameAlignment(noLayers, selection())).toMatchObject({
      ok: false,
      code: 'no-layers',
    });

    const duplicate = completeAsset();
    duplicate.layers.push({ ...duplicate.layers[0] });
    expect(inspectFrameAlignment(duplicate, selection())).toMatchObject({
      ok: false,
      code: 'duplicate-layer-id',
    });
  });

  it.each([
    [
      'LayerState欠落',
      (asset: Asset) => {
        asset.frames![1].layerStates.pop();
      },
      'missing-layer-state',
    ],
    [
      'LayerState重複',
      (asset: Asset) => {
        asset.frames![1].layerStates.push({ ...asset.frames![1].layerStates[0] });
      },
      'duplicate-layer-state',
    ],
    [
      '存在しないLayer参照',
      (asset: Asset) => {
        asset.frames![1].layerStates[0].layerId = 'layer_missing';
      },
      'unknown-layer-state',
    ],
    [
      'transform欠落',
      (asset: Asset) => {
        delete asset.frames![1].layerStates[0].transform;
      },
      'invalid-transform',
    ],
    [
      'position非有限',
      (asset: Asset) => {
        asset.frames![1].layerStates[0].transform!.position.x = Number.NaN;
      },
      'invalid-transform',
    ],
    [
      'scale非有限',
      (asset: Asset) => {
        asset.frames![1].layerStates[0].transform!.scale.y = Number.POSITIVE_INFINITY;
      },
      'invalid-transform',
    ],
    [
      'rotation非有限',
      (asset: Asset) => {
        asset.frames![1].layerStates[0].transform!.rotation = Number.NEGATIVE_INFINITY;
      },
      'invalid-transform',
    ],
  ])('%sを理由付きで拒否する', (_label, mutate, code) => {
    const source = completeAsset();
    mutate(source);
    expect(inspectFrameAlignment(source, selection())).toMatchObject({
      ok: false,
      code,
    });
  });
});

describe('previewFrameAlignment / applyFrameAlignment', () => {
  it('previewは入力AssetとupdatedAtを変えず、基準を半透明表示用・対象を移動表示用に派生する', () => {
    const source = completeAsset();
    const before = structuredClone(source);
    const result = previewFrameAlignment(source, selection(), { x: 2.5, y: -3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(source).toEqual(before);
    expect(result.value.targetAsset.updatedAt).toBe(source.updatedAt);
    expect(result.value.referenceAsset.layers.map((layer) => layer.transform.position)).toEqual([
      { x: 10, y: 20 },
      { x: 12, y: 23 },
    ]);
    expect(result.value.targetAsset.layers.map((layer) => layer.transform.position)).toEqual([
      { x: 32.75, y: 37.5 },
      { x: -2.5, y: 67 },
    ]);
  });

  it('全対象positionへ同じ小数deltaを適用し、exact write-setと未知項目を保つ', () => {
    const source = completeAsset();
    const extended = source as Asset & { futureAssetField?: unknown };
    extended.futureAssetField = { preserved: true };
    const target = extended.frames![1] as NonNullable<typeof extended.frames>[number] & {
      futureFrameField?: unknown;
    };
    target.futureFrameField = { preserved: true };
    target.colliderOverrides = [
      {
        colliderId: 'future-collider-reference',
        rect: { x: 1, y: 2, width: 3, height: 4, futureGeometry: { preserved: true } },
        visible: false,
        futureEntry: { preserved: true },
      },
    ];
    (
      target.layerStates[0] as (typeof target.layerStates)[number] & { futureState?: unknown }
    ).futureState = { preserved: true };
    (
      target.layerStates[0].transform as NonNullable<
        (typeof target.layerStates)[number]['transform']
      > & { futureTransformField?: unknown }
    ).futureTransformField = { preserved: true };
    (
      target.layerStates[0].transform!
        .position as (typeof target.layerStates)[number]['transform'] extends
        { position: infer T } | undefined
        ? T & { futurePositionField?: unknown }
        : never
    ).futurePositionField = { preserved: true };
    const before = structuredClone(extended);
    const now = new Date('2026-07-30T00:00:00.000Z');

    const result = applyFrameAlignment(extended, selection(), { x: 2.5, y: -3 }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.changed).toBe(true);
    expect(extended).toEqual(before);

    const expected = structuredClone(before);
    expected.updatedAt = now.toISOString();
    expected.frames![1].layerStates[0].transform!.position = {
      ...expected.frames![1].layerStates[0].transform!.position,
      x: 32.75,
      y: 37.5,
    };
    expected.frames![1].layerStates[1].transform!.position = { x: -2.5, y: 67 };
    expect(result.value.asset).toEqual(expected);
    expect(result.value.asset.layers).toEqual(before.layers);
    expect(result.value.asset.animations).toEqual(before.animations);
    expect(result.value.asset.frames![0]).toEqual(before.frames![0]);
    expect(result.value.asset.frames![2]).toEqual(before.frames![2]);
    expect(result.value.asset.frames![1].colliderOverrides).toEqual(
      before.frames![1].colliderOverrides,
    );
  });

  it('キャンバス外の有限座標を丸めず許可する', () => {
    const result = applyFrameAlignment(
      completeAsset(),
      selection(),
      { x: -1000.125, y: 2000.75 },
      new Date('2026-07-30T00:00:00.000Z'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.asset.frames![1].layerStates[0].transform!.position).toEqual({
      x: -969.875,
      y: 2041.25,
    });
  });

  it('0差分は同じAsset参照を返しupdatedAtを変えない', () => {
    const source = completeAsset();
    const result = applyFrameAlignment(source, selection(), { x: 0, y: 0 });
    expect(result).toMatchObject({ ok: true, value: { changed: false } });
    if (!result.ok) return;
    expect(result.value.asset).toBe(source);
    expect(result.value.asset.updatedAt).toBe('2026-07-29T00:00:00.000Z');
  });

  it('非0差分で不正な更新日時を拒否し、入力Assetを変えない', () => {
    const source = completeAsset();
    const before = structuredClone(source);
    expect(
      applyFrameAlignment(source, selection(), { x: 1, y: -1 }, new Date(Number.NaN)),
    ).toMatchObject({
      ok: false,
      code: 'invalid-timestamp',
    });
    expect(source).toEqual(before);
  });

  it.each([
    [
      'Layer 0件',
      (asset: Asset) => {
        asset.layers = [];
      },
      'no-layers',
    ],
    [
      'Layer ID重複',
      (asset: Asset) => {
        asset.layers.push(structuredClone(asset.layers[0]));
      },
      'duplicate-layer-id',
    ],
    [
      '対象LayerState欠落',
      (asset: Asset) => {
        asset.frames![1].layerStates.pop();
      },
      'missing-layer-state',
    ],
  ])('applyでも%sを拒否し、入力Assetを完全に変えない', (_label, mutate, code) => {
    const source = completeAsset();
    mutate(source);
    const before = structuredClone(source);
    expect(
      applyFrameAlignment(
        source,
        selection(),
        { x: 1, y: -1 },
        new Date('2026-07-30T00:00:00.000Z'),
      ),
    ).toMatchObject({
      ok: false,
      code,
    });
    expect(source).toEqual(before);
  });

  it.each([
    [{ x: Number.NaN, y: 0 }, 'invalid-delta'],
    [{ x: 0, y: Number.POSITIVE_INFINITY }, 'invalid-delta'],
    [{ x: Number.MAX_VALUE, y: 0 }, 'invalid-result'],
  ])('非有限deltaまたは加算結果を拒否して入力を変えない', (delta, code) => {
    const source = completeAsset();
    source.frames![1].layerStates[0].transform!.position.x = Number.MAX_VALUE;
    const before = structuredClone(source);
    expect(applyFrameAlignment(source, selection(), delta)).toMatchObject({
      ok: false,
      code,
    });
    expect(source).toEqual(before);
  });
});
