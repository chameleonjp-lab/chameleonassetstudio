import { expect, test, type Page } from '@playwright/test';

interface StoredAsset {
  id: string;
  name: string;
  assetType: string;
  canvasSize: { width: number; height: number };
  textures: Array<{ id: string }>;
  layers: Array<{ id: string }>;
  parts: Array<{ name: string; partType: string; layerIds: string[]; parentId?: string }>;
  colliders: Array<{ purpose: string }>;
  tile?: {
    tileSize: { width: number; height: number };
    collisionType: string;
    visualType: string;
  };
}

async function readAllAssets(page: Page): Promise<StoredAsset[]> {
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

async function readBlobKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return keys as string[];
  });
}

async function openNewProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  return page.getByRole('complementary', { name: 'プロパティ' });
}

test('自由な矩形sizeと明示tile starterを保存・再読込できる', async ({ page }) => {
  const properties = await openNewProject(page, '自由サイズ作成');
  await properties.getByLabel('新規アセット名').fill('横長床');
  await properties.getByLabel('新規アセットの種別').selectOption('tile');
  await properties.getByLabel('新規アセットのサイズ').selectOption('custom');
  await properties.getByLabel('新規アセットの幅').fill('320');
  await properties.getByLabel('新規アセットの高さ').fill('180');
  await properties.getByLabel('新規アセットのテンプレート').selectOption('tile-floor');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  await expect.poll(async () => (await readAllAssets(page)).length).toBe(1);
  const [created] = await readAllAssets(page);
  expect(created.canvasSize).toEqual({ width: 320, height: 180 });
  expect(created.tile).toEqual({
    tileSize: { width: 32, height: 32 },
    collisionType: 'solid',
    visualType: 'floor',
  });
  expect(created).not.toHaveProperty('templateId');

  await page.reload();
  await page.getByRole('button', { name: '「自由サイズ作成」を開く' }).click();
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByText('タイル · 320 x 180'),
  ).toBeVisible();
});

test('character starterはbody Partを明示した場合だけ作る', async ({ page }) => {
  const properties = await openNewProject(page, '初期Part作成');
  await properties.getByLabel('新規アセット名').fill('主人公');
  await expect(properties.getByLabel('新規アセットのテンプレート')).toHaveValue(
    'character-basic',
  );
  await properties.getByLabel('character body Partを作成').check();
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  await expect.poll(async () => (await readAllAssets(page)).length).toBe(1);
  const [created] = await readAllAssets(page);
  expect(created.colliders.map((collider) => collider.purpose)).toContain('body');
  expect(created.parts).toHaveLength(1);
  expect(created.parts[0]).toMatchObject({
    name: 'body',
    partType: 'body',
    layerIds: [created.layers[0].id],
  });
  expect(created.parts[0].parentId).toBeUndefined();
});

test('上限外sizeは生成前に拒否され、AssetとBlobを追加しない', async ({ page }) => {
  const properties = await openNewProject(page, 'size拒否');
  await properties.getByLabel('新規アセットのサイズ').selectOption('custom');
  await properties.getByLabel('新規アセットの幅').fill('4097');
  await properties.getByLabel('新規アセットの高さ').fill('64');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('4096以下');
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(0);
  expect(await readBlobKeys(page)).toEqual([]);
  await expect(page.getByLabel('アセットキャンバス')).toHaveCount(0);
});
