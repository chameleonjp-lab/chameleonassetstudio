import { describe, expect, it } from 'vitest';
import { ASSET_FORMAT, CURRENT_ASSET_VERSION, type Asset } from '../model/asset';
import type { Animation, Frame } from '../model/animation';
import type { Layer } from '../model/layer';
import type { Part, PartPose } from '../model/part';
import type { RigAnimation } from '../model/rig';
import type { TextureRef } from '../model/texture';
import { replacePartLayerIds } from '../model/assetOps';
import { flipCopyAsset } from '../model/flipCopy';
import {
  accumulatePartChain,
  applyPoint,
  bakeRigAnimation,
  effectivePose,
  interpolateRigPoses,
  partLocalMatrix,
  partWorldMatrix,
} from './rig';

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

describe('partLocalMatrix / applyPoint', () => {
  it('pivot (10,0) を中心に localRotation 90° 回転すると (20,0) は (10,10) 付近になる', () => {
    const part: Part = {
      id: 'part_a',
      name: 'a',
      partType: 'other',
      layerIds: [],
      pivot: { x: 10, y: 0 },
    };
    const pose = effectivePose(part, { localRotation: 90 });
    const matrix = partLocalMatrix(part, pose);
    const result = applyPoint(matrix, { x: 20, y: 0 });

    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(10, 6);
  });
});

describe('partWorldMatrix', () => {
  it('親 localPosition (5,0) と子 localRotation 90°（pivot 原点）の合成が期待どおりになる', () => {
    const parent: Part = {
      id: 'part_parent',
      name: 'parent',
      partType: 'body',
      layerIds: [],
      pivot: { x: 0, y: 0 },
    };
    const child: Part = {
      id: 'part_child',
      name: 'child',
      partType: 'arm_left',
      layerIds: [],
      parentId: 'part_parent',
      pivot: { x: 0, y: 0 },
    };
    const asset: Asset = { ...baseAsset, parts: [parent, child] };
    const poses: Record<string, PartPose> = {
      part_parent: { localPosition: { x: 5, y: 0 } },
      part_child: { localRotation: 90 },
    };

    const world = partWorldMatrix(asset, 'part_child', poses);
    const result = applyPoint(world, { x: 1, y: 0 });

    // 子のローカル点 (1,0) は 90 度回転で (0,1) になり、
    // 親の localPosition (5,0) だけ平行移動されて (5,1) になる。
    expect(result.x).toBeCloseTo(5, 6);
    expect(result.y).toBeCloseTo(1, 6);
  });

  it('循環する parentId（A → B → A）でも無限ループせず有限の行列を返す', () => {
    const partA: Part = {
      id: 'part_a',
      name: 'a',
      partType: 'other',
      layerIds: [],
      parentId: 'part_b',
    };
    const partB: Part = {
      id: 'part_b',
      name: 'b',
      partType: 'other',
      layerIds: [],
      parentId: 'part_a',
    };
    const asset: Asset = { ...baseAsset, parts: [partA, partB] };

    const world = partWorldMatrix(asset, 'part_a', {});

    expect(Number.isFinite(world.a)).toBe(true);
    expect(Number.isFinite(world.b)).toBe(true);
    expect(Number.isFinite(world.c)).toBe(true);
    expect(Number.isFinite(world.d)).toBe(true);
    expect(Number.isFinite(world.e)).toBe(true);
    expect(Number.isFinite(world.f)).toBe(true);
  });
});

describe('interpolateRigPoses', () => {
  it('2 keyframe（time 0: rotation 0 / time 1: rotation 90）の time 0.5 で 45 になる', () => {
    const rig: RigAnimation = {
      id: 'rig_1',
      name: 'test_rig',
      fps: 30,
      loop: true,
      durationMs: 1000,
      keyframes: [
        { time: 0, poses: { part_a: { localRotation: 0 } } },
        { time: 1, poses: { part_a: { localRotation: 90 } } },
      ],
    };

    const poses = interpolateRigPoses(rig, 0.5);

    expect(poses.part_a?.localRotation).toBeCloseTo(45, 6);
  });

  it('keyframes が空なら {} を返す', () => {
    const rig: RigAnimation = {
      id: 'rig_empty',
      name: 'empty',
      fps: 30,
      loop: false,
      durationMs: 1000,
      keyframes: [],
    };

    expect(interpolateRigPoses(rig, 0.5)).toEqual({});
  });
});

describe('effectivePose / rotationLimit', () => {
  it('rotationLimit（min -10 / max 10）で kf の localRotation 90 が 10 に clamp される', () => {
    const part: Part = {
      id: 'part_a',
      name: 'a',
      partType: 'other',
      layerIds: [],
      rotationLimit: { min: -10, max: 10 },
    };

    const pose = effectivePose(part, { localRotation: 90 });

    expect(pose.localRotation).toBe(10);
  });
});

describe('bakeRigAnimation', () => {
  it('中心を保ったまま回転を焼き込み、フレームとアニメーションを追加する', () => {
    const texture: TextureRef = {
      id: 'tex_main',
      kind: 'edit',
      name: 'main',
      mimeType: 'image/png',
      size: { width: 64, height: 64 },
      path: 'textures/main.png',
    };
    const layer: Layer = {
      id: 'layer_main',
      name: 'main',
      layerType: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
      textureId: 'tex_main',
    };
    const part: Part = {
      id: 'part_body',
      name: 'body',
      partType: 'body',
      layerIds: ['layer_main'],
      pivot: { x: 32, y: 32 },
    };
    const existingFrame: Frame = { id: 'frame_existing', name: 'existing', layerStates: [] };
    const existingAnimation: Animation = {
      id: 'anim_existing',
      name: 'existing',
      fps: 8,
      loop: true,
      frameIds: ['frame_existing'],
    };
    const asset: Asset = {
      ...baseAsset,
      textures: [texture],
      layers: [layer],
      parts: [part],
      frames: [existingFrame],
      animations: [existingAnimation],
    };
    const rig: RigAnimation = {
      id: 'rig_1',
      name: 'sway',
      fps: 2,
      loop: true,
      durationMs: 1000,
      keyframes: [
        { time: 0, poses: { part_body: { localRotation: 0 } } },
        { time: 1, poses: { part_body: { localRotation: 90 } } },
      ],
    };

    const baked = bakeRigAnimation(asset, rig);

    // 既存 frames/animations は保持される
    expect(baked.frames).toHaveLength(3);
    expect(baked.frames?.[0]).toBe(existingFrame);
    expect(baked.animations).toHaveLength(2);
    expect(baked.animations[0]).toBe(existingAnimation);

    const bakedFrames = baked.frames?.slice(1) ?? [];
    expect(bakedFrames).toHaveLength(2);

    for (const frame of bakedFrames) {
      const state = frame.layerStates.find((s) => s.layerId === 'layer_main');
      expect(state?.transform).toBeDefined();
      const t = state!.transform!;
      const centerX = t.position.x + (texture.size.width * t.scale.x) / 2;
      const centerY = t.position.y + (texture.size.height * t.scale.y) / 2;
      // pivot がテクスチャ中心 (32,32) と一致するため、回転しても中心は不変。
      expect(centerX).toBeCloseTo(32, 6);
      expect(centerY).toBeCloseTo(32, 6);
    }

    const secondState = bakedFrames[1].layerStates.find((s) => s.layerId === 'layer_main');
    expect(secondState?.transform?.rotation).toBe(90);

    const newAnimation = baked.animations[1];
    expect(newAnimation.name).toBe('sway');
    expect(newAnimation.fps).toBe(2);
    expect(newAnimation.loop).toBe(true);
    expect(newAnimation.frameIds).toEqual(bakedFrames.map((f) => f.id));

    // 元のアセットは変更しない
    expect(asset.frames).toHaveLength(1);
    expect(asset.animations).toHaveLength(1);
  });

  it('Part差し替えは既存bakeを変えず、次回bakeだけが新しいLayer集合を使う', () => {
    const texture: TextureRef = {
      id: 'tex_main',
      kind: 'edit',
      name: 'main',
      mimeType: 'image/png',
      size: { width: 16, height: 16 },
      path: 'textures/main.png',
    };
    const createLayer = (id: string): Layer => ({
      id,
      name: id,
      layerType: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
      textureId: texture.id,
    });
    const asset: Asset = {
      ...baseAsset,
      textures: [texture],
      layers: [createLayer('layer_a'), createLayer('layer_b')],
      parts: [
        {
          id: 'part_body',
          name: 'body',
          partType: 'body',
          layerIds: ['layer_a'],
          pivot: { x: 8, y: 8 },
        },
      ],
    };
    const rig: RigAnimation = {
      id: 'rig_replace',
      name: 'replace',
      fps: 1,
      loop: false,
      durationMs: 1000,
      keyframes: [{ time: 0, poses: { part_body: { localRotation: 10 } } }],
    };

    const firstBake = bakeRigAnimation(asset, rig);
    const firstFrames = firstBake.frames;
    const firstAnimations = firstBake.animations;
    expect(firstFrames?.at(-1)?.layerStates.map((state) => state.layerId)).toEqual(['layer_a']);

    const replaced = replacePartLayerIds(firstBake, 'part_body', ['layer_b']);
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) {
      return;
    }
    expect(replaced.asset.frames).toBe(firstFrames);
    expect(replaced.asset.animations).toBe(firstAnimations);

    const secondBake = bakeRigAnimation(replaced.asset, rig);
    const newlyBakedFrames = secondBake.frames?.slice(firstFrames?.length ?? 0) ?? [];
    expect(newlyBakedFrames).toHaveLength(1);
    expect(newlyBakedFrames[0].layerStates.map((state) => state.layerId)).toEqual(['layer_b']);
    expect(secondBake.frames?.slice(0, firstFrames?.length)).toEqual(firstFrames);
  });

  it('texture中心はscaleに依存せず、負・非等方scaleでもaccepted position式を使う', () => {
    const texture: TextureRef = {
      id: 'tex_scaled',
      kind: 'edit',
      name: 'scaled',
      mimeType: 'image/png',
      size: { width: 40, height: 20 },
      path: 'textures/scaled.png',
    };
    const layer: Layer = {
      id: 'layer_scaled',
      name: 'scaled',
      layerType: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: {
        position: { x: 10, y: 20 },
        scale: { x: -2, y: 3 },
        rotation: 17,
      },
      textureId: texture.id,
    };
    const part: Part = {
      id: 'part_scaled',
      name: 'scaled',
      partType: 'body',
      layerIds: [layer.id],
      // accepted center = position + unscaled textureSize / 2
      pivot: { x: 30, y: 30 },
    };
    const rig: RigAnimation = {
      id: 'rig_scaled',
      name: 'scaled',
      fps: 1,
      loop: false,
      durationMs: 1000,
      keyframes: [
        {
          time: 0,
          poses: {
            [part.id]: {
              localRotation: 90,
              localScale: { x: 0.5, y: -2 },
            },
          },
        },
      ],
    };
    const asset: Asset = {
      ...baseAsset,
      textures: [texture],
      layers: [layer],
      parts: [part],
      rigAnimations: [rig],
    };

    const state = bakeRigAnimation(asset, rig).frames![0].layerStates[0];

    expect(state.transform?.position).toEqual({ x: 10, y: 20 });
    expect(state.transform?.scale).toEqual({ x: -1, y: -6 });
    expect(state.transform?.rotation).toBe(107);
  });

  it.each([
    {
      name: '非有限fps',
      rig: {
        ...({} as RigAnimation),
        ...{ id: 'rig', name: 'x', fps: Number.NaN, loop: false, durationMs: 1000, keyframes: [] },
      },
      expectedCode: 'non-finite-number',
    },
    {
      name: 'unsafe frameCount',
      rig: {
        id: 'rig',
        name: 'x',
        fps: Number.MAX_VALUE,
        loop: false,
        durationMs: Number.MAX_VALUE,
        keyframes: [],
      },
      expectedCode: 'frame-count-unsafe',
    },
  ])('$nameはFrame割当前に拒否する', ({ rig, expectedCode }) => {
    const asset = structuredClone(baseAsset);
    const before = structuredClone(asset);

    let thrown: unknown;
    try {
      bakeRigAnimation(asset, rig);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'rig-preflight',
      violations: expect.arrayContaining([expect.objectContaining({ code: expectedCode })]),
    });
    expect(asset).toEqual(before);
    expect(asset.frames).toEqual([]);
  });

  it.each([
    {
      name: 'empty',
      parts: [
        {
          id: 'part_a',
          name: 'A',
          partType: 'body' as const,
          layerIds: [],
        },
      ],
      expectedCode: 'empty',
    },
    {
      name: 'duplicate',
      parts: [
        {
          id: 'part_a',
          name: 'A',
          partType: 'body' as const,
          layerIds: ['layer_main', 'layer_main'],
        },
      ],
      expectedCode: 'duplicate',
    },
    {
      name: 'missing',
      parts: [
        {
          id: 'part_a',
          name: 'A',
          partType: 'body' as const,
          layerIds: ['layer_missing'],
        },
      ],
      expectedCode: 'missing',
    },
    {
      name: 'shared',
      parts: [
        {
          id: 'part_a',
          name: 'A',
          partType: 'body' as const,
          layerIds: ['layer_main'],
        },
        {
          id: 'part_b',
          name: 'B',
          partType: 'head' as const,
          layerIds: ['layer_main'],
        },
      ],
      expectedCode: 'shared',
    },
  ])('H2=L1の$name違反はFrame割当前に理由付きで拒否する', ({ parts, expectedCode }) => {
    const layer: Layer = {
      id: 'layer_main',
      name: 'main',
      layerType: 'guide',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
    };
    const asset: Asset = { ...baseAsset, layers: [layer], parts };
    const before = structuredClone(asset);
    const rig: RigAnimation = {
      id: 'rig_invalid',
      name: 'invalid',
      fps: 1,
      loop: false,
      durationMs: 1000,
      keyframes: [{ time: 0, poses: {} }],
    };

    let thrown: unknown;
    try {
      bakeRigAnimation(asset, rig);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'part-layer-constraint',
      violations: [expect.objectContaining({ code: expectedCode })],
    });
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('リグを焼き込めません');
    expect(asset).toEqual(before);
    expect(asset.frames).toEqual([]);
  });

  it('全Frameで flip(bake(source)) と bake(flipRig(source)) のtransformが一致する', () => {
    const texture: TextureRef = {
      id: 'tex_parity',
      kind: 'edit',
      name: 'parity',
      mimeType: 'image/png',
      size: { width: 18, height: 10 },
      path: 'textures/parity.png',
    };
    const layers: Layer[] = [
      {
        id: 'layer_root',
        name: 'root',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 0.8,
        transform: {
          position: { x: 25, y: 30 },
          scale: { x: -1.25, y: 0.75 },
          rotation: 12,
        },
        textureId: texture.id,
      },
      {
        id: 'layer_mid',
        name: 'arm_left',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          position: { x: 44, y: 27 },
          scale: { x: 0.6, y: -1.4 },
          rotation: -18,
        },
        textureId: texture.id,
      },
      {
        id: 'layer_leaf',
        name: 'hand_left',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 0.65,
        transform: {
          position: { x: 62, y: 20 },
          scale: { x: -0.5, y: 1.8 },
          rotation: 7,
        },
        textureId: texture.id,
      },
    ];
    const parts: Part[] = [
      {
        id: 'part_root',
        name: 'root',
        partType: 'body',
        layerIds: [layers[0].id],
        pivot: { x: 36, y: 42 },
        bindPose: {
          localPosition: { x: 2, y: -1 },
          localRotation: 4,
          localScale: { x: 1.1, y: 0.9 },
        },
        rotationLimit: { min: -25, max: 35 },
      },
      {
        id: 'part_mid',
        name: 'arm_left',
        partType: 'arm_left',
        layerIds: [layers[1].id],
        parentId: 'part_root',
        pivot: { x: 53, y: 35 },
        bindPose: {
          localPosition: { x: 3, y: 2 },
          localRotation: -8,
          localScale: { x: -0.8, y: 1.2 },
        },
        rotationLimit: { min: -40, max: 20 },
      },
      {
        id: 'part_leaf',
        name: 'hand_left',
        partType: 'other',
        layerIds: [layers[2].id],
        parentId: 'part_mid',
        pivot: { x: 70, y: 25 },
        bindPose: { localPosition: { x: -2, y: 1 }, localScale: { x: 1.3, y: -0.7 } },
      },
    ];
    const rig: RigAnimation = {
      id: 'rig_parity',
      name: 'wave_left',
      fps: 3,
      loop: false,
      durationMs: 1000,
      keyframes: [
        {
          time: 0,
          poses: {
            part_root: { localRotation: 10 },
            part_mid: { localPosition: { x: 4, y: -2 } },
          },
        },
        {
          time: 0.5,
          poses: {
            part_mid: { localRotation: 17, localScale: { x: -1.2, y: 0.6 } },
          },
        },
        {
          time: 1,
          poses: {
            part_root: { localRotation: -15 },
            part_leaf: { localRotation: 33, localPosition: { x: 5, y: 3 } },
          },
        },
      ],
    };
    const source: Asset = {
      ...baseAsset,
      canvasSize: { width: 120, height: 100 },
      origin: { x: 60, y: 90 },
      textures: [texture],
      layers,
      parts,
      frames: [],
      animations: [],
      rigAnimations: [rig],
    };

    const flippedAfterBake = flipCopyAsset(bakeRigAnimation(source, rig), {
      now: new Date('2026-07-24T00:00:00.000Z'),
    });
    const flippedRig = flipCopyAsset(source, {
      now: new Date('2026-07-24T00:00:00.000Z'),
    });
    const bakedAfterFlip = bakeRigAnimation(flippedRig, flippedRig.rigAnimations![0]);

    expect(flippedAfterBake.frames).toHaveLength(bakedAfterFlip.frames!.length);
    for (const [frameIndex, leftFrame] of flippedAfterBake.frames!.entries()) {
      const rightFrame = bakedAfterFlip.frames![frameIndex];
      expect(leftFrame.name).toBe(rightFrame.name);
      expect(leftFrame.layerStates).toHaveLength(rightFrame.layerStates.length);
      for (const [stateIndex, leftState] of leftFrame.layerStates.entries()) {
        const rightState = rightFrame.layerStates[stateIndex];
        expect(leftState.visible).toBe(rightState.visible);
        expect(leftState.opacity).toBe(rightState.opacity);
        expect(leftState.transform?.position.x).toBeCloseTo(rightState.transform!.position.x, 6);
        expect(leftState.transform?.position.y).toBeCloseTo(rightState.transform!.position.y, 6);
        expect(leftState.transform?.scale.x).toBeCloseTo(rightState.transform!.scale.x, 6);
        expect(leftState.transform?.scale.y).toBeCloseTo(rightState.transform!.scale.y, 6);
        const normalizedRotationDifference =
          ((((leftState.transform!.rotation - rightState.transform!.rotation + 180) % 360) + 360) %
            360) -
          180;
        expect(Math.abs(normalizedRotationDifference)).toBeLessThanOrEqual(1e-6);
      }
    }
  });
});

describe('accumulatePartChain', () => {
  it('親子の localRotation を合計し、localScale を成分積で返す', () => {
    const parent: Part = {
      id: 'part_parent',
      name: 'parent',
      partType: 'body',
      layerIds: [],
    };
    const child: Part = {
      id: 'part_child',
      name: 'child',
      partType: 'arm_left',
      layerIds: [],
      parentId: 'part_parent',
    };
    const asset: Asset = { ...baseAsset, parts: [parent, child] };
    const poses: Record<string, PartPose> = {
      part_parent: { localRotation: 10, localScale: { x: 2, y: 1 } },
      part_child: { localRotation: 20, localScale: { x: 1, y: 3 } },
    };

    const result = accumulatePartChain(asset, 'part_child', poses);

    expect(result.rotation).toBeCloseTo(30, 6);
    expect(result.scale.x).toBeCloseTo(2, 6);
    expect(result.scale.y).toBeCloseTo(3, 6);
  });
});
