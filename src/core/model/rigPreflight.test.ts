import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from './asset';
import type { RigAnimation } from './rig';
import {
  assertRigPreflight,
  assertRigPreflightForLinkedRefresh,
  calculateRigFrameCount,
  inspectRigPreflight,
  RigPreflightError,
  type RigPreflightViolationCode,
} from './rigPreflight';

const baseAsset = characterAsset as unknown as Asset;

function validRig(): RigAnimation {
  return {
    id: 'rig_left',
    name: 'walk_left',
    fps: 8,
    loop: true,
    durationMs: 1000,
    keyframes: [
      {
        time: 0,
        poses: {
          part_body: {
            localPosition: { x: 1, y: 2 },
            localRotation: 3,
            localScale: { x: -1, y: 2 },
          },
        },
      },
      { time: 1, poses: { part_body: { localRotation: 15 } } },
    ],
  };
}

function fixture(): Asset {
  const asset = structuredClone(baseAsset);
  asset.parts[0].pivot = { x: 240, y: 256 };
  asset.parts[0].bindPose = {
    localPosition: { x: 2, y: 4 },
    localRotation: 5,
    localScale: { x: 1, y: 1 },
  };
  asset.parts[0].rotationLimit = { min: -30, max: 45 };
  asset.rigAnimations = [validRig()];
  return asset;
}

function codes(asset: Asset): RigPreflightViolationCode[] {
  return inspectRigPreflight(asset).map((violation) => violation.code);
}

describe('rigPreflight', () => {
  it('有効なAssetを変更せず、RigのframeCountを現行round式で返す', () => {
    const asset = fixture();
    const before = structuredClone(asset);

    expect(inspectRigPreflight(asset)).toEqual([]);
    expect(calculateRigFrameCount(asset.rigAnimations![0])).toBe(8);
    expect(() => assertRigPreflight(asset)).not.toThrow();
    expect(asset).toEqual(before);
  });

  it.each<{
    name: string;
    mutate: (asset: Asset) => void;
    expected: RigPreflightViolationCode;
  }>([
    {
      name: '非有限のLayer transform',
      mutate: (asset) => {
        asset.layers[0].transform.position.x = Number.NaN;
      },
      expected: 'non-finite-number',
    },
    {
      name: '0以下のRig fps',
      mutate: (asset) => {
        asset.rigAnimations![0].fps = 0;
      },
      expected: 'non-positive-number',
    },
    {
      name: '安全整数でない生成Frame数',
      mutate: (asset) => {
        asset.rigAnimations![0].fps = Number.MAX_VALUE;
        asset.rigAnimations![0].durationMs = Number.MAX_VALUE;
      },
      expected: 'frame-count-unsafe',
    },
    {
      name: '範囲外のkeyframe時刻',
      mutate: (asset) => {
        asset.rigAnimations![0].keyframes[0].time = -0.1;
      },
      expected: 'rig-keyframe-time-out-of-range',
    },
    {
      name: '重複keyframe時刻',
      mutate: (asset) => {
        asset.rigAnimations![0].keyframes[1].time = 0;
      },
      expected: 'rig-keyframe-time-duplicate',
    },
    {
      name: '存在しないpose Part参照',
      mutate: (asset) => {
        asset.rigAnimations![0].keyframes[0].poses.part_missing = {};
      },
      expected: 'reference-missing',
    },
    {
      name: '逆転したrotationLimit',
      mutate: (asset) => {
        asset.parts[0].rotationLimit = { min: 10, max: -10 };
      },
      expected: 'rotation-limit-order',
    },
    {
      name: 'Frame内の重複LayerState',
      mutate: (asset) => {
        asset.frames![0].layerStates.push(structuredClone(asset.frames![0].layerStates[0]));
      },
      expected: 'frame-layer-state-duplicate',
    },
    {
      name: '親子循環',
      mutate: (asset) => {
        asset.parts.push({
          id: 'part_child',
          name: 'child',
          partType: 'head',
          layerIds: ['layer_guide'],
          parentId: 'part_body',
        });
        asset.parts[0].parentId = 'part_child';
      },
      expected: 'part-parent-cycle',
    },
    {
      name: 'H2=L1の共有Layer',
      mutate: (asset) => {
        asset.parts.push({
          id: 'part_shared',
          name: 'shared',
          partType: 'head',
          layerIds: ['layer_body'],
        });
      },
      expected: 'part-layer-shared',
    },
    {
      name: '欠損Texture参照',
      mutate: (asset) => {
        asset.layers[0].textureId = 'texture_missing';
      },
      expected: 'reference-missing',
    },
  ])('$nameを理由付きで列挙する', ({ mutate, expected }) => {
    const asset = fixture();
    mutate(asset);

    expect(codes(asset)).toContain(expected);
    expect(() => assertRigPreflight(asset)).toThrow(RigPreflightError);
    try {
      assertRigPreflight(asset);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'rig-preflight',
        violations: expect.arrayContaining([expect.objectContaining({ code: expected })]),
      });
      expect((error as Error).message.length).toBeGreaterThan(0);
    }
  });

  it('bake対象rigだけを渡した場合もAsset共通構造と対象rigを同じ規則で検査する', () => {
    const asset = fixture();
    const selected = structuredClone(asset.rigAnimations![0]);
    selected.durationMs = Number.POSITIVE_INFINITY;
    asset.rigAnimations = undefined;

    const result = inspectRigPreflight(asset, { rig: selected });

    expect(result.map((violation) => violation.code)).toEqual(
      expect.arrayContaining(['non-finite-number', 'frame-count-unsafe']),
    );
    expect(result.some((violation) => violation.path.startsWith('rigAnimation[id='))).toBe(true);
  });

  it('linked Family previewだけは空Partを許可し、その他の参照違反は拒否する', () => {
    const asset = fixture();
    asset.parts[0].layerIds = [];

    const strictCodes = inspectRigPreflight(asset).map((violation) => violation.code);
    expect(strictCodes).toContain('part-layer-empty');
    expect(() => assertRigPreflightForLinkedRefresh(asset)).not.toThrow();

    asset.layers[0].textureId = 'texture_missing';
    expect(() => assertRigPreflightForLinkedRefresh(asset)).toThrow(RigPreflightError);
    try {
      assertRigPreflightForLinkedRefresh(asset);
    } catch (error) {
      expect(error).toMatchObject({
        violations: expect.arrayContaining([
          expect.objectContaining({ code: 'reference-missing' }),
        ]),
      });
    }
  });
});
