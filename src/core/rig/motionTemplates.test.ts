import { describe, expect, it } from 'vitest';
import { ASSET_FORMAT, CURRENT_ASSET_VERSION, type Asset } from '../model/asset';
import type { Part } from '../model/part';
import { buildMotionTemplate } from './motionTemplates';

const baseAsset: Asset = {
  format: ASSET_FORMAT,
  version: CURRENT_ASSET_VERSION,
  id: 'asset_test',
  assetType: 'character',
  name: 'test_asset',
  displayName: 'テスト',
  canvasSize: { width: 64, height: 64 },
  origin: { x: 32, y: 64 },
  textures: [],
  layers: [],
  parts: [],
  anchors: [],
  colliders: [],
  frames: [],
  animations: [],
  tags: [],
  gameAttributes: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildMotionTemplate', () => {
  it('body パーツがある asset で idle_sway は keyframes 3 つ、body の rot が -3/3/-3 になる', () => {
    const body: Part = { id: 'part_body', name: 'body', partType: 'body', layerIds: [] };
    const asset: Asset = { ...baseAsset, parts: [body] };

    const rig = buildMotionTemplate(asset, 'idle_sway');

    expect(rig).not.toBeNull();
    expect(rig!.keyframes).toHaveLength(3);
    expect(rig!.keyframes[0].poses.part_body?.localRotation).toBe(-3);
    expect(rig!.keyframes[1].poses.part_body?.localRotation).toBe(3);
    expect(rig!.keyframes[2].poses.part_body?.localRotation).toBe(-3);
    expect(rig!.name).toBe('idle_sway');
    expect(rig!.fps).toBe(8);
    expect(rig!.loop).toBe(true);
  });

  it('対象パーツが 1 つも見つからなければ null を返す', () => {
    const other: Part = { id: 'part_other', name: 'other', partType: 'other', layerIds: [] };
    const asset: Asset = { ...baseAsset, parts: [other] };

    expect(buildMotionTemplate(asset, 'idle_sway')).toBeNull();
    expect(buildMotionTemplate(asset, 'walk_bounce')).toBeNull();
    expect(buildMotionTemplate(asset, 'jump_squash')).toBeNull();
    expect(buildMotionTemplate(asset, 'attack_swing')).toBeNull();
    expect(buildMotionTemplate(asset, 'damage_shake')).toBeNull();
    expect(buildMotionTemplate(asset, 'dead_collapse')).toBeNull();
  });

  it('attack_swing は weapon が無く arm_right がある場合、arm_right にポーズが付く', () => {
    const armRight: Part = {
      id: 'part_arm_right',
      name: 'arm',
      partType: 'arm_right',
      layerIds: [],
    };
    const asset: Asset = { ...baseAsset, parts: [armRight] };

    const rig = buildMotionTemplate(asset, 'attack_swing');

    expect(rig).not.toBeNull();
    expect(rig!.keyframes.length).toBeGreaterThan(0);
    for (const keyframe of rig!.keyframes) {
      expect(keyframe.poses.part_arm_right).toBeDefined();
    }
  });
});
