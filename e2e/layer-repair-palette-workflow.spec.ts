import { stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

interface StoredAssetRecord {
  data: {
    id: string;
    textures: Array<{ id: string; kind: string; path: string }>;
    layers: Array<{
      textureId?: string;
      transform: { scale: { x: number; y: number } };
    }>;
  };
}

interface StoredBlobRecord {
  mimeType: string;
  bytes: ArrayBuffer;
}

interface StoredSnapshotRecord {
  assetId: string;
  label: string;
}

interface RepairState {
  assetJson: string;
  editChecksum: number;
  sourceChecksum: number;
  redCount: number;
  greenCount: number;
  blueCount: number;
  blackCount: number;
  opaqueCount: number;
  scaleX: number;
  snapshotLabels: string[];
}

function checksum(bytes: ArrayBuffer): number {
  let hash = 2166136261;
  for (const value of new Uint8Array(bytes)) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function createBlankAsset(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('palette repair E2E');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('palette対象');
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

async function drawRectangle(
  page: Page,
  color: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  await page.getByLabel('描画色').fill(color);
  await page.getByRole('button', { name: '矩形', exact: true }).click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

async function readRepairState(page: Page): Promise<RepairState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const assets = await new Promise<StoredAssetRecord[]>((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        request.onsuccess = () => resolve(request.result as StoredAssetRecord[]);
        request.onerror = () => reject(request.error);
      });
      const asset = assets[0]?.data;
      const editTexture = asset?.textures.find((texture) => texture.kind === 'edit');
      const sourceTexture = asset?.textures.find((texture) => texture.kind === 'source');
      const layer = asset?.layers.find((entry) => entry.textureId === editTexture?.id);
      if (!asset || !editTexture || !sourceTexture || !layer) {
        throw new Error('Asset / edit / source / Layerが見つかりません。');
      }

      const readBlob = async (path: string): Promise<StoredBlobRecord> => {
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
        return record;
      };

      const [editBlob, sourceBlob, snapshots] = await Promise.all([
        readBlob(editTexture.path),
        readBlob(sourceTexture.path),
        new Promise<StoredSnapshotRecord[]>((resolve, reject) => {
          const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
          request.onsuccess = () => resolve(request.result as StoredSnapshotRecord[]);
          request.onerror = () => reject(request.error);
        }),
      ]);

      const bitmap = await createImageBitmap(
        new Blob([editBlob.bytes], { type: editBlob.mimeType }),
      );
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('OffscreenCanvas 2D contextが使えません。');
        }
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let redCount = 0;
        let greenCount = 0;
        let blueCount = 0;
        let blackCount = 0;
        let opaqueCount = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const alpha = pixels[offset + 3];
          if (alpha === 0) {
            continue;
          }
          opaqueCount += 1;
          if (red === 255 && green === 0 && blue === 0) redCount += 1;
          if (red === 0 && green === 255 && blue === 0) greenCount += 1;
          if (red === 0 && green === 0 && blue === 255) blueCount += 1;
          if (red === 0 && green === 0 && blue === 0) blackCount += 1;
        }
        return {
          assetJson: JSON.stringify(asset),
          editChecksum: checksum(editBlob.bytes),
          sourceChecksum: checksum(sourceBlob.bytes),
          redCount,
          greenCount,
          blueCount,
          blackCount,
          opaqueCount,
          scaleX: layer.transform.scale.x,
          snapshotLabels: snapshots
            .filter((snapshot) => snapshot.assetId === asset.id)
            .map((snapshot) => snapshot.label)
            .sort(),
        };
      } finally {
        bitmap.close();
      }
    } finally {
      db.close();
    }
  });
}

test('palette分析を保存せず、色置換・輪郭・反転をUndo・Redo・reload・casproj退避できる', async ({
  page,
}) => {
  await createBlankAsset(page);
  const center = await canvasCenter(page);

  await drawRectangle(
    page,
    '#ff0000',
    { x: center.x - 28, y: center.y - 18 },
    { x: center.x - 8, y: center.y + 18 },
  );
  await expect.poll(async () => (await readRepairState(page)).redCount).toBeGreaterThan(0);

  await drawRectangle(
    page,
    '#00ff00',
    { x: center.x + 8, y: center.y - 18 },
    { x: center.x + 28, y: center.y + 18 },
  );
  await expect.poll(async () => (await readRepairState(page)).greenCount).toBeGreaterThan(0);

  const beforeAnalysis = await readRepairState(page);
  expect(beforeAnalysis.blueCount).toBe(0);
  expect(beforeAnalysis.blackCount).toBe(0);
  expect(beforeAnalysis.opaqueCount).toBeLessThan(32 * 32);

  await page.getByLabel('パレット抽出色数').fill('8');
  await page.getByLabel('パレットalphaしきい値').fill('0');
  await page.getByRole('button', { name: 'パレットを抽出', exact: true }).click();
  await expect(page.getByLabel('抽出パレット')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '抽出色 #ff0000 を置換元に設定', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '抽出色 #00ff00 を置換元に設定', exact: true }),
  ).toBeVisible();

  const afterAnalysis = await readRepairState(page);
  expect(afterAnalysis.assetJson).toBe(beforeAnalysis.assetJson);
  expect(afterAnalysis.editChecksum).toBe(beforeAnalysis.editChecksum);
  expect(afterAnalysis.sourceChecksum).toBe(beforeAnalysis.sourceChecksum);
  expect(afterAnalysis.snapshotLabels).toEqual(beforeAnalysis.snapshotLabels);
  expect(afterAnalysis.scaleX).toBe(beforeAnalysis.scaleX);

  await page
    .getByRole('button', { name: '抽出色 #ff0000 を置換元に設定', exact: true })
    .click();
  await expect(page.getByLabel('色置換の対象色')).toHaveValue('#ff0000');
  await page.getByLabel('色置換の置換色').fill('#0000ff');
  await page.getByLabel('色置換の許容量').fill('0');
  await page.getByRole('button', { name: 'パレット置換を適用', exact: true }).click();

  await expect.poll(async () => (await readRepairState(page)).redCount).toBe(0);
  await expect.poll(async () => (await readRepairState(page)).blueCount).toBeGreaterThan(0);
  const replaced = await readRepairState(page);
  expect(replaced.greenCount).toBeGreaterThan(0);
  expect(replaced.sourceChecksum).toBe(beforeAnalysis.sourceChecksum);
  expect(replaced.snapshotLabels).toContain('パレット置換');
  await expect(page.getByLabel('抽出パレット')).toHaveCount(0);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).redCount).toBeGreaterThan(0);
  expect((await readRepairState(page)).blueCount).toBe(0);

  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).blueCount).toBeGreaterThan(0);

  await page.getByLabel('輪郭線の色').fill('#000000');
  await page.getByLabel('輪郭線の太さ').fill('1');
  const beforeOutline = await readRepairState(page);
  await page.getByRole('button', { name: '輪郭線を追加', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).blackCount).toBeGreaterThan(0);
  const outlined = await readRepairState(page);
  expect(outlined.opaqueCount).toBeGreaterThan(beforeOutline.opaqueCount);
  expect(outlined.sourceChecksum).toBe(beforeAnalysis.sourceChecksum);
  expect(outlined.snapshotLabels).toContain('輪郭線の追加');

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).blackCount).toBe(0);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).blackCount).toBeGreaterThan(0);

  const beforeFlip = await readRepairState(page);
  await page.getByRole('button', { name: '左右反転', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).scaleX).toBeLessThan(0);
  const flipped = await readRepairState(page);
  expect(flipped.editChecksum).toBe(beforeFlip.editChecksum);
  expect(flipped.sourceChecksum).toBe(beforeAnalysis.sourceChecksum);

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).scaleX).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(async () => (await readRepairState(page)).scaleX).toBeLessThan(0);
  await expect(page.getByRole('status')).toContainText('保存済み');

  await page.reload();
  const openButton = page.getByRole('button', {
    name: '「palette repair E2E」を開く',
    exact: true,
  });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  const reloaded = await readRepairState(page);
  expect(reloaded.redCount).toBe(0);
  expect(reloaded.blueCount).toBeGreaterThan(0);
  expect(reloaded.greenCount).toBeGreaterThan(0);
  expect(reloaded.blackCount).toBeGreaterThan(0);
  expect(reloaded.scaleX).toBeLessThan(0);
  expect(reloaded.sourceChecksum).toBe(beforeAnalysis.sourceChecksum);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('palette repair E2E.casproj');
  expect(await download.failure()).toBeNull();
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  if (downloadPath) {
    expect((await stat(downloadPath)).size).toBeGreaterThan(0);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});
