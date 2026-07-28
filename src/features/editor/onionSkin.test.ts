import { describe, expect, it } from 'vitest';
import type { Animation } from '../../core/model';
import {
  ONION_SKIN_NEXT_COLOR,
  ONION_SKIN_OPACITY,
  ONION_SKIN_PREVIOUS_COLOR,
  resolveOnionSkinOccurrences,
} from './onionSkin';

const availableFrameIds = new Set(['frame_a', 'frame_b', 'frame_c']);
const animation: Animation = {
  id: 'animation',
  name: 'A B A C',
  fps: 8,
  loop: false,
  frameIds: ['frame_a', 'frame_b', 'frame_a', 'frame_c'],
};

describe('resolveOnionSkinOccurrences', () => {
  it('non-loopの先頭・途中・末尾を出現位置で解決する', () => {
    expect(resolveOnionSkinOccurrences(animation, 0, availableFrameIds)).toEqual({
      previous: null,
      next: { frameId: 'frame_b', occurrenceIndex: 1 },
    });
    expect(resolveOnionSkinOccurrences(animation, 2, availableFrameIds)).toEqual({
      previous: { frameId: 'frame_b', occurrenceIndex: 1 },
      next: { frameId: 'frame_c', occurrenceIndex: 3 },
    });
    expect(resolveOnionSkinOccurrences(animation, 3, availableFrameIds)).toEqual({
      previous: { frameId: 'frame_a', occurrenceIndex: 2 },
      next: null,
    });
  });

  it('loopの端を接続し、同じFrame IDでも異なる出現位置を保持する', () => {
    const loopAnimation = { ...animation, loop: true };
    expect(resolveOnionSkinOccurrences(loopAnimation, 0, availableFrameIds)).toEqual({
      previous: { frameId: 'frame_c', occurrenceIndex: 3 },
      next: { frameId: 'frame_b', occurrenceIndex: 1 },
    });
    expect(resolveOnionSkinOccurrences(loopAnimation, 3, availableFrameIds)).toEqual({
      previous: { frameId: 'frame_a', occurrenceIndex: 2 },
      next: { frameId: 'frame_a', occurrenceIndex: 0 },
    });
  });

  it('空・不正位置・1出現・現在位置の参照切れではghostを返さない', () => {
    expect(
      resolveOnionSkinOccurrences({ ...animation, frameIds: [] }, 0, availableFrameIds),
    ).toEqual({
      previous: null,
      next: null,
    });
    expect(resolveOnionSkinOccurrences(animation, null, availableFrameIds)).toEqual({
      previous: null,
      next: null,
    });
    expect(resolveOnionSkinOccurrences(animation, -1, availableFrameIds)).toEqual({
      previous: null,
      next: null,
    });
    expect(resolveOnionSkinOccurrences(animation, 4, availableFrameIds)).toEqual({
      previous: null,
      next: null,
    });
    expect(
      resolveOnionSkinOccurrences(
        { ...animation, loop: true, frameIds: ['frame_a'] },
        0,
        availableFrameIds,
      ),
    ).toEqual({ previous: null, next: null });
    expect(
      resolveOnionSkinOccurrences(
        { ...animation, frameIds: ['missing', 'frame_b'] },
        0,
        availableFrameIds,
      ),
    ).toEqual({ previous: null, next: null });
  });

  it('隣の参照切れだけを除外し、2出現loopでは同じ相手の出現位置を両方向に返す', () => {
    expect(
      resolveOnionSkinOccurrences(
        { ...animation, frameIds: ['frame_a', 'missing', 'frame_c'] },
        0,
        availableFrameIds,
      ),
    ).toEqual({
      previous: null,
      next: null,
    });
    expect(
      resolveOnionSkinOccurrences(
        { ...animation, loop: true, frameIds: ['frame_a', 'frame_b'] },
        0,
        availableFrameIds,
      ),
    ).toEqual({
      previous: { frameId: 'frame_b', occurrenceIndex: 1 },
      next: { frameId: 'frame_b', occurrenceIndex: 1 },
    });
  });
});

describe('onion skin display contract', () => {
  it('前は赤系、次は青系、透明度は25%で固定する', () => {
    expect(ONION_SKIN_PREVIOUS_COLOR).toMatch(/^#d/i);
    expect(ONION_SKIN_NEXT_COLOR).toMatch(/^#2/i);
    expect(ONION_SKIN_OPACITY).toBe(0.25);
  });
});
