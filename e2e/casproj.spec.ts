import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#8e44ad';
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

test('.casproj を書き出し、削除後に読み込むと画像ごと復元される', async ({ page }) => {
  await setupProjectWithImage(page, 'casproj-rt');

  // 書き出し
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('casproj-rt.casproj');
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);

  // ホームへ戻り、元プロジェクトを削除して空にする
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await page.getByRole('button', { name: '「casproj-rt」を削除' }).click();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();

  // 読み込み → 一覧に復元される
  await page
    .getByLabel('.casproj を読み込む')
    .setInputFiles({ name: 'casproj-rt.casproj', mimeType: 'application/zip', buffer: bytes });
  const openButton = page.getByRole('button', { name: '「casproj-rt」を開く' });
  await expect(openButton).toBeVisible();

  // 開くと画像レイヤーごと復元されている
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
});

test('casproj ではないファイルを読み込むと理由が表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'not-a-casproj.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from('これは ZIP ではありません', 'utf-8'),
  });
  await expect(page.getByRole('alert')).toContainText('.casproj を読み込めませんでした');
});
