import type { Animation, AnimationEvent, Frame } from './animation';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * 1回のFrame出現に使う実効表示時間。
 * 不正なoverrideまたはfpsはnullを返し、呼び出し側が検査結果として扱う。
 */
export function effectiveFrameDurationMs(
  animation: Animation,
  frame: Frame | undefined,
): number | null {
  if (!frame) {
    return null;
  }
  if (frame.durationMs !== undefined) {
    return Number.isFinite(frame.durationMs) && frame.durationMs > 0 ? frame.durationMs : null;
  }
  if (!Number.isFinite(animation.fps) || animation.fps <= 0) {
    return null;
  }
  const fallbackDuration = 1000 / animation.fps;
  return Number.isFinite(fallbackDuration) && fallbackDuration > 0 ? fallbackDuration : null;
}

/**
 * Animation.frameIdsの各出現を順に加算した実時間。
 * Animation.durationMsはinformationalなので参照しない。
 */
export function calculateAnimationDurationMs(
  animation: Animation,
  frames: readonly Frame[],
): number | null {
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  let total = 0;
  for (const frameId of animation.frameIds) {
    const frame = frameById.get(frameId);
    if (!frame) {
      return null;
    }
    const duration = effectiveFrameDurationMs(animation, frame);
    if (duration === null) {
      return null;
    }
    total += duration;
    if (!Number.isFinite(total)) {
      return null;
    }
  }
  return total;
}

/** 対象Frameの表示開始時に発火するイベントを、保存配列の順序で返す。 */
export function animationEventsAtFrame(
  animation: Animation,
  frameId: string,
): readonly AnimationEvent[] {
  return (animation.events ?? []).filter((event) => event.frameId === frameId);
}

export interface AnimationPlaybackClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AnimationPlaybackOptions {
  animation: Animation;
  frames: readonly Frame[];
  clock: AnimationPlaybackClock;
  onFrameStart: (frameId: string, occurrenceIndex: number) => void;
  onEvent?: (event: AnimationEvent, occurrenceIndex: number) => void;
  onComplete?: () => void;
}

export interface AnimationPlayback {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * 現在Frameの実効時間ごとに次の出現を予約する逐次scheduler。
 * start時の先頭Frameも表示開始として即時通知し、stop後は通知しない。
 */
export function createAnimationPlayback(options: AnimationPlaybackOptions): AnimationPlayback {
  const frameById = new Map(options.frames.map((frame) => [frame.id, frame]));
  let running = false;
  let occurrenceIndex = 0;
  let timeoutHandle: unknown;

  const clearScheduled = () => {
    if (timeoutHandle !== undefined) {
      options.clock.clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
  };

  const scheduleAfter = (remainingMs: number, callback: () => void) => {
    const delayMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS);
    timeoutHandle = options.clock.setTimeout(() => {
      timeoutHandle = undefined;
      if (!running) {
        return;
      }
      if (remainingMs > MAX_TIMER_DELAY_MS) {
        scheduleAfter(remainingMs - MAX_TIMER_DELAY_MS, callback);
        return;
      }
      callback();
    }, delayMs);
  };

  const emitCurrent = () => {
    if (!running) {
      return;
    }
    const frameId = options.animation.frameIds[occurrenceIndex];
    const duration = effectiveFrameDurationMs(options.animation, frameById.get(frameId));
    if (duration === null) {
      running = false;
      options.onComplete?.();
      return;
    }
    options.onFrameStart(frameId, occurrenceIndex);
    for (const event of animationEventsAtFrame(options.animation, frameId)) {
      options.onEvent?.(event, occurrenceIndex);
    }

    scheduleAfter(duration, () => {
      const nextIndex = occurrenceIndex + 1;
      if (nextIndex >= options.animation.frameIds.length) {
        if (!options.animation.loop) {
          running = false;
          options.onComplete?.();
          return;
        }
        occurrenceIndex = 0;
      } else {
        occurrenceIndex = nextIndex;
      }
      emitCurrent();
    });
  };

  return {
    start() {
      clearScheduled();
      if (options.animation.frameIds.length === 0) {
        running = false;
        options.onComplete?.();
        return;
      }
      occurrenceIndex = 0;
      running = true;
      emitCurrent();
    },
    stop() {
      running = false;
      clearScheduled();
    },
    isRunning() {
      return running;
    },
  };
}
