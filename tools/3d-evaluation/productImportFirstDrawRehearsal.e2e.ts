import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importBackup } from '../../src/core3d/backup/backup';
import { sha256 } from '../../src/core3d/export/snapshot';
import { NativePerformanceCollector } from './performanceCollector';
import {
  parseNativePerformanceRecord,
  serializeNativePerformanceRecord,
  type NativePerformanceEnvironment,
} from './performanceRecord';

type ImportProbeSample = {
  startedAt: number;
  startMs: number;
  firstDrawAt: number | null;
  newCanvasObserved: boolean;
};
type ImportFirstDrawProbe = {
  active: boolean;
  armed: boolean;
  baselineCanvas: HTMLCanvasElement | null;
  current: ImportProbeSample | null;
  drawCalls: number;
  freezeObserved: boolean;
  freezeSupported: boolean;
  monitoring: boolean;
  recordStartedAt: number;
  visibilityChanged: boolean;
  visibleAtStart: boolean;
};
type ProbeWindow = Window & { __nativeImportFirstDrawProbe?: ImportFirstDrawProbe };

const runCount = Number(process.env.PRODUCT_IMPORT_FIRST_DRAW_RUNS ?? 5);
if (!Number.isSafeInteger(runCount) || runCount < 1 || runCount > 20)
  throw new Error('PRODUCT_IMPORT_FIRST_DRAW_RUNS must be an integer from 1 to 20');

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: ImportFirstDrawProbe = {
      active: false,
      armed: false,
      baselineCanvas: null,
      current: null,
      drawCalls: 0,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      monitoring: false,
      recordStartedAt: 0,
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
    };
    (window as ProbeWindow).__nativeImportFirstDrawProbe = probe;

    const drawMethods = [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
      'drawRangeElements',
    ];
    const wrapped = new Set<object>();
    for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!constructor || wrapped.has(constructor.prototype)) continue;
      wrapped.add(constructor.prototype);
      const prototype = constructor.prototype as unknown as Record<string, unknown>;
      for (const method of drawMethods) {
        const original = prototype[method];
        if (typeof original !== 'function') continue;
        prototype[method] = function (this: WebGLRenderingContext, ...args: unknown[]) {
          const canvas = this.canvas;
          const isProductViewport =
            canvas instanceof HTMLCanvasElement && canvas.closest('.native-viewport-host') !== null;
          const result = (original as (...values: unknown[]) => unknown).apply(this, args);
          if (isProductViewport) {
            probe.drawCalls++;
            const sample = probe.current;
            if (
              probe.active &&
              sample &&
              sample.firstDrawAt === null &&
              canvas !== probe.baselineCanvas
            ) {
              sample.firstDrawAt = performance.now();
              sample.newCanvasObserved = true;
              probe.active = false;
            }
          }
          return result;
        };
      }
    }

    document.addEventListener(
      'change',
      (event) => {
        const input = event.target;
        if (
          !probe.armed ||
          !(input instanceof HTMLInputElement) ||
          input.id !== 'editor3d-restore' ||
          !input.files?.length
        )
          return;
        const startedAt = performance.now();
        probe.current = {
          startedAt,
          startMs: startedAt - probe.recordStartedAt,
          firstDrawAt: null,
          newCanvasObserved: false,
        };
        probe.active = true;
        probe.armed = false;
      },
      true,
    );
    document.addEventListener('visibilitychange', () => {
      if (probe.monitoring && document.hidden) probe.visibilityChanged = true;
    });
    document.addEventListener('freeze', () => {
      if (probe.monitoring) probe.freezeObserved = true;
    });
  });
}

async function beginMeasurement(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeImportFirstDrawProbe!;
    probe.recordStartedAt = performance.now();
    probe.visibleAtStart = !document.hidden;
    probe.visibilityChanged = false;
    probe.freezeObserved = false;
    probe.freezeSupported = 'onfreeze' in document;
    probe.monitoring = true;
    return {
      startedAt: new Date().toISOString(),
      visible: probe.visibleAtStart,
      freezeSupported: probe.freezeSupported,
    };
  });
}

async function armImport(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeImportFirstDrawProbe!;
    const canvas = document.querySelector('.native-viewport-host canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    probe.baselineCanvas = canvas;
    probe.current = null;
    probe.armed = true;
    return true;
  });
}

async function readSample(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeImportFirstDrawProbe!;
    const sample = probe.current;
    if (!sample || sample.firstDrawAt === null || !sample.newCanvasObserved)
      throw new Error('The imported viewport did not produce a draw on a new canvas');
    return {
      startMs: sample.startMs,
      durationMs: sample.firstDrawAt - sample.startedAt,
      endMs: sample.firstDrawAt - probe.recordStartedAt,
      newCanvasObserved: sample.newCanvasObserved,
    };
  });
}

test('measures product backup import to the first draw on the restored viewport canvas', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(Math.max(180_000, runCount * 60_000 + 120_000));
  await installProbe(page);
  await page.goto('/3d/');
  await page
    .getByLabel('新しいプロジェクト名', { exact: true })
    .fill('Native import first draw fixture');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.locator('.native-viewport-host canvas').waitFor();
  await page.waitForFunction(
    () => (window as ProbeWindow).__nativeImportFirstDrawProbe!.drawCalls > 0,
    null,
    { timeout: 30_000 },
  );

  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const backupPath = await (await backupEvent).path();
  if (!backupPath) throw new Error('Playwright did not provide the seed backup path');
  const backupBytes = new Uint8Array(await readFile(backupPath));
  const fixture = await importBackup(backupBytes);
  expect(fixture.project.meshes.length).toBeGreaterThan(0);
  const fixtureHash = await sha256(backupBytes);

  const source = {
    commitSha: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain']).length > 0,
  };
  const browserFamily: NativePerformanceEnvironment['browser']['family'] =
    browserName === 'webkit' ? 'webkit' : 'chromium';
  const browserVersion = browser.version();
  const osFamily: NativePerformanceEnvironment['os']['family'] =
    process.platform === 'linux'
      ? 'linux'
      : process.platform === 'darwin'
        ? 'macos'
        : process.platform === 'win32'
          ? 'windows'
          : 'unknown';
  const viewport = await page.evaluate(() => ({
    widthCssPx: innerWidth,
    heightCssPx: innerHeight,
    devicePixelRatio,
  }));
  const environment: NativePerformanceEnvironment = {
    browser: {
      family: browserFamily,
      version: /^\d+(?:\.\d+){0,4}$/.test(browserVersion) ? browserVersion : null,
    },
    os: { family: osFamily, version: null },
    device: {
      realDevice: 'headless',
      category: 'desktop',
      model: 'unrecorded',
      thermalState: 'unknown',
    },
    viewport,
  };

  const measurementStart = await beginMeasurement(page);
  const clock = { value: 0 };
  const collector = new NativePerformanceCollector(
    {
      schemaVersion: 'native-performance-v1',
      source,
      fixture: { id: 'F01', sha256: fixtureHash },
      environment,
      cacheState: 'warm',
      startedAt: measurementStart.startedAt,
    },
    () => clock.value,
    measurementStart.visible,
  );
  collector.observing('import-first-draw');
  if (measurementStart.freezeSupported) collector.freezeMonitoringInstalled();

  const samples: { startMs: number; durationMs: number }[] = [];
  for (let index = 0; index < runCount; index++) {
    if (!(await armImport(page))) throw new Error('The pre-import viewport canvas is missing');
    await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'import-first-draw-fixture.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(backupBytes),
    });
    await expect(page.locator('.editor3d-notice')).toContainText(
      '新しいプロジェクトとして復元しました。元のプロジェクトは上書きしていません。',
    );
    await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await page.waitForFunction(
      () => {
        const sample = (window as ProbeWindow).__nativeImportFirstDrawProbe!.current;
        return Boolean(sample && sample.firstDrawAt !== null && sample.newCanvasObserved);
      },
      null,
      { timeout: 60_000 },
    );
    const observation = await readSample(page);
    expect(observation.durationMs).toBeGreaterThan(0);
    expect(observation.newCanvasObserved).toBe(true);
    samples.push({ startMs: observation.startMs, durationMs: observation.durationMs });
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  }

  const measurementEnd = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeImportFirstDrawProbe!;
    probe.monitoring = false;
    probe.active = false;
    probe.armed = false;
    return {
      elapsedMs: performance.now() - probe.recordStartedAt,
      freezeObserved: probe.freezeObserved,
      visibilityChanged: probe.visibilityChanged,
    };
  });
  if (measurementEnd.visibilityChanged) collector.visibilityChanged(false);
  if (measurementEnd.freezeObserved) collector.frozen();
  for (const sample of samples) {
    clock.value = Math.max(clock.value, sample.startMs + sample.durationMs);
    collector.observe('import-first-draw', sample);
  }
  clock.value = Math.max(clock.value, measurementEnd.elapsedMs);

  const measured = collector.finishRecord();
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(measured.record));
  const importMetric = record.measurements.find((entry) => entry.metric === 'import-first-draw')!;
  expect(importMetric.status).toBe('measured');
  expect(importMetric.summary.n).toBe(runCount);
  expect(importMetric.summary.p95Ms).toBeNull();
  expect(importMetric.summary.p95Reason).toBe('first-draw-median-max-only');
  expect(importMetric.summary.initialRunCoverage).toBe(
    runCount < 5 ? 'fewer-than-five-runs' : 'at-least-five-runs',
  );

  const result = {
    evidenceScope: 'native-product-ui-headless',
    executionMode: 'vite-production-preview',
    importFirstDrawBoundary:
      'from the capture-phase change event on #editor3d-restore through the restore notice and the 3D表示を開く action to return from the first successful WebGL draw call on a canvas in the new viewport; the canvas must differ from the pre-import canvas',
    productImportFirstDrawMeasured: true,
    physicalAcceptance: false,
    requestedRuns: runCount,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_IMPORT_FIRST_DRAW_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    const jsonPath = join(evidenceDirectory, `${browserName}.json`);
    const screenshotPath = join(evidenceDirectory, `${browserName}.png`);
    const screenshot = await page.screenshot({ fullPage: true });
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(screenshotPath, screenshot);
    await test.info().attach(`${browserName}-import-first-draw`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
