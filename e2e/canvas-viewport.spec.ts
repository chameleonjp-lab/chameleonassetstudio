import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Asset } from '../src/core/model';
import { canvasWorldPoint } from './canvasTestHelpers';

async function expectSampleInView(canvas: Locator) {
  await expect(async () => {
    const bounds = await canvas.evaluate((element) => {
      const view = JSON.parse(element.getAttribute('data-view-transform')!) as {
        scale: number;
        offsetX: number;
        offsetY: number;
      };
      const box = element.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        left: view.offsetX,
        top: view.offsetY,
        right: view.offsetX + 64 * view.scale,
        bottom: view.offsetY + 64 * view.scale,
        pictureSize: 64 * view.scale,
      };
    });
    expect(bounds.height).toBeGreaterThanOrEqual(100);
    expect(bounds.pictureSize).toBeGreaterThanOrEqual(64);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  }).toPass();
}

async function storedSample(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const getAll = <T>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    try {
      const [assets, blobs] = await Promise.all([
        getAll<{ data: Asset }>('assets'),
        getAll<{ key: string; bytes: ArrayBuffer; mimeType: string }>('blobs'),
      ]);
      const asset = assets[0].data;
      const texture = asset.textures.find((texture: { kind: string }) => texture.kind === 'edit');
      if (!texture) throw new Error('見本の編集画像が保存されていません。');
      const record = blobs.find((record) => record.key === `${asset.id}/${texture.path}`);
      if (!record) throw new Error('見本の画像データが保存されていません。');
      const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
      return {
        type: asset.assetType,
        width: canvas.width,
        height: canvas.height,
        pixels,
        bytes: Array.from(new Uint8Array(record.bytes)),
      };
    } finally {
      db.close();
    }
  });
}

async function createSample(page: Page, type = 'character') {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('表示確認');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '表示確認', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: '画面切り替え' });
  if (await nav.isVisible())
    await nav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await page.getByLabel('新規アセットの種別').selectOption(type);
  await page.getByLabel('新規アセットのサイズ').selectOption('64');
  await page.getByLabel('新規アセット名').fill(`sample-${type}`);
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  if (await nav.isVisible()) await nav.getByRole('button', { name: '編集', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

for (const [label, type] of [
  ['キャラクター', 'character'],
  ['アイテム', 'item'],
  ['タイル', 'tile'],
  ['エフェクト', 'effect'],
] as const) {
  test(`R06: ${label}の見本を端末に保存し、PNGと再開時の画像が一致する`, async ({ page }) => {
    await createSample(page, type);
    const original = await storedSample(page);
    expect(original.type).toBe(type);
    expect(original.width).toBe(64);
    expect(original.height).toBe(64);
    expect(
      original.pixels.filter((_, index) => index % 4 === 3 && original.pixels[index] > 0).length,
    ).toBeGreaterThan(32);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
    ]);
    const bytes = await readFile((await download.path())!);
    const exported = await page.evaluate(async (base64) => {
      const binary = atob(base64);
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
    }, bytes.toString('base64'));
    expect(exported).toEqual(original.pixels);
    await page.getByRole('button', { name: '← ホーム' }).click();
    await expect(page.locator('.home-thumbnail img')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '「表示確認」を開く' }).click();
    expect((await storedSample(page)).bytes).toEqual(original.bytes);
  });
}
test.describe('小画面の描画領域', () => {
  test.use({ hasTouch: true });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 667, height: 375 },
  ]) {
    test(`R06: ${viewport.width}x${viewport.height}で見本を描き直しUndo・PNG出力できる`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await createSample(page);
      const canvas = page.getByLabel('アセットキャンバス');
      await expect(canvas).toBeVisible();
      const box = (await canvas.boundingBox())!;
      await expectSampleInView(canvas);
      const zoom = (await page.locator('.canvas-zoombar').boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(zoom.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const original = await storedSample(page);
      await page
        .getByRole('navigation', { name: '編集ツール' })
        .getByRole('button', { name: 'ブラシ', exact: true })
        .click();
      await expect(canvas).toHaveAttribute('data-raster-input-ready', 'true');
      const point = await canvasWorldPoint(canvas, 32, 32);
      await page.touchscreen.tap(point.x, point.y);
      await expect.poll(async () => (await storedSample(page)).bytes).not.toEqual(original.bytes);
      await page.getByRole('button', { name: '元に戻す', exact: true }).click();
      await expect.poll(async () => (await storedSample(page)).pixels).toEqual(original.pixels);
      const nav = page.getByRole('navigation', { name: '画面切り替え' });
      const navigation = (await nav.boundingBox())!;
      expect(navigation.y).toBeGreaterThanOrEqual(0);
      expect(navigation.y + navigation.height).toBeLessThanOrEqual(viewport.height + 1);
      await nav.getByRole('button', { name: 'タイムライン', exact: true }).click();
      await expect(page.getByRole('button', { name: 'フレーム追加' })).toBeVisible();
      await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
      await page.getByRole('button', { name: 'フレーム「frame_1」を描く' }).click();
      await nav.getByRole('button', { name: '編集', exact: true }).click();
      await expect(
        page.getByRole('status', { name: 'フレームプレビューの編集制限' }),
      ).toContainText('このコマだけを描いています');
      await expectSampleInView(canvas);
      const frameNavigation = (await nav.boundingBox())!;
      expect(frameNavigation.y + frameNavigation.height).toBeLessThanOrEqual(viewport.height + 1);
      await nav.getByRole('button', { name: 'タイムライン', exact: true }).click();
      await page.getByRole('button', { name: '停止', exact: true }).click();
      await nav.getByRole('button', { name: '書き出し', exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('sample-character.png');
    });
  }

  test('R06: 開いたまま縦横を切り替えると全体表示が追従し、手動倍率と画像を保つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await createSample(page);
    const original = await storedSample(page);
    const canvas = page.getByLabel('アセットキャンバス');
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 667, height: 375 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport);
      await expectSampleInView(canvas);
    }
    await page.getByRole('button', { name: '200%', exact: true }).click();
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(async () => {
      const view = await canvas.evaluate((element) => {
        const view = JSON.parse(element.getAttribute('data-view-transform')!);
        const box = element.getBoundingClientRect();
        return {
          scale: view.scale,
          centerX: (box.width / 2 - view.offsetX) / view.scale,
          centerY: (box.height / 2 - view.offsetY) / view.scale,
        };
      });
      expect(view.scale).toBe(2);
      expect(view.centerX).toBeCloseTo(32);
      expect(view.centerY).toBeCloseTo(32);
    }).toPass();
    await page.getByRole('button', { name: '全体表示', exact: true }).click();
    await page.setViewportSize({ width: 320, height: 568 });
    await expectSampleInView(canvas);
    expect((await storedSample(page)).bytes).toEqual(original.bytes);
  });

  for (const font of [
    { name: '文字を拡大した', style: 'html { font-size: 24px; }' },
    { name: '代替字体を使う', style: '* { font-family: serif !important; }' },
  ]) {
    test(`R06: ${font.name}320pxタイムラインでもコマの描画操作へ到達できる`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await createSample(page);
      const nav = page.getByRole('navigation', { name: '画面切り替え' });
      await nav.getByRole('button', { name: 'タイムライン', exact: true }).click();
      await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
      await page.addStyleTag({ content: font.style });
      const draw = page.getByRole('button', { name: 'フレーム「frame_1」を描く' });
      await draw.scrollIntoViewIfNeeded();
      await expect(async () => {
        const bounds = await draw.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const list = element.closest('.timeline-frame-list')!.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            hit: hit === element || element.contains(hit),
            left: box.left,
            right: box.right,
            listLeft: list.left,
            listRight: list.right,
          };
        });
        expect(bounds.hit).toBe(true);
        expect(bounds.left).toBeGreaterThanOrEqual(bounds.listLeft - 1);
        expect(bounds.right).toBeLessThanOrEqual(bounds.listRight + 1);
      }).toPass();
      await draw.click();
      await nav.getByRole('button', { name: '編集', exact: true }).click();
      await expect(
        page.getByRole('status', { name: 'フレームプレビューの編集制限' }),
      ).toContainText('このコマだけを描いています');
    });
  }
});
