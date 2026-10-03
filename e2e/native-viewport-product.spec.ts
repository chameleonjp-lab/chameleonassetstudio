import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function createBox(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native box work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
}
async function png(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('Native box work.png');
  return readFile((await download.path())!);
}

test('empty project to native box, keyboard camera, GPU pause, backup restore and re-edit', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/3d/');
  await expect(page.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  expect(
    requests.filter((url) =>
      /nativeViewport|adapters3d|assets\/renderer-|three\.js|OrbitControls/i.test(url),
    ),
  ).toEqual([]);
  await createBox(page);
  const before = await png(page);
  await test.info().attach('product-native-box.png', { body: before, contentType: 'image/png' });
  const rotate = page.getByRole('button', { name: 'カメラを左へ回転', exact: true });
  await rotate.focus();
  await page.keyboard.press('Enter');
  await expect(rotate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rotate).toBeFocused();
  const rotated = await png(page);
  expect(rotated.equals(before)).toBe(false);
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GPU表示を再開', exact: true })).toBeEnabled();
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const backup = await backupEvent;
  const backupBytes = await readFile((await backup.path())!);
  await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  expect((await png(page)).equals(rotated)).toBe(true);

  const fresh = await context.browser()!.newContext({
    viewport: page.viewportSize()!,
    deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
  });
  const restored = await fresh.newPage();
  try {
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: backup.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: backupBytes,
    });
    await expect(
      restored.getByRole('heading', { name: 'Native box work', exact: true }),
    ).toBeVisible();
    await restored.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
    expect((await png(restored)).equals(before)).toBe(true);
    await restored.getByRole('button', { name: '箱を追加', exact: true }).click();
    await restored.getByRole('button', { name: '元に戻す', exact: true }).click();
    await restored.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(
      restored.getByRole('status').filter({ hasText: '保存済み · revision' }),
    ).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('native panel fits a phone width and exposes keyboard-sized controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await createBox(page);
  const zoom = page.getByRole('button', { name: '3D表示を拡大', exact: true });
  const box = await zoom.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await zoom.focus();
  await page.keyboard.press('Space');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('product-native-panel-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('offline display chunk failure preserves saving and complete native backup', async ({
  page,
  context,
}) => {
  const events: unknown[] = [];
  page.on('request', (request) => events.push({ event: 'request', url: request.url() }));
  page.on('requestfailed', (request) =>
    events.push({ event: 'requestfailed', url: request.url(), error: request.failure() }),
  );
  page.on('response', (response) =>
    events.push({ event: 'response', url: response.url(), status: response.status() }),
  );
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) events.push({ event: 'navigation', url: frame.url() });
  });
  try {
    await page.goto('/3d/');
    await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Offline native work');
    await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
    await expect(
      page.getByRole('heading', { name: 'Offline native work', exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: '箱を追加', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '3D表示を読み込めませんでした' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '保存済み · revision' })).toBeVisible();
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    expect((await event).suggestedFilename()).toBe('Offline native work.cas3dproj');
    events.push({
      event: 'offline-boundary',
      error: await page.getByTestId('viewport-load-error').textContent(),
    });
    await context.setOffline(false);
    await page.getByRole('button', { name: '保存してページを再読み込み' }).click();
    await page.getByRole('button', { name: /Offline native work.*revision/ }).click();
    await expect(page.getByRole('button', { name: '箱を追加', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  } finally {
    const error = await page
      .getByTestId('viewport-load-error')
      .textContent({ timeout: 500 })
      .catch(() => null);
    events.push({ event: 'final-boundary', error });
    await test.info().attach('viewport-chunk-recovery.json', {
      body: Buffer.from(JSON.stringify(events, null, 2)),
      contentType: 'application/json',
    });
  }
});
