/**
 * 2D-1A-MOTION: docs/adr/0008〜0011 の契約 fixture テスト（animation event・可変時間・
 * rig bake・frame 別上書き・polygon の境界）。
 * 既存テスト（src/core/model/contract.fixtures.test.ts、src/core/rig/rig.test.ts、
 * src/core/model/flipCopy.test.ts）の期待値は変更せず、ADR で固定した現行実装の意味を
 * 独立に数値・真偽値で固定する。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import minimalAsset from '../samples/asset.minimal.json';
import type { Asset } from './asset';
import type { Animation, Frame } from './animation';
import type { RigAnimation } from './rig';
import { setRigAnimations } from './assetOps';
import { bakeRigAnimation } from '../rig/rig';
import { buildAtlas, computeSheetLayout } from '../export/atlas';
import { validateAsset } from '../schema/validate';

const baseAsset = minimalAsset as unknown as Asset;

describe('ADR-0008: Animation.durationMs は再生・export の正本ではない（休眠フィールド）', () => {
  it('durationMs を持つ animation を buildAtlas に通しても、出力 animations は {name, fps, loop, frames} のみになる', () => {
    const frame1: Frame = { id: 'frame_a', name: 'a', layerStates: [] };
    const frame2: Frame = { id: 'frame_b', name: 'b', layerStates: [] };
    const animation: Animation = {
      id: 'anim_with_duration',
      name: 'walk',
      fps: 8,
      loop: true,
      frameIds: [frame1.id, frame2.id],
      durationMs: 250, // 契約上 informational。buildAtlas はこれを読まない。
    };
    const asset: Asset = {
      ...baseAsset,
      frames: [frame1, frame2],
      animations: [animation],
    };
    const layout = computeSheetLayout([frame1.id, frame2.id], 32, 32);

    const atlas = buildAtlas(asset, layout);

    expect(atlas.animations).toHaveLength(1);
    const outputAnimation = atlas.animations[0];
    // キー集合を固定する。durationMs は出力に一切現れない。
    expect(Object.keys(outputAnimation).sort()).toEqual(['fps', 'frames', 'loop', 'name'].sort());
    expect('durationMs' in outputAnimation).toBe(false);
    expect(outputAnimation).toEqual({
      name: 'walk',
      fps: 8,
      loop: true,
      frames: ['a', 'b'],
    });
  });
});

describe('ADR-0008: bakeRigAnimation の frameCount 境界（Math.max(1, Math.round(durationMs/1000*fps))）', () => {
  it('durationMs 1000 / fps 8 は 8 フレームを生成し、生成 Animation の fps は 8', () => {
    const rig: RigAnimation = {
      id: 'rig_full',
      name: 'sway',
      fps: 8,
      loop: true,
      durationMs: 1000,
      keyframes: [],
    };
    const asset: Asset = { ...baseAsset };

    const baked = bakeRigAnimation(asset, rig);

    expect(baked.frames).toHaveLength(8);
    expect(baked.animations).toHaveLength(1);
    expect(baked.animations[0].fps).toBe(8);
    expect(baked.animations[0].frameIds).toHaveLength(8);
  });

  it('durationMs 125 / fps 8 は round(1) = 1 フレームを生成する', () => {
    const rig: RigAnimation = {
      id: 'rig_short',
      name: 'blink',
      fps: 8,
      loop: false,
      durationMs: 125,
      keyframes: [],
    };
    const asset: Asset = { ...baseAsset };

    const baked = bakeRigAnimation(asset, rig);

    expect(baked.frames).toHaveLength(1);
  });

  it('durationMs 1 / fps 8 は round(0.008) = 0 だが max(1, ...) の下限で 1 フレームになる', () => {
    const rig: RigAnimation = {
      id: 'rig_tiny',
      name: 'flash',
      fps: 8,
      loop: false,
      durationMs: 1,
      keyframes: [],
    };
    const asset: Asset = { ...baseAsset };

    const baked = bakeRigAnimation(asset, rig);

    expect(baked.frames).toHaveLength(1);
  });
});

describe('ADR-0008: bake は一方向（bake 後に rigAnimations を書き換えても既存 frames は変わらない）', () => {
  it('bake 結果の asset に setRigAnimations で別の rigAnimations を設定しても frames は同一参照のまま', () => {
    const rig: RigAnimation = {
      id: 'rig_1',
      name: 'sway',
      fps: 4,
      loop: true,
      durationMs: 1000,
      keyframes: [],
    };
    const asset: Asset = { ...baseAsset };

    const baked = bakeRigAnimation(asset, rig);
    expect(baked.frames).toHaveLength(4);

    const changedRig: RigAnimation = {
      id: 'rig_2_different',
      name: 'different',
      fps: 30,
      loop: false,
      durationMs: 5000,
      keyframes: [{ time: 0, poses: {} }],
    };
    const changed = setRigAnimations(baked, [changedRig]);

    // rigAnimations は更新されるが、bake 済みの frames / animations は一切変わらない（同一参照）。
    expect(changed.rigAnimations).toEqual([changedRig]);
    expect(changed.frames).toBe(baked.frames);
    expect(changed.animations).toBe(baked.animations);
    expect(changed.frames).toHaveLength(4);
  });
});

describe('ADR-0011 / 0021: optional追加と未知fieldの前方互換', () => {
  it('durationMs を持つ animation と持たない animation の両方が validateAsset を通る', () => {
    const frame: Frame = { id: 'frame_1', name: 'f1', layerStates: [] };
    const withDuration: Animation = {
      id: 'anim_with_duration',
      name: 'walk',
      fps: 8,
      loop: true,
      frameIds: [frame.id],
      durationMs: 500,
    };
    const withoutDuration: Animation = {
      id: 'anim_without_duration',
      name: 'idle',
      fps: 4,
      loop: true,
      frameIds: [frame.id],
    };
    const asset: Asset = {
      ...baseAsset,
      frames: [frame],
      animations: [withDuration, withoutDuration],
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('正式なeventsと、未知のanimation / frame fieldを持つデータがvalidatorを通る', () => {
    const frameWithOverrides = {
      id: 'frame_with_overrides',
      name: 'f1',
      layerStates: [],
      colliderOverrides: [{ colliderId: 'col_1', rect: { x: 0, y: 0, width: 10, height: 10 } }],
    };
    const animationWithEvents = {
      id: 'anim_with_events',
      name: 'attack',
      fps: 12,
      loop: false,
      frameIds: ['frame_with_overrides'],
      events: [
        {
          id: 'evt_1',
          name: 'attack_start',
          frameId: 'frame_with_overrides',
          payload: { power: 2 },
        },
      ],
      futureAnimationField: { preserved: true },
    };
    const asset = {
      ...baseAsset,
      frames: [frameWithOverrides],
      animations: [animationWithEvents],
    };

    const result = validateAsset(asset);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
