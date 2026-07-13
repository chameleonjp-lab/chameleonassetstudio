import { expect, test, type Page } from '@playwright/test';

interface StoredAssetRecord {
  id: string;
  name: string;
  displayName: string;
  assetType: string;
  canvasSize: { width: number; height: number };
  colliders: Array<{ shape: string; purpose: string }>;
}

/** IndexedDB の assets ストアから全アセットを読む（実体は core/storage の StoredAssetRecord.data）。 */
async function readAllAssets(page: Page): Promise<StoredAssetRecord[]> {
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

/** IndexedDB の blobs ストアのキー一覧を読む。 */
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

async function readProjectAssetIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ assets: Array<{ id: string }> }>>(
      (resolve, reject) => {
        const request = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return records[0]?.assets.map((asset) => asset.id) ?? [];
  });
}

test('画像を取り込まずに新規アセットを作成すると、型と starter 当たり判定が反映され、再読込しても残る', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('新規作成テスト');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '新規作成テスト' })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });

  // 画像を取り込まずに、型とサイズだけで空キャンバスの character アセットを作る
  await properties.getByLabel('新規アセット名').fill('主人公');
  await properties.getByLabel('新規アセットの種別').selectOption('character');
  await properties.getByLabel('新規アセットのサイズ').selectOption('64');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  // キャンバスに表示され、アセット一覧にも並ぶ
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(properties.getByRole('button', { name: '主人公' })).toBeVisible();

  // IndexedDB 上で assetType='character' と body の矩形当たり判定 1 件を確認する
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(1);
  const created = (await readAllAssets(page)).find((asset) => asset.name === '主人公');
  expect(created).toBeDefined();
  expect(created!.assetType).toBe('character');
  expect(created!.canvasSize).toEqual({ width: 64, height: 64 });
  expect(created!.colliders).toHaveLength(1);
  expect(created!.colliders[0].shape).toBe('rect');
  expect(created!.colliders[0].purpose).toBe('body');

  // reload しても残り、開ける
  await page.reload();
  await page.getByRole('button', { name: '「新規作成テスト」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByRole('button', { name: '主人公' }),
  ).toBeVisible();
});

test('item を新規作成すると当たり判定は付かない（character だけの starter テンプレート）', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('アイテム新規作成');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'アイテム新規作成' })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('回復アイテム');
  await properties.getByLabel('新規アセットの種別').selectOption('item');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(1);
  const [created] = await readAllAssets(page);
  expect(created.assetType).toBe('item');
  expect(created.colliders).toHaveLength(0);
});

test('アセットを削除すると一覧と IndexedDB から消え、空状態が表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('アセット削除テスト');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'アセット削除テスト' })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('捨てアセット');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  await expect.poll(async () => (await readAllAssets(page)).length).toBe(1);
  const [before] = await readAllAssets(page);
  expect(before).toBeDefined();
  const beforeBlobKeys = await readBlobKeys(page);
  expect(beforeBlobKeys.some((key) => key.startsWith(`${before.id}/`))).toBe(true);

  // 削除は確認ダイアログで防護される
  page.on('dialog', (dialog) => void dialog.accept());
  await properties.getByRole('button', { name: 'アセットを削除', exact: true }).click();

  // 一覧・IndexedDB の asset レコード・Blob が消える
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(0);
  const afterBlobKeys = await readBlobKeys(page);
  expect(afterBlobKeys.some((key) => key.startsWith(`${before.id}/`))).toBe(false);
  expect(await readProjectAssetIds(page)).not.toContain(before.id);

  // 空状態表示に切り替わる
  await expect(
    properties.getByText(
      'アセットがありません。画像を取り込むか、新規アセットを作成してください。',
    ),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '「アセット削除テスト」を開く' }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'プロパティ' })
      .getByText('アセットがありません。画像を取り込むか、新規アセットを作成してください。'),
  ).toBeVisible();
  expect(await readAllAssets(page)).toHaveLength(0);
  expect(await readProjectAssetIds(page)).not.toContain(before.id);
});

test('判定の数値を編集した直後にアセットを削除しても、デバウンス保存で復活しない（autosave.flush 競合の回帰、Opus 4.8 レビュー対応）', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('削除競合テスト');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '削除競合テスト' })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('競合アセット');
  await properties.getByLabel('新規アセットの種別').selectOption('character');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  // starter の body 矩形当たり判定の X 座標を編集する。
  // onChange は onLiveChange（= applyAssetSnapshot）経由で 800ms デバウンスの自動保存を予約する。
  const colliderList = page.getByRole('list', { name: '当たり判定一覧' });
  const rectRow = colliderList.getByRole('listitem').first();
  const xInput = rectRow.getByLabel('X', { exact: true });
  await xInput.fill('5');

  // デバウンス（800ms）が終わる前に、確認ダイアログを承認してすぐ削除する。
  page.on('dialog', (dialog) => void dialog.accept());
  await properties.getByRole('button', { name: 'アセットを削除', exact: true }).click();

  // 削除処理は autosave.flush() を待ってから deleteAsset() するため、
  // 削除確定後は IndexedDB から確実に消えている。
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(0);

  // デバウンス時間（800ms）を十分に超えて待っても、
  // 遅延した自動保存によってアセットが復活しないことを確認する。
  await page.waitForTimeout(1200);
  expect(await readAllAssets(page)).toHaveLength(0);

  // reload 後も復活しておらず、空状態のままである。
  await page.reload();
  await page.getByRole('button', { name: '「削除競合テスト」を開く' }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'プロパティ' })
      .getByText('アセットがありません。画像を取り込むか、新規アセットを作成してください。'),
  ).toBeVisible();
  expect(await readAllAssets(page)).toHaveLength(0);
});
