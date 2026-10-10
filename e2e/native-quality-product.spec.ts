import { readFile } from 'node:fs/promises';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { sha256 } from '../src/core3d/export/snapshot';
import { test, expect, type Page, type Route } from '@playwright/test';
async function setup(page: Page) {
  await page.goto(
    new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
  );
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Quality');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  return page.getByRole('region', { name: '作品の品質検査', exact: true });
}
test('inspects a fixed revision, distinguishes unknown values and invalidates stale results', async ({
  page,
}) => {
  const panel = await setup(page);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await expect(panel.getByText('gpuMemoryBytes', { exact: true })).toBeVisible();
  await expect(panel.getByText(/この作品の他エンジン実行: 未検証/)).toBeVisible();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toBeVisible();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toHaveCount(0);
  await test.info().attach('native-visual-quality-statistics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('closing inspection terminates the held worker and rejects late results', async ({ page }) => {
  const panel = await setup(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    seen = new Promise<void>((r) => (started = r));
  const handler = async (route: Route) => {
    started();
    await gate;
    await route.continue().catch(() => undefined);
  };
  await page.route(/assetIo\.worker/, handler);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await seen;
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  release();
  await page.unroute(/assetIo\.worker/, handler);
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
});
test('phone quality controls remain usable and do not mark fixtures as current-asset verification', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const panel = await setup(page);
    await panel.getByRole('button', { name: '現在の版を検査', exact: true }).tap();
    await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
    for (const button of await panel.getByRole('button').all()) {
      const box = await button.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await test.info().attach('native-visual-quality-phone', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  } finally {
    await context.close();
  }
});

test('a warning opens the correct material section without overwriting an unsaved draft', async ({
  page,
}) => {
  const panel = await setup(page);
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await page.getByLabel(/^制作材質/).selectOption({ index: 1 });
  await page.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await page.getByLabel(/^透過モード/).selectOption('LEGACY_AUTO');
  await page.getByRole('button', { name: '材質を適用', exact: true }).click();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await page.getByLabel('粗さ roughness', { exact: true }).fill('0.123');
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await panel.getByRole('button', { name: '編集先を確認', exact: true }).first().click();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toBeVisible();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toHaveValue('0.123');
  await expect(page.getByText('材質の色・金属・粗さ', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '編集先を確認', exact: true }).first(),
  ).toBeDisabled();
});

test('inspection worker startup failure gives safe guidance and leaves the project recoverable', async ({
  page,
}) => {
  const project = assetIoFixture();
  project.name = 'Inspection source preservation';
  const sourceBytes = await assetIoPng(),
    sourceHash = await sha256(sourceBytes);
  project.blobIds = [sourceHash];
  project.materials[0].textureBlobId = sourceHash;
  project.sources = [
    {
      id: 'inspection-original',
      blobId: sourceHash,
      mimeType: 'image/png',
      rights: { declared: 'original fixture', embedded: '' },
    },
  ];
  const archive = await exportBackup(project, new Map([[sourceHash, sourceBytes]]));
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'inspection-source.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  const panel = page.getByRole('region', { name: '作品の品質検査', exact: true });
  const backup = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    return importBackup(new Uint8Array(await readFile((await (await download).path())!)));
  };
  const before = await backup();
  expect(before.blobs.size).toBe(1);
  expect(before.blobs.get(sourceHash)).toEqual(sourceBytes);
  expect(await sha256(before.blobs.get(sourceHash)!)).toBe(sourceHash);
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    let failOnce = true;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (failOnce && String(url).includes('assetIo.worker')) {
          failOnce = false;
          throw new Error('PRIVATE-WORKER file:///private/user/model.glb');
        }
        super(url, options);
      }
    };
  });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('[EDIT_UNKNOWN]');
  await expect(panel.getByRole('status')).toContainText('原因を特定できず');
  await expect(panel.getByRole('status')).not.toContainText('PRIVATE-WORKER');
  await expect(panel.getByRole('status')).not.toContainText('/private/');
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  const after = await backup();
  expect(after.project).toEqual(before.project);
  expect([...after.blobs]).toEqual([...before.blobs]);
  expect(after.blobs.get(sourceHash)).toEqual(sourceBytes);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  expect((await backup()).project).toEqual(before.project);
});
