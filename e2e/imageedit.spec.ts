import { expect, test, type Locator, type Page } from '@playwright/test';

/** 単色 PNG を生成する。transparentRightHalf 指定時は右半分を透明にする。 */
async function makePngBuffer(
  page: Page,
  fill: string,
  options?: { transparentRightHalf?: boolean },
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([color, halfTransparent]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color as string;
      context.fillRect(0, 0, halfTransparent ? 32 : 64, 64);
      return canvas.toDataURL('image/png');
    },
    [fill, options?.transparentRightHalf ?? false] as const,
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProject(page: Page, name: string, png: Buffer): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'sprite.png', mimeType: 'image/png', buffer: png });
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
  return canvas;
}

/** IndexedDB に保存された編集用画像（textures/main.png）のピクセルを読む。 */
async function readMainPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([px, py]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const records = await new Promise<
        Array<{ key: string; mimeType: string; bytes: ArrayBuffer }>
      >((resolve, reject) => {
        const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const record = records.find((row) => row.key.endsWith('textures/main.png'));
      if (!record) {
        return [-1, -1, -1, -1];
      }
      const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(px, py, 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    },
    [x, y] as const,
  );
}

/** 保存された編集用画像のサイズを読む。 */
async function readMainSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(async () => {
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
    db.close();
    const record = records.find((row) => row.key.endsWith('textures/main.png'));
    if (!record) {
      return { width: -1, height: -1 };
    }
    const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
    return { width: bitmap.width, height: bitmap.height };
  });
}

async function readMainTextureSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<
      Array<{
        data: { textures: Array<{ path: string; size: { width: number; height: number } }> };
      }>
    >((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records[0].data.textures.find((texture) => texture.path === 'textures/main.png')!.size;
  });
}

async function canvasCenter(canvas: Locator): Promise<{ x: number; y: number }> {
  const box = (await canvas.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('背景透過をクリックで適用でき、Undo で戻せる', async ({ page }) => {
  const png = await makePngBuffer(page, '#ff0000');
  const canvas = await setupProject(page, '背景透過テスト', png);

  await page.getByRole('button', { name: '背景透過' }).click();
  const center = await canvasCenter(canvas);
  await page.mouse.click(center.x, center.y);

  // 単色画像なので全体が透明になる
  await expect.poll(async () => (await readMainPixel(page, 16, 16))[3]).toBe(0);
  await expect.poll(async () => (await readMainPixel(page, 60, 60))[3]).toBe(0);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readMainPixel(page, 16, 16))[3]).toBe(255);
});

test('トリミングをドラッグで適用できる', async ({ page }) => {
  const png = await makePngBuffer(page, '#00aa00');
  const canvas = await setupProject(page, 'トリミングテスト', png);

  // 100% 表示にして画像の画面上サイズを 64px に固定する
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: 'トリミング' }).click();

  const center = await canvasCenter(canvas);
  // 画像は中央に 64x64 で表示されている。左上 1/4 をドラッグで囲む
  await page.mouse.move(center.x - 32, center.y - 32);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => (await readMainSize(page)).width, { timeout: 10_000 })
    .toBeLessThanOrEqual(34);
  const size = await readMainSize(page);
  expect(size.width).toBeGreaterThanOrEqual(30);
  expect(size.height).toBeGreaterThanOrEqual(30);
  expect(size.height).toBeLessThanOrEqual(34);

  // Undo で元のサイズに戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readMainSize(page)).width).toBe(64);
});

test('画像編集後に再読み込みしても Asset の画像サイズと edit Blob が一致する', async ({ page }) => {
  const png = await makePngBuffer(page, '#00aa00');
  const canvas = await setupProject(page, '改訂保存E2E', png);

  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: 'トリミング' }).click();
  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x - 32, center.y - 32);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => (await readMainSize(page)).width, { timeout: 10_000 })
    .toBeLessThanOrEqual(34);
  await page.reload();
  await page.getByRole('button', { name: '「改訂保存E2E」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect.poll(async () => await readMainSize(page)).toEqual(await readMainTextureSize(page));
});

test('消しゴムでドラッグした部分が透明になる', async ({ page }) => {
  const png = await makePngBuffer(page, '#0000ff');
  const canvas = await setupProject(page, '消しゴムテスト', png);

  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: '消しゴム' }).click();

  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x - 20, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 20, center.y, { steps: 8 });
  await page.mouse.up();

  // ストローク上（画像中央）が透明になり、四隅は残る
  await expect.poll(async () => (await readMainPixel(page, 32, 32))[3]).toBe(0);
  expect((await readMainPixel(page, 2, 2))[3]).toBe(255);

  // Undo で戻る
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await readMainPixel(page, 32, 32))[3]).toBe(255);
});

test('色調整（明度 -100）で黒になる', async ({ page }) => {
  const png = await makePngBuffer(page, '#c86432');
  const canvas = await setupProject(page, '色調整テスト', png);

  // レイヤーを選択して画像編集パネルを開く
  const center = await canvasCenter(canvas);
  await page.mouse.click(center.x, center.y);

  await page.getByLabel('明度（-100〜100）').fill('-100');
  await page.getByRole('button', { name: '色調整を適用' }).click();

  await expect.poll(async () => await readMainPixel(page, 32, 32)).toEqual([0, 0, 0, 255]);
});

test('スポイトで拾った色をパレット置換できる', async ({ page }) => {
  const png = await makePngBuffer(page, '#ff0000');
  const canvas = await setupProject(page, 'パレット置換テスト', png);

  // スポイトで中央の赤を対象色にする
  await page.getByRole('button', { name: 'スポイト' }).click();
  const center = await canvasCenter(canvas);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByLabel('対象色（スポイトで拾えます）')).toHaveValue('#ff0000');

  await page.getByLabel('置換色', { exact: true }).fill('#0000ff');
  await page.getByRole('button', { name: 'パレット置換を適用' }).click();

  await expect.poll(async () => await readMainPixel(page, 32, 32)).toEqual([0, 0, 255, 255]);
});

test('輪郭線が透明領域との境界の外側に付く', async ({ page }) => {
  const png = await makePngBuffer(page, '#ff0000', { transparentRightHalf: true });
  const canvas = await setupProject(page, '輪郭線テスト', png);

  const center = await canvasCenter(canvas);
  await page.mouse.click(center.x, center.y);

  await page.getByLabel('太さ（px）').fill('2');
  await page.getByRole('button', { name: '輪郭線を追加' }).click();

  // 不透明領域は x=0..31。輪郭は x=32,33 に付く
  await expect.poll(async () => await readMainPixel(page, 33, 10)).toEqual([0, 0, 0, 255]);
  // 遠い透明部分はそのまま
  expect((await readMainPixel(page, 60, 10))[3]).toBe(0);
  // 内部は元の色のまま
  expect(await readMainPixel(page, 10, 10)).toEqual([255, 0, 0, 255]);
});

test('Undo完了後もAsset・Blob・Projectが整合し、通常編集を再開できる', async ({ page }) => {
  const png = await makePngBuffer(page, '#00aa00');
  const canvas = await setupProject(page, '履歴競合E2E', png);

  await page.getByRole('button', { name: '100%', exact: true }).click();
  await page.getByRole('button', { name: 'トリミング' }).click();

  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x - 32, center.y - 32);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(async () => (await readMainSize(page)).width, { timeout: 10_000 })
    .toBeLessThan(64);

  const undoButton = page.getByRole('button', { name: '元に戻す' });
  await expect(undoButton).toBeEnabled();
  await undoButton.click();

  await expect
    .poll(async () => (await readMainSize(page)).width, { timeout: 10_000 })
    .toBe(64);

  await expect.poll(async () => await readMainSize(page)).toEqual(await readMainTextureSize(page));

  const projectNameInput = page.getByLabel('プロジェクト名');
  await expect(projectNameInput).toHaveValue('履歴競合E2E');

  await projectNameInput.fill('Undo後は編集できる');
  await expect(page.getByRole('heading', { name: 'Undo後は編集できる' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '「Undo後は編集できる」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect.poll(async () => await readMainSize(page)).toEqual(await readMainTextureSize(page));
});
