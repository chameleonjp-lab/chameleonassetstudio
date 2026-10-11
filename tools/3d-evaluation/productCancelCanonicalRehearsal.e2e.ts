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

type CancelSample = { startMs: number; durationMs: number };
type CancelProbe = {
  active: boolean;
  cancelStartedAt: number | null;
  freezeObserved: boolean;
  freezeSupported: boolean;
  recordStartedAt: number;
  samples: CancelSample[];
  visibilityChanged: boolean;
  visibleAtStart: boolean;
};
type ProbeWindow = Window & { __nativeCancelProbe?: CancelProbe };

const runCount = Number(process.env.PRODUCT_CANCEL_RUNS ?? 20);
if (!Number.isSafeInteger(runCount) || runCount < 1 || runCount > 50)
  throw new Error('PRODUCT_CANCEL_RUNS must be an integer from 1 to 50');

const cancelNotice = '数値変形を取り消しました。確定済みの値に戻りました。';
const panel = (page: Page) => page.getByRole('region', { name: '選択部品の差分変形', exact: true });

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const noticeText = '数値変形を取り消しました。確定済みの値に戻りました。';
    const probe: CancelProbe = {
      active: false,
      cancelStartedAt: null,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      recordStartedAt: 0,
      samples: [],
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
    };
    (window as ProbeWindow).__nativeCancelProbe = probe;

    const captureCompletedCancel = () => {
      if (!probe.active || probe.cancelStartedAt === null) return;
      const noticeIsVisible = Array.from(
        document.querySelectorAll('.native-transform [role="status"]'),
      ).some((node) => node.textContent?.trim() === noticeText);
      if (!noticeIsVisible) {
        requestAnimationFrame(captureCompletedCancel);
        return;
      }
      const endedAt = performance.now();
      const startMs = probe.cancelStartedAt - probe.recordStartedAt;
      const durationMs = endedAt - probe.cancelStartedAt;
      if (startMs >= 0 && durationMs > 0) probe.samples.push({ startMs, durationMs });
      probe.cancelStartedAt = null;
    };

    document.addEventListener(
      'click',
      (event) => {
        if (!probe.active || probe.cancelStartedAt !== null) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('button');
        if (
          button?.closest('.native-transform') &&
          button.textContent?.trim() === '数値変形を取り消す'
        ) {
          probe.cancelStartedAt = performance.now();
          requestAnimationFrame(captureCompletedCancel);
        }
      },
      true,
    );
    document.addEventListener('visibilitychange', () => {
      if (probe.active && document.hidden) probe.visibilityChanged = true;
    });
    document.addEventListener('freeze', () => {
      if (probe.active) probe.freezeObserved = true;
    });
  });
}

async function currentProject(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const path = await (await downloadEvent).path();
  if (!path) throw new Error('Playwright did not provide the product backup path');
  return importBackup(new Uint8Array(await readFile(path)));
}

async function revision(page: Page) {
  const text = await page.locator('.editor3d-revision').textContent();
  const match = text?.match(/編集中 revision (\d+)/);
  if (!match) throw new Error(`Could not read the canonical project revision: ${text ?? ''}`);
  return Number(match[1]);
}

async function beginMeasurement(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeCancelProbe!;
    probe.recordStartedAt = performance.now();
    probe.samples = [];
    probe.cancelStartedAt = null;
    probe.freezeObserved = false;
    probe.freezeSupported = 'onfreeze' in document;
    probe.visibilityChanged = false;
    probe.visibleAtStart = !document.hidden;
    probe.active = true;
    return {
      startedAt: new Date().toISOString(),
      visible: probe.visibleAtStart,
      freezeSupported: probe.freezeSupported,
    };
  });
}

test('measures product cancel to canonical unchanged and verifies each backup snapshot', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(Math.max(180_000, runCount * 12_000 + 120_000));
  await installProbe(page);
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native cancel fixture');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('数値で差分変形', { exact: true }).click();

  const baseline = await currentProject(page);
  expect(baseline.project.nodes.length).toBeGreaterThan(0);
  const canonicalRevision = await revision(page);
  const fixtureHash = await sha256(new TextEncoder().encode(JSON.stringify(baseline.project)));
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
  collector.observing('cancel');
  if (measurementStart.freezeSupported) collector.freezeMonitoringInstalled();

  const transform = panel(page);
  const startButton = transform.getByRole('button', { name: '数値変形を開始', exact: true });
  const x = transform.getByLabel('移動量 X（m）', { exact: true });
  const previewButton = transform.getByRole('button', {
    name: '数値変形をプレビュー',
    exact: true,
  });
  const cancelButton = transform.getByRole('button', { name: '数値変形を取り消す', exact: true });

  for (let index = 0; index < runCount; index++) {
    await startButton.click();
    await x.fill(String(0.25 + (index % 4) * 0.25));
    await previewButton.click();
    await expect(
      transform.getByRole('status').filter({ hasText: 'プレビュー中' }).first(),
    ).toBeVisible();
    const previousSamples = await page.evaluate(
      () => (window as ProbeWindow).__nativeCancelProbe!.samples.length,
    );
    await expect(cancelButton).toBeEnabled();
    await cancelButton.click();
    await expect(transform.getByText(cancelNotice, { exact: true })).toBeVisible();
    await page.waitForFunction(
      (count) => (window as ProbeWindow).__nativeCancelProbe!.samples.length > count,
      previousSamples,
      { timeout: 10_000 },
    );
    const observed = await page.evaluate((sampleIndex) => {
      const probe = (window as ProbeWindow).__nativeCancelProbe!;
      const sample = probe.samples[sampleIndex];
      if (!sample) throw new Error('The cancel completion probe did not produce a sample');
      return { sample, elapsedMs: performance.now() - probe.recordStartedAt };
    }, previousSamples);
    clock.value = Math.max(clock.value, observed.elapsedMs);
    collector.observe('cancel', observed.sample);
    expect(await revision(page)).toBe(canonicalRevision);

    // The timed interval ends at the product's cancel-complete notice; this independent
    // backup check verifies that the entire canonical project stayed byte-for-byte equivalent
    // at the decoded JSON object level without adding download/ZIP time to the latency sample.
    const after = await currentProject(page);
    expect(after.project).toEqual(baseline.project);
    expect(await revision(page)).toBe(canonicalRevision);
  }

  const measurementEnd = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeCancelProbe!;
    probe.active = false;
    return {
      elapsedMs: performance.now() - probe.recordStartedAt,
      freezeObserved: probe.freezeObserved,
      visibilityChanged: probe.visibilityChanged,
      sampleCount: probe.samples.length,
    };
  });
  expect(measurementEnd.sampleCount).toBe(runCount);
  if (measurementEnd.visibilityChanged) collector.visibilityChanged(false);
  if (measurementEnd.freezeObserved) collector.frozen();
  clock.value = Math.max(clock.value, measurementEnd.elapsedMs);

  const measured = collector.finishRecord();
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(measured.record));
  const cancelMetric = record.measurements.find((entry) => entry.metric === 'cancel')!;
  expect(cancelMetric.status).toBe('measured');
  expect(cancelMetric.summary.n).toBe(runCount);
  expect(cancelMetric.summary.medianMs).not.toBeNull();
  expect(cancelMetric.summary.p95Ms).toBeNull();

  const result = {
    evidenceScope: 'native-product-ui-headless',
    executionMode: 'vite-production-preview',
    cancelBoundary:
      'from the capture-phase click on 数値変形を取り消す to the product cancellation notice; the canonical revision is checked unchanged at each completion, then a decoded product backup is compared with the full pre-draft canonical project object outside the timed interval',
    productCancelMeasured: true,
    canonicalBackupEqualityChecks: runCount,
    physicalAcceptance: false,
    requestedRuns: runCount,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_CANCEL_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    const jsonPath = join(evidenceDirectory, `${browserName}.json`);
    const screenshotPath = join(evidenceDirectory, `${browserName}.png`);
    const screenshot = await page.screenshot({ fullPage: true });
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(screenshotPath, screenshot);
    await test.info().attach(`${browserName}-cancel-canonical`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
