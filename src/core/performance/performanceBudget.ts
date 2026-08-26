export type MetricAvailability = 'available' | 'unsupported';

export interface RuntimePerformanceSnapshot {
  jsHeapUsedBytes: number | null;
  jsHeapLimitBytes: number | null;
  deviceMemoryGb: number | null;
  longTaskCount: number | null;
  longTaskDurationMs: number | null;
  longTaskSupport: MetricAvailability;
}

export interface LongTaskUpdate {
  longTaskCount: number;
  longTaskDurationMs: number;
}

export interface LongTaskObservation {
  availability: MetricAvailability;
  disconnect: () => void;
}

interface PerformanceMemory {
  usedJSHeapSize?: unknown;
  jsHeapSizeLimit?: unknown;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: unknown;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function readRuntimePerformanceSnapshot(): RuntimePerformanceSnapshot {
  const performanceObject =
    typeof globalThis.performance === 'undefined' ? undefined : globalThis.performance;
  const memory = (performanceObject as PerformanceWithMemory | undefined)?.memory;
  const navigatorObject =
    typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator;
  const deviceMemory = (navigatorObject as NavigatorWithDeviceMemory | undefined)?.deviceMemory;

  return {
    jsHeapUsedBytes: finiteNonNegativeNumber(memory?.usedJSHeapSize),
    jsHeapLimitBytes: finiteNonNegativeNumber(memory?.jsHeapSizeLimit),
    deviceMemoryGb: finiteNonNegativeNumber(deviceMemory),
    longTaskCount: null,
    longTaskDurationMs: null,
    longTaskSupport: typeof PerformanceObserver === 'function' ? 'available' : 'unsupported',
  };
}

export function observeLongTasks(
  onUpdate: (update: LongTaskUpdate) => void,
): LongTaskObservation {
  if (typeof PerformanceObserver !== 'function') {
    return { availability: 'unsupported', disconnect: () => undefined };
  }

  try {
    let longTaskCount = 0;
    let longTaskDurationMs = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        longTaskDurationMs += finiteNonNegativeNumber(entry.duration) ?? 0;
      }
      onUpdate({ longTaskCount, longTaskDurationMs });
    });
    observer.observe({ entryTypes: ['longtask'] });
    return { availability: 'available', disconnect: () => observer.disconnect() };
  } catch {
    return { availability: 'unsupported', disconnect: () => undefined };
  }
}

export function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return '未計測';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 || amount >= 10 ? 0 : 1;
  return amount.toFixed(fractionDigits) + ' ' + units[unitIndex];
}

export function formatMilliseconds(value: number | null): string {
  return value === null || !Number.isFinite(value) || value < 0
    ? '未計測'
    : value.toFixed(1) + ' ms';
}
