/**
 * B09/T06 evidence interchange, not a benchmark runner or device acceptance gate.
 * Metadata is declared by the caller; hashes and physical hardware are not attested here.
 * No project names, paths, URLs, user agents, serial numbers, or free-form notes are accepted.
 */
export const NATIVE_PERFORMANCE_LIMITS = Object.freeze({
  jsonBytes: 4 * 1024 * 1024,
  samplesPerMetric: 20_000,
  totalSamples: 40_000,
  observationMs: 60 * 60 * 1000,
  viewportEdge: 32_768,
  devicePixelRatio: 16,
  percentileSamples: 100,
  percentileWindowMs: 60_000,
});

export const NATIVE_PERFORMANCE_METRICS = [
  'input',
  'animation-frame',
  'long-task',
  'import-first-draw',
  'cancel',
  'autosave-window',
] as const;
export type NativePerformanceMetric = (typeof NATIVE_PERFORMANCE_METRICS)[number];

// Extend this reviewed catalog when an actual measurement needs another model.
// Unknown models stay unrecorded; arbitrary device identifiers must not enter a report.
export const NATIVE_PERFORMANCE_DEVICE_MODELS = [
  'unrecorded',
  'macbook-air-m1',
  'macbook-air-m2',
  'macbook-pro-m1',
  'macbook-pro-m2',
  'ipad-9',
  'ipad-10',
  'ipad-air-m1',
  'ipad-pro-m2',
  'iphone-13',
  'iphone-14',
  'iphone-15',
  'iphone-16',
  'pixel-7',
  'pixel-8',
  'galaxy-s23',
  'galaxy-s24',
] as const;

const OPERATIONS = {
  input: ['selection', 'numeric-commit'],
  'animation-frame': ['active-playback'],
  'long-task': ['main-thread'],
  'import-first-draw': ['import-to-first-draw'],
  cancel: ['cancel-to-canonical-unchanged'],
  'autosave-window': ['first-dirty-to-persisted'],
} as const;
type Operation = (typeof OPERATIONS)[NativePerformanceMetric][number];
const UNAVAILABLE_REASONS = [
  'not-run',
  'api-unavailable',
  'observer-unavailable',
  'operation-unavailable',
  'operation-failed',
  'interrupted',
  'sample-limit',
] as const;
type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export interface NativePerformanceEnvironment {
  browser: {
    family: 'chromium' | 'chrome' | 'edge' | 'firefox' | 'webkit' | 'safari' | 'unknown';
    version: string | null;
  };
  os: {
    family: 'linux' | 'macos' | 'windows' | 'ios' | 'ipados' | 'android' | 'unknown';
    version: string | null;
  };
  device: {
    /** Explicit declaration, never inferred from viewport, browser, or user agent. */
    realDevice: 'declared-physical' | 'headless' | 'emulated' | 'unknown';
    category: 'desktop' | 'tablet' | 'phone' | 'unknown';
    model: (typeof NATIVE_PERFORMANCE_DEVICE_MODELS)[number];
    thermalState: 'nominal' | 'warm' | 'hot' | 'unknown';
  };
  viewport: { widthCssPx: number; heightCssPx: number; devicePixelRatio: number };
}

export interface NativePerformanceWindow {
  /** Monotonic milliseconds relative to this record's start, not wall-clock timestamps. */
  startMs: number;
  endMs: number;
  visibility: 'foreground' | 'background' | 'mixed' | 'unknown';
  freeze: 'none-observed' | 'observed' | 'unknown';
}

export interface NativePerformanceSample {
  /** Monotonic start relative to the record start; preserve collection order. */
  startMs: number;
  durationMs: number;
}

export type NativePerformanceMeasurement = {
  metric: NativePerformanceMetric;
  operation: Operation;
} & (
  | {
      status: 'measured';
      window: NativePerformanceWindow;
      samples: NativePerformanceSample[];
    }
  | {
      status: 'not-measured' | 'unsupported' | 'failed';
      reason: UnavailableReason;
    }
);

export interface NativePerformanceRecordInput {
  schemaVersion: 'native-performance-v1';
  source: { commitSha: string; dirty: boolean };
  fixture: {
    id:
      | 'F01'
      | 'F02'
      | 'F03'
      | 'F04'
      | 'F05'
      | 'F06'
      | 'F07'
      | 'F08'
      | 'F09'
      | 'F10'
      | 'F11'
      | 'F12'
      | 'F13';
    sha256: string;
  };
  environment: NativePerformanceEnvironment;
  cacheState: 'cold' | 'warm';
  /** Exact UTC ISO timestamp; all sample/window offsets use one monotonic clock. */
  startedAt: string;
  /** Exactly one series per metric. Separate records keep input operations and cache states apart. */
  measurements: NativePerformanceMeasurement[];
}

export interface NativePerformanceSummary {
  n: number;
  medianMs: number | null;
  maxMs: number | null;
  /** Nearest-rank percentile, only after the sample/window/foreground conditions are satisfied. */
  p95Ms: number | null;
  p95Reason:
    | null
    | 'not-measured'
    | 'unsupported'
    | 'failed'
    | 'no-samples'
    | 'first-draw-median-max-only'
    | 'insufficient-samples'
    | 'short-window'
    | 'non-foreground'
    | 'freeze-not-excluded';
  /** Initial import runs are median/max observations, with at least five repeats requested by §7. */
  initialRunCoverage: null | 'fewer-than-five-runs' | 'at-least-five-runs';
}

export interface NativePerformanceRecord extends Omit<
  NativePerformanceRecordInput,
  'measurements'
> {
  measurements: (NativePerformanceMeasurement & { summary: NativePerformanceSummary })[];
}

type ErrorCode =
  'shape' | 'enum' | 'number' | 'hash' | 'timestamp' | 'window' | 'size' | 'metrics' | 'summary';
export class NativePerformanceRecordError extends Error {
  constructor(readonly code: ErrorCode) {
    // Do not echo rejected input, which could contain secrets.
    super(`Invalid native performance record (${code})`);
    this.name = 'NativePerformanceRecordError';
  }
}

function reject(code: ErrorCode): never {
  throw new NativePerformanceRecordError(code);
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    reject('shape');
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    reject('shape');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) reject('shape');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) reject('shape');
  if (value.length > maximum) reject('size');
  // Reject sparse arrays, extra fields, symbols, and accessors before reading elements.
  if (Reflect.ownKeys(value).length !== value.length + 1) reject('shape');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) reject('shape');
  }
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) reject('enum');
  return value as T[number];
}

function number(value: unknown, maximum: number, positive = false, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum ||
    (positive && value === 0) ||
    (integer && !Number.isSafeInteger(value))
  )
    reject('number');
  return value;
}

function hash(value: unknown, digits: number): string {
  if (typeof value !== 'string' || value.length !== digits || !/^[a-f0-9]+$/.test(value))
    reject('hash');
  return value;
}

function version(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 31 || !/^\d{1,5}(?:\.\d{1,5}){0,4}$/.test(value))
    reject('shape');
  return value;
}

function environment(value: unknown): NativePerformanceEnvironment {
  const root = object(value, ['browser', 'os', 'device', 'viewport']);
  const browser = object(root.browser, ['family', 'version']);
  const os = object(root.os, ['family', 'version']);
  const device = object(root.device, ['realDevice', 'category', 'model', 'thermalState']);
  const viewport = object(root.viewport, ['widthCssPx', 'heightCssPx', 'devicePixelRatio']);
  return {
    browser: {
      family: choice(browser.family, [
        'chromium',
        'chrome',
        'edge',
        'firefox',
        'webkit',
        'safari',
        'unknown',
      ]),
      version: version(browser.version),
    },
    os: {
      family: choice(os.family, [
        'linux',
        'macos',
        'windows',
        'ios',
        'ipados',
        'android',
        'unknown',
      ]),
      version: version(os.version),
    },
    device: {
      realDevice: choice(device.realDevice, [
        'declared-physical',
        'headless',
        'emulated',
        'unknown',
      ]),
      category: choice(device.category, ['desktop', 'tablet', 'phone', 'unknown']),
      model: choice(device.model, NATIVE_PERFORMANCE_DEVICE_MODELS),
      thermalState: choice(device.thermalState, ['nominal', 'warm', 'hot', 'unknown']),
    },
    viewport: {
      widthCssPx: number(viewport.widthCssPx, NATIVE_PERFORMANCE_LIMITS.viewportEdge, true, true),
      heightCssPx: number(viewport.heightCssPx, NATIVE_PERFORMANCE_LIMITS.viewportEdge, true, true),
      devicePixelRatio: number(
        viewport.devicePixelRatio,
        NATIVE_PERFORMANCE_LIMITS.devicePixelRatio,
        true,
      ),
    },
  };
}

function measurement(value: unknown, withSummary: boolean): NativePerformanceMeasurement {
  // Inspect the discriminator without invoking getters on untrusted objects.
  if (value === null || typeof value !== 'object') reject('shape');
  const status = Object.getOwnPropertyDescriptor(value, 'status')?.value;
  const root = object(value, [
    'metric',
    'operation',
    'status',
    ...(status === 'measured' ? ['window', 'samples'] : ['reason']),
    ...(withSummary ? ['summary'] : []),
  ]);
  const metric = choice(root.metric, NATIVE_PERFORMANCE_METRICS);
  const operation = choice(root.operation, OPERATIONS[metric]);
  if (status !== 'measured') {
    return {
      metric,
      operation,
      status: choice(root.status, ['not-measured', 'unsupported', 'failed']),
      reason: choice(root.reason, UNAVAILABLE_REASONS),
    };
  }
  const rawWindow = object(root.window, ['startMs', 'endMs', 'visibility', 'freeze']);
  const window: NativePerformanceWindow = {
    startMs: number(rawWindow.startMs, NATIVE_PERFORMANCE_LIMITS.observationMs),
    endMs: number(rawWindow.endMs, NATIVE_PERFORMANCE_LIMITS.observationMs),
    visibility: choice(rawWindow.visibility, ['foreground', 'background', 'mixed', 'unknown']),
    freeze: choice(rawWindow.freeze, ['none-observed', 'observed', 'unknown']),
  };
  if (window.endMs <= window.startMs) reject('window');
  let previousStart = window.startMs;
  const samples = array(root.samples, NATIVE_PERFORMANCE_LIMITS.samplesPerMetric).map((raw) => {
    const sample = object(raw, ['startMs', 'durationMs']);
    const startMs = number(sample.startMs, NATIVE_PERFORMANCE_LIMITS.observationMs);
    const durationMs = number(sample.durationMs, NATIVE_PERFORMANCE_LIMITS.observationMs);
    if (startMs < previousStart || startMs + durationMs > window.endMs) reject('window');
    previousStart = startMs;
    return { startMs, durationMs };
  });
  // An observed long-task window can genuinely contain zero tasks. Other empty runs are unmeasured.
  if (samples.length === 0 && metric !== 'long-task') reject('window');
  return { metric, operation, status: 'measured', window, samples };
}

function summarize(series: NativePerformanceMeasurement): NativePerformanceSummary {
  const empty: NativePerformanceSummary = {
    n: 0,
    medianMs: null,
    maxMs: null,
    p95Ms: null,
    p95Reason: series.status === 'measured' ? 'no-samples' : series.status,
    initialRunCoverage: null,
  };
  if (series.status !== 'measured' || !series.samples.length) return empty;
  const sorted = series.samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const n = sorted.length;
  const middle = Math.floor(n / 2);
  const medianMs = n % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  let p95Reason: NativePerformanceSummary['p95Reason'] = null;
  if (series.metric === 'import-first-draw') p95Reason = 'first-draw-median-max-only';
  else if (n < NATIVE_PERFORMANCE_LIMITS.percentileSamples) p95Reason = 'insufficient-samples';
  else if (
    series.window.endMs - series.window.startMs <
    NATIVE_PERFORMANCE_LIMITS.percentileWindowMs
  )
    p95Reason = 'short-window';
  else if (series.window.visibility !== 'foreground') p95Reason = 'non-foreground';
  else if (series.window.freeze !== 'none-observed') p95Reason = 'freeze-not-excluded';
  return {
    n,
    medianMs,
    maxMs: sorted[n - 1],
    p95Ms: p95Reason === null ? sorted[Math.ceil(n * 0.95) - 1] : null,
    p95Reason,
    initialRunCoverage:
      series.metric === 'import-first-draw'
        ? n < 5
          ? 'fewer-than-five-runs'
          : 'at-least-five-runs'
        : null,
  };
}

function checkSize(json: string): string {
  if (
    json.length > NATIVE_PERFORMANCE_LIMITS.jsonBytes ||
    new TextEncoder().encode(json).byteLength > NATIVE_PERFORMANCE_LIMITS.jsonBytes
  )
    reject('size');
  return json;
}

function build(value: unknown, withSummary: boolean): NativePerformanceRecord {
  const root = object(value, [
    'schemaVersion',
    'source',
    'fixture',
    'environment',
    'cacheState',
    'startedAt',
    'measurements',
  ]);
  const source = object(root.source, ['commitSha', 'dirty']);
  if (typeof source.dirty !== 'boolean') reject('shape');
  const fixture = object(root.fixture, ['id', 'sha256']);
  if (
    typeof root.startedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(root.startedAt) ||
    !Number.isFinite(Date.parse(root.startedAt)) ||
    new Date(root.startedAt).toISOString() !== root.startedAt
  )
    reject('timestamp');
  let totalSamples = 0;
  const seen = new Set<NativePerformanceMetric>();
  const measurements = array(root.measurements, NATIVE_PERFORMANCE_METRICS.length).map((raw) => {
    const series = measurement(raw, withSummary);
    if (seen.has(series.metric)) reject('metrics');
    seen.add(series.metric);
    if (series.status === 'measured') totalSamples += series.samples.length;
    if (totalSamples > NATIVE_PERFORMANCE_LIMITS.totalSamples) reject('size');
    const summary = summarize(series);
    if (withSummary) {
      const submitted = object((raw as Record<string, unknown>).summary, Object.keys(summary));
      if (Object.entries(summary).some(([key, expected]) => submitted[key] !== expected))
        reject('summary');
    }
    return { ...series, summary };
  });
  if (seen.size !== NATIVE_PERFORMANCE_METRICS.length) reject('metrics');
  const result: NativePerformanceRecord = {
    schemaVersion: choice(root.schemaVersion, ['native-performance-v1']),
    source: { commitSha: hash(source.commitSha, 40), dirty: source.dirty },
    fixture: {
      id: choice(fixture.id, [
        'F01',
        'F02',
        'F03',
        'F04',
        'F05',
        'F06',
        'F07',
        'F08',
        'F09',
        'F10',
        'F11',
        'F12',
        'F13',
      ]),
      sha256: hash(fixture.sha256, 64),
    },
    environment: environment(root.environment),
    cacheState: choice(root.cacheState, ['cold', 'warm']),
    startedAt: root.startedAt,
    measurements,
  };
  checkSize(JSON.stringify(result));
  return result;
}

/** Validates and copies raw observations; does not mutate, trim, infer hardware, or determine a tier. */
export function createNativePerformanceRecord(input: unknown): NativePerformanceRecord {
  return build(input, false);
}

/** Revalidates raw data and summaries before export; caller mutation cannot forge an aggregate. */
export function serializeNativePerformanceRecord(record: unknown): string {
  return checkSize(JSON.stringify(build(record, true)));
}

/** Bounded JSON import with exact keys and recomputed aggregates, rather than trusting a claimed p95. */
export function parseNativePerformanceRecord(json: string): NativePerformanceRecord {
  if (typeof json !== 'string') reject('shape');
  checkSize(json);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    reject('shape');
  }
  return build(value, true);
}
