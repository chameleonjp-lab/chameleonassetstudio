import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import {
  assertDistributionTimeline,
  buildDistributionTimelines,
  createDistributionPlayback,
  distributionEventsBetween,
  sampleDistributionTimeline,
} from './distributionTimeline';

function fixture(loop = true) {
  const asset = structuredClone(characterAsset) as unknown as Asset;
  asset.frames = [100, 200, 300].map((durationMs, index) => ({
    id: `f${index}`,
    name: 'same display name',
    layerStates: [],
    durationMs,
  }));
  asset.animations = [
    {
      id: 'walk',
      name: 'walk',
      fps: 10,
      loop,
      durationMs: 999,
      frameIds: ['f0', 'f1', 'f2'],
      events: [
        { id: 'event-a', name: 'step', frameId: 'f0', payload: { sound: 'foot' } },
        { id: 'event-b', name: 'step', frameId: 'f0', payload: [1, null, false] },
        { id: 'event-c', name: 'end', frameId: 'f2' },
      ],
    },
  ];
  const frames = [
    { id: 'f2', page: 1 },
    { id: 'f0', page: 0 },
    { id: 'f1', page: 0 },
  ];
  return { asset, frames, timeline: buildDistributionTimelines(asset, frames)[0] };
}

describe('additive distribution timeline', () => {
  it('preserves 100/200/300ms, frame IDs, page references and output order independently', () => {
    const { timeline } = fixture();
    expect(timeline.durationMs).toBe(600);
    expect(
      timeline.occurrences.map(({ startMs, durationMs, frameIndex, page }) => [
        startMs,
        durationMs,
        frameIndex,
        page,
      ]),
    ).toEqual([
      [0, 100, 1, 0],
      [100, 200, 2, 0],
      [300, 300, 0, 1],
    ]);
    expect(() => assertDistributionTimeline(JSON.parse(JSON.stringify(timeline)))).not.toThrow();
  });

  it('repeats canonical frameId events for each occurrence in saved event order', () => {
    const { asset, frames } = fixture();
    asset.animations[0].frameIds = ['f0', 'f1', 'f0'];
    asset.animations[0].events?.pop();
    const before = structuredClone(asset);
    const timeline = buildDistributionTimelines(asset, frames)[0];
    expect(timeline.occurrences.map((entry) => entry.startMs)).toEqual([0, 100, 300]);
    expect(timeline.occurrences[2].events.map((event) => event.id)).toEqual(['event-a', 'event-b']);
    timeline.occurrences[0].events[0].payload = 'changed';
    expect(asset).toEqual(before);
    expect(timeline.occurrences[2].events[0].payload).toEqual({ sound: 'foot' });
  });

  it('uses fps only for frames without duration and ignores informational animation duration', () => {
    const { asset, frames } = fixture();
    delete asset.frames![1].durationMs;
    asset.animations[0].fps = 8;
    expect(buildDistributionTimelines(asset, frames)[0].durationMs).toBe(525);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid canonical duration %s', (durationMs) => {
    const { asset, frames } = fixture();
    asset.frames![0].durationMs = durationMs;
    expect(() => buildDistributionTimelines(asset, frames)).toThrow();
  });

  it('rejects dangling references, duplicate IDs and arithmetic overflow before consumption', () => {
    const { asset, frames } = fixture();
    expect(() => buildDistributionTimelines(asset, frames.slice(1))).toThrow();
    expect(() => buildDistributionTimelines(asset, [...frames, frames[0]])).toThrow();
    asset.animations[0].events![0].frameId = 'missing';
    expect(() => buildDistributionTimelines(asset, frames)).toThrow();
    asset.animations[0].events = [];
    asset.frames![0].durationMs = Number.MAX_VALUE;
    expect(() => buildDistributionTimelines(asset, frames)).toThrow();
  });

  it('uses half-open intervals and retains final non-looping frame', () => {
    const { timeline } = fixture(false);
    expect(
      [0, 99, 100, 299, 300, 599, 600, 999].map(
        (time) => sampleDistributionTimeline(timeline, time)?.occurrence.index,
      ),
    ).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
    expect(sampleDistributionTimeline(timeline, 600)?.complete).toBe(true);
    timeline.loop = true;
    expect(sampleDistributionTimeline(timeline, 600)).toMatchObject({
      cycle: 1,
      occurrence: { index: 0 },
      complete: false,
    });
    expect(sampleDistributionTimeline(timeline, 750)).toMatchObject({
      cycle: 1,
      occurrence: { index: 1 },
    });
  });

  it('aligns ordinary fractional-fps cycle boundaries with emitted events', () => {
    const { asset, frames } = fixture();
    asset.animations[0].frameIds = ['f0', 'f1'];
    asset.animations[0].events?.pop();
    asset.animations[0].fps = 60;
    asset.frames!.forEach((frame) => delete frame.durationMs);
    const timeline = buildDistributionTimelines(asset, frames)[0];
    expect(sampleDistributionTimeline(timeline, 100)).toMatchObject({
      cycle: 3,
      occurrence: { index: 0 },
    });
    expect(distributionEventsBetween(timeline, 99, 100)).toHaveLength(2);
    expect(sampleDistributionTimeline(timeline, 116.66666666666667)).toMatchObject({
      cycle: 3,
      occurrence: { index: 1 },
    });
    expect(sampleDistributionTimeline(timeline, 2100)).toMatchObject({
      cycle: 63,
      occurrence: { index: 0 },
    });
    expect(distributionEventsBetween(timeline, 2099, 2100)).toHaveLength(2);
    expect(distributionEventsBetween(timeline, 2100, 2101)).toEqual([]);
  });

  it('delivers all crossed events including loop start, once and in deterministic order', () => {
    const { timeline } = fixture();
    expect(
      distributionEventsBetween(timeline, null, 750).map(({ event, cycle, timeMs }) => [
        event.id,
        cycle,
        timeMs,
      ]),
    ).toEqual([
      ['event-a', 0, 0],
      ['event-b', 0, 0],
      ['event-c', 0, 300],
      ['event-a', 1, 600],
      ['event-b', 1, 600],
    ]);
    expect(distributionEventsBetween(timeline, 600, 600)).toEqual([]);
    expect(distributionEventsBetween(timeline, 299, 300)).toHaveLength(1);
    timeline.loop = false;
    expect(distributionEventsBetween(timeline, 300, 1200)).toEqual([]);
  });

  it('preserves elapsed remainder across ticks, stop, restart and completed playback', () => {
    const { timeline } = fixture(false);
    const player = createDistributionPlayback(timeline);
    expect(player.start().events).toHaveLength(2);
    expect(player.advance(150).sample?.occurrence.index).toBe(1);
    expect(player.advance(150).events[0].timeMs).toBe(300);
    player.stop();
    expect(player.advance(900).events).toEqual([]);
    expect(player.advance(0).sample?.occurrence.index).toBe(2);
    expect(player.start().sample?.occurrence.index).toBe(0);
    player.advance(600);
    expect(player.isRunning()).toBe(false);
    expect(player.advance(999).events).toEqual([]);
  });

  it('rejects excessive catch-up atomically and supports a subsequent smaller tick', () => {
    const { timeline } = fixture();
    const player = createDistributionPlayback(timeline);
    player.start();
    expect(() => player.advance(600 * 10_000)).toThrow(/limit/);
    expect(player.advance(300).events.map((entry) => entry.timeMs)).toEqual([300]);
    expect(() => distributionEventsBetween(timeline, 10, 9)).toThrow(/backwards/);
    expect(() => sampleDistributionTimeline(timeline, NaN)).toThrow();
    timeline.occurrences.forEach((entry) => {
      entry.events = [];
    });
    const longRunning = createDistributionPlayback(timeline);
    longRunning.start();
    longRunning.advance(2 ** 52);
    expect(() => longRunning.advance(0.1)).toThrow(/precision/);
  });

  it('rejects corrupt serialized totals, gaps and event references', () => {
    const { timeline } = fixture();
    expect(() => sampleDistributionTimeline({ ...timeline, durationMs: 0 }, 0)).toThrow();
    timeline.occurrences[1].startMs++;
    expect(() => distributionEventsBetween(timeline, null, 0)).toThrow();
    timeline.occurrences[1].startMs--;
    timeline.occurrences[0].events[0].frameId = 'f2';
    expect(() => createDistributionPlayback(timeline)).toThrow();
  });

  it('handles an empty animation without inventing a frame or a timer', () => {
    const { asset, frames } = fixture();
    asset.animations[0].frameIds = [];
    asset.animations[0].events = [];
    const timeline = buildDistributionTimelines(asset, frames)[0];
    const player = createDistributionPlayback(timeline);
    expect(player.start()).toEqual({ sample: null, events: [] });
    expect(player.isRunning()).toBe(false);
  });
});
