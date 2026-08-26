import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatBytes,
  formatMilliseconds,
  readRuntimePerformanceSnapshot,
} from './performanceBudget';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readRuntimePerformanceSnapshot', () => {
  it('APIがない環境では値を推測せず未計測にする', () => {
    vi.stubGlobal('performance', {});
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PerformanceObserver', undefined);

    const snapshot = readRuntimePerformanceSnapshot();

    expect(snapshot.jsHeapUsedBytes).toBeNull();
    expect(snapshot.jsHeapLimitBytes).toBeNull();
    expect(snapshot.deviceMemoryGb).toBeNull();
    expect(snapshot.longTaskCount).toBeNull();
    expect(snapshot.longTaskDurationMs).toBeNull();
    expect(snapshot.longTaskSupport).toBe('unsupported');
  });

  it('有限でないブラウザ値を採用しない', () => {
    vi.stubGlobal('performance', {
      memory: {
        usedJSHeapSize: Number.NaN,
        jsHeapSizeLimit: Number.POSITIVE_INFINITY,
      },
    });
    vi.stubGlobal('navigator', { deviceMemory: Number.NaN });

    const snapshot = readRuntimePerformanceSnapshot();

    expect(snapshot.jsHeapUsedBytes).toBeNull();
    expect(snapshot.jsHeapLimitBytes).toBeNull();
    expect(snapshot.deviceMemoryGb).toBeNull();
  });
});

describe('format helpers', () => {
  it('バイト数と時間を読みやすく整形する', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatMilliseconds(12.34)).toBe('12.3 ms');
  });

  it('不正値は未計測として表示する', () => {
    expect(formatBytes(null)).toBe('未計測');
    expect(formatBytes(-1)).toBe('未計測');
    expect(formatMilliseconds(null)).toBe('未計測');
    expect(formatMilliseconds(Number.NaN)).toBe('未計測');
  });
});
