import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import { validateAsset } from '../schema/validate';
import type { Asset } from './asset';
import { flipCopyAsset, swapLeftRightLabel } from './flipCopy';

const baseAsset = characterAsset as unknown as Asset;
// 反転軸 mirrorX = origin.x = 256、reflect(x) = 512 - x。

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
    (flipped.animations[0].events?.[0].payload as { side: string }).side = 'changed';
    expect(source.animations[0].events?.[0].payload).toEqual({ side: 'left' });
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

  it('リグ編集データ（rigAnimations）は本コピーでは省く', () => {
    const withRig: Asset = {
      ...baseAsset,
      rigAnimations: [
        { id: 'rig_1', name: 'test', fps: 8, loop: true, durationMs: 1000, keyframes: [] },
      ],
    };
    const flipped = flipCopyAsset(withRig);
    expect(flipped.rigAnimations).toBeUndefined();
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
});
