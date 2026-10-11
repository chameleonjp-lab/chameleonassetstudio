import { describe, expect, it } from 'vitest';
import {
  createNativePerformanceRecord,
  NATIVE_PERFORMANCE_LIMITS,
  NativePerformanceRecordError,
  parseNativePerformanceRecord,
  serializeNativePerformanceRecord,
  type NativePerformanceMeasurement,
  type NativePerformanceRecordInput,
} from './performanceRecord';

// These are deliberately synthetic validator fixtures, never benchmark results or device evidence.
function input(): NativePerformanceRecordInput {
  return {
    schemaVersion: 'native-performance-v1',
    source: { commitSha: 'a'.repeat(40), dirty: true },
    fixture: { id: 'F01', sha256: 'b'.repeat(64) },
    environment: {
      browser: { family: 'chromium', version: '140.0.7339.0' },
      os: { family: 'linux', version: null },
      device: {
        realDevice: 'headless',
        category: 'desktop',
        model: 'unrecorded',
        thermalState: 'unknown',
      },
      viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 },
    },
    cacheState: 'warm',
    startedAt: '2026-10-09T19:00:00.000Z',
    measurements: [
      { metric: 'input', operation: 'selection', status: 'not-measured', reason: 'not-run' },
      {
        metric: 'animation-frame',
        operation: 'active-playback',
        status: 'not-measured',
        reason: 'not-run',
      },
      {
        metric: 'long-task',
        operation: 'main-thread',
        status: 'unsupported',
        reason: 'api-unavailable',
      },
      {
        metric: 'import-first-draw',
        operation: 'import-to-first-draw',
        status: 'not-measured',
        reason: 'not-run',
      },
      {
        metric: 'cancel',
        operation: 'cancel-to-canonical-unchanged',
        status: 'failed',
        reason: 'operation-failed',
      },
      {
        metric: 'autosave-window',
        operation: 'first-dirty-to-persisted',
        status: 'not-measured',
        reason: 'not-run',
      },
    ],
  };
}

function measured(
  durations: number[],
  endMs = 60_000,
): Extract<NativePerformanceMeasurement, { status: 'measured' }> {
  return {
    metric: 'input',
    operation: 'selection',
    status: 'measured',
    window: { startMs: 0, endMs, visibility: 'foreground', freeze: 'none-observed' },
    samples: durations.map((durationMs, index) => ({ startMs: index * 100, durationMs })),
  };
}

function recordWith(series: NativePerformanceMeasurement) {
  const candidate = input();
  candidate.measurements[
    candidate.measurements.findIndex((item) => item.metric === series.metric)
  ] = series;
  return createNativePerformanceRecord(candidate);
}

function summarize(series: NativePerformanceMeasurement) {
  return recordWith(series).measurements.find((item) => item.metric === series.metric)!.summary;
}

describe('native performance evidence contract', () => {
  it('keeps missing, unsupported, and failed measurements null, without invented zeros', () => {
    const record = createNativePerformanceRecord(input());
    for (const item of record.measurements) {
      expect(item.summary).toEqual({
        n: 0,
        medianMs: null,
        maxMs: null,
        p95Ms: null,
        p95Reason: item.status,
        initialRunCoverage: null,
      });
    }
    expect(record.environment.device.realDevice).toBe('headless');
    expect(record.source.dirty).toBe(true);
    expect(record).not.toHaveProperty('tier');
    expect(record).not.toHaveProperty('pass');
  });

  it('preserves raw collection order, zero observations, and an even median without mutation', () => {
    const series = measured([8, 0, 6, 2]);
    const candidate = input();
    candidate.measurements[0] = series;
    const before = structuredClone(candidate);
    const record = createNativePerformanceRecord(candidate);
    expect(candidate).toEqual(before);
    expect(record.measurements[0]).toMatchObject({
      samples: series.samples,
      summary: { n: 4, medianMs: 4, maxMs: 8, p95Ms: null, p95Reason: 'insufficient-samples' },
    });
    series.samples[0].durationMs = 900;
    candidate.environment.viewport.widthCssPx = 200;
    expect(record.measurements[0]).toMatchObject({
      samples: [
        { startMs: 0, durationMs: 8 },
        ...(before.measurements[0].status === 'measured'
          ? before.measurements[0].samples.slice(1)
          : []),
      ],
    });
    expect(record.environment.viewport.widthCssPx).toBe(1280);
  });

  it('requires both 100 samples and a 60-second observation window before nearest-rank p95', () => {
    expect(summarize(measured(Array.from({ length: 99 }, (_, index) => index + 1))).p95Reason).toBe(
      'insufficient-samples',
    );
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarize(measured(hundred, 59_999)).p95Reason).toBe('short-window');
    expect(summarize(measured(hundred))).toEqual({
      n: 100,
      medianMs: 50.5,
      maxMs: 100,
      p95Ms: 95,
      p95Reason: null,
      initialRunCoverage: null,
    });
  });

  it('does not sort the raw samples to compute an odd median', () => {
    expect(summarize(measured([8, 1, 3]))).toMatchObject({ medianMs: 3, maxMs: 8 });
  });

  it.each(['background', 'mixed', 'unknown'] as const)(
    'withholds p95 for %s visibility',
    (visibility) => {
      const series = measured(Array(100).fill(10));
      series.window.visibility = visibility;
      expect(summarize(series)).toMatchObject({ p95Ms: null, p95Reason: 'non-foreground' });
    },
  );

  it.each(['observed', 'unknown'] as const)('withholds p95 for %s freeze conditions', (freeze) => {
    const series = measured(Array(100).fill(10));
    series.window.freeze = freeze;
    expect(summarize(series)).toMatchObject({ p95Ms: null, p95Reason: 'freeze-not-excluded' });
  });

  it.each(['cold', 'warm'] as const)(
    'keeps %s import first-draw as median/max, with repeat coverage',
    (cacheState) => {
      for (const n of [4, 5, 100]) {
        const candidate = input();
        candidate.cacheState = cacheState;
        candidate.measurements[3] = {
          ...measured(Array(n).fill(20)),
          metric: 'import-first-draw',
          operation: 'import-to-first-draw',
        };
        expect(createNativePerformanceRecord(candidate).measurements[3].summary).toMatchObject({
          n,
          medianMs: 20,
          maxMs: 20,
          p95Ms: null,
          p95Reason: 'first-draw-median-max-only',
          initialRunCoverage: n < 5 ? 'fewer-than-five-runs' : 'at-least-five-runs',
        });
      }
    },
  );

  it('distinguishes an observed zero-task window from an unavailable observer', () => {
    const summary = summarize({ ...measured([]), metric: 'long-task', operation: 'main-thread' });
    expect(summary).toMatchObject({
      n: 0,
      medianMs: null,
      maxMs: null,
      p95Ms: null,
      p95Reason: 'no-samples',
    });
    expect(() => recordWith(measured([]))).toThrow(NativePerformanceRecordError);
  });

  it('serializes and parses a bounded record with recomputed summaries', () => {
    const record = recordWith(measured([2, 7, 10]));
    const json = serializeNativePerformanceRecord(record);
    expect(parseNativePerformanceRecord(json)).toEqual(record);
    record.measurements[0].summary.p95Ms = 7;
    expect(() => serializeNativePerformanceRecord(record)).toThrow(/summary/);
    expect(() => parseNativePerformanceRecord(JSON.stringify(record))).toThrow(/summary/);
  });

  it.each([NaN, Infinity, -Infinity, -1, NATIVE_PERFORMANCE_LIMITS.observationMs + 1])(
    'rejects invalid raw duration %s',
    (duration) => {
      expect(() => recordWith(measured([duration]))).toThrow(NativePerformanceRecordError);
    },
  );

  it('bounds and orders raw sample timestamps within their actual observation window', () => {
    for (const series of [
      { ...measured([1]), window: { ...measured([1]).window, startMs: 60_000 } },
      { ...measured([1]), samples: [{ startMs: -1, durationMs: 1 }] },
      { ...measured([1]), samples: [{ startMs: 60_000, durationMs: 1 }] },
      {
        ...measured([1, 1]),
        samples: [
          { startMs: 2, durationMs: 1 },
          { startMs: 1, durationMs: 1 },
        ],
      },
      { ...measured([1]), window: { ...measured([1]).window, startMs: 10 } },
    ])
      expect(() => recordWith(series)).toThrow(NativePerformanceRecordError);
    const exact = measured(
      [NATIVE_PERFORMANCE_LIMITS.observationMs],
      NATIVE_PERFORMANCE_LIMITS.observationMs,
    );
    expect(summarize(exact).maxMs).toBe(NATIVE_PERFORMANCE_LIMITS.observationMs);
  });

  it('requires all six independent metric categories and matching operation semantics', () => {
    const missing = input();
    missing.measurements.pop();
    expect(() => createNativePerformanceRecord(missing)).toThrow(/metrics/);
    const duplicate = input();
    duplicate.measurements[1] = duplicate.measurements[0];
    expect(() => createNativePerformanceRecord(duplicate)).toThrow(/metrics/);
    const mismatched = input();
    mismatched.measurements[0].operation = 'active-playback';
    expect(() => createNativePerformanceRecord(mismatched)).toThrow(/enum/);
  });

  it.each([
    (candidate: NativePerformanceRecordInput) => {
      candidate.source.commitSha = 'abc1234';
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.fixture.sha256 = 'g'.repeat(64);
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.startedAt = '2026-02-30T00:00:00.000Z';
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.startedAt = '2026-10-09T19:00:00Z';
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.environment.viewport.devicePixelRatio = 0;
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.environment.viewport.devicePixelRatio = Infinity;
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.environment.viewport.widthCssPx = 1.5;
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.environment.viewport.heightCssPx = NATIVE_PERFORMANCE_LIMITS.viewportEdge + 1;
    },
    (candidate: NativePerformanceRecordInput) => {
      candidate.environment.browser.version = 'https://private.example/secret';
    },
  ])('rejects invalid provenance, time, and environment declarations', (mutate) => {
    const candidate = input();
    mutate(candidate);
    expect(() => createNativePerformanceRecord(candidate)).toThrow(NativePerformanceRecordError);
  });

  it('rejects free text and extra fields without copying rejected values into errors', () => {
    const secret = 'private-user@example.invalid';
    for (const candidate of [
      { ...input(), notes: secret },
      { ...input(), tier: 'phone-pass' },
      { ...input(), environment: { ...input().environment, userAgent: secret } },
      {
        ...input(),
        environment: {
          ...input().environment,
          device: { ...input().environment.device, model: secret },
        },
      },
      {
        ...input(),
        measurements: input().measurements.map((series) => ({ ...series, reason: secret })),
      },
    ]) {
      try {
        createNativePerformanceRecord(candidate);
        expect.fail('Expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(NativePerformanceRecordError);
        expect(String(error)).not.toContain(secret);
      }
    }
  });

  it('does not infer physical status from a phone viewport or convert declarations into acceptance', () => {
    const candidate = input();
    candidate.environment.viewport = { widthCssPx: 390, heightCssPx: 844, devicePixelRatio: 3 };
    candidate.environment.device.category = 'phone';
    expect(createNativePerformanceRecord(candidate).environment.device.realDevice).toBe('headless');
    candidate.environment.device.realDevice = 'declared-physical';
    candidate.environment.device.model = 'iphone-13';
    const record = createNativePerformanceRecord(candidate);
    expect(record.environment.device.realDevice).toBe('declared-physical');
    expect(record).not.toHaveProperty('accepted');
    expect(() => createNativePerformanceRecord({ ...candidate, pass: true })).toThrow(/shape/);
  });

  it('rejects accessors, sparse or annotated arrays, class instances, and prototype-bearing JSON', () => {
    let read = false;
    const getter = {
      ...input(),
      get cacheState() {
        read = true;
        return 'warm';
      },
    };
    expect(() => createNativePerformanceRecord(getter)).toThrow(/shape/);
    expect(read).toBe(false);
    const sparse = input();
    delete sparse.measurements[0];
    expect(() => createNativePerformanceRecord(sparse)).toThrow(/shape/);
    const symbol = input();
    Object.defineProperty(symbol.measurements, Symbol('private'), { value: 'secret' });
    expect(() => createNativePerformanceRecord(symbol)).toThrow(/shape/);
    const prototype = input();
    Object.setPrototypeOf(prototype.source, { secret: true });
    expect(() => createNativePerformanceRecord(prototype)).toThrow(/shape/);
    const json = JSON.stringify(createNativePerformanceRecord(input()));
    expect(() => parseNativePerformanceRecord(json.replace('{', '{"__proto__":{},'))).toThrow(
      /shape/,
    );
  });

  it('bounds each series, aggregate samples, and JSON before importing', () => {
    const series = measured([0]);
    series.samples = Array.from({ length: NATIVE_PERFORMANCE_LIMITS.samplesPerMetric + 1 }, () => ({
      startMs: 0,
      durationMs: 0,
    }));
    expect(() => recordWith(series)).toThrow(/size/);
    const total = input();
    total.measurements = total.measurements.map(({ metric, operation }) => ({
      ...measured([0]),
      metric,
      operation,
      samples: Array.from({ length: 7000 }, () => ({ startMs: 0, durationMs: 0 })),
    }));
    expect(() => createNativePerformanceRecord(total)).toThrow(/size/);
    expect(() =>
      parseNativePerformanceRecord(' '.repeat(NATIVE_PERFORMANCE_LIMITS.jsonBytes + 1)),
    ).toThrow(/size/);
    expect(() =>
      parseNativePerformanceRecord(
        '"' + 'あ'.repeat(NATIVE_PERFORMANCE_LIMITS.jsonBytes / 2) + '"',
      ),
    ).toThrow(/size/);
    expect(() => parseNativePerformanceRecord('{')).toThrow(/shape/);
  });
});
