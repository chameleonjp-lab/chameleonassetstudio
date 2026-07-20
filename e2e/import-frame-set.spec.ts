import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

async function makeSolidPng(page: Page, color: string, width = 16, height = 16): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ([fill, w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      context.fillStyle = fill;
      context.fillRect(0, 0, w, h);
      return canvas.toDataURL('image/png');
    },
    [color, width, height] as const,
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function makeGridSheet(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 19;
    canvas.height = 19;
    const context = canvas.getContext('2d')!;
    const cells = [
      { x: 1, y: 1, color: '#ff0000' },
      { x: 10, y: 1, color: '#00ff00' },
      { x: 1, y: 10, color: '#0000ff' },
      { x: 10, y: 10, color: '#ffff00' },
    ];
    for (const cell of cells) {
      context.fillStyle = cell.color;
      context.fillRect(cell.x, cell.y, 8, 8);
    }
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function openPropertiesOnMobile(page: Page): Promise<void> {
  const nav = page.getByRole('navigation', { name: '画面切り替え' });
  if (await nav.isVisible()) {
    await nav.getByRole('button', { name: 'プロパティ' }).tap();
  }
}

interface StoredFrameSetAsset {
  id: string;
  canvasSize: { width: number; height: number };
  textures: Array<{ id: string; kind: string; path: string }>;
  layers: Array<{ id: string; visible: boolean }>;
  frames: Array<{
    id: string;
    name: string;
    layerStates: Array<{ layerId: string; visible?: boolean }>;
  }>;
  animations: Array<{ name: string; fps: number; loop: boolean; frameIds: string[] }>;
  provenance?: Array<{ sourceFileName: string; hash: string; textureId?: string }>;
}

async function readAssets(page: Page): Promise<StoredFrameSetAsset[]> {
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

async function readEditCellColors(page: Page): Promise<number[][]> {
  return page.evaluate(async () => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const assets = (await requestResult(
      db.transaction('assets', 'readonly').objectStore('assets').getAll(),
    )) as Array<{
      data: {
        id: string;
        textures: Array<{ kind: string; path: string }>;
      };
    }>;
    const blobs = (await requestResult(
      db.transaction('blobs', 'readonly').objectStore('blobs').getAll(),
    )) as Array<{ key: string; mimeType: string; bytes: ArrayBuffer }>;
    db.close();
    const asset = assets[0].data;
    const colors: number[][] = [];
    for (const texture of asset.textures.filter((item) => item.kind === 'edit')) {
      const record = blobs.find((blob) => blob.key === `${asset.id}/${texture.path}`)!;
      const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      colors.push(Array.from(context.getImageData(4, 4, 1, 1).data));
      bitmap.close();
    }
    return colors;
  });
}

function visibleLayerIds(asset: StoredFrameSetAsset, frameIndex: number): string[] {
  const visibility = new Map(asset.layers.map((layer) => [layer.id, layer.visible]));
  for (const state of asset.frames[frameIndex].layerStates) {
    if (state.visible !== undefined) visibility.set(state.layerId, state.visible);
  }
  return [...visibility].filter(([, visible]) => visible).map(([id]) => id);
}

test('連番previewを自然数順で確定し、1 Undo/Redo・reload後もframe意味を保持する', async ({
  page,
}) => {
  await createProject(page, 'sequence import');
  const one = await makeSolidPng(page, '#ff0000');
  const two = await makeSolidPng(page, '#00ff00');
  const ten = await makeSolidPng(page, '#0000ff');
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles([
    { name: 'walk_10.png', mimeType: 'image/png', buffer: ten },
    { name: 'walk_2.png', mimeType: 'image/png', buffer: two },
    { name: 'walk_1.png', mimeType: 'image/png', buffer: one },
  ]);
  await page.getByRole('button', { name: '連番previewを準備' }).click();

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('Asset 1件 / layer 3件 / frame 3件 / animation 1件');
  await expect(dialog.locator('.import-preview-files li')).toHaveText([
    'walk_1.png',
    'walk_2.png',
    'walk_10.png',
  ]);
  await dialog.getByRole('button', { name: '取り込みを取消' }).click();
  expect(await readAssets(page)).toEqual([]);
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => (await readAssets(page)).length).toBe(1);
  const asset = (await readAssets(page))[0];
  expect(asset.layers).toHaveLength(3);
  expect(asset.frames.map((frame) => frame.name)).toEqual(['walk_1', 'walk_2', 'walk_10']);
  expect(asset.animations).toMatchObject([
    { name: 'walk_1', fps: 8, loop: true, frameIds: asset.frames.map((frame) => frame.id) },
  ]);
  expect(asset.provenance?.map((record) => record.sourceFileName)).toEqual([
    'walk_1.png',
    'walk_2.png',
    'walk_10.png',
  ]);
  expect(asset.provenance?.[0].hash).toBe(
    `sha256:${createHash('sha256').update(one).digest('hex')}`,
  );
  for (let index = 0; index < asset.frames.length; index += 1) {
    expect(visibleLayerIds(asset, index)).toEqual([asset.layers[index].id]);
  }

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(0);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(1);

  await page.reload();
  await page.getByRole('button', { name: '「sequence import」を開く' }).click();
  expect((await readAssets(page))[0]).toEqual(asset);
});

test('連番は17件超と混在寸法を生成前に拒否し、正本へ保存しない', async ({ page }) => {
  await createProject(page, 'sequence rejection');
  const small = await makeSolidPng(page, '#ff0000', 8, 8);
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles(
    Array.from({ length: 17 }, (_, index) => ({
      name: `limit_${index + 1}.png`,
      mimeType: 'image/png',
      buffer: small,
    })),
  );
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await expect(page.getByRole('alert')).toContainText('最大16件');
  expect(await readAssets(page)).toEqual([]);

  const large = await makeSolidPng(page, '#00ff00', 16, 8);
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles([
    { name: 'mixed_1.png', mimeType: 'image/png', buffer: small },
    { name: 'mixed_2.png', mimeType: 'image/png', buffer: large },
  ]);
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await expect(page.getByRole('alert')).toContainText('すべて同じ寸法');
  await expect(page.getByRole('alert')).toContainText('自動拡縮やpaddingは行いません');
  expect(await readAssets(page)).toEqual([]);
});

test('手動格子sheetはloss確認後に4cellを行優先で保存しatlasへ書き出す', async ({ page }) => {
  await createProject(page, 'sheet import');
  await page.getByLabel('frame列取り込みモード').selectOption('sheet');
  const sheet = await makeGridSheet(page);
  await page.getByLabel('Sprite Sheetファイルを選ぶ').setInputFiles({
    name: 'effects.png',
    mimeType: 'image/png',
    buffer: sheet,
  });
  await page.getByLabel('Sprite Sheet cell幅').fill('8');
  await page.getByLabel('Sprite Sheet cell高さ').fill('8');
  await page.getByLabel('Sprite Sheet 外周margin').fill('1');
  await page.getByLabel('Sprite Sheet cell間spacing').fill('1');
  await page.getByRole('button', { name: 'Sprite Sheet previewを準備' }).click();

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('2列 x 2行');
  await expect(dialog).toContainText('外周margin 1px');
  const confirm = dialog.getByRole('button', { name: '取り込みを確定' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/loss・warningを確認/).check();
  await confirm.click();

  const asset = (await readAssets(page))[0];
  expect(asset.canvasSize).toEqual({ width: 8, height: 8 });
  expect(asset.textures.filter((texture) => texture.kind === 'source')).toHaveLength(1);
  expect(asset.textures.filter((texture) => texture.kind === 'edit')).toHaveLength(4);
  expect(asset.layers).toHaveLength(4);
  expect(asset.frames).toHaveLength(4);
  expect(asset.provenance).toHaveLength(1);
  expect(asset.provenance?.[0]).toMatchObject({
    sourceFileName: 'effects.png',
    hash: `sha256:${createHash('sha256').update(sheet).digest('hex')}`,
  });
  expect(await readEditCellColors(page)).toEqual([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
  ]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const downloadPath = await download.path();
  const entries = unzipSync(new Uint8Array(await readFile(downloadPath!)));
  const atlas = JSON.parse(Buffer.from(entries['atlas/atlas.json']).toString('utf-8'));
  expect(atlas.cellSize).toEqual({ width: 8, height: 8 });
  expect(atlas.frames.map((frame: { name: string }) => frame.name)).toEqual(
    asset.frames.map((frame) => frame.name),
  );
  expect(atlas.animations[0]).toMatchObject({
    name: 'effects',
    fps: 8,
    loop: true,
    frames: asset.frames.map((frame) => frame.name),
  });

  await page.reload();
  await page.getByRole('button', { name: '「sheet import」を開く' }).click();
  expect((await readAssets(page))[0]).toEqual(asset);
});

test('signature・dimension・decode失敗だけをquarantineし正本を変更しない', async ({ page }) => {
  await createProject(page, 'image quarantine');
  const png = await makeSolidPng(page, '#ff0000');
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'spoofed.jpg',
    mimeType: 'image/jpeg',
    buffer: png,
  });
  await expect(page.getByRole('alert')).toContainText('宣言形式と実体が一致しません');

  const tooWide = await makeSolidPng(page, '#00ff00', 4097, 1);
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'too-wide.png',
    mimeType: 'image/png',
    buffer: tooWide,
  });
  await expect(page.getByRole('alert')).toContainText('画像サイズが大きすぎます');

  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(page.getByRole('alert')).toContainText('画像をデコードできませんでした');
  expect(await readAssets(page)).toEqual([]);

  await page.getByRole('button', { name: '← ホーム' }).click();
  const quarantine = page.getByRole('region', { name: '読み込みに失敗したファイル' });
  await expect(quarantine).toContainText('spoofed.jpg');
  await expect(quarantine).toContainText('too-wide.png');
  await expect(quarantine).toContainText('broken.png');
});

test.describe('iPhone SE級touchのframe列import', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('連番preview・確定・Undo・reloadへtapで到達し横overflowしない', async ({ page }) => {
    await createProject(page, 'mobile sequence');
    await openPropertiesOnMobile(page);
    const first = await makeSolidPng(page, '#ff0000');
    const second = await makeSolidPng(page, '#00ff00');
    await page.getByLabel('連番ファイルを選ぶ').setInputFiles([
      { name: 'mobile_2.png', mimeType: 'image/png', buffer: second },
      { name: 'mobile_1.png', mimeType: 'image/png', buffer: first },
    ]);
    await page.getByRole('button', { name: '連番previewを準備' }).tap();
    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await dialog.getByRole('button', { name: '取り込みを確定' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    await page.getByRole('button', { name: '元に戻す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(0);
    await page.getByRole('button', { name: 'やり直す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test('sheet格子・warning確認・確定・reloadへtapで到達する', async ({ page }) => {
    await createProject(page, 'mobile sheet');
    await openPropertiesOnMobile(page);
    await page.getByLabel('frame列取り込みモード').selectOption('sheet');
    await page.getByLabel('Sprite Sheetファイルを選ぶ').setInputFiles({
      name: 'mobile-sheet.png',
      mimeType: 'image/png',
      buffer: await makeGridSheet(page),
    });
    await page.getByLabel('Sprite Sheet cell幅').fill('8');
    await page.getByLabel('Sprite Sheet cell高さ').fill('8');
    await page.getByLabel('Sprite Sheet 外周margin').fill('1');
    await page.getByLabel('Sprite Sheet cell間spacing').fill('1');
    await page.getByRole('button', { name: 'Sprite Sheet previewを準備' }).tap();
    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await dialog.getByLabel(/loss・warningを確認/).tap();
    const confirm = dialog.getByRole('button', { name: '取り込みを確定' });
    expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await confirm.tap();
    await expect.poll(async () => (await readAssets(page))[0]?.frames.length).toBe(4);
    await page.reload();
    await page.getByRole('button', { name: '「mobile sheet」を開く' }).tap();
    expect((await readAssets(page))[0].frames).toHaveLength(4);
  });
});
