import {
  H3_CASES,
  makeMeasuredResult,
  runH3CoreCase,
  type H3Capabilities,
  type H3Observations,
} from './matrix';
import './style.css';

declare const __H3_SOURCE_COMMIT__: string;

const PENDING_KEY = 'chameleon-h3-pending-run-v1';

interface MemoryPerformance extends Performance {
  memory?: { usedJSHeapSize?: number };
}

interface PendingRun {
  caseId: string;
  startedAt: string;
}

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) {
    throw new Error(`Missing element: ${id}`);
  }
  return target as T;
}

function priorPendingRun(): PendingRun | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRun>;
    return typeof parsed.caseId === 'string' && typeof parsed.startedAt === 'string'
      ? { caseId: parsed.caseId, startedAt: parsed.startedAt }
      : null;
  } catch {
    return null;
  }
}

function requiredValue(id: string): string {
  const value = element<HTMLInputElement>(id).value.trim();
  if (!value) {
    throw new Error(`${id} is required`);
  }
  return value;
}

function heapBytes(): number | null {
  const value = (performance as MemoryPerformance).memory?.usedJSHeapSize;
  return typeof value === 'number' ? value : null;
}

function orientation(): string {
  return (
    screen.orientation?.type ??
    (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape')
  );
}

function animationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setStatus(message: string, kind: 'normal' | 'error' = 'normal'): void {
  const status = element<HTMLElement>('status');
  status.textContent = message;
  status.dataset.kind = kind;
}

function renderDownload(value: unknown, filename: string): void {
  const output = element<HTMLTextAreaElement>('output');
  const json = JSON.stringify(value, null, 2);
  output.value = json;
  const link = element<HTMLAnchorElement>('download');
  if (link.href.startsWith('blob:')) {
    URL.revokeObjectURL(link.href);
  }
  link.href = URL.createObjectURL(new Blob([`${json}\n`], { type: 'application/json' }));
  link.download = filename;
  link.hidden = false;
}

async function runSelectedCase(): Promise<void> {
  const button = element<HTMLButtonElement>('run');
  button.disabled = true;
  const previous = priorPendingRun();
  let observer: PerformanceObserver | null = null;

  try {
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      throw new Error(
        'iPhone / iPad evidence requires an HTTPS origin. HTTP LAN previews are invalid.',
      );
    }
    const sourceCommit = requiredValue('source-commit');
    if (!/^[0-9a-f]{7,40}$/i.test(sourceCommit)) {
      throw new Error('source-commit must be a 7-40 character hexadecimal commit SHA');
    }
    const device = requiredValue('device');
    const os = requiredValue('os');
    const browser = requiredValue('browser');
    const caseId = element<HTMLSelectElement>('case').value;
    const definition = H3_CASES.find((candidate) => candidate.id === caseId);
    if (!definition || definition.tier !== 'device-core') {
      throw new Error('Browser runs accept one device-core case at a time');
    }

    const pending: PendingRun = { caseId, startedAt: new Date().toISOString() };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    setStatus(`Running ${caseId}: 3 warmups + 10 recorded iterations...`);

    const longTaskEntries: PerformanceEntry[] = [];
    let longTaskCapability: H3Capabilities['longTask'] = 'unsupported';
    const supportedEntryTypes =
      'PerformanceObserver' in window
        ? (PerformanceObserver as unknown as { supportedEntryTypes?: readonly string[] })
            .supportedEntryTypes
        : undefined;
    if (supportedEntryTypes?.includes('longtask')) {
      try {
        observer = new PerformanceObserver((list) => {
          longTaskEntries.push(...list.getEntries());
        });
        observer.observe({ type: 'longtask' });
        longTaskCapability = 'supported';
      } catch {
        observer = null;
      }
    }

    const heapBefore = heapBytes();
    const measurementStartedAt = performance.now();
    const core = await runH3CoreCase(definition, { betweenIterations: animationFrame });
    const measurementEndedAt = performance.now();
    const heapAfter = heapBytes();
    const storage = await navigator.storage?.estimate?.();
    if (observer) {
      longTaskEntries.push(...observer.takeRecords());
    }
    observer?.disconnect();
    observer = null;
    const measuredLongTasks = longTaskEntries.filter(
      (entry) => entry.startTime >= measurementStartedAt && entry.startTime < measurementEndedAt,
    );

    const capabilities: H3Capabilities = {
      longTask: longTaskCapability,
      jsHeap: heapBefore === null || heapAfter === null ? 'unsupported' : 'supported',
      storageEstimate: storage ? 'supported' : 'unsupported',
    };
    const observations: H3Observations = {
      longTaskCount: longTaskCapability === 'supported' ? measuredLongTasks.length : null,
      longTaskTotalMs:
        longTaskCapability === 'supported'
          ? measuredLongTasks.reduce((total, entry) => total + entry.duration, 0)
          : null,
      jsHeapBeforeBytes: heapBefore,
      jsHeapAfterBytes: heapAfter,
      storageUsageBytes: storage?.usage ?? null,
      storageQuotaBytes: storage?.quota ?? null,
    };
    const result = makeMeasuredResult({
      sourceCommit,
      definition,
      environment: {
        runtime: 'browser',
        recordedAt: new Date().toISOString(),
        device,
        os,
        browser,
        userAgent: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio,
        orientation: orientation(),
        lowPowerMode: element<HTMLSelectElement>('low-power').value as 'on' | 'off' | 'unknown',
        thermalState: element<HTMLSelectElement>('thermal').value as
          'normal' | 'warm' | 'hot' | 'unknown',
        cpu: null,
        logicalCpuCount: navigator.hardwareConcurrency || null,
        totalMemoryBytes: null,
      },
      capabilities,
      core,
      observations,
      interruptedPreviousRun: previous,
      notes: [
        'Core bake/serialization measurement only; product UI, renderer, save, Undo/Redo, reload, and export require the later product-path gate.',
        'Unsupported browser APIs are recorded as null/unsupported, never as zero.',
        'No numeric H3 warning or hard cap is accepted by this result.',
      ],
    });
    localStorage.removeItem(PENDING_KEY);
    renderDownload(
      result,
      `h3-${caseId}-${device.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
    );
    setStatus(`Completed ${caseId}. Download and retain the JSON before running another case.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'error');
  } finally {
    observer?.disconnect();
    button.disabled = false;
  }
}

function initialize(): void {
  element<HTMLInputElement>('source-commit').value = __H3_SOURCE_COMMIT__;
  const select = element<HTMLSelectElement>('case');
  for (const definition of H3_CASES.filter((candidate) => candidate.tier === 'device-core')) {
    const option = document.createElement('option');
    option.value = definition.id;
    option.textContent = `${definition.label} — ${definition.note}`;
    select.append(option);
  }
  const pending = priorPendingRun();
  if (pending) {
    element<HTMLElement>('interrupted').textContent =
      `Previous run did not clear its marker: ${pending.caseId}, started ${pending.startedAt}. ` +
      'Keep this as reload/crash evidence; the next result will reference it.';
  }
  element<HTMLButtonElement>('run').addEventListener('click', () => void runSelectedCase());
}

initialize();
