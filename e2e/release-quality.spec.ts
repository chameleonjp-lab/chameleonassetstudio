import { expect, test } from '@playwright/test';

test('初回ホーム取込は編集画面を先読みせず、320pxの確認画面を操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const editorRequests: string[] = [];
  page.on('request', (request) => {
    if (/EditorScreen.*\.(js|css|tsx)/.test(request.url())) editorRequests.push(request.url());
  });
  await page.goto('/2d/');
  await expect(page.getByRole('button', { name: '作成', exact: true })).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    return canvas.toDataURL().split(',')[1];
  });
  const started = Date.now();
  await page
    .getByLabel('画像を取り込む')
    .setInputFiles({ name: 'cold.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const importMs = Date.now() - started;
  expect(editorRequests).toEqual([]);
  expect(
    await dialog
      .locator('button')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height)),
  ).toEqual([44, 44]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  expect(editorRequests.length).toBeGreaterThan(0);
  const download = page.waitForEvent('download');
  const outputStarted = Date.now();
  // Mobile export navigation is the product path.
  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し', exact: true })
    .click();
  await page.getByRole('button', { name: 'PNG をダウンロード', exact: true }).click();
  await download;
  const exportMs = Date.now() - outputStarted;
  console.log(
    JSON.stringify({
      kind: 'release-quality-measurement',
      viewport: '320x568',
      image: '512x512 transparent PNG',
      importMs,
      exportMs,
      browser: test.info().project.name,
      realDevice: false,
    }),
  );
});
