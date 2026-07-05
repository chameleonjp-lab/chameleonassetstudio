import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { buildAtlas, computeSheetLayout } from './atlas';

const baseAsset = characterAsset as unknown as Asset;

describe('computeSheetLayout', () => {
  it('1 件なら 1 列 1 行になる', () => {
    const layout = computeSheetLayout(['a'], 32, 48);
    expect(layout.columns).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.positions).toEqual([{ frameId: 'a', x: 0, y: 0 }]);
    expect(layout.width).toBe(32);
    expect(layout.height).toBe(48);
  });

  it('2 件なら 2 列 1 行になる', () => {
    const layout = computeSheetLayout(['a', 'b'], 10, 20);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(1);
    expect(layout.positions).toEqual([
      { frameId: 'a', x: 0, y: 0 },
      { frameId: 'b', x: 10, y: 0 },
    ]);
    expect(layout.width).toBe(20);
    expect(layout.height).toBe(20);
  });

  it('5 件なら 3 列 2 行になり、左上から行優先で並ぶ', () => {
    const layout = computeSheetLayout(['a', 'b', 'c', 'd', 'e'], 10, 10);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.positions).toEqual([
      { frameId: 'a', x: 0, y: 0 },
      { frameId: 'b', x: 10, y: 0 },
      { frameId: 'c', x: 20, y: 0 },
      { frameId: 'd', x: 0, y: 10 },
      { frameId: 'e', x: 10, y: 10 },
    ]);
    expect(layout.width).toBe(30);
    expect(layout.height).toBe(20);
  });
});

describe('buildAtlas', () => {
  it('フレーム名・アニメーション・origin / anchors / colliders が入る', () => {
    const frameIds = (baseAsset.frames ?? []).map((frame) => frame.id);
    const layout = computeSheetLayout(
      frameIds,
      baseAsset.canvasSize.width,
      baseAsset.canvasSize.height,
    );
    const atlas = buildAtlas(baseAsset, layout);

    expect(atlas.format).toBe('chameleon-atlas');
    expect(atlas.version).toBe('0.1.0');
    expect(atlas.texture).toBe('spritesheet.png');
    expect(atlas.cellSize).toEqual({ width: 512, height: 512 });
    expect(atlas.frames.map((frame) => frame.name)).toEqual(['idle_0', 'idle_1']);
    expect(atlas.frames[1]).toMatchObject({ x: 512, y: 0, width: 512, height: 512 });
    // Animation.frameIds が Frame.name へ解決される
    expect(atlas.animations).toEqual([
      { name: 'idle', fps: 8, loop: true, frames: ['idle_0', 'idle_1'] },
    ]);
    expect(atlas.origin).toEqual({ x: 256, y: 448 });
    expect(atlas.anchors).toEqual([
      { name: 'foot', role: 'foot', x: 256, y: 448 },
      { name: 'hand_right', role: 'hand_right', x: 352, y: 288 },
    ]);
    expect(atlas.colliders).toEqual(baseAsset.colliders);
  });

  it('フレームが 0 件なら default 1 コマになる', () => {
    const noFrameAsset: Asset = { ...baseAsset, frames: [] };
    const layout = computeSheetLayout(
      ['default'],
      noFrameAsset.canvasSize.width,
      noFrameAsset.canvasSize.height,
    );
    const atlas = buildAtlas(noFrameAsset, layout);
    expect(atlas.frames).toEqual([{ name: 'default', x: 0, y: 0, width: 512, height: 512 }]);
    expect(atlas.animations).toEqual([
      { name: 'idle', fps: 8, loop: true, frames: ['frame_idle_0', 'frame_idle_1'] },
    ]);
  });

  it('tile アセットは tile 設定がそのまま atlas.json に入り、cellSize は実配置のまま', () => {
    const tileAsset: Asset = {
      ...baseAsset,
      assetType: 'tile',
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      },
    };
    const layout = computeSheetLayout(
      ['default'],
      tileAsset.canvasSize.width,
      tileAsset.canvasSize.height,
    );
    const atlas = buildAtlas(tileAsset, layout);
    expect(atlas.tile).toEqual({
      tileSize: { width: 32, height: 32 },
      collisionType: 'solid',
      visualType: 'floor',
    });
    // Sprite Sheet の実配置（canvasSize セル）と食い違わないこと
    expect(atlas.cellSize).toEqual({ width: 512, height: 512 });
  });

  it('tile 設定が無ければ atlas.json に tile フィールドは入らない', () => {
    const layout = computeSheetLayout(['default'], 512, 512);
    const atlas = buildAtlas(baseAsset, layout);
    expect('tile' in atlas).toBe(false);
  });

  it('非 tile アセットに tile 設定が残っていても atlas.json には出ない', () => {
    const characterWithTile: Asset = {
      ...baseAsset,
      assetType: 'character',
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      },
    };
    const layout = computeSheetLayout(['default'], 512, 512);
    const atlas = buildAtlas(characterWithTile, layout);
    expect('tile' in atlas).toBe(false);
  });

  it('effect アセットは effect 設定がそのまま atlas.json に入る', () => {
    const effectAsset: Asset = {
      ...baseAsset,
      assetType: 'effect',
      effect: {
        effectType: 'spark',
        durationMs: 500,
        loop: false,
        blendMode: 'normal',
      },
    };
    const layout = computeSheetLayout(['default'], 512, 512);
    const atlas = buildAtlas(effectAsset, layout);
    expect(atlas.effect).toEqual({
      effectType: 'spark',
      durationMs: 500,
      loop: false,
      blendMode: 'normal',
    });
  });

  it('非 effect アセットに effect 設定が残っていても atlas.json には出ない', () => {
    const characterWithEffect: Asset = {
      ...baseAsset,
      assetType: 'character',
      effect: {
        effectType: 'spark',
        durationMs: 500,
        loop: false,
        blendMode: 'normal',
      },
    };
    const layout = computeSheetLayout(['default'], 512, 512);
    const atlas = buildAtlas(characterWithEffect, layout);
    expect('effect' in atlas).toBe(false);
  });
});
