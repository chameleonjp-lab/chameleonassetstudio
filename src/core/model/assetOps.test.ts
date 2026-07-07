import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import { validateAsset } from '../schema/validate';
import type { Asset } from './asset';
import {
  addGuideLayer,
  createPart,
  flipLayerHorizontal,
  moveLayerOrder,
  removeLayer,
  removePart,
  renameLayer,
  setLayerLocked,
  setLayerVisibility,
  updatePart,
} from './assetOps';

const baseAsset = characterAsset as unknown as Asset;

describe('レイヤー操作', () => {
  it('renameLayer は対象レイヤーだけ名前を変える', () => {
    const next = renameLayer(baseAsset, 'layer_body', '胴体');
    expect(next.layers.find((l) => l.id === 'layer_body')?.name).toBe('胴体');
    expect(next.layers.find((l) => l.id === 'layer_guide')?.name).toBe('guide');
    // 元のアセットは変更しない
    expect(baseAsset.layers.find((l) => l.id === 'layer_body')?.name).toBe('body');
  });

  it('表示とロックを切り替えられ、schema 検証を通る', () => {
    const hidden = setLayerVisibility(baseAsset, 'layer_body', false);
    expect(hidden.layers[0].visible).toBe(false);
    const locked = setLayerLocked(hidden, 'layer_body', true);
    expect(locked.layers[0].locked).toBe(true);
    expect(validateAsset(locked).valid).toBe(true);
  });

  it('flipLayerHorizontal は scale.x の符号だけを反転し、非破壊で二度反転すると戻る', () => {
    const flipped = flipLayerHorizontal(baseAsset, 'layer_body');
    const body = flipped.layers.find((l) => l.id === 'layer_body')!;
    // scale.x のみ符号反転、他の変形フィールドは維持する
    expect(body.transform.scale.x).toBe(-1);
    expect(body.transform.scale.y).toBe(1);
    expect(body.transform.position).toEqual({ x: 0, y: 0 });
    expect(body.transform.rotation).toBe(0);
    // 対象外レイヤーは変えない
    expect(flipped.layers.find((l) => l.id === 'layer_guide')?.transform.scale.x).toBe(1);
    // 元アセットは破壊しない
    expect(baseAsset.layers.find((l) => l.id === 'layer_body')?.transform.scale.x).toBe(1);
    // schema 検証を通る（version は上げない非破壊操作）
    expect(validateAsset(flipped).valid).toBe(true);
    expect(flipped.version).toBe(baseAsset.version);
    // 二度反転すると元の向きへ戻る
    const twice = flipLayerHorizontal(flipped, 'layer_body');
    expect(twice.layers.find((l) => l.id === 'layer_body')?.transform.scale.x).toBe(1);
  });

  it('moveLayerOrder で前面・背面へ動かせる', () => {
    // layer_body（先頭 = 最背面）を前面へ
    const forward = moveLayerOrder(baseAsset, 'layer_body', 'forward');
    expect(forward.layers.map((l) => l.id)).toEqual(['layer_guide', 'layer_body']);
    // 端にある場合は何もしない
    const noop = moveLayerOrder(forward, 'layer_body', 'forward');
    expect(noop.layers.map((l) => l.id)).toEqual(['layer_guide', 'layer_body']);
    const backward = moveLayerOrder(forward, 'layer_body', 'backward');
    expect(backward.layers.map((l) => l.id)).toEqual(['layer_body', 'layer_guide']);
  });

  it('removeLayer はパーツからの参照も外す', () => {
    const next = removeLayer(baseAsset, 'layer_body');
    expect(next.layers.some((l) => l.id === 'layer_body')).toBe(false);
    expect(next.parts.find((p) => p.id === 'part_body')?.layerIds).toEqual([]);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('addGuideLayer は最前面へガイドレイヤーを足す', () => {
    const next = addGuideLayer(baseAsset, '中心線');
    expect(next.layers).toHaveLength(3);
    const added = next.layers.at(-1)!;
    expect(added.layerType).toBe('guide');
    expect(added.name).toBe('中心線');
    expect(validateAsset(next).valid).toBe(true);
  });
});

describe('パーツ操作', () => {
  it('createPart は存在するレイヤーだけを紐づける', () => {
    const next = createPart(baseAsset, {
      name: '武器',
      partType: 'weapon',
      layerIds: ['layer_body', 'layer_missing'],
      pivot: { x: 10, y: 20 },
    });
    const part = next.parts.at(-1)!;
    expect(part.partType).toBe('weapon');
    expect(part.layerIds).toEqual(['layer_body']);
    expect(part.pivot).toEqual({ x: 10, y: 20 });
    expect(validateAsset(next).valid).toBe(true);
  });

  it('updatePart で種別と pivot を変更できる', () => {
    const next = updatePart(baseAsset, 'part_body', {
      partType: 'accessory',
      pivot: { x: 5, y: 6 },
      name: '飾り',
    });
    const part = next.parts.find((p) => p.id === 'part_body')!;
    expect(part.partType).toBe('accessory');
    expect(part.pivot).toEqual({ x: 5, y: 6 });
    expect(part.name).toBe('飾り');
    expect(validateAsset(next).valid).toBe(true);
  });

  it('removePart でパーツが消える（レイヤーは残る）', () => {
    const next = removePart(baseAsset, 'part_body');
    expect(next.parts).toHaveLength(0);
    expect(next.layers).toHaveLength(baseAsset.layers.length);
  });
});

describe('原点、アンカー、当たり判定（Phase 8）', () => {
  it('setOrigin と resetOriginToBottomCenter が働く', async () => {
    const { setOrigin, resetOriginToBottomCenter } = await import('./assetOps');
    const moved = setOrigin(baseAsset, { x: 10, y: 20 });
    expect(moved.origin).toEqual({ x: 10, y: 20 });
    const reset = resetOriginToBottomCenter(moved);
    expect(reset.origin).toEqual({ x: 256, y: 512 });
    expect(validateAsset(reset).valid).toBe(true);
  });

  it('アンカーを追加・更新・削除できる', async () => {
    const { addAnchor, updateAnchor, removeAnchor } = await import('./assetOps');
    const added = addAnchor(baseAsset, { role: 'weapon', position: { x: 5, y: 6 } });
    const anchor = added.anchors.at(-1)!;
    expect(anchor.role).toBe('weapon');
    expect(anchor.name).toBe('weapon');
    expect(anchor.position).toEqual({ x: 5, y: 6 });
    expect(validateAsset(added).valid).toBe(true);

    const updated = updateAnchor(added, anchor.id, {
      name: '剣先',
      role: 'projectile_spawn',
      position: { x: 7, y: 8 },
    });
    const after = updated.anchors.find((a) => a.id === anchor.id)!;
    expect(after.name).toBe('剣先');
    expect(after.role).toBe('projectile_spawn');
    expect(validateAsset(updated).valid).toBe(true);

    const removed = removeAnchor(updated, anchor.id);
    expect(removed.anchors.some((a) => a.id === anchor.id)).toBe(false);
  });

  it('矩形と円の当たり判定を追加でき、schema 検証を通る', async () => {
    const { addRectCollider, addCircleCollider } = await import('./assetOps');
    const withRect = addRectCollider(baseAsset, 'attack');
    const rect = withRect.colliders.at(-1)!;
    expect(rect.shape).toBe('rect');
    expect(rect.purpose).toBe('attack');
    expect(validateAsset(withRect).valid).toBe(true);

    const withCircle = addCircleCollider(withRect, 'sensor');
    const circle = withCircle.colliders.at(-1)!;
    expect(circle.shape).toBe('circle');
    if (circle.shape === 'circle') {
      expect(circle.circle.radius).toBeGreaterThan(0);
    }
    expect(validateAsset(withCircle).valid).toBe(true);
  });

  it('updateCollider は形状に応じたフィールドを更新し、表示も切り替えられる', async () => {
    const { updateCollider } = await import('./assetOps');
    const updated = updateCollider(baseAsset, 'col_body', {
      purpose: 'sensor',
      visible: false,
      rect: { width: 10 },
    });
    const collider = updated.colliders.find((c) => c.id === 'col_body')!;
    expect(collider.purpose).toBe('sensor');
    expect(collider.visible).toBe(false);
    if (collider.shape === 'rect') {
      expect(collider.rect.width).toBe(10);
      expect(collider.rect.x).toBe(192); // 他のフィールドは維持
    }
    expect(validateAsset(updated).valid).toBe(true);
  });

  it('removeCollider で判定が消える', async () => {
    const { removeCollider } = await import('./assetOps');
    const removed = removeCollider(baseAsset, 'col_body');
    expect(removed.colliders.some((c) => c.id === 'col_body')).toBe(false);
    expect(removed.colliders).toHaveLength(baseAsset.colliders.length - 1);
  });

  it('moveCollider は snap OFF で rect の x/y だけを 1px 移動し、サイズを維持する', async () => {
    const { moveCollider } = await import('./assetOps');
    const moved = moveCollider(baseAsset, 'col_body', {
      direction: 'right',
      snapEnabled: false,
      gridSize: 16,
    });
    const collider = moved.colliders.find((c) => c.id === 'col_body')!;
    expect(collider.shape).toBe('rect');
    if (collider.shape === 'rect') {
      expect(collider.rect.x).toBe(193);
      expect(collider.rect.y).toBe(192);
      expect(collider.rect.width).toBe(128);
      expect(collider.rect.height).toBe(256);
    }
    expect(validateAsset(moved).valid).toBe(true);
  });

  it('moveCollider は snap ON で grid size 分移動し、grid に揃える', async () => {
    const { moveCollider, updateCollider } = await import('./assetOps');
    const offGrid = updateCollider(baseAsset, 'col_body', { rect: { x: 193 } });
    const moved = moveCollider(offGrid, 'col_body', {
      direction: 'right',
      snapEnabled: true,
      gridSize: 16,
    });
    const collider = moved.colliders.find((c) => c.id === 'col_body')!;
    expect(collider.shape).toBe('rect');
    if (collider.shape === 'rect') {
      expect(collider.rect.x).toBe(208);
      expect(collider.rect.x % 16).toBe(0);
      expect(collider.rect.width).toBe(128);
      expect(collider.rect.height).toBe(256);
    }
    expect(validateAsset(moved).valid).toBe(true);
  });

  it('moveCollider は circle の x/y だけを移動し、radius を維持する', async () => {
    const { addCircleCollider, moveCollider } = await import('./assetOps');
    const withCircle = addCircleCollider(baseAsset);
    const circle = withCircle.colliders.at(-1)!;
    const moved = moveCollider(withCircle, circle.id, {
      direction: 'up',
      snapEnabled: false,
      gridSize: 16,
    });
    const after = moved.colliders.find((c) => c.id === circle.id)!;
    expect(after.shape).toBe('circle');
    if (after.shape === 'circle' && circle.shape === 'circle') {
      expect(after.circle.x).toBe(circle.circle.x);
      expect(after.circle.y).toBe(circle.circle.y - 1);
      expect(after.circle.radius).toBe(circle.circle.radius);
    }
    expect(validateAsset(moved).valid).toBe(true);
  });

  it('moveCollider は非表示または存在しない判定を変更しない', async () => {
    const { moveCollider, updateCollider } = await import('./assetOps');
    const hidden = updateCollider(baseAsset, 'col_body', { visible: false });
    expect(
      moveCollider(hidden, 'col_body', { direction: 'right', snapEnabled: false, gridSize: 16 }),
    ).toBe(hidden);
    expect(
      moveCollider(baseAsset, 'missing', { direction: 'right', snapEnabled: false, gridSize: 16 }),
    ).toBe(baseAsset);
  });
});

describe('フレームとアニメーション（Phase 9）', () => {
  it('captureFrame は全レイヤーの状態を取り込む', async () => {
    const { captureFrame } = await import('./assetOps');
    const next = captureFrame(baseAsset, 'my_frame');
    const frame = next.frames!.at(-1)!;
    expect(frame.name).toBe('my_frame');
    expect(frame.layerStates).toHaveLength(baseAsset.layers.length);
    expect(frame.layerStates.map((s) => s.layerId)).toEqual(baseAsset.layers.map((l) => l.id));
    const bodyState = frame.layerStates.find((s) => s.layerId === 'layer_body')!;
    expect(bodyState.visible).toBe(true);
    expect(bodyState.opacity).toBe(1);
    expect(bodyState.transform).toEqual(
      baseAsset.layers.find((l) => l.id === 'layer_body')!.transform,
    );
    expect(validateAsset(next).valid).toBe(true);
  });

  it('captureFrame は名前省略時に連番の名前を付け、frames が無いアセットでも動く', async () => {
    const { captureFrame } = await import('./assetOps');
    const withoutFrames: Asset = { ...baseAsset, frames: undefined };
    const next = captureFrame(withoutFrames);
    expect(next.frames).toHaveLength(1);
    expect(next.frames![0].name).toBe('frame_1');
    expect(validateAsset(next).valid).toBe(true);
  });

  it('renameFrame は対象フレームだけ名前を変える', async () => {
    const { renameFrame } = await import('./assetOps');
    const next = renameFrame(baseAsset, 'frame_idle_0', 'idle_a');
    expect(next.frames!.find((f) => f.id === 'frame_idle_0')?.name).toBe('idle_a');
    expect(next.frames!.find((f) => f.id === 'frame_idle_1')?.name).toBe('idle_1');
    expect(validateAsset(next).valid).toBe(true);
  });

  it('moveFrameOrder で前後に動かせる', async () => {
    const { moveFrameOrder } = await import('./assetOps');
    const forward = moveFrameOrder(baseAsset, 'frame_idle_0', 'forward');
    expect(forward.frames!.map((f) => f.id)).toEqual(['frame_idle_1', 'frame_idle_0']);
    // 端にある場合は何もしない
    const noop = moveFrameOrder(forward, 'frame_idle_0', 'forward');
    expect(noop.frames!.map((f) => f.id)).toEqual(['frame_idle_1', 'frame_idle_0']);
    const backward = moveFrameOrder(forward, 'frame_idle_0', 'backward');
    expect(backward.frames!.map((f) => f.id)).toEqual(['frame_idle_0', 'frame_idle_1']);
    expect(validateAsset(backward).valid).toBe(true);
  });

  it('duplicateFrame は直後に複製を挿入する', async () => {
    const { duplicateFrame } = await import('./assetOps');
    const next = duplicateFrame(baseAsset, 'frame_idle_0');
    expect(next.frames).toHaveLength(3);
    expect(next.frames![1].name).toBe('idle_0_copy');
    expect(next.frames![1].id).not.toBe('frame_idle_0');
    expect(next.frames![1].layerStates).toEqual(baseAsset.frames![0].layerStates);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('removeFrame はアニメーションの frameIds からも除去する', async () => {
    const { removeFrame } = await import('./assetOps');
    const next = removeFrame(baseAsset, 'frame_idle_0');
    expect(next.frames!.some((f) => f.id === 'frame_idle_0')).toBe(false);
    expect(next.animations[0].frameIds).toEqual(['frame_idle_1']);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('addAnimation は既定 fps / loop を持ち、存在しない frameId を除外する', async () => {
    const { addAnimation } = await import('./assetOps');
    const next = addAnimation(baseAsset, {
      name: 'walk',
      frameIds: ['frame_idle_0', 'frame_missing'],
    });
    const animation = next.animations.at(-1)!;
    expect(animation.name).toBe('walk');
    expect(animation.fps).toBe(8);
    expect(animation.loop).toBe(true);
    expect(animation.frameIds).toEqual(['frame_idle_0']);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('updateAnimation は fps を 1〜240 にクランプし、存在しない frameId を除外する', async () => {
    const { updateAnimation } = await import('./assetOps');
    const tooHigh = updateAnimation(baseAsset, 'anim_idle', { fps: 999 });
    expect(tooHigh.animations[0].fps).toBe(240);
    const tooLow = updateAnimation(baseAsset, 'anim_idle', { fps: -5 });
    expect(tooLow.animations[0].fps).toBe(1);
    const filtered = updateAnimation(baseAsset, 'anim_idle', {
      frameIds: ['frame_idle_0', 'frame_missing'],
      loop: false,
    });
    expect(filtered.animations[0].frameIds).toEqual(['frame_idle_0']);
    expect(filtered.animations[0].loop).toBe(false);
    expect(validateAsset(filtered).valid).toBe(true);
  });

  it('removeAnimation でアニメーションが消える', async () => {
    const { removeAnimation } = await import('./assetOps');
    const next = removeAnimation(baseAsset, 'anim_idle');
    expect(next.animations).toHaveLength(0);
    expect(validateAsset(next).valid).toBe(true);
  });

  it('applyFrameToAsset はレイヤーへ transform を適用し、updatedAt を変えない', async () => {
    const { applyFrameToAsset } = await import('./assetOps');
    const next = applyFrameToAsset(baseAsset, 'frame_idle_1');
    const body = next.layers.find((l) => l.id === 'layer_body')!;
    expect(body.transform.position).toEqual({ x: 0, y: -4 });
    expect(next.updatedAt).toBe(baseAsset.updatedAt);
    expect(next.frames).toBe(baseAsset.frames);
    // 存在しないフレーム id では元のアセットをそのまま返す
    expect(applyFrameToAsset(baseAsset, 'missing')).toBe(baseAsset);
  });
});

describe('型別設定（Phase 14）', () => {
  it('setAssetType はアセット種別を変える', async () => {
    const { setAssetType } = await import('./assetOps');
    const next = setAssetType(baseAsset, 'tile');
    expect(next.assetType).toBe('tile');
    expect(baseAsset.assetType).not.toBe('tile');
    expect(validateAsset(next).valid).toBe(true);
  });

  it('setTileSettings は設定を追加・削除できる', async () => {
    const { setTileSettings } = await import('./assetOps');
    const tile = {
      tileSize: { width: 32, height: 32 },
      collisionType: 'solid',
      visualType: 'floor',
    } as const;
    const withTile = setTileSettings({ ...baseAsset, assetType: 'tile' }, tile);
    expect(withTile.tile).toEqual(tile);
    expect(validateAsset(withTile).valid).toBe(true);
    const removed = setTileSettings(withTile, undefined);
    expect(removed.tile).toBeUndefined();
  });

  it('setGimmickSettings は設定を追加・削除できる', async () => {
    const { setGimmickSettings } = await import('./assetOps');
    const withGimmick = setGimmickSettings(
      { ...baseAsset, assetType: 'gimmick' },
      { movementPreset: 'horizontal' },
    );
    expect(withGimmick.gimmick).toEqual({ movementPreset: 'horizontal' });
    expect(validateAsset(withGimmick).valid).toBe(true);
    const removed = setGimmickSettings(withGimmick, undefined);
    expect(removed.gimmick).toBeUndefined();
  });

  it('setEffectSettings は設定を追加・削除できる', async () => {
    const { setEffectSettings } = await import('./assetOps');
    const effect = {
      effectType: 'spark',
      durationMs: 500,
      loop: false,
      blendMode: 'normal',
    } as const;
    const withEffect = setEffectSettings({ ...baseAsset, assetType: 'effect' }, effect);
    expect(withEffect.effect).toEqual(effect);
    expect(validateAsset(withEffect).valid).toBe(true);
    const removed = setEffectSettings(withEffect, undefined);
    expect(removed.effect).toBeUndefined();
  });

  it('setLayerBackground は対象レイヤーへ設定し、無い場合はそのまま返す', async () => {
    const { setLayerBackground } = await import('./assetOps');
    const background = {
      role: 'mid',
      parallaxSpeed: { x: 0.5, y: 0 },
      loopX: true,
      loopY: false,
    } as const;
    const withBackground = setLayerBackground(
      { ...baseAsset, assetType: 'background' },
      'layer_body',
      background,
    );
    expect(withBackground.layers.find((l) => l.id === 'layer_body')?.background).toEqual(
      background,
    );
    expect(validateAsset(withBackground).valid).toBe(true);
    const removed = setLayerBackground(withBackground, 'layer_body', undefined);
    expect(removed.layers.find((l) => l.id === 'layer_body')?.background).toBeUndefined();
    expect(setLayerBackground(baseAsset, 'missing', background)).toBe(baseAsset);
  });

  it('setGameAttribute / removeGameAttribute でゲーム属性を操作できる', async () => {
    const { setGameAttribute, removeGameAttribute } = await import('./assetOps');
    const withScore = setGameAttribute(baseAsset, 'score', 0);
    expect(withScore.gameAttributes.score).toBe(0);
    expect(validateAsset(withScore).valid).toBe(true);
    const removed = removeGameAttribute(withScore, 'score');
    expect(removed.gameAttributes.score).toBeUndefined();
  });
});

describe('簡易リグ（Phase 15）', () => {
  const rigAsset: Asset = {
    ...baseAsset,
    parts: [
      { id: 'part_a', name: 'A', partType: 'body', layerIds: [] },
      { id: 'part_b', name: 'B', partType: 'body', layerIds: [], parentId: 'part_a' },
      { id: 'part_c', name: 'C', partType: 'body', layerIds: [], parentId: 'part_b' },
    ],
  };

  it('setPartParent は自己参照や循環になる変更を無視して asset をそのまま返す', async () => {
    const { setPartParent } = await import('./assetOps');
    const selfParent = setPartParent(rigAsset, 'part_a', 'part_a');
    expect(selfParent).toBe(rigAsset);
    // part_c は part_a の子孫なので、part_a の親を part_c にすると循環になる
    const cyclic = setPartParent(rigAsset, 'part_a', 'part_c');
    expect(cyclic).toBe(rigAsset);
  });

  it('setPartParent は循環にならない変更を反映する', async () => {
    const { setPartParent } = await import('./assetOps');
    const next = setPartParent(rigAsset, 'part_c', 'part_a');
    expect(next.parts.find((p) => p.id === 'part_c')?.parentId).toBe('part_a');
    expect(validateAsset(next).valid).toBe(true);
    const cleared = setPartParent(next, 'part_c', undefined);
    expect(cleared.parts.find((p) => p.id === 'part_c')?.parentId).toBeUndefined();
  });

  it('setPartBindPose でバインドポーズを設定・解除できる', async () => {
    const { setPartBindPose } = await import('./assetOps');
    const withPose = setPartBindPose(rigAsset, 'part_a', {
      localPosition: { x: 1, y: 2 },
      localRotation: 10,
    });
    expect(withPose.parts.find((p) => p.id === 'part_a')?.bindPose).toEqual({
      localPosition: { x: 1, y: 2 },
      localRotation: 10,
    });
    const cleared = setPartBindPose(withPose, 'part_a', undefined);
    expect(cleared.parts.find((p) => p.id === 'part_a')?.bindPose).toBeUndefined();
  });

  it('setPartRotationLimit で可動域を設定・解除できる', async () => {
    const { setPartRotationLimit } = await import('./assetOps');
    const withLimit = setPartRotationLimit(rigAsset, 'part_a', { min: -30, max: 30 });
    expect(withLimit.parts.find((p) => p.id === 'part_a')?.rotationLimit).toEqual({
      min: -30,
      max: 30,
    });
    const cleared = setPartRotationLimit(withLimit, 'part_a', undefined);
    expect(cleared.parts.find((p) => p.id === 'part_a')?.rotationLimit).toBeUndefined();
  });

  it('setRigAnimations は配列を丸ごと置き換える', async () => {
    const { setRigAnimations } = await import('./assetOps');
    const rig = {
      id: 'rig_1',
      name: 'test',
      fps: 8,
      loop: true,
      durationMs: 1000,
      keyframes: [],
    };
    const next = setRigAnimations(rigAsset, [rig]);
    expect(next.rigAnimations).toEqual([rig]);
  });
});
