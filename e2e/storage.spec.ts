import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredEditState {
  assetId: string;
  blobKey: string;
  textureWidth: number;
  textureHeight: number;
  decodedWidth: number;
  decodedHeight: number;
  bytes: number[];
}

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
  await page.goto('/2d/');
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

async function readStoredEditState(page: Page, assetId?: string): Promise<StoredEditState> {
  return page.evaluate(async (selectedAssetId) => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const assetTx = db.transaction(['assets'], 'readonly');
      const assetRecords = (await requestResult(assetTx.objectStore('assets').getAll())) as Array<{
        id: string;
        data: {
          id: string;
          textures: Array<{
            kind: string;
            path: string;
            size: { width: number; height: number };
          }>;
        };
      }>;
      const asset = (
        selectedAssetId
          ? assetRecords.find((record) => record.id === selectedAssetId)
          : assetRecords[0]
      )?.data;
      const texture = asset?.textures.find((entry) => entry.kind === 'edit');
      if (!asset || !texture) {
        throw new Error('保存済み edit TextureRef が見つかりません');
      }
      const blobKey = `${asset.id}/${texture.path}`;
      const blobTx = db.transaction(['blobs'], 'readonly');
      const blobRecord = (await requestResult(blobTx.objectStore('blobs').get(blobKey))) as
        { mimeType: string; bytes: ArrayBuffer } | undefined;
      if (!blobRecord) {
        throw new Error('保存済み edit Blob が見つかりません');
      }
      const bitmap = await createImageBitmap(
        new Blob([blobRecord.bytes], { type: blobRecord.mimeType }),
      );
      const result = {
        assetId: asset.id,
        blobKey,
        textureWidth: texture.size.width,
        textureHeight: texture.size.height,
        decodedWidth: bitmap.width,
        decodedHeight: bitmap.height,
        bytes: Array.from(new Uint8Array(blobRecord.bytes)),
      };
      bitmap.close();
      return result;
    } finally {
      db.close();
    }
  }, assetId);
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
    const restoreButton = page.getByRole('button', {
      name: 'ごみ箱の「trash-rt」を復元',
    });
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

    const purgeButton = page.getByRole('button', {
      name: 'ごみ箱の「trash-purge」を完全に削除',
    });
    await expect(purgeButton).toBeVisible();
    await purgeButton.click();
    await expect(purgeButton).toHaveCount(0);
    await expect(page.getByRole('button', { name: '「trash-purge」を開く' })).toHaveCount(0);
  });
});

test.describe('復旧点（2D-1B-RECOVERY）', () => {
  test('画像編集→復旧点復元→Undo→reloadでAsset JSONとBlobが一致する', async ({ page }) => {
    await setupProjectWithImage(page, 'snapshot-undo-reload');

    const layerList = page.getByRole('list', { name: 'レイヤー一覧' });
    await layerList.getByRole('button', { name: 'main', exact: true }).click();
    const original = await readStoredEditState(page);

    await page.getByLabel('色相（-180〜180）').fill('120');
    await page.getByRole('button', { name: '色調整を適用' }).click();
    await expect(page.getByRole('heading', { name: '復旧点' })).toBeVisible();

    await expect
      .poll(async () => (await readStoredEditState(page)).bytes)
      .not.toEqual(original.bytes);
    const edited = await readStoredEditState(page);

    await page
      .getByRole('button', { name: /復旧点「.*」から復元/ })
      .first()
      .click();
    await expect.poll(async () => (await readStoredEditState(page)).bytes).toEqual(original.bytes);

    await page.getByRole('button', { name: '元に戻す' }).click();
    await expect.poll(async () => (await readStoredEditState(page)).bytes).toEqual(edited.bytes);

    await page.reload();
    await expect(
      page.getByRole('button', { name: '「snapshot-undo-reload」を開く' }),
    ).toBeVisible();
    const reloaded = await readStoredEditState(page);
    expect(reloaded.bytes).toEqual(edited.bytes);
    expect(reloaded.textureWidth).toBe(reloaded.decodedWidth);
    expect(reloaded.textureHeight).toBe(reloaded.decodedHeight);

    await page.getByRole('button', { name: '「snapshot-undo-reload」を開く' }).click();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  });
});

test.describe('壊れた import の隔離（2D-1B-STORAGE §E）', () => {
  test('壊れた ZIP は理由付きで失敗し、隔離一覧から削除できる', async ({ page }) => {
    await page.goto('/2d/');
    await page.getByLabel('.casproj を読み込む').setInputFiles({
      name: 'broken.casproj',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]),
    });

    await expect(page.getByRole('alert')).toContainText('.casproj を読み込めませんでした');
    const quarantineSection = page.getByRole('region', {
      name: '読み込みに失敗したファイル',
    });
    await expect(quarantineSection).toBeVisible();
    await expect(quarantineSection.getByText('broken.casproj')).toBeVisible();

    await quarantineSection.getByRole('button', { name: '「broken.casproj」を削除' }).click();
    await expect(quarantineSection).toHaveCount(0);
  });
});

test('R02: 作成・複製・削除と名前変更を取り消し、全画像を再読込後も保持する', async ({ page }) => {
  await setupProjectWithImage(page, 'R02 history');
  page.on('dialog', (dialog) => void dialog.accept());
  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('プロジェクト名', { exact: true }).fill('R02 renamed');
  await properties.getByLabel('プロジェクト名', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'R02 renamed' })).toBeVisible();
  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole('heading', { name: 'R02 history' })).toBeVisible();
  await redo.click();
  await expect(page.getByRole('heading', { name: 'R02 renamed' })).toBeVisible();
  await expect(
    properties.getByRole('button', { name: '独立コピーを作成', exact: true }),
  ).toBeEnabled();
  const original = await readStoredEditState(page);
  await properties.getByRole('button', { name: '独立コピーを作成', exact: true }).click();
  await expect(properties.locator('.asset-list button')).toHaveCount(2);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(properties.locator('.asset-list button')).toHaveCount(1);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(properties.locator('.asset-list button')).toHaveCount(2);
  await properties.getByRole('button', { name: 'アセットを削除', exact: true }).click();
  await expect(properties.locator('.asset-list button')).toHaveCount(1);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(properties.locator('.asset-list button')).toHaveCount(2);
  expect((await readStoredEditState(page, original.assetId)).bytes).toEqual(original.bytes);
  await properties.getByLabel('新規アセット名').fill('blank history');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(properties.locator('.asset-list button')).toHaveCount(3);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(properties.locator('.asset-list button')).toHaveCount(2);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(properties.locator('.asset-list button')).toHaveCount(3);
  await page.reload();
  await page.getByRole('button', { name: '「R02 renamed」を開く' }).click();
  await expect(properties.locator('.asset-list button')).toHaveCount(3);
  expect((await readStoredEditState(page, original.assetId)).bytes).toEqual(original.bytes);
});
