import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONAL_ANIMATION_FPS,
  deriveUniformAnimationTiming,
} from './decodeAnimatedImage';

describe('deriveUniformAnimationTiming', () => {
  it('合計durationから決定的な整数fpsとinformational durationMsを作る', () => {
    expect(deriveUniformAnimationTiming([100_000, 100_000])).toEqual({
      fps: 10,
      durationMs: 200,
      playbackDurationMs: 200,
      variableDurations: false,
      missingDuration: false,
      rounded: false,
      clamped: false,
    });
  });

  it('可変durationは総時間を保持しつつuniform fpsへ丸める', () => {
    const timing = deriveUniformAnimationTiming([100_000, 200_000]);
    expect(timing.fps).toBe(7);
    expect(timing.durationMs).toBe(300);
    expect(timing.variableDurations).toBe(true);
    expect(timing.rounded).toBe(true);
    expect(timing.playbackDurationMs).toBeCloseTo(285.714, 3);
  });

  it('duration欠損は8fpsへfallbackし、極端な値は1〜240fpsへclampする', () => {
    const missing = deriveUniformAnimationTiming([null, 100_000]);
    expect(missing).toMatchObject({
      fps: DEFAULT_OPTIONAL_ANIMATION_FPS,
      missingDuration: true,
    });
    expect(missing.durationMs).toBeUndefined();
    expect(deriveUniformAnimationTiming([1_000])).toMatchObject({ fps: 240, clamped: true });
    expect(deriveUniformAnimationTiming([3_000_000])).toMatchObject({ fps: 1, clamped: true });
  });
});
