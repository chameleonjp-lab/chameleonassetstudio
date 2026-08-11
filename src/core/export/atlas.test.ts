import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import {
  buildAtlas,
  buildDistributionManifest,
  canonicalJson,
  computeDistributionSheetLayout,
  computeSheetLayout,
} from './atlas';

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

describe('computeDistributionSheetLayout', () => {
  const input = (id: string, width: number, height: number, contentRect = {
    x: 0,
    y: 0,
    width,
    height,
  }) => ({
    id,
    name: id,
    sourceSize: { width, height },
    contentRect,
  });

  it('fixed-gridはpaddingをセル間だけに加え、行優先の座標を保持する', () => {
    const layout = computeDistributionSheetLayout(
      [
        input('a', 64, 32),
        input('b', 64, 32),
        input('c', 64, 32),
        input('d', 64, 32),
        input('e', 64, 32),
      ],
      { profile: 'fixed-grid', padding: 2 },
    );

    expect(layout.profile).toBe('fixed-grid');
    expect(layout.padding).toBe(2);
    expect(layout.pages).toEqual([
      expect.objectContaining({
        path: 'atlas/pages/page-000.png',
        width: 2048,
        height: 2048,
      }),
    ]);
    expect(layout.frames.map(({ id, page, rect }) => ({ id, page, rect }))).toEqual([
      { id: 'a', page: 0, rect: { x: 0, y: 0, width: 64, height: 32 } },
      { id: 'b', page: 0, rect: { x: 66, y: 0, width: 64, height: 32 } },
      { id: 'c', page: 0, rect: { x: 132, y: 0, width: 64, height: 32 } },
      { id: 'd', page: 0, rect: { x: 0, y: 34, width: 64, height: 32 } },
      { id: 'e', page: 0, rect: { x: 66, y: 34, width: 64, height: 32 } },
    ]);
  });

  it('packedは高さ・幅・元のフレーム順で安定配置し、trim情報を保持する', () => {
    const layout = computeDistributionSheetLayout(
      [
        input('a', 64, 64, { x: 4, y: 5, width: 10, height: 20 }),
        input('b', 64, 64, { x: 1, y: 2, width: 32, height: 20 }),
        input('c', 64, 64, { x: 0, y: 0, width: 20, height: 10 }),
      ],
      { profile: 'packed', padding: 2 },
    );

    expect(layout.profile).toBe('packed');
    expect(layout.frames.map(({ id, page, rect, contentRect, contentOffset }) => ({
      id,
      page,
      rect,
      contentRect,
      contentOffset,
    }))).toEqual([
      {
        id: 'a',
        page: 0,
        rect: { x: 34, y: 0, width: 10, height: 20 },
        contentRect: { x: 4, y: 5, width: 10, height: 20 },
        contentOffset: { x: 4, y: 5 },
      },
      {
        id: 'b',
        page: 0,
        rect: { x: 0, y: 0, width: 32, height: 20 },
        contentRect: { x: 1, y: 2, width: 32, height: 20 },
        contentOffset: { x: 1, y: 2 },
      },
      {
        id: 'c',
        page: 0,
        rect: { x: 46, y: 0, width: 20, height: 10 },
        contentRect: { x: 0, y: 0, width: 20, height: 10 },
        contentOffset: { x: 0, y: 0 },
      },
    ]);
  });

  it('完全透明Frameも1件として残し、4ページ超過とページ外フレームを拒否する', () => {
    const transparent = computeDistributionSheetLayout(
      [input('empty', 64, 64, { x: 0, y: 0, width: 0, height: 0 })],
      { profile: 'packed' },
    );
    expect(transparent.frames[0]).toMatchObject({
      id: 'empty',
      rect: { width: 1, height: 1 },
      contentRect: { width: 0, height: 0 },
    });

    const fivePages = Array.from({ length: 5 }, (_, index) =>
      input(`frame-${index}`, 2048, 2048),
    );
    expect(() =>
      computeDistributionSheetLayout(fivePages, { profile: 'packed', padding: 1 }),
    ).toThrow(/4ページ/);

    expect(() =>
      computeDistributionSheetLayout([input('oversized', 2049, 1)], {
        profile: 'packed',
      }),
    ).toThrow(/2048/);
  });

  it('manifestはpackedのpage・rect・trim情報とhelper参照用のpage pathを保持する', () => {
    const atlas = buildAtlas(
      baseAsset,
      computeSheetLayout(
        (baseAsset.frames ?? []).map((frame) => frame.id),
        baseAsset.canvasSize.width,
        baseAsset.canvasSize.height,
      ),
    );
    const layout = computeDistributionSheetLayout(
      [
        input('a', 64, 64, { x: 2, y: 3, width: 10, height: 12 }),
        input('b', 64, 64, { x: 0, y: 0, width: 20, height: 8 }),
      ],
      { profile: 'packed', padding: 1 },
    );
    const manifest = buildDistributionManifest(
      baseAsset,
      atlas,
      ['asset.json', 'atlas/atlas.json', 'README.md'],
      layout,
    );

    expect(manifest.profile).toBe('packed');
    expect(manifest.files.pages).toEqual(['atlas/pages/page-000.png']);
    expect(manifest.pages[0]).toMatchObject({
      path: 'atlas/pages/page-000.png',
      width: 2048,
      height: 2048,
    });
    expect(manifest.frames).toEqual(
      layout.frames.map((frame) => ({
      name: frame.name,
      page: frame.page,
      rect: frame.rect,
      sourceSize: frame.sourceSize,
      contentRect: frame.contentRect,
      contentOffset: frame.contentOffset,
      rotated: frame.rotated,
    })),
    );
    expect(canonicalJson(manifest)).toContain('contentOffset');
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
    expect(atlas.frames[1]).toMatchObject({
      x: 512,
      y: 0,
      width: 512,
      height: 512,
    });
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

  it('参照中Frameの個別時間またはeventを固定fpsへ落とさず理由付きで拒否する', () => {
    const durationAsset = structuredClone(baseAsset);
    durationAsset.frames![0].durationMs = 120;
    expect(() => buildAtlas(durationAsset, computeSheetLayout(['frame_idle_0'], 32, 32))).toThrow(
      /個別表示時間/,
    );

    const eventAsset = structuredClone(baseAsset);
    eventAsset.animations[0].events = [{ id: 'event_1', name: 'step', frameId: 'frame_idle_0' }];
    expect(() => buildAtlas(eventAsset, computeSheetLayout(['frame_idle_0'], 32, 32))).toThrow(
      /イベント/,
    );
  });

  it('Frame collider overrideを直接APIでもAtlasへ落とさず事前拒否する', () => {
    const asset = structuredClone(baseAsset);
    asset.frames![0].colliderOverrides = [{ colliderId: 'col_body', visible: false }];
    expect(() => buildAtlas(asset, computeSheetLayout(['frame_idle_0'], 32, 32))).toThrow(
      /frame_idle_0.*col_body.*asset\.json.*\.casproj/s,
    );
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
      {
        name: 'idle',
        fps: 8,
        loop: true,
        frames: ['frame_idle_0', 'frame_idle_1'],
      },
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

describe('distribution manifest core', () => {
  it('legacy Atlasを変更せず、fixed-grid manifestを決定的に組み立てる', () => {
    const atlas = buildAtlas(
      baseAsset,
      computeSheetLayout(
        (baseAsset.frames ?? []).map((frame) => frame.id),
        baseAsset.canvasSize.width,
        baseAsset.canvasSize.height,
      ),
    );
    const first = buildDistributionManifest(baseAsset, atlas, [
      'README.md',
      'atlas/atlas.json',
      'textures/main.png',
      'asset.json',
    ]);
    const second = buildDistributionManifest(baseAsset, atlas, [
      'asset.json',
      'textures/main.png',
      'atlas/atlas.json',
      'README.md',
    ]);

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.format).toBe('chameleon-distribution');
    expect(first.version).toBe('0.1.0');
    expect(first.profile).toBe('fixed-grid');
    expect(first.scale).toBe(1);
    expect(first.files).toMatchObject({
      manifest: 'manifest.json',
      assetJson: 'asset.json',
      atlasJson: 'atlas/atlas.json',
      pages: ['atlas/spritesheet.png'],
      mainPng: 'textures/main.png',
      mainWebp: null,
    });
    expect(first.frames[0]).toMatchObject({
      page: 0,
      rect: { x: 0, y: 0, width: 512, height: 512 },
      sourceSize: { width: 512, height: 512 },
      contentRect: { x: 0, y: 0, width: 512, height: 512 },
      contentOffset: { x: 0, y: 0 },
      rotated: false,
    });
  });
});
