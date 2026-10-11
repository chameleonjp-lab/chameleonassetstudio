import { expect, it } from 'vitest';
import { NativePerformanceCollector } from './performanceCollector';
import type { NativePerformanceRecordInput } from './performanceRecord';
const metadata: Omit<NativePerformanceRecordInput, 'measurements'> = {
  schemaVersion: 'native-performance-v1',
  source: { commitSha: 'a'.repeat(40), dirty: false },
  fixture: { id: 'F01', sha256: 'b'.repeat(64) },
  cacheState: 'warm',
  startedAt: '2026-10-10T00:00:00.000Z',
  environment: {
    browser: { family: 'chromium', version: null },
    os: { family: 'unknown', version: null },
    device: {
      realDevice: 'headless',
      category: 'desktop',
      model: 'unrecorded',
      thermalState: 'unknown',
    },
    viewport: { widthCssPx: 640, heightCssPx: 480, devicePixelRatio: 1 },
  },
};
it('records actual boundaries, distinguishes unsupported/unmeasured and excludes short p95', () => {
  let clock = 100;
  const collector = new NativePerformanceCollector(metadata, () => clock, true);
  collector.freezeMonitoringInstalled();
  const token = collector.begin('input');
  clock = 112;
  collector.finish(token);
  collector.unavailable('long-task');
  clock = 120;
  const { record } = collector.finishRecord();
  const input = record.measurements.find((entry) => entry.metric === 'input')!;
  expect(input).toMatchObject({
    status: 'measured',
    samples: [{ startMs: 0, durationMs: 12 }],
    summary: { n: 1, medianMs: 12, maxMs: 12, p95Ms: null },
  });
  expect(record.measurements.find((entry) => entry.metric === 'long-task')).toMatchObject({
    status: 'unsupported',
    summary: { medianMs: null },
  });
  expect(record.measurements.find((entry) => entry.metric === 'animation-frame')).toMatchObject({
    status: 'not-measured',
  });
  expect(() => collector.begin('input')).toThrow();
});
it('requires all pending work to end and preserves completed samples alongside a failed attempt', () => {
  let time = 0;
  const collector = new NativePerformanceCollector(metadata, () => time, true);
  const one = collector.begin('cancel');
  time = 2;
  collector.finish(one);
  const two = collector.begin('cancel');
  expect(() => collector.finishRecord()).toThrow();
  collector.fail(two);
  const result = collector.finishRecord();
  expect(result.record.measurements.find((entry) => entry.metric === 'cancel')).toMatchObject({
    status: 'failed',
    summary: { p95Ms: null },
  });
  expect(result.failedMetricSamples.cancel).toEqual([{ startMs: 0, durationMs: 2 }]);
  expect(() => collector.finish(one)).toThrow();
});
it('rejects backward clocks, future samples, duplicate tokens and overwriting observed metrics', () => {
  let time = 10;
  const collector = new NativePerformanceCollector(metadata, () => time, true);
  const token = collector.begin('input');
  time = 12;
  collector.finish(token);
  expect(() => collector.finish(token)).toThrow();
  expect(() => collector.unavailable('input')).toThrow();
  expect(() => collector.observe('long-task', { startMs: 1, durationMs: 50 })).toThrow();
  time = 11;
  expect(() => collector.begin('input')).toThrow();
});
it('does not certify a percentile after background or observed freeze', () => {
  let time = 0;
  const collector = new NativePerformanceCollector(metadata, () => time, true);
  collector.freezeMonitoringInstalled();
  for (let i = 0; i < 100; i++) {
    time = i * 600;
    const token = collector.begin('input');
    time++;
    collector.finish(token);
  }
  collector.visibilityChanged(false);
  collector.frozen();
  time = 60001;
  expect(collector.finishRecord().record.measurements[0].summary.p95Ms).toBeNull();
});
