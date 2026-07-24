import { describe, expect, it, vi } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import { validateAsset } from '../schema/validate';
import type { Asset } from './asset';
import { flipCopyAsset, swapLeftRightLabel } from './flipCopy';

const baseAsset = characterAsset as unknown as Asset;
// 反転軸 mirrorX = origin.x = 256、reflect(x) = 512 - x。

function canonicalizeFlipGraph(asset: Asset): Asset {
  const result = structuredClone(asset);
  const idMap = <T extends { id: string }>(items: readonly T[], prefix: string) =>
    new Map(items.map((item, index) => [item.id, `${prefix}_${index}`] as const));
  const layerIds = idMap(result.layers, 'layer');
  const partIds = idMap(result.parts, 'part');
  const frameIds = idMap(result.frames ?? [], 'frame');
  const animationIds = idMap(result.animations, 'animation');
  const rigIds = idMap(result.rigAnimations ?? [], 'rig');
  const eventIds = idMap(
    result.animations.flatMap((animation) => animation.events ?? []),
    'event',
  );
  const anchorIds = idMap(result.anchors, 'anchor');
  const colliderIds = idMap(result.colliders, 'collider');
  const mapped = (map: ReadonlyMap<string, string>, id: string): string => {
    const value = map.get(id);
    if (!value) {
      throw new Error(`canonical ID mapがありません: ${id}`);
    }
    return value;
  };

  result.id = 'asset_0';
  result.name = 'automatic_copy_name';
  result.displayName = 'automatic copy display name';
  result.createdAt = 'normalized';
  result.updatedAt = 'normalized';
  for (const layer of result.layers) {
    layer.id = mapped(layerIds, layer.id);
  }
  for (const part of result.parts) {
    part.id = mapped(partIds, part.id);
    part.layerIds = part.layerIds.map((id) => mapped(layerIds, id));
    if (part.parentId) {
      part.parentId = mapped(partIds, part.parentId);
    }
  }
  for (const frame of result.frames ?? []) {
    frame.id = mapped(frameIds, frame.id);
    for (const state of frame.layerStates) {
      state.layerId = mapped(layerIds, state.layerId);
    }
  }
  for (const animation of result.animations) {
    animation.id = mapped(animationIds, animation.id);
    animation.frameIds = animation.frameIds.map((id) => mapped(frameIds, id));
    for (const event of animation.events ?? []) {
      event.id = mapped(eventIds, event.id);
      event.frameId = mapped(frameIds, event.frameId);
    }
  }
  for (const rig of result.rigAnimations ?? []) {
    rig.id = mapped(rigIds, rig.id);
    for (const keyframe of rig.keyframes) {
      keyframe.poses = Object.fromEntries(
        Object.entries(keyframe.poses).map(([partId, pose]) => [mapped(partIds, partId), pose]),
      );
    }
  }
  for (const anchor of result.anchors) {
    anchor.id = mapped(anchorIds, anchor.id);
  }
  for (const collider of result.colliders) {
    collider.id = mapped(colliderIds, collider.id);
  }
  return result;
}

function regeneratedIdGroups(asset: Asset): Record<string, string[]> {
  return {
    assets: [asset.id],
    layers: asset.layers.map(({ id }) => id),
    parts: asset.parts.map(({ id }) => id),
    frames: (asset.frames ?? []).map(({ id }) => id),
    animations: asset.animations.map(({ id }) => id),
    rigs: (asset.rigAnimations ?? []).map(({ id }) => id),
    events: asset.animations.flatMap((animation) => (animation.events ?? []).map(({ id }) => id)),
    anchors: asset.anchors.map(({ id }) => id),
    colliders: asset.colliders.map(({ id }) => id),
  };
}

describe('swapLeftRightLabel', () => {
  it('left / right トークンを 1 回ずつ入れ替える', () => {
    expect(swapLeftRightLabel('hand_left')).toBe('hand_right');
    expect(swapLeftRightLabel('hand_right')).toBe('hand_left');
    expect(swapLeftRightLabel('Left arm / Right leg')).toBe('Right arm / Left leg');
    // 二重置換しない（left→right→left にならない）
    expect(swapLeftRightLabel('left_and_right')).toBe('right_and_left');
    // 対象トークンが無ければそのまま
    expect(swapLeftRightLabel('body')).toBe('body');
  });
});

describe('flipCopyAsset', () => {
  it('新規 id のアセットを作り、元アセットは変更しない', () => {
    const flipped = flipCopyAsset(baseAsset);
    expect(flipped.id).not.toBe(baseAsset.id);
    expect(flipped.version).toBe(baseAsset.version);
    expect(flipped.format).toBe(baseAsset.format);
    // 元は非破壊
    expect(baseAsset.layers[0].transform.scale.x).toBe(1);
    expect(baseAsset.anchors.find((a) => a.role === 'hand_right')).toBeDefined();
    // schema 検証を通る
    expect(validateAsset(flipped).valid).toBe(true);
  });

  it('name / displayName は left/right 入替、無ければ接尾辞を付ける', () => {
    const flipped = flipCopyAsset(baseAsset);
    // サンプルの name/displayName に left/right が無い場合は接尾辞
    expect(flipped.name).toBe(`${baseAsset.name}_flipped`);
    expect(flipped.displayName).toBe(`${baseAsset.displayName} (左右反転)`);
    // left/right を含む場合は入れ替える
    const named: Asset = { ...baseAsset, name: 'hero_right', displayName: 'ヒーロー right' };
    const flippedNamed = flipCopyAsset(named);
    expect(flippedNamed.name).toBe('hero_left');
    expect(flippedNamed.displayName).toBe('ヒーロー left');
    // options で明示指定できる
    expect(flipCopyAsset(baseAsset, { name: 'x', displayName: 'y' })).toMatchObject({
      name: 'x',
      displayName: 'y',
    });
  });

  it('origin は反転軸なので不変', () => {
    const flipped = flipCopyAsset(baseAsset);
    expect(flipped.origin).toEqual(baseAsset.origin);
  });

  it('レイヤー transform を水平鏡映する（scale.x と rotation を符号反転、position.x を中心反射）', () => {
    // texture 幅・回転・拡大を持つレイヤーで数式を確認する（layer_body の texture 幅=512）
    const modified: Asset = {
      ...baseAsset,
      layers: baseAsset.layers.map((layer, index) =>
        index === 0
          ? {
              ...layer,
              transform: { position: { x: 100, y: 20 }, scale: { x: 2, y: 3 }, rotation: 30 },
            }
          : layer,
      ),
    };
    const flipped = flipCopyAsset(modified);
    // 順序は保つので index 0 が元 layer_body に対応
    const body = flipped.layers[0];
    expect(body.transform.position).toEqual({ x: 512 - 100 - 512, y: 20 }); // = -100
    expect(body.transform.scale).toEqual({ x: -2, y: 3 });
    expect(body.transform.rotation).toBe(-30);
    // texture を持たない guide レイヤーは幅 0 として点反射する
    const guide = flipped.layers[1];
    expect(guide.transform.position.x).toBe(512 - 0 - 0); // = 512
    expect(guide.transform.scale.x).toBe(-1);
    // レイヤー id は新規採番される
    expect(flipped.layers.map((l) => l.id)).not.toEqual(baseAsset.layers.map((l) => l.id));
  });

  it('anchor の座標を反射し、左右 role と名前を入れ替える', () => {
    const flipped = flipCopyAsset(baseAsset);
    const foot = flipped.anchors.find((a) => a.role === 'foot')!;
    expect(foot.position.x).toBe(256); // 軸上なので不変
    // hand_right は hand_left になり、座標 352 → 160
    const hand = flipped.anchors.find((a) => a.name === 'hand_left')!;
    expect(hand.role).toBe('hand_left');
    expect(hand.position.x).toBe(512 - 352); // = 160
    expect(hand.position.y).toBe(288);
  });

  it('collider の rect / circle の x を反射する', () => {
    const flipped = flipCopyAsset(baseAsset);
    const rect = flipped.colliders.find((c) => c.shape === 'rect')!;
    if (rect.shape === 'rect') {
      // x=192,width=128 は 256 対称なので反射しても x=192
      expect(rect.rect.x).toBe(512 - 192 - 128); // = 192
      expect(rect.rect.width).toBe(128);
    }
    const circle = flipped.colliders.find((c) => c.shape === 'circle')!;
    if (circle.shape === 'circle') {
      expect(circle.circle.x).toBe(256); // 軸上
      expect(circle.circle.radius).toBe(96);
    }
  });

  it('part / frame / animation の参照 id を新レイヤー・新フレームへ張り替える', () => {
    const source: Asset = {
      ...baseAsset,
      frames: baseAsset.frames?.map((frame, index) =>
        index === 0 ? { ...frame, durationMs: 150 } : frame,
      ),
      animations: baseAsset.animations.map((animation) => ({
        ...animation,
        events: [
          {
            id: 'event_left',
            name: 'hand_left_attack',
            frameId: 'frame_idle_0',
            payload: { side: 'left' },
          },
        ],
      })),
    };
    (source.animations[0].events?.[0] as unknown as Record<string, unknown>).futureEventField = {
      preserved: true,
    };
    const flipped = flipCopyAsset(source);
    const newLayerIds = new Set(flipped.layers.map((l) => l.id));
    // part.layerIds は新レイヤー id を指す
    for (const part of flipped.parts) {
      for (const layerId of part.layerIds) {
        expect(newLayerIds.has(layerId)).toBe(true);
      }
    }
    // frame.layerStates.layerId も新レイヤー id
    const newFrameIds = new Set((flipped.frames ?? []).map((f) => f.id));
    for (const frame of flipped.frames ?? []) {
      for (const state of frame.layerStates) {
        expect(newLayerIds.has(state.layerId)).toBe(true);
      }
    }
    // animation.frameIds は新フレーム id を指す
    for (const animation of flipped.animations) {
      for (const frameId of animation.frameIds) {
        expect(newFrameIds.has(frameId)).toBe(true);
      }
    }
    expect(flipped.frames?.[0].durationMs).toBe(150);
    expect(flipped.animations[0].events?.[0]).toMatchObject({
      name: 'hand_left_attack',
      frameId: flipped.frames?.[0].id,
      payload: { side: 'left' },
    });
    expect(flipped.animations[0].events?.[0].id).not.toBe('event_left');
    expect(flipped.animations[0].events?.[0] as unknown as Record<string, unknown>).toMatchObject({
      futureEventField: { preserved: true },
    });
    (flipped.animations[0].events?.[0].payload as { side: string }).side = 'changed';
    (
      (flipped.animations[0].events?.[0] as unknown as Record<string, unknown>)
        .futureEventField as { preserved: boolean }
    ).preserved = false;
    expect(source.animations[0].events?.[0].payload).toEqual({ side: 'left' });
    expect(
      (source.animations[0].events?.[0] as unknown as Record<string, unknown>).futureEventField,
    ).toEqual({ preserved: true });
    expect(validateAsset(flipped).valid).toBe(true);
  });

  it('linked mirror modeはFrame / Animation / event IDを維持する', () => {
    const source: Asset = {
      ...baseAsset,
      animations: baseAsset.animations.map((animation) => ({
        ...animation,
        events: [{ id: 'event_keep', name: 'start', frameId: 'frame_idle_0' }],
      })),
    };

    const linked = flipCopyAsset(source, { preserveInternalIds: true });

    expect(linked.frames?.map(({ id }) => id)).toEqual(source.frames?.map(({ id }) => id));
    expect(linked.animations.map(({ id }) => id)).toEqual(source.animations.map(({ id }) => id));
    expect(linked.animations[0].events?.[0]).toEqual(source.animations[0].events?.[0]);
  });

  it('リグ編集データを鏡映して保持し、Rig / Part参照を新IDへ張り替える', () => {
    const withRig: Asset = {
      ...structuredClone(baseAsset),
      parts: baseAsset.parts.map((part) => ({
        ...structuredClone(part),
        pivot: { x: 240, y: 250 },
        bindPose: {
          localPosition: { x: 6, y: -3 },
          localRotation: 15,
          localScale: { x: -2, y: 0.5 },
        },
        rotationLimit: { min: -20, max: 35 },
      })),
      rigAnimations: [
        {
          id: 'rig_1',
          name: 'attack_left',
          fps: 8,
          loop: true,
          durationMs: 1000,
          keyframes: [
            {
              time: 0,
              poses: {
                part_body: {
                  localPosition: { x: 4, y: 5 },
                  localRotation: -25,
                  localScale: { x: -1, y: 3 },
                },
              },
            },
          ],
        },
      ],
    };
    const flipped = flipCopyAsset(withRig);
    const flippedPart = flipped.parts[0];
    const flippedRig = flipped.rigAnimations![0];

    expect(flippedPart.id).not.toBe('part_body');
    expect(flippedPart.pivot).toEqual({ x: 272, y: 250 });
    expect(flippedPart.bindPose).toEqual({
      localPosition: { x: -6, y: -3 },
      localRotation: -15,
      localScale: { x: -2, y: 0.5 },
    });
    expect(flippedPart.rotationLimit).toEqual({ min: -35, max: 20 });
    expect(flippedRig).toMatchObject({
      name: 'attack_right',
      fps: 8,
      loop: true,
      durationMs: 1000,
      keyframes: [{ time: 0 }],
    });
    expect(flippedRig.id).not.toBe('rig_1');
    expect(flippedRig.keyframes[0].poses).toEqual({
      [flippedPart.id]: {
        localPosition: { x: -4, y: 5 },
        localRotation: 25,
        localScale: { x: -1, y: 3 },
      },
    });
  });

  it('texture IDを維持するためprovenance参照も維持し、recordは独立copyする', () => {
    const source = structuredClone(baseAsset);
    const sourceTextureId = source.textures.find((texture) => texture.kind === 'source')!.id;
    source.provenance = [
      {
        sourceFileName: 'hero.png',
        mimeType: 'image/png',
        byteLength: 3,
        hash: `sha256:${'b'.repeat(64)}`,
        importedAt: '2026-07-20T00:00:00.000Z',
        textureId: sourceTextureId,
        future: { preserved: true },
      },
    ];

    const flipped = flipCopyAsset(source);
    expect(flipped.provenance?.[0].textureId).toBe(sourceTextureId);
    expect(flipped.textures.some((texture) => texture.id === sourceTextureId)).toBe(true);
    (flipped.provenance?.[0].future as { preserved: boolean }).preserved = false;
    expect(source.provenance[0].future).toEqual({ preserved: true });
  });

  it('全生成対象IDを完全再採番し、Anchor / Colliderを含む対応と未知の非参照fieldを保持する', () => {
    const source = structuredClone(baseAsset);
    source.name = 'hero_left';
    source.displayName = 'Hero Left';
    source.layers.push({
      ...structuredClone(source.layers[0]),
      id: 'layer_hand',
      name: 'hand_left',
      transform: {
        position: { x: 330, y: 180 },
        scale: { x: -1.5, y: 0.75 },
        rotation: 12,
      },
    });
    source.parts = [
      {
        id: 'part_root',
        name: 'root',
        partType: 'body',
        layerIds: ['layer_body'],
        pivot: { x: 260, y: 300 },
        bindPose: { localPosition: { x: 2, y: 1 }, localRotation: 5 },
        rotationLimit: { min: -40, max: 30 },
      },
      {
        id: 'part_mid',
        name: 'arm_left',
        partType: 'arm_left',
        layerIds: ['layer_guide'],
        parentId: 'part_root',
        pivot: { x: 300, y: 220 },
        bindPose: { localScale: { x: -1, y: 1.25 } },
      },
      {
        id: 'part_leaf',
        name: 'hand_left',
        partType: 'other',
        layerIds: ['layer_hand'],
        parentId: 'part_mid',
        pivot: { x: 340, y: 180 },
      },
    ];
    source.rigAnimations = [
      {
        id: 'rig_left',
        name: 'wave_left',
        fps: 4,
        loop: false,
        durationMs: 1000,
        keyframes: [
          {
            time: 0,
            poses: {
              part_root: { localPosition: { x: 1, y: 2 } },
              part_mid: { localRotation: 10 },
            },
          },
          {
            time: 1,
            poses: {
              part_leaf: { localRotation: -30, localScale: { x: -0.5, y: 2 } },
            },
          },
        ],
      },
    ];
    source.animations[0].events = [
      {
        id: 'event_left',
        name: 'game_left_event',
        frameId: source.frames![0].id,
      },
    ];
    (source.parts[0] as unknown as Record<string, unknown>).futurePartMetadata = {
      label: 'left stays data',
    };
    (source.rigAnimations[0] as unknown as Record<string, unknown>).futureRigMetadata = {
      enabled: true,
    };
    const before = structuredClone(source);

    const flipped = flipCopyAsset(source, { now: new Date('2026-07-24T01:02:03.000Z') });

    const sourceIds = {
      layers: source.layers.map(({ id }) => id),
      parts: source.parts.map(({ id }) => id),
      frames: source.frames!.map(({ id }) => id),
      animations: source.animations.map(({ id }) => id),
      rigs: source.rigAnimations.map(({ id }) => id),
      events: source.animations.flatMap((animation) =>
        (animation.events ?? []).map(({ id }) => id),
      ),
      anchors: source.anchors.map(({ id }) => id),
      colliders: source.colliders.map(({ id }) => id),
    };
    const flippedIds = {
      layers: flipped.layers.map(({ id }) => id),
      parts: flipped.parts.map(({ id }) => id),
      frames: flipped.frames!.map(({ id }) => id),
      animations: flipped.animations.map(({ id }) => id),
      rigs: flipped.rigAnimations!.map(({ id }) => id),
      events: flipped.animations.flatMap((animation) =>
        (animation.events ?? []).map(({ id }) => id),
      ),
      anchors: flipped.anchors.map(({ id }) => id),
      colliders: flipped.colliders.map(({ id }) => id),
    };
    for (const key of Object.keys(sourceIds) as Array<keyof typeof sourceIds>) {
      expect(new Set(flippedIds[key]).size).toBe(flippedIds[key].length);
      expect(flippedIds[key].some((id) => sourceIds[key].includes(id))).toBe(false);
    }

    expect(flipped.parts[1].parentId).toBe(flipped.parts[0].id);
    expect(flipped.parts[2].parentId).toBe(flipped.parts[1].id);
    expect(Object.keys(flipped.rigAnimations![0].keyframes[0].poses)).toEqual([
      flipped.parts[0].id,
      flipped.parts[1].id,
    ]);
    expect(flipped.animations[0].events![0]).toMatchObject({
      name: 'game_left_event',
      frameId: flipped.frames![0].id,
    });
    expect(flipped.textures.map(({ id, path }) => ({ id, path }))).toEqual(
      source.textures.map(({ id, path }) => ({ id, path })),
    );
    expect((flipped.parts[0] as unknown as Record<string, unknown>).futurePartMetadata).toEqual({
      label: 'left stays data',
    });
    expect(
      (flipped.rigAnimations![0] as unknown as Record<string, unknown>).futureRigMetadata,
    ).toEqual({ enabled: true });
    expect(source).toEqual(before);
    expect(validateAsset(flipped).valid).toBe(true);
  });

  it('二重反転で座標・pose・可動域・左右roleを元へ戻し、各段のIDは独立させる', () => {
    const source = structuredClone(baseAsset);
    source.parts[0].pivot = { x: 210, y: 250 };
    source.parts[0].bindPose = {
      localPosition: { x: -8, y: 3 },
      localRotation: 25,
      localScale: { x: -1.5, y: 0.75 },
    };
    source.parts[0].rotationLimit = { min: -35, max: 20 };
    source.rigAnimations = [
      {
        id: 'rig_double',
        name: 'idle_left',
        fps: 2,
        loop: true,
        durationMs: 1000,
        keyframes: [
          {
            time: 0,
            poses: {
              part_body: {
                localPosition: { x: 5, y: 6 },
                localRotation: -10,
                localScale: { x: -2, y: 3 },
              },
            },
          },
        ],
      },
    ];

    const once = flipCopyAsset(source);
    const twice = flipCopyAsset(once);

    expect(canonicalizeFlipGraph(twice)).toEqual(canonicalizeFlipGraph(source));
    const groups = [source, once, twice].map(regeneratedIdGroups);
    for (const key of Object.keys(groups[0])) {
      const ids = groups.flatMap((group) => group[key]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(twice.textures).toEqual(source.textures);
  });

  it('省略されたFrame transformをown propertyとして追加せずJSON往復を一致させる', () => {
    const source = structuredClone(baseAsset);
    delete source.frames![0].layerStates[0].transform;

    const flipped = flipCopyAsset(source);
    const state = flipped.frames![0].layerStates[0];

    expect(Object.hasOwn(state, 'transform')).toBe(false);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('linked初回作成相当の内部ID維持modeでも空Partを厳格に拒否する', () => {
    const source = structuredClone(baseAsset);
    source.parts[0].layerIds = [];

    expect(() => flipCopyAsset(source, { preserveInternalIds: true })).toThrow(/empty/);
  });

  it('構造preflight違反は旧IDを残して成功扱いにせず、元Assetを変更しない', () => {
    const source = structuredClone(baseAsset);
    source.rigAnimations = [
      {
        id: 'rig_invalid',
        name: 'invalid',
        fps: 8,
        loop: false,
        durationMs: 1000,
        keyframes: [{ time: 0, poses: { missing_part: {} } }],
      },
    ];
    const before = structuredClone(source);
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');

    try {
      expect(() => flipCopyAsset(source)).toThrow(/ポーズ参照.*見つかりません/);
      expect(randomUUID).not.toHaveBeenCalled();
      expect(source).toEqual(before);
    } finally {
      randomUUID.mockRestore();
    }
  });
});
