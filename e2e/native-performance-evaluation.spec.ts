import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import type { NativeEvaluation } from '../tools/3d-evaluation/main';
import {
  parseNativePerformanceRecord,
  serializeNativePerformanceRecord,
} from '../tools/3d-evaluation/performanceRecord';

test('records bounded real isolated-renderer commit observations without asserting a device tier', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000);
  await page.goto('/tools/3d-evaluation/index.html');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { nativeEvaluation: NativeEvaluation }).nativeEvaluation.diagnostics
            .framesRendered,
      ),
    )
    .toBeGreaterThan(0);
  const source = {
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty:
      execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
        encoding: 'utf8',
      }).trim().length > 0,
  };
  const result = await page.evaluate(
    async ({ source, browserName }) => {
      const app = (window as unknown as { nativeEvaluation: NativeEvaluation }).nativeEvaluation;
      return app.measureCommits({
        schemaVersion: 'native-performance-v1',
        source,
        environment: {
          browser: { family: browserName, version: null },
          os: { family: 'unknown', version: null },
          device: {
            realDevice: 'headless',
            category: 'desktop',
            model: 'unrecorded',
            thermalState: 'unknown',
          },
          viewport: { widthCssPx: innerWidth, heightCssPx: innerHeight, devicePixelRatio },
        },
      });
    },
    { source, browserName },
  );
  const record = parseNativePerformanceRecord(serializeNativePerformanceRecord(result.record));
  const input = record.measurements.find((entry) => entry.metric === 'input')!;
  expect(input.status).toBe('measured');
  expect(input.summary.n).toBe(100);
  expect(input.summary.medianMs).not.toBeNull();
  expect(result.evidenceScope).toBe('isolated-native-renderer');
  expect(result.productInputLatencyMeasured).toBe(false);
  expect(result.physicalAcceptance).toBe(false);
  expect(record.measurements.find((entry) => entry.metric === 'animation-frame')!.status).toBe(
    'not-measured',
  );
  const evidencePath = process.env.NATIVE_PERFORMANCE_EVIDENCE_PATH;
  if (evidencePath) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
  }
  const screenshot = await page.screenshot({ fullPage: true });
  const screenshotPath = process.env.NATIVE_PERFORMANCE_SCREENSHOT_PATH;
  if (screenshotPath) {
    await mkdir(dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot);
  }
  await test.info().attach('native-performance-evaluation-screen', {
    body: screenshot,
    contentType: 'image/png',
  });
  await test.info().attach('native-performance-isolated-raw', {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: 'application/json',
  });
});
