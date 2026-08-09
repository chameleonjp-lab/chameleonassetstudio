import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#457b9d';
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
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'base.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
}

/** IndexedDBの全ストアをBlobのメタデータ込みで正規化する（読み取り専用）。 */
async function readStorageSnapshot(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const storeNames = Array.from(db.objectStoreNames).sort();
    const snapshot: Record<string, unknown> = {};
    for (const storeName of storeNames) {
      const values = await new Promise<{ keys: IDBValidKey[]; values: unknown[] }>(
        (resolve, reject) => {
          const transaction = db.transaction(storeName, 'readonly');
          const store = transaction.objectStore(storeName);
          const keysRequest = store.getAllKeys();
          const valuesRequest = store.getAll();
          transaction.oncomplete = () =>
            resolve({ keys: keysRequest.result, values: valuesRequest.result });
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        },
      );
      snapshot[storeName] = values;
      snapshot[`${storeName}:keys`] = values.keys;
    }
    db.close();
    return JSON.stringify(snapshot, (_key, value) => {
      if (value instanceof Blob) {
        return { __type: 'Blob', size: value.size, type: value.type };
      }
      return value;
    });
  });
}

test.describe('Group 14 Game Check Mode', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('375x667で確認でき、UI-only操作の前後で永続データを変更しない', async ({ page }) => {
    await setupProjectWithImage(page, 'G14ゲーム確認');

    const openButton = page.getByRole('button', { name: 'ゲーム確認', exact: true });
    await expect(openButton).toBeEnabled();
    const before = await readStorageSnapshot(page);

    await openButton.click();
    await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
    await expect(page.getByText(/物理演算・engine固有挙動/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '実効collider' })).toBeChecked();
    await page.getByRole('checkbox', { name: '実効collider' }).uncheck();
    await page.getByRole('checkbox', { name: 'anchor' }).uncheck();

    const layout = await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);

    await page.getByRole('button', { name: 'Editorへ戻る', exact: true }).first().click();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
    expect(await readStorageSnapshot(page)).toBe(before);
  });
});
