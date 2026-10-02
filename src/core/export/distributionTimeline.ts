import { assertDistributionTimeline } from './distributionRuntime.js';
export {
  assertDistributionTimeline,
  sampleDistributionTimeline,
  distributionEventsBetween,
  createDistributionPlayback,
} from './distributionRuntime.js';
import type { AnimationEvent, Asset } from '../model';
import { animationEventsAtFrame, effectiveFrameDurationMs } from '../model/animationTiming';

/** Additive 0.2.0 runtime data. Names are labels, never lookup keys. */
export interface DistributionOccurrence {
  index: number;
  frameId: string;
  frameIndex: number;
  page: number;
  startMs: number;
  durationMs: number;
  events: AnimationEvent[];
}

export interface DistributionTimeline {
  id: string;
  name: string;
  loop: boolean;
  durationMs: number;
  occurrences: DistributionOccurrence[];
}

export interface DistributionTimelineFrame {
  id: string;
  page: number;
}

function uniqueIds(entries: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id))
      throw new Error(`${label}: missing or duplicate ID`);
    ids.add(entry.id);
  }
}

/** Uses canonical frame duration and frameId event semantics without editing the source. */
export function buildDistributionTimelines(
  asset: Asset,
  frames: readonly DistributionTimelineFrame[],
): DistributionTimeline[] {
  uniqueIds(asset.frames ?? [], 'source frames');
  uniqueIds(asset.animations, 'animations');
  uniqueIds(frames, 'distribution frames');
  const source = new Map((asset.frames ?? []).map((frame) => [frame.id, frame]));
  const output = new Map(frames.map((frame, index) => [frame.id, { ...frame, index }]));
  for (const frame of frames) {
    if (!Number.isSafeInteger(frame.page) || frame.page < 0) throw new Error('Invalid page');
  }
  return asset.animations.map((animation) => {
    uniqueIds(animation.events ?? [], 'events');
    for (const event of animation.events ?? []) {
      if (!animation.frameIds.includes(event.frameId)) throw new Error('Unresolved event frame');
    }
    let startMs = 0;
    const occurrences = animation.frameIds.map((frameId, index) => {
      const frame = output.get(frameId);
      const durationMs = effectiveFrameDurationMs(animation, source.get(frameId));
      if (!frame || durationMs === null) throw new Error('Unresolved frame or invalid duration');
      const endMs = startMs + durationMs;
      if (!Number.isFinite(endMs) || endMs <= startMs) throw new Error('Timeline time overflow');
      const occurrence: DistributionOccurrence = {
        index,
        frameId,
        frameIndex: frame.index,
        page: frame.page,
        startMs,
        durationMs,
        events: structuredClone([...animationEventsAtFrame(animation, frameId)]),
      };
      startMs = endMs;
      return occurrence;
    });
    const timeline = {
      id: animation.id,
      name: animation.name,
      loop: animation.loop,
      durationMs: startMs,
      occurrences,
    };
    assertDistributionTimeline(timeline);
    return timeline;
  });
}

export interface DistributionSample {
  occurrence: DistributionOccurrence;
  cycle: number;
  complete: boolean;
}

export interface DistributionEventDelivery {
  event: AnimationEvent;
  occurrenceIndex: number;
  cycle: number;
  timeMs: number;
}
