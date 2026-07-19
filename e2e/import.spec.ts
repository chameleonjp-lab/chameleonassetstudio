import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

/** ページ内の Canvas で PNG を生成して Buffer にする（左半分だけ不透明の赤、右半分は透明）。 */
async function makePngBuffer(page: Page, width = 64, height = 64): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'rgba(255, 0, 0, 1)';
      context.fillRect(0, 0, w / 2, h);
      return canvas.toDataURL('image/png');
    },
    [width, height] as const,
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function makeImageBuffer(page: Page, mimeType: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3a7d44';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL(type);
  }, mimeType);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function readFirstStoredAsset(page: Page): Promise<{
  textures: Array<{ id: string; kind: string }>;
  provenance?: Array<Record<string, unknown>>;
}> {
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
    return records[0]?.data as never;
  });
}

test('PNG を取り込むとキャンバスに表示され、透明部分が保持される', async ({ page }) => {
  await createProject(page, '画像取り込み');
  const buffer = await makePngBuffer(page);

  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);

  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByRole('button', { name: 'hero' }),
  ).toBeVisible();

  // 保存された編集用画像（PNG 正規化後）の右上ピクセルのアルファが 0 のまま維持されている
  const alpha = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ key: string; mimeType: string; bytes: ArrayBuffer }>>(
      (resolve, reject) => {
        const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const record = records.find((row) => row.key.endsWith('textures/main.png'));
    if (!record) {
      return -1;
    }
    const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(bitmap.width - 4, 4, 1, 1).data[3];
  });
  expect(alpha).toBe(0);
});

test('再読み込み後も取り込んだ画像が残る', async ({ page }) => {
  await createProject(page, '画像永続化');
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'keeper.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '「画像永続化」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByRole('button', { name: 'keeper' }),
  ).toBeVisible();
});

test('JPG と WebP も取り込める', async ({ page }) => {
  await createProject(page, '形式テスト');

  const jpegBuffer = await makeImageBuffer(page, 'image/jpeg');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpegBuffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  const webpBuffer = await makeImageBuffer(page, 'image/webp');
  await page
    .getByLabel('画像を追加')
    .setInputFiles({ name: 'sticker.webp', mimeType: 'image/webp', buffer: webpBuffer });
  await confirmImageImport(page);

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await expect(properties.getByRole('button', { name: 'photo' })).toBeVisible();
  await expect(properties.getByRole('button', { name: 'sticker' })).toBeVisible();
});

test('対応していないファイルは理由を表示する', async ({ page }) => {
  await createProject(page, '制限テスト');

  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('これは画像ではありません'),
  });

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('対応していないファイル形式');
});

test('画像batchは16件上限で、途中に不正画像があればAssetを1件も保存しない', async ({ page }) => {
  await createProject(page, 'Asset batch原子性');
  const png = await makePngBuffer(page);

  await page.getByLabel('画像を選ぶ').setInputFiles(
    Array.from({ length: 17 }, (_, index) => ({
      name: `limit-${index}.png`,
      mimeType: 'image/png',
      buffer: png,
    })),
  );
  await expect(page.getByRole('alert')).toContainText('一度に選べる画像は16件まで');

  await page.getByLabel('画像を選ぶ').setInputFiles([
    { name: 'valid.png', mimeType: 'image/png', buffer: png },
    { name: 'spoofed.jpg', mimeType: 'image/jpeg', buffer: png },
  ]);
  await expect(page.getByRole('alert')).toContainText('選択した画像は1件も追加されていません');
  await expect(page.getByLabel('アセットキャンバス')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('chameleon-asset-studio');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const count = await new Promise<number>((resolve, reject) => {
          const request = db.transaction('assets', 'readonly').objectStore('assets').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return count;
      }),
    )
    .toBe(0);
});

test('通常画像batchはpreview取消で無変更、確定後は1回のUndo / Redoで全件を往復する', async ({
  page,
}) => {
  await createProject(page, '通常画像preview');
  const first = await makePngBuffer(page, 16, 16);
  const second = await makePngBuffer(page, 24, 12);
  const input = page.getByLabel('画像を選ぶ');
  await input.setInputFiles([
    { name: 'normal-a.png', mimeType: 'image/png', buffer: first },
    { name: 'normal-b.png', mimeType: 'image/png', buffer: second },
  ]);

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('Asset 2件 / layer 2件 / frame 0件 / animation 0件');
  await dialog.getByRole('button', { name: '取り込みを取消' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toHaveCount(0);

  await input.setInputFiles([
    { name: 'normal-a.png', mimeType: 'image/png', buffer: first },
    { name: 'normal-b.png', mimeType: 'image/png', buffer: second },
  ]);
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toHaveCount(0);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await expect(properties.getByRole('button', { name: 'normal-a' })).toBeVisible();
  await expect(properties.getByRole('button', { name: 'normal-b' })).toBeVisible();
});

test.describe('iPhone SE級touchのprovenance保存', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('元file情報とSHA-256を保存し、reload後も保持する', async ({ page }) => {
    await createProject(page, 'mobile provenance');
    const buffer = await makePngBuffer(page, 320, 160);
    await page
      .getByLabel('画像を選ぶ')
      .setInputFiles({ name: 'mobile-source.png', mimeType: 'image/png', buffer });
    await confirmImageImport(page);
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

    const expectedHash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
    const beforeReload = await readFirstStoredAsset(page);
    const record = beforeReload.provenance?.[0];
    expect(record).toMatchObject({
      sourceFileName: 'mobile-source.png',
      mimeType: 'image/png',
      byteLength: buffer.byteLength,
      hash: expectedHash,
    });
    expect(beforeReload.textures.find((texture) => texture.id === record?.textureId)?.kind).toBe(
      'source',
    );

    await page.reload();
    await page.getByRole('button', { name: '「mobile provenance」を開く' }).click();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
    expect((await readFirstStoredAsset(page)).provenance).toEqual(beforeReload.provenance);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
