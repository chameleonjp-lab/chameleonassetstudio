import { expect, test, type Page } from '@playwright/test';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2e7d32';
    context.fillRect(0, 0, 32, 32);
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

test.describe('ごみ箱（2D-1B-STORAGE §B）', () => {
  test('削除したプロジェクトはごみ箱から復元でき、画像も残る', async ({ page }) => {
    // 削除・完全削除は確認ダイアログを出すため、常に承認する
    page.on('dialog', (dialog) => void dialog.accept());

    await setupProjectWithImage(page, 'trash-rt');
    await page.getByRole('button', { name: '← ホーム' }).click();
    await expect(page.getByRole('button', { name: '「trash-rt」を開く' })).toBeVisible();

    // 削除するとごみ箱へ移動し、一覧からは消える
    await page.getByRole('button', { name: '「trash-rt」を削除' }).click();
    await expect(page.getByRole('button', { name: '「trash-rt」を開く' })).toHaveCount(0);

    // ごみ箱に表示される
    const restoreButton = page.getByRole('button', { name: 'ごみ箱の「trash-rt」を復元' });
    await expect(restoreButton).toBeVisible();

    // 復元すると一覧に戻る
    await restoreButton.click();
    await expect(page.getByRole('button', { name: '「trash-rt」を開く' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ごみ箱の「trash-rt」を復元' })).toHaveCount(0);

    // 開くと画像も復元されている
    await page.getByRole('button', { name: '「trash-rt」を開く' }).click();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  });

  test('ごみ箱から完全に削除すると復元できなくなる', async ({ page }) => {
    // 削除・完全削除は確認ダイアログを出すため、常に承認する
    page.on('dialog', (dialog) => void dialog.accept());

    await setupProjectWithImage(page, 'trash-purge');
    await page.getByRole('button', { name: '← ホーム' }).click();
    await page.getByRole('button', { name: '「trash-purge」を削除' }).click();

    const purgeButton = page.getByRole('button', { name: 'ごみ箱の「trash-purge」を完全に削除' });
    await expect(purgeButton).toBeVisible();
    await purgeButton.click();
    await expect(purgeButton).toHaveCount(0);
    await expect(page.getByRole('button', { name: '「trash-purge」を開く' })).toHaveCount(0);
  });
});

test.describe('壊れた import の隔離（2D-1B-STORAGE §E）', () => {
  test('壊れた ZIP は理由付きで失敗し、隔離一覧から削除できる', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('.casproj を読み込む').setInputFiles({
      name: 'broken.casproj',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]),
    });

    await expect(page.getByRole('alert')).toContainText('.casproj を読み込めませんでした');
    const quarantineSection = page.getByRole('region', { name: '読み込みに失敗したファイル' });
    await expect(quarantineSection).toBeVisible();
    await expect(quarantineSection.getByText('broken.casproj')).toBeVisible();

    await quarantineSection.getByRole('button', { name: '「broken.casproj」を削除' }).click();
    await expect(quarantineSection).toHaveCount(0);
  });
});
