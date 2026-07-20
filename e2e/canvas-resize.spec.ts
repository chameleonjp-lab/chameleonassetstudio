import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { confirmImageImport } from './importTestHelpers';

interface StoredAsset {
  id: string;
  canvasSize: { width: number; height: number };
  origin: { x: number; y: number };
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
}

interface CanvasResizeState {
  canvasSize: { width: number; height: number };
  origin: { x: number; y: number };
  layerPosition: { x: number; y: number };
  editTextureSize: { width: number; height: number };
  blobSignatures: Record<string, string>;
}

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#8e44ad';
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
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function readCanvasResizeState(page: Page): Promise<CanvasResizeState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<Array<{ data: StoredAsset }>>((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        request.onsuccess = () => resolve(request.result as Array<{ data: StoredAsset }>);
        request.onerror = () => reject(request.error);
      });
      const asset = records[0]?.data;
      const editTexture = asset?.textures.find((texture) => texture.kind === 'edit');
      const layer = asset?.layers.find((candidate) => candidate.textureId === editTexture?.id);
      if (!asset || !editTexture || !layer) {
        throw new Error('Asset / edit texture / layerが見つかりません。');
      }

      const blobSignatures: Record<string, string> = {};
      for (const texture of asset.textures.filter(
        (candidate) => candidate.kind === 'source' || candidate.kind === 'edit',
      )) {
        const record = await new Promise<{ mimeType: string; bytes: ArrayBuffer } | undefined>(
          (resolve, reject) => {
            const request = db
              .transaction('blobs', 'readonly')
              .objectStore('blobs')
              .get(`${asset.id}/${texture.path}`);
            request.onsuccess = () =>
              resolve(request.result as { mimeType: string; bytes: ArrayBuffer } | undefined);
            request.onerror = () => reject(request.error);
          },
        );
        if (!record) {
          throw new Error(`画像Blobが見つかりません: ${texture.path}`);
        }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', record.bytes));
        const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
        blobSignatures[texture.kind] = `${record.mimeType}:${record.bytes.byteLength}:${hash}`;
      }

      return {
        canvasSize: asset.canvasSize,
        origin: asset.origin,
        layerPosition: layer.transform.position,
        editTextureSize: editTexture.size,
        blobSignatures,
      };
    } finally {
      db.close();
    }
  });
}

async function setCanvasSize(page: Page, width: number, height: number): Promise<void> {
  await page.getByLabel('Asset canvas幅').fill(String(width));
  await page.getByLabel('Asset canvas高さ').fill(String(height));
}

test('中央anchorの拡大を1履歴で保存し、Blobを変えずPNG / atlas寸法へ反映する', async ({ page }) => {
  await setupProjectWithImage(page, 'canvas resize 中央拡大');
  const before = await readCanvasResizeState(page);
  expect(before.canvasSize).toEqual({ width: 64, height: 64 });

  await expect(page.getByLabel('基準位置 中央')).toBeChecked();
  await setCanvasSize(page, 81, 79);
  await expect(
    page.getByRole('img', { name: /canvas変更前後preview。変更前64 x 64、変更後81 x 79/ }),
  ).toBeVisible();
  await expect(page.getByRole('status', { name: 'canvas外データ件数' })).toContainText('合計 0件');

  await page.getByRole('button', { name: 'Asset canvasサイズを適用' }).click();
  await expect
    .poll(async () => (await readCanvasResizeState(page)).canvasSize)
    .toEqual({
      width: 81,
      height: 79,
    });
  const resized = await readCanvasResizeState(page);
  expect(resized.layerPosition).toEqual({ x: 8, y: 7 });
  expect(resized.origin).toEqual({ x: 40, y: 71 });
  expect({
    x: resized.origin.x - resized.layerPosition.x,
    y: resized.origin.y - resized.layerPosition.y,
  }).toEqual({ x: 32, y: 64 });
  expect(resized.editTextureSize).toEqual(before.editTextureSize);
  expect(resized.blobSignatures).toEqual(before.blobSignatures);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => (await readCanvasResizeState(page)).canvasSize)
    .toEqual({
      width: 64,
      height: 64,
    });
  const undone = await readCanvasResizeState(page);
  expect(undone.layerPosition).toEqual({ x: 0, y: 0 });
  expect(undone.origin).toEqual({ x: 32, y: 64 });

  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect
    .poll(async () => (await readCanvasResizeState(page)).canvasSize)
    .toEqual({
      width: 81,
      height: 79,
    });

  await page.reload();
  await page.getByRole('button', { name: '「canvas resize 中央拡大」を開く' }).click();
  const reloaded = await readCanvasResizeState(page);
  expect(reloaded.canvasSize).toEqual({ width: 81, height: 79 });
  expect(reloaded.layerPosition).toEqual({ x: 8, y: 7 });
  expect(reloaded.origin).toEqual({ x: 40, y: 71 });
  expect(reloaded.blobSignatures).toEqual(before.blobSignatures);

  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
  ]);
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  const pngBytes = await readFile(pngPath!);
  expect({ width: pngBytes.readUInt32BE(16), height: pngBytes.readUInt32BE(20) }).toEqual({
    width: 81,
    height: 79,
  });

  const [zipDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const zipPath = await zipDownload.path();
  expect(zipPath).not.toBeNull();
  const entries = unzipSync(new Uint8Array(await readFile(zipPath!)));
  const atlas = JSON.parse(Buffer.from(entries['atlas/atlas.json']).toString('utf-8')) as {
    cellSize: { width: number; height: number };
  };
  expect(atlas.cellSize).toEqual({ width: 81, height: 79 });
});

test('canvas外警告のある縮小は取消可能で、確認後もtexture / Blobをcropしない', async ({ page }) => {
  await setupProjectWithImage(page, 'canvas resize 縮小警告');
  const before = await readCanvasResizeState(page);

  await setCanvasSize(page, 32, 32);
  const warning = page.getByRole('status', { name: 'canvas外データ件数' });
  await expect(warning).toContainText('レイヤー: 1件');
  await expect(warning).toContainText('原点: 1件');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('合計2件');
    expect(dialog.message()).toContain('clamp');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Asset canvasサイズを適用' }).click();
  expect((await readCanvasResizeState(page)).canvasSize).toEqual({ width: 64, height: 64 });

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Asset canvasサイズを適用' }).click();
  await expect
    .poll(async () => (await readCanvasResizeState(page)).canvasSize)
    .toEqual({
      width: 32,
      height: 32,
    });
  const resized = await readCanvasResizeState(page);
  expect(resized.layerPosition).toEqual({ x: -16, y: -16 });
  expect(resized.origin).toEqual({ x: 16, y: 48 });
  expect(resized.editTextureSize).toEqual({ width: 64, height: 64 });
  expect(resized.blobSignatures).toEqual(before.blobSignatures);
});

test('iPhone SE級touch viewportで9点anchor・preview・適用へ到達でき、横スクロールしない', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 667 },
  });
  const page = await context.newPage();

  try {
    await setupProjectWithImage(page, 'canvas resize mobile');
    await page
      .getByRole('navigation', { name: '画面切り替え' })
      .getByRole('button', { name: 'プロパティ' })
      .tap();

    await setCanvasSize(page, 72, 72);
    const bottomRight = page.getByLabel('基準位置 右下');
    const anchorBox = await bottomRight.boundingBox();
    expect(anchorBox?.width).toBeGreaterThanOrEqual(44);
    expect(anchorBox?.height).toBeGreaterThanOrEqual(44);
    await bottomRight.tap();
    await expect(bottomRight).toBeChecked();
    await expect(page.getByRole('img', { name: /canvas変更前後preview/ })).toBeVisible();

    const applyButton = page.getByRole('button', { name: 'Asset canvasサイズを適用' });
    const applyBox = await applyButton.boundingBox();
    expect(applyBox?.height).toBeGreaterThanOrEqual(44);
    await applyButton.tap();
    await expect
      .poll(async () => (await readCanvasResizeState(page)).canvasSize)
      .toEqual({
        width: 72,
        height: 72,
      });
    expect((await readCanvasResizeState(page)).layerPosition).toEqual({ x: 8, y: 8 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});
