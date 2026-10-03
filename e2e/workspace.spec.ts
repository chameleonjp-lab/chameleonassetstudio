import { expect, test } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

test('ホームの画像取込から編集・PNG出力・再開まで進める', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/2d/');
  const buffer = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#70c488';
    context.fillRect(8, 8, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('画像を取り込む', { exact: true }).setInputFiles({
    name: 'home-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(buffer, 'base64'),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' })
    .click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG をダウンロード' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('button', { name: '← ホーム' }).click();
  await expect(page.locator('.home-thumbnail img')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '「home-image」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});

test('保存が正常なら容量詳細を畳み、目的別に編集項目を選べる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 10, quota: 1000 }),
        persisted: async () => true,
      },
    });
  });
  await page.goto('/2d/');
  await expect(page.locator('#home-storage details')).not.toHaveAttribute('open');
  await page.getByLabel('プロジェクト名').fill('見本');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'プロパティ内メニュー' });
  await menu.getByRole('link', { name: 'ゲーム情報', exact: true }).click();
  await expect(page.getByRole('region', { name: 'ゲーム用の情報' })).toBeVisible();
  await expect(page.getByRole('region', { name: '素材の作成と管理' })).toBeHidden();
  await menu.getByRole('button', { name: 'すべて表示' }).click();
  await expect(page.getByRole('region', { name: '素材の作成と管理' })).toBeVisible();
});

test('ホーム取込を取消でき、保存失敗をダイアログ内で確認して再試行できる', async ({ page }) => {
  await page.goto('/2d/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = { name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') };
  const readCounts = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const counts = await Promise.all(
        ['projects', 'assets', 'blobs'].map(
          (store) =>
            new Promise<number>((resolve, reject) => {
              const request = db.transaction(store).objectStore(store).count();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      db.close();
      return counts;
    });
  await page.getByLabel('画像を取り込む', { exact: true }).setInputFiles(file);
  await page.getByRole('button', { name: '取り込みを取消' }).click();
  expect(await readCounts()).toEqual([0, 0, 0]);
  await page.getByLabel('画像を取り込む', { exact: true }).setInputFiles(file);
  await page.evaluate(() => {
    const state = globalThis as unknown as { originalPut: typeof IDBObjectStore.prototype.put };
    state.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('quota test', 'QuotaExceededError');
    };
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect(dialog.getByRole('alert')).toContainText('画像を保存できませんでした');
  expect(await readCounts()).toEqual([0, 0, 0]);
  await page.evaluate(() => {
    const state = globalThis as unknown as { originalPut: typeof IDBObjectStore.prototype.put };
    IDBObjectStore.prototype.put = state.originalPut;
  });
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  expect(await readCounts()).toEqual([1, 1, 3]);
});

for (const type of ['character', 'item', 'tile', 'effect']) {
  test(`${type} の見本は画素を持ち、空白は透明`, async ({ page }) => {
    await page.goto('/2d/');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    await page.getByLabel('新規アセットの種別').selectOption(type);
    await page.getByLabel('新規アセット名').fill('sample');
    await page.getByLabel('見本の絵を入れて始める').check();
    await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
    const readAlpha = (name = 'sample') =>
      page.evaluate(async (assetName) => {
        const modulePath = '/src/core/storage/index.ts';
        const { listProjectAssets, loadBlob, listProjects } = await import(modulePath);
        const projects = await listProjects();
        const assets = await listProjectAssets(projects[0].id);
        const asset = assets.find((entry: { name: string }) => entry.name === assetName);
        if (!asset) return -1;
        const texture = asset.textures.find((entry: { kind: string }) => entry.kind === 'edit')!;
        const blob = await loadBlob(`${asset.id}/${texture.path}`);
        const bitmap = await createImageBitmap(blob!);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let alpha = 0;
        for (let index = 3; index < pixels.length; index += 4) alpha += pixels[index];
        return alpha;
      }, name);
    await expect.poll(() => readAlpha()).toBeGreaterThan(0);
    await page.getByLabel('新規アセット名').fill('blank');
    await page.getByLabel('見本の絵を入れて始める').uncheck();
    await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
    await expect.poll(() => readAlpha('blank')).toBe(0);
  });
}
