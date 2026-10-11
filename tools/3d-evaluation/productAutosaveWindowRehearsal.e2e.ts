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

type AutosaveSample = { startMs: number; durationMs: number };
type AutosaveProbe = {
  active: boolean;
  currentDirtyAt: number | null;
  freezeObserved: boolean;
  freezeSupported: boolean;
  recordStartedAt: number;
  samples: AutosaveSample[];
  visibilityChanged: boolean;
  visibleAtStart: boolean;
};
type ProbeWindow = Window & { __nativeAutosaveProbe?: AutosaveProbe };

const runCount = Number(process.env.PRODUCT_AUTOSAVE_WINDOW_RUNS ?? 20);
if (!Number.isSafeInteger(runCount) || runCount < 1 || runCount > 50)
  throw new Error('PRODUCT_AUTOSAVE_WINDOW_RUNS must be an integer from 1 to 50');

const transformPanel = (page: Page) =>
  page.getByRole('region', { name: '選択部品の差分変形', exact: true });

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: AutosaveProbe = {
      active: false,
      currentDirtyAt: null,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      recordStartedAt: 0,
      samples: [],
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
    };
    (window as ProbeWindow).__nativeAutosaveProbe = probe;
    document.addEventListener('visibilitychange', () => {
      if (probe.active && document.hidden) probe.visibilityChanged = true;
    });
    document.addEventListener('freeze', () => {
      if (probe.active) probe.freezeObserved = true;
    });
  });
}

async function projectRevisions(page: Page) {
  const text = await page.locator('.editor3d-revision').textContent();
  const match = text?.match(/編集中 revision (\d+) \/ 保存済み revision (\d+)/);
  if (!match) throw new Error(`Could not read product revisions: ${text ?? ''}`);
  return { current: Number(match[1]), persisted: Number(match[2]) };
}

async function waitForSaved(page: Page) {
  const status = page.locator('.editor3d-save-status');
  await expect(status).toHaveText(/^保存済み · revision \d+$/);
  await expect
    .poll(async () => {
      const revisions = await projectRevisions(page);
      return revisions.current === revisions.persisted;
    })
    .toBe(true);
}

async function currentProject(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const path = await (await downloadEvent).path();
  if (!path) throw new Error('Playwright did not provide the current project backup path');
  return importBackup(new Uint8Array(await readFile(path)));
}

async function savedProject(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page
    .getByRole('button', {
      name: '保存済みの版をバックアップ: Native autosave fixture',
      exact: true,
    })
    .click();
  const path = await (await downloadEvent).path();
  if (!path) throw new Error('Playwright did not provide the persisted project backup path');
  return importBackup(new Uint8Array(await readFile(path)));
}

async function beginMeasurement(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeAutosaveProbe!;
    probe.recordStartedAt = performance.now();
    probe.currentDirtyAt = null;
    probe.samples = [];
    probe.freezeObserved = false;
    probe.freezeSupported = 'onfreeze' in document;
    probe.visibilityChanged = false;
    probe.visibleAtStart = !document.hidden;
    probe.active = true;
    const observe = (time: number) => {
      if (!probe.active) return;
      const status = document.querySelector('.editor3d-save-status');
      const text = document.querySelector('.editor3d-revision')?.textContent ?? '';
      const pair = text.match(/編集中 revision (\d+) \/ 保存済み revision (\d+)/);
      if (probe.currentDirtyAt === null) {
        if (status?.classList.contains('is-dirty')) probe.currentDirtyAt = time;
      } else if (
        status &&
        !status.classList.contains('is-dirty') &&
        status.textContent?.trim().startsWith('保存済み · revision ') &&
        pair &&
        pair[1] === pair[2]
      ) {
        const startMs = probe.currentDirtyAt - probe.recordStartedAt;
        const durationMs = time - probe.currentDirtyAt;
        if (startMs >= 0 && durationMs > 0) probe.samples.push({ startMs, durationMs });
        probe.currentDirtyAt = null;
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    return {
      startedAt: new Date().toISOString(),
      visible: probe.visibleAtStart,
      freezeSupported: probe.freezeSupported,
    };
  });
}

test('measures product first-dirty to durable autosave revision', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(Math.max(180_000, runCount * 15_000 + 120_000));
  await installProbe(page);
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native autosave fixture');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await waitForSaved(page);
  await transformPanel(page).getByText('数値で差分変形', { exact: true }).click();

  const baseline = await currentProject(page);
  expect(baseline.project.nodes.length).toBeGreaterThan(0);
  await waitForSaved(page);
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
  collector.observing('autosave-window');
  if (measurementStart.freezeSupported) collector.freezeMonitoringInstalled();

  const panel = transformPanel(page);
  const startButton = panel.getByRole('button', { name: '数値変形を開始', exact: true });
  const x = panel.getByLabel('移動量 X（m）', { exact: true });
  const applyButton = panel.getByRole('button', { name: '数値変形を適用', exact: true });

  for (let index = 0; index < runCount; index++) {
    const before = await projectRevisions(page);
    expect(before.current).toBe(before.persisted);
    const previousSamples = await page.evaluate(
      () => (window as ProbeWindow).__nativeAutosaveProbe!.samples.length,
    );
    await startButton.click();
    await x.fill(String(0.1 + (index % 5) * 0.05));
    await applyButton.click();
    await expect.poll(async () => (await projectRevisions(page)).current).toBe(before.current + 1);
    await page.waitForFunction(
      (count) => (window as ProbeWindow).__nativeAutosaveProbe!.samples.length > count,
      previousSamples,
      { timeout: 15_000 },
    );
    const observed = await page.evaluate((sampleIndex) => {
      const probe = (window as ProbeWindow).__nativeAutosaveProbe!;
      const sample = probe.samples[sampleIndex];
      if (!sample) throw new Error('The autosave boundary probe did not produce a sample');
      return { sample, elapsedMs: performance.now() - probe.recordStartedAt };
    }, previousSamples);
    clock.value = Math.max(clock.value, observed.elapsedMs);
    collector.observe('autosave-window', observed.sample);
    await waitForSaved(page);
    const after = await projectRevisions(page);
    expect(after.current).toBe(before.current + 1);
    expect(after.persisted).toBe(after.current);
  }

  const measurementEnd = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeAutosaveProbe!;
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
  const autosaveMetric = record.measurements.find((entry) => entry.metric === 'autosave-window')!;
  expect(autosaveMetric.status).toBe('measured');
  expect(autosaveMetric.summary.n).toBe(runCount);
  expect(autosaveMetric.summary.medianMs).not.toBeNull();
  expect(autosaveMetric.summary.p95Ms).toBeNull();

  // The measured endpoint is SaveQueue's durable revision acknowledgment. Verify the saved
  // product backup matches the current project only after ending the timed observation window.
  const current = await currentProject(page);
  const persisted = await savedProject(page);
  expect(persisted.project).toEqual(current.project);
  const finalRevisions = await projectRevisions(page);
  expect(finalRevisions.persisted).toBe(finalRevisions.current);
  expect(persisted.project.revision).toBe(finalRevisions.persisted);

  const result = {
    evidenceScope: 'native-product-ui-headless',
    executionMode: 'vite-production-preview',
    autosaveWindowBoundary:
      'from the first requestAnimationFrame observation of .editor3d-save-status entering is-dirty after numeric Apply to the first frame where the accessible save label is 保存済み · revision N and edited/persisted revision numbers match; this state reflects the SaveQueue durable commit acknowledgment, not merely autosave scheduling',
    productAutosaveWindowMeasured: true,
    persistedBackupMatchesCurrentProject: true,
    physicalAcceptance: false,
    requestedRuns: runCount,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_AUTOSAVE_WINDOW_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    const jsonPath = join(evidenceDirectory, `${browserName}.json`);
    const screenshotPath = join(evidenceDirectory, `${browserName}.png`);
    const screenshot = await page.screenshot({ fullPage: true });
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(screenshotPath, screenshot);
    await test.info().attach(`${browserName}-autosave-window`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
