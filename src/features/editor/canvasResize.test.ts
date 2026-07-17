import { describe, expect, it } from 'vitest';
import { createImageAsset, type Asset } from '../../core/model';
import {
  canvasResizeOffset,
  inspectCanvasResizeOverflow,
  resizeAssetCanvas,
  type CanvasResizeAnchor,
} from './canvasResize';

const ANCHORS: CanvasResizeAnchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

describe('canvasResizeOffset', () => {
  it.each([
    {
      label: '奇数差分の拡大',
      oldSize: { width: 10, height: 20 },
      nextSize: { width: 15, height: 27 },
      xs: [0, 2, 5],
      ys: [0, 3, 7],
    },
    {
      label: '奇数差分の縮小',
      oldSize: { width: 15, height: 27 },
      nextSize: { width: 10, height: 20 },
      xs: [0, -2, -5],
      ys: [0, -3, -7],
    },
    {
      label: '偶数差分の拡大',
      oldSize: { width: 10, height: 20 },
      nextSize: { width: 16, height: 28 },
      xs: [0, 3, 6],
      ys: [0, 4, 8],
    },
    {
      label: '偶数差分の縮小',
      oldSize: { width: 16, height: 28 },
      nextSize: { width: 10, height: 20 },
      xs: [0, -3, -6],
      ys: [0, -4, -8],
    },
  ])('$labelで9点anchorのdx/dyを決定できる', ({ oldSize, nextSize, xs, ys }) => {
    expect(ANCHORS.map((anchor) => canvasResizeOffset(oldSize, nextSize, anchor))).toEqual([
      { x: xs[0], y: ys[0] },
      { x: xs[1], y: ys[0] },
      { x: xs[2], y: ys[0] },
      { x: xs[0], y: ys[1] },
      { x: xs[1], y: ys[1] },
      { x: xs[2], y: ys[1] },
      { x: xs[0], y: ys[2] },
      { x: xs[1], y: ys[2] },
      { x: xs[2], y: ys[2] },
    ]);
  });
});

function richAsset(): Asset {
  const base = createImageAsset({
    name: 'canvas-resize',
    size: { width: 100, height: 80 },
    sourceMimeType: 'image/png',
    sourceExtension: 'png',
    now: new Date('2026-07-17T00:00:00.000Z'),
  });
  const layer = base.layers[0];
  return {
    ...base,
    origin: { x: 50, y: 80 },
    layers: [
      {
        ...layer,
        transform: {
          position: { x: 10, y: 20 },
          scale: { x: -2, y: 3 },
          rotation: 15,
        },
      },
    ],
    frames: [
      {
        id: 'frame-1',
        name: 'explicit',
        layerStates: [
          {
            layerId: layer.id,
            transform: {
              position: { x: 30, y: 40 },
              scale: { x: 4, y: -5 },
              rotation: 25,
            },
          },
        ],
      },
      {
        id: 'frame-2',
        name: 'inherits-base',
        layerStates: [{ layerId: layer.id, visible: false }],
      },
    ],
    anchors: [{ id: 'anchor-1', name: 'hand', role: 'hand_left', position: { x: 11, y: 12 } }],
    colliders: [
      {
        id: 'rect-1',
        name: 'body',
        purpose: 'body',
        shape: 'rect',
        visible: true,
        rect: { x: 13, y: 14, width: 15, height: 16 },
      },
      {
        id: 'circle-1',
        name: 'attack',
        purpose: 'attack',
        shape: 'circle',
        visible: true,
        circle: { x: 17, y: 18, radius: 19 },
      },
    ],
    parts: [
      {
        id: 'part-1',
        name: 'body',
        partType: 'body',
        layerIds: [layer.id],
        pivot: { x: 21, y: 22 },
        bindPose: { localPosition: { x: 1, y: 2 }, localRotation: 3 },
      },
    ],
    tile: { tileSize: { width: 8, height: 8 }, collisionType: 'solid', visualType: 'floor' },
    gimmick: { movementPreset: 'horizontal' },
    effect: { effectType: 'spark', durationMs: 250, loop: false, blendMode: 'add' },
    rigAnimations: [
      {
        id: 'rig-1',
        name: 'idle',
        fps: 12,
        loop: true,
        durationMs: 1000,
        keyframes: [
          {
            time: 0,
            poses: { 'part-1': { localPosition: { x: 4, y: 5 } } },
          },
        ],
      },
    ],
    animations: [{ id: 'animation-1', name: 'idle', fps: 12, loop: true, frameIds: ['frame-1'] }],
    gameAttributes: { speed: 10, spawn: { x: 999, y: 999 } },
  };
}

describe('resizeAssetCanvas', () => {
  it('G1のcanvas座標だけへ同じdx/dyを一度適用し、非対象値は維持する', () => {
    const before = richAsset();
    const beforeSnapshot = structuredClone(before);
    const next = resizeAssetCanvas(
      before,
      { width: 111, height: 89 },
      'center',
      new Date('2026-07-17T01:00:00.000Z'),
    );

    expect(next.canvasSize).toEqual({ width: 111, height: 89 });
    expect(next.layers[0].transform.position).toEqual({ x: 15, y: 24 });
    expect(next.frames?.[0].layerStates[0].transform?.position).toEqual({ x: 35, y: 44 });
    expect(next.frames?.[1].layerStates[0]).toEqual({
      layerId: before.layers[0].id,
      visible: false,
    });
    expect(next.origin).toEqual({ x: 55, y: 84 });
    expect(next.anchors[0].position).toEqual({ x: 16, y: 16 });
    expect(next.colliders[0].shape === 'rect' && next.colliders[0].rect).toEqual({
      x: 18,
      y: 18,
      width: 15,
      height: 16,
    });
    expect(next.colliders[1].shape === 'circle' && next.colliders[1].circle).toEqual({
      x: 22,
      y: 22,
      radius: 19,
    });
    expect(next.parts[0].pivot).toEqual({ x: 26, y: 26 });

    expect(next.textures).toEqual(before.textures);
    expect(next.layers[0].transform.scale).toEqual(before.layers[0].transform.scale);
    expect(next.layers[0].transform.rotation).toBe(before.layers[0].transform.rotation);
    expect(next.frames?.[0].layerStates[0].transform?.scale).toEqual(
      before.frames?.[0].layerStates[0].transform?.scale,
    );
    expect(next.parts[0].bindPose).toEqual(before.parts[0].bindPose);
    expect(next.rigAnimations).toEqual(before.rigAnimations);
    expect(next.tile).toEqual(before.tile);
    expect(next.gimmick).toEqual(before.gimmick);
    expect(next.effect).toEqual(before.effect);
    expect(next.animations).toEqual(before.animations);
    expect(next.gameAttributes).toEqual(before.gameAttributes);
    expect(next.updatedAt).toBe('2026-07-17T01:00:00.000Z');
    expect(before).toEqual(beforeSnapshot);
  });

  it('同じsizeは参照同一のno-opになり、invalid sizeは丸めず拒否する', () => {
    const asset = richAsset();
    expect(resizeAssetCanvas(asset, { ...asset.canvasSize }, 'bottom-right')).toBe(asset);
    expect(() => resizeAssetCanvas(asset, { width: 10.5, height: 20 }, 'center')).toThrow(/整数/);
    expect(() => resizeAssetCanvas(asset, { width: 4097, height: 20 }, 'center')).toThrow(
      /4096以下/,
    );
  });
});

describe('inspectCanvasResizeOverflow', () => {
  it('transform済みLayer / frame stateと各game dataを分類して数える', () => {
    const base = richAsset();
    const asset: Asset = {
      ...base,
      canvasSize: { width: 50, height: 50 },
      origin: { x: 25, y: 50 },
      layers: [
        {
          ...base.layers[0],
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 90,
          },
        },
      ],
      frames: [
        {
          id: 'frame-out',
          name: 'out',
          layerStates: [
            {
              layerId: base.layers[0].id,
              transform: {
                position: { x: 40, y: 40 },
                scale: { x: 1, y: 1 },
                rotation: 0,
              },
            },
          ],
        },
        {
          id: 'frame-inherit',
          name: 'inherit',
          layerStates: [{ layerId: base.layers[0].id }],
        },
      ],
      anchors: [
        { id: 'in', name: 'in', role: 'center', position: { x: 0, y: 0 } },
        { id: 'out', name: 'out', role: 'foot', position: { x: 51, y: 50 } },
      ],
      colliders: [
        {
          id: 'rect-in',
          name: 'in',
          purpose: 'body',
          shape: 'rect',
          visible: true,
          rect: { x: 0, y: 0, width: 50, height: 50 },
        },
        {
          id: 'circle-out',
          name: 'out',
          purpose: 'attack',
          shape: 'circle',
          visible: true,
          circle: { x: 48, y: 25, radius: 3 },
        },
      ],
      parts: [
        { id: 'without', name: 'without', partType: 'body', layerIds: [] },
        {
          id: 'outside',
          name: 'outside',
          partType: 'head',
          layerIds: [],
          pivot: { x: -1, y: 0 },
        },
      ],
    };

    expect(inspectCanvasResizeOverflow(asset)).toEqual({
      layers: 1,
      frameStates: 1,
      origin: 0,
      anchors: 1,
      colliders: 1,
      partPivots: 1,
      total: 5,
    });
  });
});
