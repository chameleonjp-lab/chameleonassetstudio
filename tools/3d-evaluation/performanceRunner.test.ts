import { expect, it, vi, afterEach } from 'vitest';
import { measureNativeCommits } from './performanceRunner';
import { nativeBox } from './fixtures';
import type { NativeViewport } from '../../src/adapters3d/three/renderer';
import type { NativePerformanceRecordInput } from './performanceRecord';
const input: Omit<
  NativePerformanceRecordInput,
  'measurements' | 'fixture' | 'startedAt' | 'cacheState'
> = {
  schemaVersion: 'native-performance-v1',
  source: { commitSha: 'a'.repeat(40), dirty: false },
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
afterEach(() => vi.unstubAllGlobals());
it('rejects an invalid or pre-cancelled run before changing the rendered fixture', async () => {
  const setProject = vi.fn();
  const viewport = {
    diagnostics: { state: 'active', framesRendered: 1 },
    setProject,
  } as unknown as NativeViewport;
  const project = nativeBox(),
    before = structuredClone(project);
  await expect(
    measureNativeCommits(viewport, project, input, {
      iterations: 0,
      observationMs: 60000,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow();
  const operation = new AbortController();
  operation.abort();
  await expect(
    measureNativeCommits(viewport, project, input, {
      iterations: 100,
      observationMs: 60000,
      signal: operation.signal,
    }),
  ).rejects.toThrow();
  expect(project).toEqual(before);
  expect(setProject).not.toHaveBeenCalled();
});
it('restores the source fixture and removes observers when a real commit cannot be rendered', async () => {
  const add = vi.fn(),
    remove = vi.fn(),
    disconnect = vi.fn();
  vi.stubGlobal('document', { hidden: false, addEventListener: add, removeEventListener: remove });
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['longtask'];
      observe() {
        throw new Error('Unavailable observer');
      }
      disconnect = disconnect;
    },
  );
  const setProject = vi.fn().mockReturnValue({ ok: false });
  const viewport = {
    diagnostics: { state: 'active', framesRendered: 1 },
    setProject,
  } as unknown as NativeViewport;
  const project = nativeBox(),
    before = structuredClone(project);
  await expect(
    measureNativeCommits(viewport, project, input, {
      iterations: 5,
      observationMs: 60000,
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('commit failed');
  expect(setProject).toHaveBeenCalledTimes(2);
  expect(setProject.mock.calls[1][0]).toEqual(before);
  expect(project).toEqual(before);
  expect(disconnect).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
});

it('returns raw observations with an explicit isolated scope and restores the unchanged fixture', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const operation = new AbortController();
  let result: ReturnType<typeof measureNativeCommits> | undefined;
  try {
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('PerformanceObserver', undefined);
    const diagnostics = { state: 'active', framesRendered: 1 };
    const setProject = vi.fn().mockImplementation(() => {
      diagnostics.framesRendered++;
      return { ok: true };
    });
    const viewport = { diagnostics, setProject } as unknown as NativeViewport;
    const project = nativeBox(),
      before = structuredClone(project);
    result = measureNativeCommits(viewport, project, input, {
      iterations: 5,
      observationMs: 60000,
      signal: operation.signal,
    });
    // WebCrypto runs outside fake timers. Wait for its completion even when the
    // full suite is busy, rather than giving it a fixed number of event-loop turns.
    await vi.waitFor(() => expect(setProject).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(60001);
    const recorded = await result;
    expect(recorded).toMatchObject({
      evidenceScope: 'isolated-native-renderer',
      productInputLatencyMeasured: false,
      physicalAcceptance: false,
    });
    expect(recorded.record.measurements.find((entry) => entry.metric === 'input')).toMatchObject({
      status: 'measured',
      summary: { n: 5, p95Ms: null },
    });
    expect(
      recorded.record.measurements.find((entry) => entry.metric === 'import-first-draw'),
    ).toMatchObject({ status: 'not-measured' });
    expect(setProject).toHaveBeenCalledTimes(6);
    expect(setProject.mock.calls[5][0]).toEqual(before);
    expect(project).toEqual(before);
  } finally {
    operation.abort();
    await result?.catch(() => undefined);
    vi.useRealTimers();
  }
});
