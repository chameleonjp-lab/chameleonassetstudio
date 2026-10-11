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

type ProductProbe = {
  drawCalls: number;
  enabled: boolean;
  freezeObserved: boolean;
  freezeSupported: boolean;
  pendingStart: number | null;
  samples: { startMs: number; durationMs: number }[];
  startedAt: number;
  visibilityChanged: boolean;
  visibleAtStart: boolean;
};
type ProbeWindow = Window & { __nativeProductPerformanceProbe?: ProductProbe };

const samples = Number(process.env.PRODUCT_PERFORMANCE_SAMPLES ?? 100);
const observationMs = Number(process.env.PRODUCT_PERFORMANCE_WINDOW_MS ?? 60_000);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 1_000)
  throw new Error('PRODUCT_PERFORMANCE_SAMPLES must be an integer from 1 to 1000');
if (!Number.isSafeInteger(observationMs) || observationMs < 1_000 || observationMs > 3_600_000)
  throw new Error('PRODUCT_PERFORMANCE_WINDOW_MS must be an integer from 1000 to 3600000');

const controls = (page: Page) =>
  page.getByRole('region', { name: '選択部品の差分変形', exact: true });

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function currentProjectHash(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const downloadPath = await (await downloadEvent).path();
  if (!downloadPath) throw new Error('Playwright did not provide the product backup path');
  const backup = await importBackup(new Uint8Array(await readFile(downloadPath)));
  return sha256(new TextEncoder().encode(JSON.stringify(backup.project)));
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: ProductProbe = {
      drawCalls: 0,
      enabled: false,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      pendingStart: null,
      samples: [],
      startedAt: 0,
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
    };
    (window as ProbeWindow).__nativeProductPerformanceProbe = probe;

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
          if (canvas instanceof HTMLCanvasElement && canvas.closest('.native-viewport-host'))
            probe.drawCalls++;
          return (original as (...values: unknown[]) => unknown).apply(this, args);
        };
      }
    }

    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      requestFrame((time) => {
        const priorDrawCalls = probe.drawCalls;
        callback(time);
        if (probe.enabled && probe.pendingStart !== null && probe.drawCalls > priorDrawCalls) {
          const pendingStart = probe.pendingStart;
          probe.pendingStart = null;
          probe.samples.push({
            startMs: pendingStart - probe.startedAt,
            durationMs: performance.now() - pendingStart,
          });
        }
      });

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        const button = target instanceof Element ? target.closest('button') : null;
        if (probe.enabled && button?.textContent?.trim() === '数値変形を適用')
          probe.pendingStart = performance.now();
      },
      true,
    );
    document.addEventListener('visibilitychange', () => {
      if (probe.enabled && document.hidden) probe.visibilityChanged = true;
    });
    document.addEventListener('freeze', () => {
      if (probe.enabled) probe.freezeObserved = true;
    });
  });
}

test('measures product numeric commit to the next native WebGL frame without claiming physical acceptance', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(observationMs + 120_000);
  await installProbe(page);
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native product performance');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await controls(page).getByText('数値で差分変形', { exact: true }).click();
  const panel = controls(page);
  const startButton = panel.getByRole('button', { name: '数値変形を開始', exact: true });
  await expect(startButton).toBeEnabled();
  const fixtureHash = await currentProjectHash(page);
  await expect
    .poll(() =>
      page.evaluate(() => (window as ProbeWindow).__nativeProductPerformanceProbe!.drawCalls),
    )
    .toBeGreaterThan(0);

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
  const measurementStart = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeProductPerformanceProbe!;
    probe.samples = [];
    probe.pendingStart = null;
    probe.visibilityChanged = false;
    probe.freezeObserved = false;
    probe.visibleAtStart = !document.hidden;
    probe.freezeSupported = 'onfreeze' in document;
    probe.startedAt = performance.now();
    probe.enabled = true;
    return {
      startedAt: new Date().toISOString(),
      visible: probe.visibleAtStart,
      freezeSupported: probe.freezeSupported,
    };
  });

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
  collector.observing('input');
  if (!measurementStart.visible) collector.visibilityChanged(false);
  if (measurementStart.freezeSupported) collector.freezeMonitoringInstalled();

  for (let index = 0; index < samples; index++) {
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await panel
      .getByLabel('移動量 X（m）', { exact: true })
      .fill(index % 2 === 0 ? '0.01' : '-0.01');
    await panel.getByLabel('移動量 Y（m）', { exact: true }).fill('0');
    await panel.getByLabel('移動量 Z（m）', { exact: true }).fill('0');

    const targetElapsed = samples < 2 ? 0 : (index * (observationMs - 300)) / (samples - 1);
    const elapsed = await page.evaluate(() => {
      const probe = (window as ProbeWindow).__nativeProductPerformanceProbe!;
      return performance.now() - probe.startedAt;
    });
    if (targetElapsed > elapsed) await page.waitForTimeout(targetElapsed - elapsed);
    await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as ProbeWindow).__nativeProductPerformanceProbe!.samples.length,
          ),
        { timeout: 5_000 },
      )
      .toBe(index + 1);
  }

  const elapsedAfterSamples = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeProductPerformanceProbe!;
    return performance.now() - probe.startedAt;
  });
  if (observationMs + 100 > elapsedAfterSamples)
    await page.waitForTimeout(observationMs + 100 - elapsedAfterSamples);
  const probeResult = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeProductPerformanceProbe!;
    probe.enabled = false;
    return {
      elapsedMs: performance.now() - probe.startedAt,
      freezeObserved: probe.freezeObserved,
      pendingStart: probe.pendingStart,
      samples: probe.samples,
      visibilityChanged: probe.visibilityChanged,
    };
  });
  expect(probeResult.pendingStart).toBeNull();
  expect(probeResult.samples).toHaveLength(samples);
  if (probeResult.visibilityChanged) collector.visibilityChanged(false);
  if (probeResult.freezeObserved) collector.frozen();
  for (const sample of probeResult.samples) {
    clock.value = sample.startMs + sample.durationMs;
    collector.observe('input', sample);
  }
  clock.value = Math.max(observationMs, probeResult.elapsedMs);
  const measured = collector.finishRecord();
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(measured.record));
  const input = record.measurements.find((entry) => entry.metric === 'input')!;
  expect(input.status).toBe('measured');
  expect(input.summary.n).toBe(samples);
  expect(input.summary.medianMs).not.toBeNull();

  const result = {
    evidenceScope: 'native-product-ui-headless',
    inputBoundary:
      'capture-phase numeric-apply click to completion of the next requestAnimationFrame containing a WebGL draw from .native-viewport-host',
    productInputLatencyMeasured: true,
    physicalAcceptance: false,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_PERFORMANCE_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(
      join(evidenceDirectory, `${browserName}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
  const screenshot = await page.screenshot({ fullPage: true });
  if (evidenceDirectory) await writeFile(join(evidenceDirectory, `${browserName}.png`), screenshot);
  await test.info().attach('native-product-performance-screen', {
    body: screenshot,
    contentType: 'image/png',
  });
  await test.info().attach('native-product-performance-raw', {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: 'application/json',
  });
});
