import { expect, test, type Page } from '@playwright/test';

interface StoredAssetRecord {
  data: {
    id: string;
    canvasSize: { width: number; height: number };
    origin: { x: number; y: number };
    anchors: unknown[];
    colliders: unknown[];
    textures: Array<{
      id: string;
      kind: string;
      path: string;
      size: { width: number; height: number };
    }>;
    layers: Array<{
      textureId?: string;
      transform: { position: { x: number; y: number } };
    }>;
  };
}

interface StoredBlobRecord {
  mimeType: string;
  bytes: ArrayBuffer;
}

interface RepairState {
  canvasSize: { width: number; height: number };
  origin: { x: number; y: number };
  anchors: unknown[];
  colliders: unknown[];
  editTextureSize: { width: number; height: number };
  editImageSize: { width: number; height: number };
  sourceImageSize: { width: number; height: number };
  layerPosition: { x: number; y: number };
  alphaBounds: { x: number; y: number; width: number; height: number } | null;
}

async function createBlankAsset(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('padding resize E2E');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('repair対象');
  await properties.getByLabel('新規アセットのサイズ').selectOption('32');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByLabel('アセットキャンバス').boundingBox();
  if (!box) {
    throw new Error('Canvasの座標を取得できません。');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function readRepairState(page: Page): Promise<RepairState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<StoredAssetRecord[]>((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        request.onsuccess = () => resolve(request.result as StoredAssetRecord[]);
        request.onerror = () => reject(request.error);
      });
      const asset = records[0]?.data;
      const editTexture = asset?.textures.find((entry) => entry.kind === 'edit');
      const sourceTexture = asset?.textures.find((entry) => entry.kind === 'source');
      const layer = asset?.layers.find((entry) => entry.textureId === editTexture?.id);
      if (!asset || !editTexture || !sourceTexture || !layer) {
        throw new Error('Asset / Texture / Layerが見つかりません。');
      }

      const readBitmap = async (path: string) => {
        const record = await new Promise<StoredBlobRecord | undefined>((resolve, reject) => {
          const request = db
            .transaction('blobs', 'readonly')
            .objectStore('blobs')
            .get(`${asset.id}/${path}`);
          request.onsuccess = () => resolve(request.result as StoredBlobRecord | undefined);
          request.onerror = () => reject(request.error);
        });
        if (!record) {
          throw new Error(`画像Blobが見つかりません: ${path}`);
        }
        return createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      };

      const editBitmap = await readBitmap(editTexture.path);
      const sourceBitmap = await readBitmap(sourceTexture.path);
      try {
        const canvas = new OffscreenCanvas(editBitmap.width, editBitmap.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('OffscreenCanvas 2D contextが使えません。');
        }
        context.drawImage(editBitmap, 0, 0);
        const pixels = context.getImageData(0, 0, editBitmap.width, editBitmap.height).data;
        let minX = editBitmap.width;
        let minY = editBitmap.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < editBitmap.height; y += 1) {
          for (let x = 0; x < editBitmap.width; x += 1) {
            if (pixels[(y * editBitmap.width + x) * 4 + 3] === 0) {
              continue;
            }
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        return {
          canvasSize: asset.canvasSize,
          origin: asset.origin,
          anchors: asset.anchors,
          colliders: asset.colliders,
          editTextureSize: editTexture.size,
          editImageSize: { width: editBitmap.width, height: editBitmap.height },
          sourceImageSize: { width: sourceBitmap.width, height: sourceBitmap.height },
          layerPosition: layer.transform.position,
          alphaBounds:
            maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        };
      } finally {
        editBitmap.close();
        sourceBitmap.close();
      }
    } finally {
      db.close();
    }
  });
}

test('paddingとsmooth resizeを保存し、位置補正・Undo・Redo・reloadを維持する', async ({ page }) => {
  await createBlankAsset(page);
  const center = await canvasCenter(page);

  await page.getByRole('button', { name: '塗りつぶし', exact: true }).click();
  await page.mouse.click(center.x, center.y);
  await expect.poll(async () => (await readRepairState(page)).alphaBounds).not.toBeNull();

  const before = await readRepairState(page);
  expect(before.editTextureSize).toEqual({ width: 32, height: 32 });
  expect(before.editImageSize).toEqual({ width: 32, height: 32 });
  expect(before.sourceImageSize).toEqual({ width: 32, height: 32 });
  expect(before.alphaBounds).toEqual({ x: 0, y: 0, width: 32, height: 32 });

  await page.getByLabel('padding top').fill('2');
  await page.getByLabel('padding right').fill('3');
  await page.getByLabel('padding bottom').fill('4');
  await page.getByLabel('padding left').fill('5');
  await expect(page.getByLabel('padding変更後preview')).toContainText('40 x 38px');
  await expect(
    page.getByText('変更後のLayer画像はAsset canvas外へはみ出します。canvasは自動拡張しません。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '透明paddingを追加', exact: true }).click();

  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 40, height: 38 });
  const padded = await readRepairState(page);
  expect(padded.editImageSize).toEqual({ width: 40, height: 38 });
  expect(padded.sourceImageSize).toEqual({ width: 32, height: 32 });
  expect(padded.alphaBounds).toEqual({ x: 5, y: 2, width: 32, height: 32 });
  expect(padded.layerPosition).toEqual({ x: -5, y: -2 });
  expect(padded.canvasSize).toEqual(before.canvasSize);
  expect(padded.origin).toEqual(before.origin);
  expect(padded.anchors).toEqual(before.anchors);
  expect(padded.colliders).toEqual(before.colliders);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 32, height: 32 });
  expect((await readRepairState(page)).layerPosition).toEqual(before.layerPosition);

  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 40, height: 38 });

  await page.getByLabel('リサイズ後の幅').fill('20');
  await page.getByLabel('リサイズ後の高さ').fill('19');
  await page.getByLabel('リサイズ補間方法').selectOption('smooth');
  await expect(page.getByLabel('リサイズ変更後preview')).toContainText('20 x 19px');
  await page.getByRole('button', { name: 'Layer画像をリサイズ', exact: true }).click();

  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 20, height: 19 });
  const resized = await readRepairState(page);
  expect(resized.editImageSize).toEqual({ width: 20, height: 19 });
  expect(resized.sourceImageSize).toEqual({ width: 32, height: 32 });
  expect(resized.layerPosition.x).toBeCloseTo(5);
  expect(resized.layerPosition.y).toBeCloseTo(7.5);
  expect(resized.canvasSize).toEqual(before.canvasSize);
  expect(resized.origin).toEqual(before.origin);
  expect(resized.anchors).toEqual(before.anchors);
  expect(resized.colliders).toEqual(before.colliders);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 40, height: 38 });
  expect((await readRepairState(page)).layerPosition).toEqual({ x: -5, y: -2 });

  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).editTextureSize)
    .toEqual({ width: 20, height: 19 });

  await page.reload();
  const openButton = page.getByRole('button', {
    name: '「padding resize E2E」を開く',
    exact: true,
  });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const reloaded = await readRepairState(page);
  expect(reloaded.editTextureSize).toEqual({ width: 20, height: 19 });
  expect(reloaded.editImageSize).toEqual({ width: 20, height: 19 });
  expect(reloaded.sourceImageSize).toEqual({ width: 32, height: 32 });
  expect(reloaded.canvasSize).toEqual(before.canvasSize);
});
