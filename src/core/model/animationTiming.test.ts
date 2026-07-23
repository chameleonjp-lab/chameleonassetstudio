import { describe, expect, it, vi } from 'vitest';
import type { Animation, Frame } from './animation';
import {
  calculateAnimationDurationMs,
  createAnimationPlayback,
  effectiveFrameDurationMs,
  type AnimationPlaybackClock,
} from './animationTiming';

class TestClock implements AnimationPlaybackClock {
  private now = 0;
  private nextId = 1;
  private timers = new Map<number, { due: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { due: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(delayMs: number): void {
    const target = this.now + delayMs;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!next) {
        break;
      }
      const [id, timer] = next;
      this.timers.delete(id);
      this.now = timer.due;
      timer.callback();
    }
    this.now = target;
  }
}

const frames: Frame[] = [
  { id: 'frame_a', name: 'A', durationMs: 250, layerStates: [] },
  { id: 'frame_b', name: 'B', layerStates: [] },
];

const animation: Animation = {
  id: 'anim',
  name: 'walk',
  fps: 10,
  loop: false,
  frameIds: ['frame_a', 'frame_b', 'frame_a'],
  durationMs: 9999,
  events: [
    { id: 'event_a1', name: 'step', frameId: 'frame_a' },
    { id: 'event_a2', name: 'sound', frameId: 'frame_a', payload: { volume: 0.5 } },
    { id: 'event_b', name: 'turn', frameId: 'frame_b', payload: ['left', 1, true, null] },
  ],
};

describe('animation timing', () => {
  it('Frame overrideとfps fallbackを使い、同じFrameの各出現を合計する', () => {
    expect(effectiveFrameDurationMs(animation, frames[0])).toBe(250);
    expect(effectiveFrameDurationMs(animation, frames[1])).toBe(100);
    expect(calculateAnimationDurationMs(animation, frames)).toBe(600);
  });

  it('Animation.durationMsを無視し、共有Frameのoverrideを各Animationで使う', () => {
    const other: Animation = {
      ...animation,
      id: 'other',
      fps: 2,
      frameIds: ['frame_a', 'frame_b'],
      durationMs: 1,
    };
    expect(calculateAnimationDurationMs(other, frames)).toBe(750);
  });

  it('不正なfps・durationまたは参照切れでは計算不能を返す', () => {
    expect(effectiveFrameDurationMs({ ...animation, fps: 0 }, frames[1])).toBeNull();
    expect(effectiveFrameDurationMs(animation, undefined)).toBeNull();
    expect(
      effectiveFrameDurationMs(animation, { ...frames[0], durationMs: Number.NaN }),
    ).toBeNull();
    expect(
      calculateAnimationDurationMs({ ...animation, frameIds: ['missing'] }, frames),
    ).toBeNull();
  });
});

describe('animation playback scheduler', () => {
  it('先頭を即時表示し、各実効時間の境界で順送りして非loopを終了する', () => {
    const clock = new TestClock();
    const onFrameStart = vi.fn();
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const playback = createAnimationPlayback({
      animation,
      frames,
      clock,
      onFrameStart,
      onEvent,
      onComplete,
    });

    playback.start();
    expect(onFrameStart.mock.calls).toEqual([['frame_a', 0]]);
    expect(onEvent.mock.calls.map(([event, index]) => [event.id, index])).toEqual([
      ['event_a1', 0],
      ['event_a2', 0],
    ]);

    clock.advance(249);
    expect(onFrameStart).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(onFrameStart).toHaveBeenLastCalledWith('frame_b', 1);
    expect(onEvent).toHaveBeenLastCalledWith(animation.events?.[2], 1);

    clock.advance(100);
    expect(onFrameStart).toHaveBeenLastCalledWith('frame_a', 2);
    expect(onEvent.mock.calls.map(([event, index]) => [event.id, index])).toEqual([
      ['event_a1', 0],
      ['event_a2', 0],
      ['event_b', 1],
      ['event_a1', 2],
      ['event_a2', 2],
    ]);

    clock.advance(250);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(playback.isRunning()).toBe(false);
  });

  it('loopの各周回で先頭Frameとイベントを再発火する', () => {
    const clock = new TestClock();
    const loopAnimation: Animation = {
      ...animation,
      loop: true,
      frameIds: ['frame_a', 'frame_b'],
      events: [{ id: 'loop_event', name: 'again', frameId: 'frame_a' }],
    };
    const onFrameStart = vi.fn();
    const onEvent = vi.fn();
    const playback = createAnimationPlayback({
      animation: loopAnimation,
      frames,
      clock,
      onFrameStart,
      onEvent,
    });

    playback.start();
    clock.advance(250);
    clock.advance(100);

    expect(onFrameStart.mock.calls).toEqual([
      ['frame_a', 0],
      ['frame_b', 1],
      ['frame_a', 0],
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('停止後は予約済みのFrame・イベント・完了を通知しない', () => {
    const clock = new TestClock();
    const onFrameStart = vi.fn();
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const playback = createAnimationPlayback({
      animation,
      frames,
      clock,
      onFrameStart,
      onEvent,
      onComplete,
    });

    playback.start();
    playback.stop();
    clock.advance(10_000);

    expect(onFrameStart).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onComplete).not.toHaveBeenCalled();
    expect(playback.isRunning()).toBe(false);
  });

  it('参照切れFrameでは表示やeventを通知せず安全に終了する', () => {
    const clock = new TestClock();
    const onFrameStart = vi.fn();
    const onEvent = vi.fn();
    const onComplete = vi.fn();
    const playback = createAnimationPlayback({
      animation: {
        ...animation,
        frameIds: ['missing'],
        events: [{ id: 'dangling', name: 'unsafe', frameId: 'missing' }],
      },
      frames,
      clock,
      onFrameStart,
      onEvent,
      onComplete,
    });

    playback.start();

    expect(onFrameStart).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(playback.isRunning()).toBe(false);
  });
});
