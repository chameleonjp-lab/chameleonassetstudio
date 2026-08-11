/**
 * 2D-1A-CONTRACT: docs/adr/0004-trim-atlas-scale-output-semantics.md の契約 fixture テスト。
 * 既存テスト（atlas.test.ts）の期待値は変更せず、5 フレームのアセットで
 * computeSheetLayout / buildAtlas の cell 単位（trim なし・回転なし）配置を数値で固定する。
 */
import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { buildAtlas, computeDistributionSheetLayout, computeSheetLayout } from './atlas';

const baseAsset = characterAsset as unknown as Asset;

const FRAME_IDS = ['frame_f0', 'frame_f1', 'frame_f2', 'frame_f3', 'frame_f4'];

const fiveFrameAsset: Asset = {
  ...baseAsset,
  frames: FRAME_IDS.map((id, index) => ({
    id,
    name: `f${index}`,
    layerStates: [],
  })),
  animations: [{ id: 'anim_all', name: 'all', fps: 10, loop: true, frameIds: FRAME_IDS }],
};

describe('ADR-0004: computeSheetLayout の cell 配置（5 フレーム）', () => {
  it('3 列 2 行に配置され、各セルの左上座標が cellWidth / cellHeight の等倍グリッドになる', () => {
    const layout = computeSheetLayout(FRAME_IDS, 64, 32);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.positions).toEqual([
      { frameId: 'frame_f0', x: 0, y: 0 },
      { frameId: 'frame_f1', x: 64, y: 0 },
      { frameId: 'frame_f2', x: 128, y: 0 },
      { frameId: 'frame_f3', x: 0, y: 32 },
      { frameId: 'frame_f4', x: 64, y: 32 },
    ]);
    expect(layout.width).toBe(192);
    expect(layout.height).toBe(64);
  });
});

describe('ADR-0004: buildAtlas の frames 絶対座標・cellSize・origin / anchors / colliders パススルー（5 フレーム）', () => {
  it('frames は sheet 内絶対座標で trim されず、origin / anchors / colliders はアセットの値をそのまま持つ', () => {
    const layout = computeSheetLayout(FRAME_IDS, 64, 32);
    const atlas = buildAtlas(fiveFrameAsset, layout);

    expect(atlas.cellSize).toEqual({ width: 64, height: 32 });
    expect(atlas.frames).toEqual([
      { name: 'f0', x: 0, y: 0, width: 64, height: 32 },
      { name: 'f1', x: 64, y: 0, width: 64, height: 32 },
      { name: 'f2', x: 128, y: 0, width: 64, height: 32 },
      { name: 'f3', x: 0, y: 32, width: 64, height: 32 },
      { name: 'f4', x: 64, y: 32, width: 64, height: 32 },
    ]);
    expect(atlas.animations).toEqual([
      { name: 'all', fps: 10, loop: true, frames: ['f0', 'f1', 'f2', 'f3', 'f4'] },
    ]);
    // origin / anchors / colliders はアセットの値をそのまま持つ（trim オフセット補正をしない）
    expect(atlas.origin).toEqual(fiveFrameAsset.origin);
    expect(atlas.anchors).toEqual(
      fiveFrameAsset.anchors.map((anchor) => ({
        name: anchor.name,
        role: anchor.role,
        x: anchor.position.x,
        y: anchor.position.y,
      })),
    );
    expect(atlas.colliders).toEqual(fiveFrameAsset.colliders);
  });

  it('atlas 内画像回転は扱わない（frames に回転関連フィールドを持たない）', () => {
    const layout = computeSheetLayout(FRAME_IDS, 64, 32);
    const atlas = buildAtlas(fiveFrameAsset, layout);
    for (const frame of atlas.frames) {
      expect(Object.keys(frame).sort()).toEqual(['height', 'name', 'width', 'x', 'y']);
    }
  });
});


describe('Group 15 SHEET fixtures', () => {
  it('5フレームのtrim rectをpackedへ安定配置し、完全透明Frameを保持する', () => {
    const layout = computeDistributionSheetLayout(
      FRAME_IDS.map((id, index) => ({
        id,
        name: `f${index}`,
        sourceSize: { width: 64, height: 64 },
        contentRect:
          index === 4
            ? { x: 0, y: 0, width: 0, height: 0 }
            : { x: index, y: index + 1, width: 16 + index, height: 20 - index },
      })),
      { profile: 'packed', padding: 2 },
    );

    expect(layout.frames).toHaveLength(5);
    expect(layout.frames.map((frame) => frame.id)).toEqual(FRAME_IDS);
    expect(layout.frames[4]).toMatchObject({
      contentRect: { width: 0, height: 0 },
      rect: { width: 1, height: 1 },
    });
    expect(layout.pages.every((page) => page.width === 2048 && page.height === 2048)).toBe(
      true,
    );
  });
});
