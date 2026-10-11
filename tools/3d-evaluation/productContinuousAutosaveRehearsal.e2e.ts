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

type PersistedChange = {
  atMs: number;
  currentRevision: number;
  persistedRevision: number;
  duringBurst: boolean;
};
type SavedTransition = {
  atMs: number;
  currentRevision: number;
  persistedRevision: number;
};
type BurstProbe = {
  active: boolean;
  initialCurrentRevision: number;
  initialPersistedRevision: number;
  firstDirtyAt: number | null;
  applyClickTimes: number[];
  persistedChanges: PersistedChange[];
  savedTransitions: SavedTransition[];
};
type ContinuousAutosaveProbe = {
  active: boolean;
  recordStartedAt: number;
  lastPersistedRevision: number | null;
  previousDirty: boolean;
  freezeObserved: boolean;
  freezeSupported: boolean;
  visibilityChanged: boolean;
  visibleAtStart: boolean;
  currentBurst: BurstProbe | null;
};
type ProbeWindow = Window & { __nativeContinuousAutosaveProbe?: ContinuousAutosaveProbe };

const runCount = Number(process.env.PRODUCT_CONTINUOUS_AUTOSAVE_RUNS ?? 5);
const commitCount = Number(process.env.PRODUCT_CONTINUOUS_AUTOSAVE_COMMITS ?? 20);
const pauseMs = Number(process.env.PRODUCT_CONTINUOUS_AUTOSAVE_PAUSE_MS ?? 200);
const debounceMs = 800;
if (!Number.isSafeInteger(runCount) || runCount < 1 || runCount > 10)
  throw new Error('PRODUCT_CONTINUOUS_AUTOSAVE_RUNS must be an integer from 1 to 10');
if (!Number.isSafeInteger(commitCount) || commitCount < 12 || commitCount > 40)
  throw new Error('PRODUCT_CONTINUOUS_AUTOSAVE_COMMITS must be an integer from 12 to 40');
if (!Number.isSafeInteger(pauseMs) || pauseMs < 50 || pauseMs > 500)
  throw new Error('PRODUCT_CONTINUOUS_AUTOSAVE_PAUSE_MS must be an integer from 50 to 500');

const transformPanel = (page: Page) =>
  page.getByRole('region', { name: '選択部品の差分変形', exact: true });

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: ContinuousAutosaveProbe = {
      active: false,
      recordStartedAt: 0,
      lastPersistedRevision: null,
      previousDirty: false,
      freezeObserved: false,
      freezeSupported: 'onfreeze' in document,
      visibilityChanged: false,
      visibleAtStart: !document.hidden,
      currentBurst: null,
    };
    (window as ProbeWindow).__nativeContinuousAutosaveProbe = probe;
    document.addEventListener(
      'click',
      (event) => {
        if (!probe.active || !probe.currentBurst?.active) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('button');
        if (button?.textContent?.trim() === '数値変形を適用')
          probe.currentBurst.applyClickTimes.push(performance.now() - probe.recordStartedAt);
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
      name: '保存済みの版をバックアップ: Native continuous autosave fixture',
      exact: true,
    })
    .click();
  const path = await (await downloadEvent).path();
  if (!path) throw new Error('Playwright did not provide the persisted project backup path');
  return importBackup(new Uint8Array(await readFile(path)));
}

async function beginMeasurement(page: Page) {
  return page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeContinuousAutosaveProbe!;
    const status = document.querySelector('.editor3d-save-status');
    const revisionText = document.querySelector('.editor3d-revision')?.textContent ?? '';
    const pair = revisionText.match(/編集中 revision (\d+) \/ 保存済み revision (\d+)/);
    if (!pair || status?.classList.contains('is-dirty'))
      throw new Error(`Expected a saved baseline before measuring: ${revisionText}`);
    probe.recordStartedAt = performance.now();
    probe.active = true;
    probe.lastPersistedRevision = Number(pair[2]);
    probe.previousDirty = false;
    probe.freezeObserved = false;
    probe.freezeSupported = 'onfreeze' in document;
    probe.visibilityChanged = false;
    probe.visibleAtStart = !document.hidden;
    const observe = () => {
      if (!probe.active) return;
      const now = performance.now();
      const atMs = now - probe.recordStartedAt;
      const saveStatus = document.querySelector('.editor3d-save-status');
      const text = document.querySelector('.editor3d-revision')?.textContent ?? '';
      const revisions = text.match(/編集中 revision (\d+) \/ 保存済み revision (\d+)/);
      const dirty = saveStatus?.classList.contains('is-dirty') ?? false;
      if (revisions) {
        const currentRevision = Number(revisions[1]);
        const persistedRevision = Number(revisions[2]);
        const burst = probe.currentBurst;
        if (burst?.active && dirty && burst.firstDirtyAt === null) burst.firstDirtyAt = atMs;
        if (
          probe.lastPersistedRevision !== null &&
          persistedRevision !== probe.lastPersistedRevision &&
          burst
        ) {
          burst.persistedChanges.push({
            atMs,
            currentRevision,
            persistedRevision,
            duringBurst: burst.active,
          });
        }
        const saved = !dirty && currentRevision === persistedRevision;
        if (probe.previousDirty && saved && burst)
          burst.savedTransitions.push({ atMs, currentRevision, persistedRevision });
        probe.previousDirty = dirty;
        probe.lastPersistedRevision = persistedRevision;
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

async function startBurst(page: Page, baseline: { current: number; persisted: number }) {
  await page.evaluate((initial) => {
    const probe = (window as ProbeWindow).__nativeContinuousAutosaveProbe!;
    probe.currentBurst = {
      active: true,
      initialCurrentRevision: initial.current,
      initialPersistedRevision: initial.persisted,
      firstDirtyAt: null,
      applyClickTimes: [],
      persistedChanges: [],
      savedTransitions: [],
    };
  }, baseline);
}

async function stopInputBurst(page: Page) {
  return page.evaluate(() => {
    const burst = (window as ProbeWindow).__nativeContinuousAutosaveProbe!.currentBurst;
    if (!burst) throw new Error('No autosave burst is active');
    burst.active = false;
    return structuredClone(burst);
  });
}

async function readBurst(page: Page) {
  return page.evaluate(() => {
    const burst = (window as ProbeWindow).__nativeContinuousAutosaveProbe!.currentBurst;
    if (!burst) throw new Error('No autosave burst was recorded');
    return structuredClone(burst);
  });
}

test('measures durable checkpoints during continuous product edits', async ({
  page,
  browser,
  browserName,
}) => {
  test.setTimeout(Math.max(180_000, runCount * 35_000 + 90_000));
  await installProbe(page);
  await page.goto('/3d/');
  await page
    .getByLabel('新しいプロジェクト名', { exact: true })
    .fill('Native continuous autosave fixture');
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
  const burstResults: Array<{
    baselineRevision: number;
    finalRevision: number;
    requestedCommits: number;
    actualApplyClicks: number;
    maximumInterCommitGapMs: number;
    firstDirtyAtMs: number;
    firstCheckpointAtMs: number;
    firstDirtyToFirstCheckpointMs: number;
    checkpointCurrentRevision: number;
    checkpointPersistedRevision: number;
    firstCheckpointObservedDuringBurst: boolean;
    finalAckAtMs: number;
    lastEditToFinalAckMs: number;
  }> = [];

  for (let run = 0; run < runCount; run++) {
    await waitForSaved(page);
    const before = await projectRevisions(page);
    expect(before.current).toBe(before.persisted);
    await startBurst(page, before);
    for (let index = 0; index < commitCount; index++) {
      const current = await projectRevisions(page);
      await startButton.click();
      await x.fill(String(0.01 + ((run + index) % 9) * 0.01));
      await applyButton.click();
      await expect
        .poll(async () => (await projectRevisions(page)).current)
        .toBe(current.current + 1);
      if (index < commitCount - 1) await page.waitForTimeout(pauseMs);
    }

    const inputBurst = await stopInputBurst(page);
    expect(inputBurst.applyClickTimes).toHaveLength(commitCount);
    const gaps = inputBurst.applyClickTimes
      .slice(1)
      .map((time, index) => time - inputBurst.applyClickTimes[index]);
    const maximumInterCommitGapMs = Math.max(...gaps);
    expect(
      maximumInterCommitGapMs,
      `Continuous-input run ${run + 1} exceeded the ${debounceMs} ms debounce interval`,
    ).toBeLessThan(debounceMs);
    expect(inputBurst.firstDirtyAt).not.toBeNull();

    const firstCheckpoint = inputBurst.persistedChanges.find(
      (change) =>
        change.duringBurst &&
        change.persistedRevision > before.persisted &&
        change.atMs < inputBurst.applyClickTimes.at(-1)!,
    );
    expect(
      firstCheckpoint,
      `Run ${run + 1} did not durably advance a revision while the continuous edit burst was active`,
    ).toBeDefined();

    await waitForSaved(page);
    const after = await projectRevisions(page);
    expect(after.current).toBe(before.current + commitCount);
    expect(after.persisted).toBe(after.current);
    const completedBurst = await readBurst(page);
    const finalAck = [...completedBurst.savedTransitions]
      .reverse()
      .find(
        (transition) =>
          transition.currentRevision === after.current &&
          transition.persistedRevision === after.current,
      );
    expect(
      finalAck,
      `Run ${run + 1} did not record the final durable revision transition`,
    ).toBeDefined();

    const firstDirtyAtMs = inputBurst.firstDirtyAt!;
    const firstDirtyToFirstCheckpointMs = firstCheckpoint!.atMs - firstDirtyAtMs;
    const lastEditAtMs = inputBurst.applyClickTimes.at(-1)!;
    expect(firstDirtyToFirstCheckpointMs).toBeGreaterThan(0);
    expect(finalAck!.atMs).toBeGreaterThan(lastEditAtMs);
    clock.value = Math.max(clock.value, finalAck!.atMs);
    collector.observe('autosave-window', {
      startMs: firstDirtyAtMs,
      durationMs: firstDirtyToFirstCheckpointMs,
    });

    burstResults.push({
      baselineRevision: before.persisted,
      finalRevision: after.persisted,
      requestedCommits: commitCount,
      actualApplyClicks: inputBurst.applyClickTimes.length,
      maximumInterCommitGapMs,
      firstDirtyAtMs,
      firstCheckpointAtMs: firstCheckpoint!.atMs,
      firstDirtyToFirstCheckpointMs,
      checkpointCurrentRevision: firstCheckpoint!.currentRevision,
      checkpointPersistedRevision: firstCheckpoint!.persistedRevision,
      firstCheckpointObservedDuringBurst: firstCheckpoint!.duringBurst,
      finalAckAtMs: finalAck!.atMs,
      lastEditToFinalAckMs: finalAck!.atMs - lastEditAtMs,
    });

    const current = await currentProject(page);
    const persisted = await savedProject(page);
    expect(persisted.project).toEqual(current.project);
    expect(persisted.project.revision).toBe(after.persisted);
  }

  const measurementEnd = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__nativeContinuousAutosaveProbe!;
    probe.active = false;
    return {
      elapsedMs: performance.now() - probe.recordStartedAt,
      freezeObserved: probe.freezeObserved,
      visibilityChanged: probe.visibilityChanged,
    };
  });
  if (measurementEnd.visibilityChanged) collector.visibilityChanged(false);
  if (measurementEnd.freezeObserved) collector.frozen();
  clock.value = Math.max(clock.value, measurementEnd.elapsedMs);

  const measured = collector.finishRecord();
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(measured.record));
  const autosaveMetric = record.measurements.find((entry) => entry.metric === 'autosave-window')!;
  expect(autosaveMetric.status).toBe('measured');
  expect(autosaveMetric.summary.n).toBe(runCount);
  expect(autosaveMetric.summary.p95Ms).toBeNull();

  const finalCurrent = await currentProject(page);
  const finalPersisted = await savedProject(page);
  expect(finalPersisted.project).toEqual(finalCurrent.project);
  const finalRevisions = await projectRevisions(page);
  expect(finalRevisions.persisted).toBe(finalRevisions.current);
  expect(finalPersisted.project.revision).toBe(finalRevisions.persisted);

  const result = {
    evidenceScope: 'native-product-ui-headless',
    executionMode: 'vite-production-preview',
    autosaveBurstBoundary:
      'each trial applies repeated numeric commits with every observed apply-to-apply gap below the configured 800 ms debounce; autosave-window samples run from the first dirty-state observation to the first durable revision checkpoint observed before the burst ends; the final revision is verified separately after the last edit',
    productContinuousAutosaveMeasured: true,
    continuousInputDebounceMs: debounceMs,
    requestedRuns: runCount,
    requestedCommitsPerRun: commitCount,
    requestedPauseBetweenCommitsMs: pauseMs,
    allBurstsHadDurableCheckpointBeforeLastEdit: burstResults.every(
      (trial) => trial.firstCheckpointObservedDuringBurst,
    ),
    finalSavedBackupMatchesCurrentProject: true,
    physicalAcceptance: false,
    burstResults,
    record,
  };
  const evidenceDirectory = process.env.NATIVE_PRODUCT_CONTINUOUS_AUTOSAVE_EVIDENCE_DIR;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    const prefix = `PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11_${browserName}`;
    const jsonPath = join(evidenceDirectory, `${prefix}.json`);
    const screenshotPath = join(evidenceDirectory, `${prefix}.png`);
    const screenshot = await page.screenshot({ fullPage: true });
    await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(screenshotPath, screenshot);
    await test.info().attach(`${browserName}-continuous-autosave`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
});
