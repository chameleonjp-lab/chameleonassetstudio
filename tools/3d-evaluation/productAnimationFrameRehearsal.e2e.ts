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

type AnimationFrameProbe = {
  drawCalls: number;
  enabled: boolean;
  freezeObserved: boolean;
  freezeSupported: boolean;
  lastDrawAt: number | null;
  playback: boolean;
  samples: { startMs: number; durationMs: number }[];
  startedAt: number;
  visibilityChanged: boolean;
  visibleAtStart: boolean;
};
type ProbeWindow = Window & { __nativeAnimationFrameProbe?: AnimationFrameProbe };

const observationMs = Number(process.env.PRODUCT_ANIMATION_FRAME_WINDOW_MS ?? 60_000);
if (!Number.isSafeInteger(observationMs) || observationMs < 1_000 || observationMs > 3_600_000)
  throw new Error('PRODUCT_ANIMATION_FRAME_WINDOW_MS must be an integer from 1000 to 3600000');

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const panel = (page: Page) => page.getByRole('region', { name: '3Dアニメーション', exact: true });

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: AnimationFrameProbe = {
      drawCalls: 0,
      enabled: false,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      lastDrawAt: null,
      playback: false,
      samples: [],
      startedAt: 0,
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
    };
    (window as ProbeWindow).__nativeAnimationFrameProbe = probe;

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
          if (
            this.canvas instanceof HTMLCanvasElement &&
            this.canvas.closest('.native-viewport-host')
          )
            probe.drawCalls++;
          return (original as (...values: unknown[]) => unknown).apply(this, args);
        };
      }
    }

    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      requestFrame((time) => {
        const previousDrawCalls = probe.drawCalls;
        callback(time);
        if (!probe.enabled || !probe.playback || probe.drawCalls === previousDrawCalls) return;
        const completedAt = performance.now();
        if (probe.lastDrawAt !== null) {
          const startMs = probe.lastDrawAt - probe.startedAt;
          const durationMs = completedAt - probe.lastDrawAt;
          if (startMs >= 0 && durationMs > 0) probe.samples.push({ startMs, durationMs });
        }
        probe.lastDrawAt = completedAt;
      });

    document.addEventListener('visibilitychange', () => {
      if (probe.enabled && document.hidden) probe.visibilityChanged = true;
    });
    document.addEventListener('freeze', () => {
      if (probe.enabled) probe.freezeObserved = true;
    });
  });
}

async function currentProject(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const downloadPath = await (await downloadEvent).path();
  if (!downloadPath) throw new Error('Playwright did not provide the product backup path');
  return importBackup(new Uint8Array(await readFile(downloadPath)));
}

test('measures active product animation frame intervals from actual viewport WebGL draws', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(observationMs + 120_000);
  await installProbe(page);
  await page.goto('/3d/');
  await page
    .getByLabel('新しいプロジェクト名', { exact: true })
    .fill('Native animation frame performance');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('アニメーション編集を開く', { exact: true }).click();

  const animation = panel(page);
  await animation.getByLabel('clip名', { exact: true }).fill('Looping measurement');
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  const target = animation.getByRole('combobox', { name: 'キー対象', exact: true });
  const nodeId = await target.locator('option').nth(1).getAttribute('value');
  if (!nodeId) throw new Error('Native project did not create a selectable node');
  await target.selectOption(nodeId);
  await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
  await animation.getByLabel('キー値 X', { exact: true }).fill('1');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  const loop = animation.getByLabel('clipをloop再生する', { exact: true });
  await loop.check();
  await animation.getByRole('button', { name: 'clip設定を適用', exact: true }).click();
  await expect(loop).toBeChecked();

  const project = await currentProject(page);
  expect(project.project.clips[0]?.loop).toBe(true);
  const fixtureHash = await sha256(new TextEncoder().encode(JSON.stringify(project.project)));
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

  const playButton = animation.getByRole('button', { name: 'clipを再生', exact: true });
  const stopButton = animation.getByRole('button', { name: 'clipを停止', exact: true });
  await playButton.click();
  await expect(animation.getByRole('status')).toContainText('アニメーション再生中');
  const measurementStart = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeAnimationFrameProbe!;
    probe.samples = [];
    probe.lastDrawAt = null;
    probe.visibilityChanged = false;
    probe.freezeObserved = false;
    probe.freezeSupported = 'onfreeze' in document;
    probe.visibleAtStart = !document.hidden;
    probe.startedAt = performance.now();
    probe.enabled = true;
    probe.playback = true;
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
  collector.observing('animation-frame');
  if (!measurementStart.visible) collector.visibilityChanged(false);
  if (measurementStart.freezeSupported) collector.freezeMonitoringInstalled();

  const elapsed = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeAnimationFrameProbe!;
    return performance.now() - probe.startedAt;
  });
  if (elapsed < observationMs) await page.waitForTimeout(observationMs - elapsed);
  await expect(animation.getByRole('status')).toContainText('アニメーション再生中');
  const probeResult = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeAnimationFrameProbe!;
    probe.enabled = false;
    probe.playback = false;
    const elapsedMs = performance.now() - probe.startedAt;
    return {
      elapsedMs,
      freezeObserved: probe.freezeObserved,
      samples: probe.samples.filter((sample) => sample.startMs + sample.durationMs <= elapsedMs),
      visibilityChanged: probe.visibilityChanged,
    };
  });
  await stopButton.click();
  await expect(animation.getByRole('status')).toContainText('アニメーション停止pose');
  expect(probeResult.elapsedMs).toBeGreaterThanOrEqual(observationMs);
  expect(probeResult.samples.length).toBeGreaterThan(0);

  if (probeResult.visibilityChanged) collector.visibilityChanged(false);
  if (probeResult.freezeObserved) collector.frozen();
  for (const sample of probeResult.samples) {
    clock.value = Math.max(clock.value, sample.startMs + sample.durationMs);
    collector.observe('animation-frame', sample);
  }
  clock.value = Math.max(observationMs, probeResult.elapsedMs);
  const measured = collector.finishRecord();
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(measured.record));
  const animationFrames = record.measurements.find((entry) => entry.metric === 'animation-frame')!;
  expect(animationFrames.status).toBe('measured');
  expect(animationFrames.summary.n).toBe(probeResult.samples.length);
  expect(animationFrames.summary.medianMs).not.toBeNull();

  const result = {
    evidenceScope: 'native-product-ui-headless',
    executionMode: 'vite-production-preview',
    animationFrameBoundary:
      'elapsed time between completion of consecutive requestAnimationFrame callbacks that each execute at least one WebGL draw on .native-viewport-host while clip playback is active',
    productAnimationFrameMeasured: true,
    physicalAcceptance: false,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_ANIMATION_FRAME_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    const jsonPath = join(evidenceDirectory, `${browserName}.json`);
    const screenshotPath = join(evidenceDirectory, `${browserName}.png`);
    const screenshot = await page.screenshot({ fullPage: true });
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(screenshotPath, screenshot);
    await test.info().attach(`${browserName}-animation-frame`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
