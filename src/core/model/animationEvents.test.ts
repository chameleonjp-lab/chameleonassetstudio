import { describe, expect, it } from 'vitest';
import sample from '../samples/asset.character.json';
import type { Asset } from './asset';
import {
  addAnimationEvent,
  animationEventFrameCandidates,
  changeAnimationEventFrame,
  removeAnimationEvent,
  renameAnimationEvent,
} from './animationEvents';

function fixture(): Asset {
  const asset = structuredClone(sample) as unknown as Asset;
  asset.frames = [
    { id: 'frame_a', name: 'A', layerStates: [] },
    { id: 'frame_b', name: 'B', layerStates: [] },
  ];
  asset.animations = [
    {
      id: 'animation_1',
      name: 'walk',
      frameIds: ['frame_a', 'frame_b', 'frame_a', 'missing'],
      fps: 12,
      loop: true,
      events: [
        {
          id: 'event_existing',
          name: 'step',
          frameId: 'frame_a',
          payload: { volume: 1 },
          future: 'keep',
        } as never,
        { id: 'event_dangling', name: 'old', frameId: 'outside' },
      ],
    },
  ];
  return asset;
}

describe('D3 animation event editing', () => {
  it('候補を再生順に重複除去し、参照切れを候補にしない', () => {
    expect(animationEventFrameCandidates(fixture(), 'animation_1')).toEqual(['frame_a', 'frame_b']);
  });

  it('名前とFrameを明示したeventを末尾へ追加し、入力を変更しない', () => {
    const source = fixture();
    const result = addAnimationEvent(source, 'animation_1', ' step ', 'frame_b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asset).not.toBe(source);
    expect(source.animations[0].events).toHaveLength(2);
    expect(result.asset.animations[0].events?.at(-1)).toMatchObject({
      name: ' step ',
      frameId: 'frame_b',
    });
    expect(result.asset.animations[0].events?.at(-1)?.id).not.toBe('event_existing');
    expect(result.asset.animations[0].events?.at(-1)?.payload).toBeUndefined();
  });

  it('空名とAnimation外Frameを拒否し、重複名は許可する', () => {
    const source = fixture();
    expect(addAnimationEvent(source, 'animation_1', '   ', 'frame_a')).toMatchObject({
      ok: false,
      asset: source,
    });
    expect(addAnimationEvent(source, 'animation_1', 'step', 'outside')).toMatchObject({
      ok: false,
      asset: source,
    });
    expect(addAnimationEvent(source, 'animation_1', 'step', 'frame_a')).toMatchObject({
      ok: true,
      changed: true,
    });
  });

  it('exact write-setで未知項目・payload・無効参照・順序を保持する', () => {
    const source = fixture();
    const renamed = renameAnimationEvent(source, 'animation_1', 'event_dangling', 'renamed');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.asset.animations[0].events?.[1]).toMatchObject({
      id: 'event_dangling',
      name: 'renamed',
      frameId: 'outside',
    });

    const changed = changeAnimationEventFrame(
      renamed.asset,
      'animation_1',
      'event_existing',
      'frame_b',
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.asset.animations[0].events?.[0]).toMatchObject({
      id: 'event_existing',
      name: 'step',
      frameId: 'frame_b',
      payload: { volume: 1 },
      future: 'keep',
    });
    expect(source.animations[0].events?.[0].frameId).toBe('frame_a');
  });

  it('対象eventだけを削除し、no-opではAssetを変更しない', () => {
    const source = fixture();
    const removed = removeAnimationEvent(source, 'animation_1', 'event_existing');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.asset.animations[0].events?.map(({ id }) => id)).toEqual(['event_dangling']);

    const noop = renameAnimationEvent(source, 'animation_1', 'event_existing', 'step');
    expect(noop).toEqual({ ok: true, asset: source, changed: false });
  });
});
