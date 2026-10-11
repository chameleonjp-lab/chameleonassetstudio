import { NativePerformanceCollector } from './performanceCollector';
import type { NativePerformanceRecordInput } from './performanceRecord';
import type { NativeViewport } from '../../src/adapters3d/three/renderer';
import type { Project3D } from '../../src/core3d/model/project';
import { sha256 } from '../../src/core3d/export/snapshot';

/** Development-only isolated renderer evidence. It does not measure product input dispatch. */
export async function measureNativeCommits(
  viewport: NativeViewport,
  project: Project3D,
  input: Omit<
    NativePerformanceRecordInput,
    'measurements' | 'fixture' | 'startedAt' | 'cacheState'
  >,
  options: { iterations: number; observationMs: number; signal: AbortSignal },
) {
  if (
    !Number.isSafeInteger(options.iterations) ||
    options.iterations < 5 ||
    options.iterations > 1000 ||
    !Number.isFinite(options.observationMs) ||
    options.observationMs < 60000 ||
    options.observationMs > 300000
  )
    throw new Error('Invalid measurement request');
  options.signal.throwIfAborted();
  if (!project.nodes.length || viewport.diagnostics.state !== 'active')
    throw new Error('A rendered fixture is required');
  const baseline = structuredClone(project);
  const fixtureHash = await sha256(new TextEncoder().encode(JSON.stringify(baseline)));
  const collector = new NativePerformanceCollector(
    {
      ...input,
      fixture: { id: 'F01', sha256: fixtureHash },
      startedAt: new Date().toISOString(),
      cacheState: 'warm',
    },
    () => performance.now(),
    !document.hidden,
  );
  const visibility = () => collector.visibilityChanged(!document.hidden);
  const frozen = () => collector.frozen();
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('freeze', frozen);
  if ('onfreeze' in document) collector.freezeMonitoringInstalled();
  let observer: PerformanceObserver | undefined;
  let observerFailure = false;
  if (
    typeof PerformanceObserver !== 'undefined' &&
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    PerformanceObserver.supportedEntryTypes.includes('longtask')
  ) {
    const accept = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        const startMs = entry.startTime - collector.monotonicStart;
        if (startMs < 0) continue;
        try {
          collector.observe('long-task', { startMs, durationMs: entry.duration });
        } catch {
          observerFailure = true;
        }
      }
    };
    try {
      observer = new PerformanceObserver((list) => accept(list.getEntries()));
      observer.observe({ type: 'longtask', buffered: false });
      collector.observing('long-task');
    } catch {
      observer?.disconnect();
      observer = undefined;
      collector.unavailable('long-task');
    }
  } else collector.unavailable('long-task');
  const wait = (milliseconds: number) =>
    new Promise<void>((resolve, reject) => {
      options.signal.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Measurement interrupted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        options.signal.removeEventListener('abort', abort);
        resolve();
      }, milliseconds);
      options.signal.addEventListener('abort', abort, { once: true });
    });
  try {
    for (let index = 0; index < options.iterations; index++) {
      await wait(
        Math.max(0, (index * options.observationMs) / options.iterations - collector.elapsedMs),
      );
      const frames = viewport.diagnostics.framesRendered;
      const candidate = structuredClone(baseline);
      candidate.revision += index + 1;
      candidate.nodes[0].transform.translation[0] += (index % 2 ? -1 : 1) * 0.1;
      const token = collector.begin('input');
      const result = viewport.setProject(candidate);
      if (!result.ok) {
        collector.fail(token);
        throw new Error('Measured render commit failed');
      }
      const deadline = performance.now() + 5000;
      while (viewport.diagnostics.framesRendered <= frames) {
        options.signal.throwIfAborted();
        if (viewport.diagnostics.state !== 'active' || performance.now() >= deadline) {
          collector.fail(token);
          throw new Error('Measured draw unavailable');
        }
        await wait(1);
      }
      collector.finish(token);
    }
    await wait(Math.max(0, options.observationMs - collector.elapsedMs));
    if (observer) {
      for (const entry of observer.takeRecords()) {
        const startMs = entry.startTime - collector.monotonicStart;
        if (startMs >= 0) collector.observe('long-task', { startMs, durationMs: entry.duration });
      }
    }
    if (observerFailure) throw new Error('Long-task observations incomplete');
    const result = collector.finishRecord();
    return {
      evidenceScope: 'isolated-native-renderer' as const,
      inputBoundary: 'setProject-to-framesRendered-increment' as const,
      productInputLatencyMeasured: false,
      physicalAcceptance: false,
      ...result,
    };
  } finally {
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('freeze', frozen);
    // Restore the original fixture; no persistent repository is involved.
    viewport.setProject(baseline);
  }
}
