import {
  createNativePerformanceRecord,
  NATIVE_PERFORMANCE_LIMITS,
  NATIVE_PERFORMANCE_METRICS,
  type NativePerformanceMeasurement,
  type NativePerformanceMetric,
  type NativePerformanceRecordInput,
  type NativePerformanceSample,
} from './performanceRecord';

type Metadata = Omit<NativePerformanceRecordInput, 'measurements'>;
type Operation = NativePerformanceMeasurement['operation'];
const operations: Record<NativePerformanceMetric, Operation> = {
  input: 'numeric-commit',
  'animation-frame': 'active-playback',
  'long-task': 'main-thread',
  'import-first-draw': 'import-to-first-draw',
  cancel: 'cancel-to-canonical-unchanged',
  'autosave-window': 'first-dirty-to-persisted',
};
/** Explicit instrumentation only. Caller must finish at the real operation boundary. */
export class NativePerformanceCollector {
  private readonly start: number;
  private readonly metadata: Metadata;
  private readonly samples = new Map<NativePerformanceMetric, NativePerformanceSample[]>();
  private readonly active = new Map<number, { metric: NativePerformanceMetric; startMs: number }>();
  private readonly unsupported = new Set<NativePerformanceMetric>();
  private readonly failed = new Set<NativePerformanceMetric>();
  private next = 0;
  private total = 0;
  private stopped = false;
  private lastTime = 0;
  private visibility: 'foreground' | 'mixed' | 'unknown';
  private freeze: 'none-observed' | 'observed' | 'unknown';
  constructor(
    metadata: Metadata,
    private readonly now: () => number = () => performance.now(),
    foreground?: boolean,
  ) {
    // Validate a detached metadata copy before accepting any observations.
    const record = createNativePerformanceRecord({
      ...metadata,
      measurements: NATIVE_PERFORMANCE_METRICS.map((metric) => ({
        metric,
        operation: operations[metric],
        status: 'not-measured',
        reason: 'not-run',
      })),
    });
    const { measurements: _measurements, ...copy } = record;
    void _measurements;
    this.metadata = copy;
    this.start = now();
    if (!Number.isFinite(this.start) || this.start < 0) throw new Error('Invalid monotonic clock');
    this.visibility = foreground === undefined ? 'unknown' : foreground ? 'foreground' : 'mixed';
    this.freeze = 'unknown';
  }
  private elapsed() {
    const time = this.now() - this.start;
    if (
      !Number.isFinite(time) ||
      time < this.lastTime ||
      time > NATIVE_PERFORMANCE_LIMITS.observationMs
    )
      throw new Error('Invalid observation clock');
    this.lastTime = time;
    return time;
  }
  get monotonicStart() {
    return this.start;
  }
  get elapsedMs() {
    return this.elapsed();
  }
  begin(metric: NativePerformanceMetric) {
    if (this.stopped || !NATIVE_PERFORMANCE_METRICS.includes(metric) || this.active.size >= 64)
      throw new Error('Measurement cannot begin');
    if (this.unsupported.has(metric) || this.failed.has(metric))
      throw new Error('Measurement unavailable');
    const token = ++this.next;
    this.active.set(token, { metric, startMs: this.elapsed() });
    return token;
  }
  finish(token: number) {
    const active = this.active.get(token);
    if (this.stopped || !active) throw new Error('Unknown measurement token');
    const end = this.elapsed();
    this.append(active.metric, { startMs: active.startMs, durationMs: end - active.startMs });
    this.active.delete(token);
  }
  fail(token: number) {
    const active = this.active.get(token);
    if (this.stopped || !active) throw new Error('Unknown measurement token');
    this.failed.add(active.metric);
    this.active.delete(token);
  }
  /** Observer timestamps must use this collector's relative monotonic clock. */
  observe(metric: NativePerformanceMetric, sample: NativePerformanceSample) {
    if (this.stopped || !NATIVE_PERFORMANCE_METRICS.includes(metric))
      throw new Error('Measurement stopped');
    const end = this.elapsed();
    if (
      !Number.isFinite(sample.startMs) ||
      !Number.isFinite(sample.durationMs) ||
      sample.startMs < 0 ||
      sample.durationMs < 0 ||
      sample.startMs + sample.durationMs > end
    )
      throw new Error('Invalid observation sample');
    this.append(metric, { ...sample });
  }
  private append(metric: NativePerformanceMetric, sample: NativePerformanceSample) {
    const list = this.samples.get(metric) ?? [];
    if (
      this.unsupported.has(metric) ||
      this.failed.has(metric) ||
      list.length >= NATIVE_PERFORMANCE_LIMITS.samplesPerMetric ||
      this.total >= NATIVE_PERFORMANCE_LIMITS.totalSamples
    )
      throw new Error('Measurement sample limit or unavailable metric');
    if (list.length && sample.startMs < list[list.length - 1].startMs)
      throw new Error('Out-of-order observation sample');
    list.push(sample);
    this.samples.set(metric, list);
    this.total++;
  }
  /** An installed observer with no events is different from an observer never started. */
  observing(metric: NativePerformanceMetric) {
    if (
      this.stopped ||
      !NATIVE_PERFORMANCE_METRICS.includes(metric) ||
      this.unsupported.has(metric) ||
      this.failed.has(metric)
    )
      throw new Error('Measurement unavailable');
    if (!this.samples.has(metric)) this.samples.set(metric, []);
  }
  unavailable(metric: NativePerformanceMetric) {
    if (
      this.stopped ||
      !NATIVE_PERFORMANCE_METRICS.includes(metric) ||
      this.samples.has(metric) ||
      [...this.active.values()].some((entry) => entry.metric === metric)
    )
      throw new Error('Cannot discard existing observations');
    this.unsupported.add(metric);
  }
  visibilityChanged(foreground: boolean) {
    if (!foreground) this.visibility = 'mixed';
  }
  freezeMonitoringInstalled() {
    if (this.freeze !== 'observed') this.freeze = 'none-observed';
  }
  frozen() {
    this.freeze = 'observed';
  }
  finishRecord() {
    if (this.stopped || this.active.size)
      throw new Error('Finish or fail pending observations first');
    const endMs = this.elapsed();
    const measurements = NATIVE_PERFORMANCE_METRICS.map((metric): NativePerformanceMeasurement => {
      const common = { metric, operation: operations[metric] };
      if (this.failed.has(metric))
        return { ...common, status: 'failed', reason: 'operation-failed' };
      if (this.unsupported.has(metric))
        return { ...common, status: 'unsupported', reason: 'observer-unavailable' };
      const samples = this.samples.get(metric);
      return samples
        ? {
            ...common,
            status: 'measured',
            window: { startMs: 0, endMs, visibility: this.visibility, freeze: this.freeze },
            samples,
          }
        : { ...common, status: 'not-measured', reason: 'not-run' };
    });
    const record = createNativePerformanceRecord({ ...this.metadata, measurements });
    this.stopped = true;
    // Partial samples remain available to the caller even when one attempt failed.
    return {
      record,
      failedMetricSamples: Object.fromEntries(
        [...this.failed].map((metric) => [
          metric,
          (this.samples.get(metric) ?? []).map((sample) => ({ ...sample })),
        ]),
      ),
    };
  }
}
