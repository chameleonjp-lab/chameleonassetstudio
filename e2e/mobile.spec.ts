import { expect, test, type Page } from '@playwright/test';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c0392b';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

test('スマホ横（667x375）で横スクロールが出ず、下部ナビが表示される', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await setupProjectWithImage(page, 'スマホ横テスト');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await expect(page.getByRole('navigation', { name: '画面切り替え' })).toBeVisible();
});

test('スマホ縦（375x667）で下部ナビから書き出し画面へ到達できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'スマホ縦書き出しテスト');

  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' })
    .click();

  await expect(page.getByRole('button', { name: 'PNG をダウンロード' })).toBeVisible();
});

test('スマホ縦でプロジェクト名入力のフォントが 16px 以上（iOS ズーム防止）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const input = page.getByLabel('プロジェクト名');
  await expect(input).toBeVisible();
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test('スマホ縦で下部ナビの主要ボタンのタップ対象が十分な高さを持つ', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'タップ対象テスト');

  const exportButton = page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' });
  const box = await exportButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});
