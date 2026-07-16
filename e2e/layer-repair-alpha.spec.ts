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
  textureSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  layerPosition: { x: number; y: number };
  alphaBounds: { x: number; y: number; width: number; height: number } | null;
}

async function createBlankAsset(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('alpha trim E2E');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('trim対象');
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
      const texture = asset?.textures.find((entry) => entry.kind === 'edit');
      const layer = asset?.layers.find((entry) => entry.textureId === texture?.id);
      if (!asset || !texture || !layer) {
        throw new Error('編集用Asset / Texture / Layerが見つかりません。');
      }
      const blobRecord = await new Promise<StoredBlobRecord | undefined>((resolve, reject) => {
        const request = db
          .transaction('blobs', 'readonly')
          .objectStore('blobs')
          .get(`${asset.id}/${texture.path}`);
        request.onsuccess = () => resolve(request.result as StoredBlobRecord | undefined);
        request.onerror = () => reject(request.error);
      });
      if (!blobRecord) {
        throw new Error('編集用画像Blobが見つかりません。');
      }

      const bitmap = await createImageBitmap(
        new Blob([blobRecord.bytes], { type: blobRecord.mimeType }),
      );
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('OffscreenCanvas 2D contextが使えません。');
        }
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let minX = bitmap.width;
        let minY = bitmap.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            if (pixels[(y * bitmap.width + x) * 4 + 3] === 0) {
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
          textureSize: texture.size,
          imageSize: { width: bitmap.width, height: bitmap.height },
          layerPosition: layer.transform.position,
          alphaBounds:
            maxX < 0
              ? null
              : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        };
      } finally {
        bitmap.close();
      }
    } finally {
      db.close();
    }
  });
}

test('alpha boundsを検査してlayer画像だけtrimし、Undo・Redo・reloadできる', async ({ page }) => {
  await createBlankAsset(page);
  const center = await canvasCenter(page);

  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await page.mouse.move(center.x - 20, center.y - 16);
  await page.mouse.down();
  await page.mouse.move(center.x + 14, center.y + 10, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => (await readRepairState(page)).alphaBounds).not.toBeNull();
  const before = await readRepairState(page);
  expect(before.textureSize).toEqual({ width: 32, height: 32 });
  expect(before.imageSize).toEqual({ width: 32, height: 32 });
  expect(before.alphaBounds).not.toBeNull();
  const bounds = before.alphaBounds!;
  expect(bounds.width).toBeLessThan(32);
  expect(bounds.height).toBeLessThan(32);
  expect(bounds.x + bounds.y).toBeGreaterThan(0);

  await page.getByRole('button', { name: '透明縁を検査', exact: true }).click();
  await expect(page.getByLabel('透明縁検査結果')).toBeVisible();
  await expect(
    page.getByText('透明縁があります。選択画像だけをトリミングできます。'),
  ).toBeVisible();

  await page.getByRole('button', { name: '透明縁をトリミング', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).textureSize)
    .toEqual({ width: bounds.width, height: bounds.height });

  const trimmed = await readRepairState(page);
  expect(trimmed.imageSize).toEqual({ width: bounds.width, height: bounds.height });
  expect(trimmed.alphaBounds).toEqual({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  expect(trimmed.canvasSize).toEqual(before.canvasSize);
  expect(trimmed.origin).toEqual(before.origin);
  expect(trimmed.anchors).toEqual(before.anchors);
  expect(trimmed.colliders).toEqual(before.colliders);
  expect(trimmed.layerPosition.x).toBeCloseTo(before.layerPosition.x + bounds.x);
  expect(trimmed.layerPosition.y).toBeCloseTo(before.layerPosition.y + bounds.y);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).textureSize)
    .toEqual({ width: 32, height: 32 });
  const undone = await readRepairState(page);
  expect(undone.layerPosition).toEqual(before.layerPosition);
  expect(undone.canvasSize).toEqual(before.canvasSize);

  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect
    .poll(async () => (await readRepairState(page)).textureSize)
    .toEqual({ width: bounds.width, height: bounds.height });

  await page.reload();
  const openButton = page.getByRole('button', { name: '「alpha trim E2E」を開く', exact: true });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const reloaded = await readRepairState(page);
  expect(reloaded.textureSize).toEqual({ width: bounds.width, height: bounds.height });
  expect(reloaded.imageSize).toEqual({ width: bounds.width, height: bounds.height });
  expect(reloaded.canvasSize).toEqual(before.canvasSize);
});
