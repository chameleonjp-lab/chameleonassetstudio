import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#6c5ce7';
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
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function readSavedProjectName(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('projects', 'readonly');
          const getAll = transaction.objectStore('projects').getAll() as IDBRequest<
            Array<{ name: string }>
          >;
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            db.close();
            resolve(getAll.result[0]?.name ?? null);
          };
        };
      }),
  );
}

test('読み込み後のオフラインでも端末内保存とPNG書き出しを続けられる', async ({ page }) => {
  await setupProjectWithImage(page, 'Group21B オフライン');

  await page.context().setOffline(true);
  const connectionStatus = page.getByRole('status', { name: '通信状態' });
  await expect(connectionStatus).toContainText('オフラインです');
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  await page.getByLabel('プロジェクト名').fill('Group21B オフライン保存済み');
  await expect(page.getByText('保存済み')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('base.png');

  await page.context().setOffline(false);
  await expect(connectionStatus).toContainText('オンラインに戻りました');
});

test('ページ離脱時に保留中の名前変更を保存し、再読み込み後に開ける', async ({ page }) => {
  const originalName = 'Group21B 離脱前';
  const savedName = 'Group21B 離脱保存済み';
  await setupProjectWithImage(page, originalName);

  await page.getByLabel('プロジェクト名').fill(savedName);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
  await expect.poll(() => readSavedProjectName(page)).toBe(savedName);

  await page.reload();
  await expect(page.getByRole('button', { name: `「${savedName}」を開く` })).toBeVisible();
});
