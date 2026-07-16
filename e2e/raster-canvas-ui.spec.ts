import { expect, test, type Page } from '@playwright/test';

interface StoredBlobRecord {
  key: string;
  mimeType: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

async function openNewProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  return page.getByRole('complementary', { name: 'プロパティ' });
}

async function createBlankAsset(page: Page) {
  const properties = await openNewProject(page, 'ラスター描画E2E');
  await properties.getByLabel('新規アセット名').fill('描画テスト');
  await properties.getByLabel('新規アセットのサイズ').selectOption('square-32');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function readStoredAlphaCount(page: Page): Promise<{
  alphaCount: number;
  width: number;
  height: number;
}> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<StoredBlobRecord[]>((resolve, reject) => {
        const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAll();
        request.onsuccess = () => resolve(request.result as StoredBlobRecord[]);
        request.onerror = () => reject(request.error);
      });
      const record = [...records].sort((left, right) =>
        left.updatedAt.localeCompare(right.updatedAt),
      ).at(-1);
      if (!record) {
        throw new Error('保存済み画像Blobが見つかりません。');
      }
      const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('OffscreenCanvas 2D contextが使えません。');
        }
        context.drawImage(bitmap, 0, 0);
        const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let alphaCount = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] > 0) {
            alphaCount += 1;
          }
        }
        return { alphaCount, width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    } finally {
      db.close();
    }
  });
}

async function canvasCenter(page: Page) {
  const box = await page.getByLabel('アセットキャンバス').boundingBox();
  if (!box) {
    throw new Error('Canvasの座標を取得できません。');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function waitForAlphaCount(page: Page, predicate: (count: number) => boolean) {
  await expect
    .poll(async () => (await readStoredAlphaCount(page)).alphaCount)
    .toSatisfy(predicate);
}

async function undoToTransparent(page: Page) {
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(async () => (await readStoredAlphaCount(page)).alphaCount).toBe(0);
}

test('brush・fill・矩形・楕円を保存し、各操作をUndoできる', async ({ page }) => {
  await createBlankAsset(page);
  const initial = await readStoredAlphaCount(page);
  expect(initial).toEqual({ alphaCount: 0, width: 32, height: 32 });

  await page.getByLabel('描画色').fill('#ff0000');
  await page.getByLabel('ブラシサイズ').fill('3');
  const center = await canvasCenter(page);

  await page.getByRole('button', { name: 'ブラシ', exact: true }).click();
  await page.mouse.move(center.x - 18, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 18, center.y, { steps: 6 });
  await page.mouse.up();
  await waitForAlphaCount(page, (count) => count > 0 && count < 32 * 32);
  await undoToTransparent(page);

  await page.getByRole('button', { name: '塗りつぶし', exact: true }).click();
  await page.mouse.click(center.x, center.y);
  await expect.poll(async () => (await readStoredAlphaCount(page)).alphaCount).toBe(32 * 32);
  await undoToTransparent(page);

  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await page.mouse.move(center.x - 20, center.y - 15);
  await page.mouse.down();
  await page.mouse.move(center.x + 20, center.y + 15, { steps: 4 });
  await page.mouse.up();
  await waitForAlphaCount(page, (count) => count > 0 && count < 32 * 32);
  await undoToTransparent(page);

  await page.getByRole('button', { name: '楕円', exact: true }).click();
  await page.mouse.move(center.x - 20, center.y - 20);
  await page.mouse.down();
  await page.mouse.move(center.x + 20, center.y + 20, { steps: 4 });
  await page.mouse.up();
  await waitForAlphaCount(page, (count) => count > 0 && count < 32 * 32);
  await undoToTransparent(page);
});
