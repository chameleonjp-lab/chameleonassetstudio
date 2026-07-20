import { describe, expect, it } from 'vitest';
import { applyFrameToAsset, createImageAsset, type Layer } from '../model';
import {
  MAX_FRAME_SET_ITEMS,
  assertTileSetImportInput,
  buildFrameSetFrames,
  compareNaturalFileNames,
  computeManualGrid,
  naturalFileOrder,
} from './importFrameSet';

describe('naturalFileOrder', () => {
  it('ASCII数字を数値比較し、自然順で同順位なら入力順を維持する', () => {
    const duplicateA = { name: 'walk_2.png', marker: 'a' };
    const duplicateB = { name: 'walk_2.png', marker: 'b' };
    expect(
      naturalFileOrder([
        { name: 'walk_10.png', marker: 'ten' },
        duplicateA,
        { name: 'walk_01.png', marker: 'one' },
        duplicateB,
      ]).map(({ marker }) => marker),
    ).toEqual(['one', 'a', 'b', 'ten']);
    expect(compareNaturalFileNames('frame9.png', 'frame10.png')).toBeLessThan(0);
    expect(
      naturalFileOrder([
        { name: 'frame_01.PNG', marker: 'selected-first' },
        { name: 'frame_1.png', marker: 'selected-second' },
      ]).map(({ marker }) => marker),
    ).toEqual(['selected-first', 'selected-second']);
  });
});

describe('computeManualGrid', () => {
  it('uniform marginとspacingから完全に収まるcellを左上・行優先で列挙する', () => {
    const layout = computeManualGrid(
      { width: 25, height: 15 },
      { cellWidth: 5, cellHeight: 4, margin: 1, spacing: 2 },
    );
    expect(layout).toMatchObject({
      columns: 3,
      rows: 2,
      rightRemainder: 4,
      bottomRemainder: 3,
    });
    expect(layout.cells.map(({ x, y }) => [x, y])).toEqual([
      [1, 1],
      [8, 1],
      [15, 1],
      [1, 7],
      [8, 7],
      [15, 7],
    ]);
    expect(
      layout.cells.every((cell) => cell.x + cell.width <= 25 && cell.y + cell.height <= 15),
    ).toBe(true);
  });

  it('16cellを受け入れ、17cell・0cell・不正な数値を生成前に拒否する', () => {
    expect(
      computeManualGrid(
        { width: MAX_FRAME_SET_ITEMS, height: 1 },
        { cellWidth: 1, cellHeight: 1, margin: 0, spacing: 0 },
      ).cells,
    ).toHaveLength(MAX_FRAME_SET_ITEMS);
    expect(() =>
      computeManualGrid(
        { width: MAX_FRAME_SET_ITEMS + 1, height: 1 },
        { cellWidth: 1, cellHeight: 1, margin: 0, spacing: 0 },
      ),
    ).toThrow('最大16件');
    expect(() =>
      computeManualGrid(
        { width: 4, height: 4 },
        { cellWidth: 8, cellHeight: 8, margin: 0, spacing: 0 },
      ),
    ).toThrow('1件以上');
    expect(() =>
      computeManualGrid(
        { width: 4, height: 4 },
        { cellWidth: 1.5, cellHeight: 1, margin: 0, spacing: 0 },
      ),
    ).toThrow('整数');
    expect(() =>
      computeManualGrid(
        { width: 4, height: 4 },
        { cellWidth: 1, cellHeight: 1, margin: -1, spacing: 0 },
      ),
    ).toThrow('0以上');
  });
});

describe('buildFrameSetFrames', () => {
  it('各frameで対応layerだけが可視になる完全なlayerStatesを作る', () => {
    const base = createImageAsset({
      name: 'sequence',
      size: { width: 16, height: 16 },
      sourceMimeType: 'image/png',
      sourceExtension: 'png',
    });
    const layers: Layer[] = Array.from({ length: 3 }, (_, index) => ({
      ...base.layers[0],
      id: `layer_${index}`,
      name: `layer ${index}`,
      visible: index === 0,
    }));
    const frames = buildFrameSetFrames(layers, ['one', 'two', 'three']);
    const asset = { ...base, layers, frames };

    expect(frames.map((frame) => frame.layerStates)).toHaveLength(3);
    for (const frame of frames) {
      expect(frame.layerStates).toHaveLength(3);
      expect(
        applyFrameToAsset(asset, frame.id).layers.filter((layer) => layer.visible),
      ).toHaveLength(1);
    }
  });
});

describe('assertTileSetImportInput', () => {
  const base = {
    grid: { cellWidth: 32, cellHeight: 16, margin: 0, spacing: 0 },
    tileSize: { width: 32, height: 16 },
    collisionType: 'solid' as const,
    visualType: 'floor',
  };

  it('cellSizeと同じ既定tileSizeおよびcellSize以下の値を受け入れる', () => {
    expect(() => assertTileSetImportInput(base)).not.toThrow();
    expect(() =>
      assertTileSetImportInput({ ...base, tileSize: { width: 8, height: 8 } }),
    ).not.toThrow();
  });

  it('0・非整数・cellSize超過・未知collisionを拒否する', () => {
    expect(() => assertTileSetImportInput({ ...base, tileSize: { width: 0, height: 16 } })).toThrow(
      '1以上の整数',
    );
    expect(() =>
      assertTileSetImportInput({ ...base, tileSize: { width: 1.5, height: 16 } }),
    ).toThrow('1以上の整数');
    expect(() =>
      assertTileSetImportInput({ ...base, tileSize: { width: 33, height: 16 } }),
    ).toThrow('cellSize以下');
    expect(() =>
      assertTileSetImportInput({
        ...base,
        collisionType: 'unknown' as typeof base.collisionType,
      }),
    ).toThrow('未対応のcollision');
  });
});
