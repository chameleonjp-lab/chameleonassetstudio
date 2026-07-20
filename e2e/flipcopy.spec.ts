import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page, color: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  }, color);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** IndexedDB の assets ストアから全アセットを読む。 */
async function readAllAssets(page: Page): Promise<
  Array<{
    id: string;
    name: string;
    displayName: string;
    layers: Array<{ transform: { scale: { x: number } } }>;
  }>
> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: unknown }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.map((record) => record.data) as never;
  });
}

test('アセットの左右反転コピーを作成すると、反転した新規アセットが追加され選択が切り替わる', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('反転コピーテスト');
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name: '反転コピーテスト' })).toBeVisible();

  const buffer = await makePngBuffer(page, '#c0392b');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  // 左右反転コピーを作成
  await page.getByRole('button', { name: '独立左右反転コピーを作成' }).click();

  // アセットが 2 つになり、反転アセットが IndexedDB に保存される
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(2);

  const assets = await readAllAssets(page);
  const original = assets.find((asset) => !asset.name.endsWith('_flipped'))!;
  const flipped = assets.find((asset) => asset.name.endsWith('_flipped'))!;
  expect(flipped).toBeDefined();
  // 元は正、コピーは負の scale.x（水平反転）
  expect(original.layers[0].transform.scale.x).toBeGreaterThan(0);
  expect(flipped.layers[0].transform.scale.x).toBeLessThan(0);

  // アセット一覧に反転コピーが並び、選択が反転コピーへ切り替わる
  await expect(page.locator('.asset-list li')).toHaveCount(2);
  await expect(page.locator('.asset-list button[aria-pressed="true"]')).toContainText('(左右反転)');
  await expect(
    page.getByRole('region', { name: 'Family / Variant' }).getByText('standalone / 独立', {
      exact: true,
    }),
  ).toBeVisible();
});
