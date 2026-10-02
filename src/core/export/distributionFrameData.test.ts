import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { computeDistributionSheetLayout, type DistributionScale } from './atlas';
import { buildDistributionFrameData, projectDistributionFrame } from './distributionFrameData';

function source() {
  const asset = structuredClone(characterAsset) as unknown as Asset;
  asset.origin = { x: 3, y: 4 };
  asset.anchors = [{ id: 'hand', name: 'hand', role: 'custom', position: { x: 8, y: 6 } }];
  asset.colliders = [
    {
      id: 'box',
      name: 'box',
      purpose: 'body',
      visible: true,
      shape: 'rect',
      rect: { x: 1, y: 2, width: 3, height: 4 },
    },
    {
      id: 'ball',
      name: 'ball',
      purpose: 'sensor',
      visible: true,
      shape: 'circle',
      circle: { x: 7, y: 8, radius: 2 },
    },
  ];
  asset.frames = [
    {
      id: 'first',
      name: 'same',
      layerStates: [],
      colliderOverrides: [
        { colliderId: 'box', rect: { x: 2, y: 3, width: 4, height: 5 }, visible: false },
        { colliderId: 'ball', visible: false },
      ],
    },
  ];
  return asset;
}

describe('distribution frame game data', () => {
  it.each([1, 2, 3] as DistributionScale[])(
    'keeps trim, origin, anchors and override geometry aligned at %sx',
    (scale) => {
      const asset = source();
      const before = structuredClone(asset);
      const layout = [
        {
          id: 'first',
          name: 'same',
          page: 1,
          rect: { x: 30, y: 40, width: 10 * scale, height: 12 * scale },
          contentRect: { x: 1, y: 2, width: 8 * scale, height: 9 * scale },
          contentOffset: { x: 2 * scale, y: 3 * scale },
          sourceSize: { width: 32 * scale, height: 32 * scale },
          rotated: false as const,
        },
      ];
      const frame = buildDistributionFrameData(asset, layout, scale)[0];
      const projected = projectDistributionFrame(frame, { x: 100, y: 200 });
      expect(projected.page).toBe(1);
      expect(projected.sourceRect).toEqual({ x: 31, y: 42, width: 8 * scale, height: 9 * scale });
      expect(projected.destinationRect).toEqual({
        x: 100 - scale,
        y: 200 - scale,
        width: 8 * scale,
        height: 9 * scale,
      });
      expect(projected.anchors[0].position).toEqual({ x: 100 + 5 * scale, y: 200 + 2 * scale });
      expect(projected.colliders[0]).toMatchObject({
        visible: false,
        rect: { x: 100 - scale, y: 200 - scale, width: 4 * scale, height: 5 * scale },
      });
      expect(projected.colliders[1]).toMatchObject({
        visible: false,
        circle: { x: 100 + 4 * scale, y: 200 + 4 * scale, radius: 2 * scale },
      });
      expect(asset).toEqual(before);
      expect(layout[0].contentOffset).toEqual({ x: 2 * scale, y: 3 * scale });
    },
  );

  it('rejects dangling or duplicate output IDs and invalid scale', () => {
    const asset = source();
    const layout = computeDistributionSheetLayout([
      {
        id: 'missing',
        name: 'x',
        sourceSize: { width: 10, height: 10 },
        contentRect: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(() => buildDistributionFrameData(asset, layout.frames, 1)).toThrow(/source/);
    layout.frames[0].id = 'first';
    expect(() =>
      buildDistributionFrameData(asset, [...layout.frames, ...layout.frames], 1),
    ).toThrow(/Duplicate/);
    expect(() =>
      buildDistributionFrameData(asset, layout.frames, 4 as DistributionScale),
    ).toThrow();
    asset.origin.x = Number.MAX_VALUE;
    expect(() => buildDistributionFrameData(asset, layout.frames, 3)).toThrow(/finite/);
    asset.origin.x = -Number.MAX_VALUE;
    const frame = buildDistributionFrameData(asset, layout.frames, 1)[0];
    expect(() => projectDistributionFrame(frame, { x: Number.MAX_VALUE, y: 0 })).toThrow(/finite/);
  });
});

describe('packed source-to-sheet coordinate conversion', () => {
  it.each([1, 2, 3] as DistributionScale[])(
    'moves the real packer crop to sheet-local coordinates at %sx',
    (scale) => {
      const asset = source();
      const layout = computeDistributionSheetLayout(
        [
          {
            id: 'first',
            name: 'same',
            sourceSize: { width: 32 * scale, height: 32 * scale },
            contentRect: { x: 2 * scale, y: 3 * scale, width: 8 * scale, height: 9 * scale },
          },
        ],
        { profile: 'packed' },
      );
      const frame = buildDistributionFrameData(asset, layout.frames, scale, 'packed')[0];
      expect(frame.contentRect).toEqual({ x: 0, y: 0, width: 8 * scale, height: 9 * scale });
      expect(frame.contentOffset).toEqual({ x: 2 * scale, y: 3 * scale });
      expect(projectDistributionFrame(frame, { x: 100, y: 200 }).sourceRect).toEqual({
        x: layout.frames[0].rect.x,
        y: layout.frames[0].rect.y,
        width: 8 * scale,
        height: 9 * scale,
      });
      expect(layout.frames[0].contentRect.x).toBe(2 * scale);
    },
  );
});
