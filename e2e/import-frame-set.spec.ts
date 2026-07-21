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
  name: string;
  assetType: string;
  canvasSize: { width: number; height: number };
  origin: { x: number; y: number };
  textures: Array<{ id: string; kind: string; path: string }>;
  layers: Array<{ id: string; visible: boolean }>;
  frames: Array<{
    id: string;
    name: string;
    layerStates: Array<{ layerId: string; visible?: boolean }>;
  }>;
  animations: Array<{ name: string; fps: number; loop: boolean; frameIds: string[] }>;
  anchors: Array<{ id: string; name: string; role: string; position: { x: number; y: number } }>;
  colliders: Array<{ id: string; name: string; purpose: string; shape: string }>;
  tile?: {
    tileSize: { width: number; height: number };
    collisionType: string;
    visualType: string;
  };
  effect?: {
    effectType: string;
    durationMs: number;
    loop: boolean;
    blendMode: string;
  };
  provenance?: Array<{
    sourceFileName: string;
    mimeType: string;
    byteLength: number;
    hash: string;
    textureId?: string;
    origin?: string;
  }>;
}

function omitIds<T extends { id: string }>(items: T[]): Array<Omit<T, 'id'>> {
  return items.map(
    (item) =>
      Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id')) as Omit<T, 'id'>,
  );
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

async function readEditCellColors(page: Page, assetId: string | null = null): Promise<number[][]> {
  return page.evaluate(async (selectedAssetId) => {
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
    const asset = selectedAssetId
      ? assets.find((record) => record.data.id === selectedAssetId)?.data
      : assets[0]?.data;
    if (!asset) throw new Error(`対象Assetが見つかりません: ${selectedAssetId ?? '先頭'}`);
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
  }, assetId);
}

async function readBlobRecords(page: Page): Promise<Array<{ key: string; mimeType: string }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ key: string; mimeType: string }>>(
      (resolve, reject) => {
        const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return records.map(({ key, mimeType }) => ({ key, mimeType }));
  });
}

async function readQuarantineFileNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ fileName: string }>>((resolve, reject) => {
      const request = db.transaction('quarantine', 'readonly').objectStore('quarantine').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.map(({ fileName }) => fileName).sort();
  });
}

function visibleLayerIds(asset: StoredFrameSetAsset, frameIndex: number): string[] {
  const visibility = new Map(asset.layers.map((layer) => [layer.id, layer.visible]));
  for (const state of asset.frames[frameIndex].layerStates) {
    if (state.visible !== undefined) visibility.set(state.layerId, state.visible);
  }
  return [...visibility].filter(([, visible]) => visible).map(([id]) => id);
}

test('保存前previewは背景をmodal化し、Ctrl+Zでstaged stateを古くしない', async ({ page }) => {
  await createProject(page, 'modal import guard');
  const input = page.getByLabel('画像を選ぶ');
  const base = await makeSolidPng(page, '#ff0000');
  await input.setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer: base });

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  const cancel = dialog.getByRole('button', { name: '取り込みを取消' });
  await expect(cancel).toBeFocused();
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(1);
  const before = (await readAssets(page))[0];

  const second = await makeSolidPng(page, '#00ff00');
  await page
    .getByLabel('画像を追加')
    .setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: second });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await page.keyboard.press('Control+z');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => (await readAssets(page)).map((asset) => asset.id))
    .toEqual([before.id]);
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);

  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(2);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => (await readAssets(page)).map((asset) => asset.id))
    .toEqual([before.id]);
});

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

test('Tileset独立モードは設定をpreviewし、4cell・0 animation・tile metadataを保存する', async ({
  page,
}) => {
  await createProject(page, 'tileset import');
  await page.getByLabel('frame列取り込みモード').selectOption('tileset');
  const sheet = await makeGridSheet(page);
  await page.getByLabel('Tilesetファイルを選ぶ').setInputFiles({
    name: 'terrain.png',
    mimeType: 'image/png',
    buffer: sheet,
  });
  await page.getByLabel('Tileset cell幅').fill('8');
  await page.getByLabel('Tileset cell高さ').fill('8');
  await page.getByLabel('Tileset 外周margin').fill('1');
  await page.getByLabel('Tileset cell間spacing').fill('1');
  await expect(page.getByLabel('Tileset tile幅')).toHaveValue('8');
  await expect(page.getByLabel('Tileset tile高さ')).toHaveValue('8');
  await page.getByLabel('Tileset collision').selectOption('hazard');
  await page.getByLabel('Tileset visualType').fill('damage-floor');
  await page.getByRole('button', { name: 'Tileset previewを準備' }).click();

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('Tileset（手動格子）');
  await expect(dialog).toContainText('Asset 1件 / layer 4件 / frame 4件 / animation 0件');
  await expect(dialog).toContainText('tileSizeは8 x 8px');
  await expect(dialog).toContainText('collisionはAsset全体で「hazard」');
  await expect(dialog).toContainText('colliderは自動生成しません');
  await dialog.getByLabel(/loss・warningを確認/).check();
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();

  const asset = (await readAssets(page))[0];
  expect(asset.assetType).toBe('tile');
  expect(asset.canvasSize).toEqual({ width: 8, height: 8 });
  expect(asset.frames).toHaveLength(4);
  expect(asset.layers).toHaveLength(4);
  expect(asset.animations).toEqual([]);
  expect(asset.colliders).toEqual([]);
  expect(asset.tile).toEqual({
    tileSize: { width: 8, height: 8 },
    collisionType: 'hazard',
    visualType: 'damage-floor',
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
  const entries = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  const atlas = JSON.parse(Buffer.from(entries['atlas/atlas.json']).toString('utf-8'));
  expect(atlas.cellSize).toEqual({ width: 8, height: 8 });
  expect(atlas.tile).toEqual(asset.tile);
  expect(atlas.animations).toEqual([]);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(0);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: '「tileset import」を開く' }).click();
  expect((await readAssets(page))[0]).toEqual(asset);
});

test('実exportの5-frame Chameleon Atlasを意味上roundtripし、空sheet cellとraw JSONを保存しない', async ({
  page,
}) => {
  await createProject(page, 'atlas roundtrip');
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
  const buffers = await Promise.all(colors.map((color) => makeSolidPng(page, color, 8, 8)));
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles(
    buffers.map((buffer, index) => ({
      name: `round_${index + 1}.png`,
      mimeType: 'image/png',
      buffer,
    })),
  );
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await page
    .getByRole('dialog', { name: '取り込み確定前preview' })
    .getByRole('button', { name: '取り込みを確定' })
    .click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(1);

  const [sourceDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const sourceEntries = unzipSync(new Uint8Array(await readFile((await sourceDownload.path())!)));
  const exportedAtlasBytes = Buffer.from(sourceEntries['atlas/atlas.json']);
  const exportedTextureBytes = Buffer.from(sourceEntries['atlas/spritesheet.png']);
  const exportedAtlas = JSON.parse(exportedAtlasBytes.toString('utf-8'));
  expect(exportedAtlas.frames).toHaveLength(5);
  expect(exportedAtlas.frames.at(-1)).toMatchObject({ x: 8, y: 8, width: 8, height: 8 });

  await page.getByLabel('frame列取り込みモード').selectOption('atlas');
  await page.getByLabel('atlas.jsonを選ぶ').setInputFiles({
    name: 'atlas.json',
    mimeType: 'application/json',
    buffer: exportedAtlasBytes,
  });
  await page.getByLabel('spritesheet.pngを選ぶ').setInputFiles({
    name: 'spritesheet.png',
    mimeType: 'image/png',
    buffer: exportedTextureBytes,
  });
  await page.getByLabel('Atlas Asset名').fill('roundtrip_flattened');
  await page.getByLabel('Atlas fallback Asset type').selectOption('item');
  await page.getByRole('button', { name: 'Chameleon Atlas previewを準備' }).click();

  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('Chameleon Atlas 0.1.0');
  await expect(dialog).toContainText('layer 5件 / frame 5件 / animation 1件');
  await expect(dialog).toContainText('末尾の空sheet cellは取り込みません');
  await expect(dialog).toContainText('atlas.jsonのraw bytesは保存しません');
  await expect(dialog).toContainText('選択した「item」で作成します');
  const confirm = dialog.getByRole('button', { name: '取り込みを確定' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/loss・warningを確認/).check();
  await confirm.click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(2);

  const storedAssets = await readAssets(page);
  const source = storedAssets.find((asset) => asset.name === 'round_1');
  const imported = storedAssets.find((asset) => asset.name === 'roundtrip_flattened');
  expect(source).toBeDefined();
  expect(imported).toBeDefined();
  if (!source || !imported) throw new Error('roundtrip比較対象のAssetが見つかりません。');
  expect(imported.assetType).toBe('item');
  expect(imported.frames).toHaveLength(5);
  expect(imported.layers).toHaveLength(5);
  expect(imported.animations).toHaveLength(1);
  expect(imported.origin).toEqual(source.origin);
  expect(omitIds(imported.anchors)).toEqual(omitIds(source.anchors));
  expect(omitIds(imported.colliders)).toEqual(omitIds(source.colliders));
  const sourceFrameName = new Map(source.frames.map((frame) => [frame.id, frame.name]));
  const importedFrameName = new Map(imported.frames.map((frame) => [frame.id, frame.name]));
  expect(
    imported.animations.map((animation) => ({
      name: animation.name,
      fps: animation.fps,
      loop: animation.loop,
      frames: animation.frameIds.map((frameId) => importedFrameName.get(frameId)),
    })),
  ).toEqual(
    source.animations.map((animation) => ({
      name: animation.name,
      fps: animation.fps,
      loop: animation.loop,
      frames: animation.frameIds.map((frameId) => sourceFrameName.get(frameId)),
    })),
  );
  expect(imported.provenance).toHaveLength(2);
  expect(imported.provenance?.[0]).toMatchObject({
    sourceFileName: 'spritesheet.png',
    hash: `sha256:${createHash('sha256').update(exportedTextureBytes).digest('hex')}`,
  });
  expect(imported.provenance?.[1]).toMatchObject({
    sourceFileName: 'atlas.json',
    mimeType: 'application/json',
    hash: `sha256:${createHash('sha256').update(exportedAtlasBytes).digest('hex')}`,
    origin: 'chameleon-atlas-metadata',
  });
  expect(imported.provenance?.[1].textureId).toBeUndefined();
  expect(await readEditCellColors(page, imported.id)).toEqual([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
    [255, 0, 255, 255],
  ]);
  expect(
    (await readBlobRecords(page)).some(({ mimeType }) => mimeType === 'application/json'),
  ).toBe(false);
  expect((await readBlobRecords(page)).some(({ key }) => key.endsWith('/atlas.json'))).toBe(false);

  const [roundtripDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const roundtripEntries = unzipSync(
    new Uint8Array(await readFile((await roundtripDownload.path())!)),
  );
  expect(JSON.parse(Buffer.from(roundtripEntries['atlas/atlas.json']).toString('utf-8'))).toEqual(
    exportedAtlas,
  );

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(1);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: '「atlas roundtrip」を開く' }).click();
  expect((await readAssets(page)).find((asset) => asset.id === imported.id)).toEqual(imported);
});

const atlasMetadataRoundtripCases = [
  {
    kind: 'tile',
    settings: {
      tileSize: { width: 4, height: 8 },
      collisionType: 'one_way',
      visualType: 'ledge',
    },
    color: '#38bdf8',
  },
  {
    kind: 'effect',
    settings: {
      effectType: 'explosion',
      durationMs: 750,
      loop: false,
      blendMode: 'screen',
    },
    color: '#fb7185',
  },
] as const;

for (const metadataCase of atlasMetadataRoundtripCases) {
  test(`Chameleon Atlasの${metadataCase.kind}設定を保存・reload・再exportまで意味上roundtripする`, async ({
    page,
  }) => {
    const projectName = `${metadataCase.kind} atlas metadata`;
    const assetName = `${metadataCase.kind}_roundtrip`;
    const atlas = {
      format: 'chameleon-atlas',
      version: '0.1.0',
      texture: 'spritesheet.png',
      cellSize: { width: 8, height: 8 },
      frames: [
        { name: 'state_1', x: 0, y: 0, width: 8, height: 8 },
        { name: 'state_2', x: 8, y: 0, width: 8, height: 8 },
      ],
      animations: [{ name: 'cycle', fps: 12, loop: true, frames: ['state_2', 'state_1'] }],
      origin: { x: 4, y: 8 },
      anchors: [],
      colliders: [],
      ...(metadataCase.kind === 'tile'
        ? { tile: metadataCase.settings }
        : { effect: metadataCase.settings }),
    };

    await createProject(page, projectName);
    await page.getByLabel('frame列取り込みモード').selectOption('atlas');
    await page.getByLabel('atlas.jsonを選ぶ').setInputFiles({
      name: 'atlas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(atlas)),
    });
    await page.getByLabel('spritesheet.pngを選ぶ').setInputFiles({
      name: 'spritesheet.png',
      mimeType: 'image/png',
      buffer: await makeSolidPng(page, metadataCase.color, 16, 8),
    });
    await page.getByLabel('Atlas Asset名').fill(assetName);
    await page.getByLabel('Atlas fallback Asset type').selectOption('item');
    await page.getByRole('button', { name: 'Chameleon Atlas previewを準備' }).click();

    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await expect(dialog).toContainText(`Asset typeは「${metadataCase.kind}」`);
    await expect(dialog).toContainText(`${metadataCase.kind}設定`);
    await dialog.getByLabel(/loss・warningを確認/).check();
    await dialog.getByRole('button', { name: '取り込みを確定' }).click();

    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    const asset = (await readAssets(page))[0];
    expect(asset.name).toBe(assetName);
    expect(asset.assetType).toBe(metadataCase.kind);
    expect(asset[metadataCase.kind]).toEqual(metadataCase.settings);
    expect(asset[metadataCase.kind === 'tile' ? 'effect' : 'tile']).toBeUndefined();
    expect(asset.frames.map((frame) => frame.name)).toEqual(['state_1', 'state_2']);
    const frameNameById = new Map(asset.frames.map((frame) => [frame.id, frame.name]));
    expect(
      asset.animations.map((animation) => ({
        name: animation.name,
        fps: animation.fps,
        loop: animation.loop,
        frames: animation.frameIds.map((frameId) => frameNameById.get(frameId)),
      })),
    ).toEqual([{ name: 'cycle', fps: 12, loop: true, frames: ['state_2', 'state_1'] }]);

    const [firstDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
    ]);
    const firstEntries = unzipSync(new Uint8Array(await readFile((await firstDownload.path())!)));
    const firstExport = JSON.parse(Buffer.from(firstEntries['atlas/atlas.json']).toString('utf-8'));
    expect(firstExport).toEqual(atlas);

    await page.reload();
    await page.getByRole('button', { name: `「${projectName}」を開く` }).click();
    const reloaded = (await readAssets(page))[0];
    expect(reloaded).toEqual(asset);

    const [secondDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
    ]);
    const secondEntries = unzipSync(new Uint8Array(await readFile((await secondDownload.path())!)));
    const secondExport = JSON.parse(
      Buffer.from(secondEntries['atlas/atlas.json']).toString('utf-8'),
    );
    expect(secondExport).toEqual(atlas);
    expect(secondExport).toEqual(firstExport);
  });
}

test('外部・不整合Atlas JSONは理由付き拒否し、正本・quarantineを変更しない', async ({ page }) => {
  await createProject(page, 'atlas rejection');
  await page.getByLabel('frame列取り込みモード').selectOption('atlas');
  await page.getByLabel('atlas.jsonを選ぶ').setInputFiles({
    name: 'atlas.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'phaser-atlas',
        version: '0.1.0',
        texture: 'spritesheet.png',
        cellSize: { width: 8, height: 8 },
        frames: [],
        animations: [],
        origin: { x: 0, y: 0 },
        anchors: [],
        colliders: [],
      }),
    ),
  });
  await page.getByLabel('spritesheet.pngを選ぶ').setInputFiles({
    name: 'spritesheet.png',
    mimeType: 'image/png',
    buffer: await makeSolidPng(page, '#ff0000', 8, 8),
  });
  await page.getByRole('button', { name: 'Chameleon Atlas previewを準備' }).click();
  await expect(page.getByRole('alert')).toContainText('Chameleon自形式');
  expect(await readAssets(page)).toEqual([]);
  expect(await readBlobRecords(page)).toEqual([]);
  expect(await readQuarantineFileNames(page)).toEqual([]);

  await page.getByLabel('atlas.jsonを選ぶ').setInputFiles({
    name: 'atlas.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'chameleon-atlas',
        version: '0.1.0',
        texture: 'spritesheet.png',
        cellSize: { width: 8, height: 8 },
        frames: [{ name: 'idle', x: 0, y: 0, width: 8, height: 8 }],
        animations: [{ name: 'walk', fps: 8, loop: true, frames: ['missing'] }],
        origin: { x: 0, y: 0 },
        anchors: [],
        colliders: [],
      }),
    ),
  });
  await page.getByRole('button', { name: 'Chameleon Atlas previewを準備' }).click();
  await expect(page.getByRole('alert')).toContainText('存在しないframe');
  expect(await readAssets(page)).toEqual([]);
  expect(await readBlobRecords(page)).toEqual([]);
  expect(await readQuarantineFileNames(page)).toEqual([]);
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
  await expect(page.getByRole('alert')).toContainText('PNGのIEND chunkがありません');
  expect(await readAssets(page)).toEqual([]);
  expect(await readQuarantineFileNames(page)).toEqual([
    'broken.png',
    'spoofed.jpg',
    'too-wide.png',
  ]);

  await page.getByRole('button', { name: '← ホーム' }).click();
  const quarantine = page.getByRole('region', { name: '読み込みに失敗したファイル' });
  await expect(quarantine).toContainText('spoofed.jpg');
  await expect(quarantine).toContainText('too-wide.png');
  await expect(quarantine).toContainText('broken.png');
});

test.describe('touch tabletのTileset import', () => {
  test.use({ hasTouch: true, viewport: { width: 768, height: 1024 } });

  test('preview・確定・Undo/Redo・reloadへtapで到達する', async ({ page }) => {
    await createProject(page, 'touch tileset');
    await openPropertiesOnMobile(page);
    await page.getByLabel('frame列取り込みモード').selectOption('tileset');
    await page.getByLabel('Tilesetファイルを選ぶ').setInputFiles({
      name: 'single-tile.png',
      mimeType: 'image/png',
      buffer: await makeSolidPng(page, '#00ff00', 8, 8),
    });
    await page.getByLabel('Tileset cell幅').fill('8');
    await page.getByLabel('Tileset cell高さ').fill('8');
    await page.getByRole('button', { name: 'Tileset previewを準備' }).tap();
    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await expect(dialog).toContainText('frame 1件 / animation 0件');
    await dialog.getByRole('button', { name: '取り込みを確定' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    await page.getByRole('button', { name: '元に戻す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(0);
    await page.getByRole('button', { name: 'やり直す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    await page.reload();
    await page.getByRole('button', { name: '「touch tileset」を開く' }).tap();
    expect((await readAssets(page))[0].tile).toEqual({
      tileSize: { width: 8, height: 8 },
      collisionType: 'solid',
      visualType: 'floor',
    });
  });
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

  test('Chameleon Atlasの2 file・loss確認・確定へtapで到達し44pxと横overflowを守る', async ({
    page,
  }) => {
    await createProject(page, 'mobile atlas');
    await openPropertiesOnMobile(page);
    await page.getByLabel('frame列取り込みモード').selectOption('atlas');
    const texture = await makeSolidPng(page, '#ff0000', 8, 8);
    const atlas = {
      format: 'chameleon-atlas',
      version: '0.1.0',
      texture: 'spritesheet.png',
      cellSize: { width: 8, height: 8 },
      frames: [{ name: 'idle', x: 0, y: 0, width: 8, height: 8 }],
      animations: [{ name: 'idle', fps: 8, loop: true, frames: ['idle'] }],
      origin: { x: 4, y: 8 },
      anchors: [],
      colliders: [],
    };
    await page.getByLabel('atlas.jsonを選ぶ').setInputFiles({
      name: 'atlas.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(atlas)),
    });
    await page.getByLabel('spritesheet.pngを選ぶ').setInputFiles({
      name: 'spritesheet.png',
      mimeType: 'image/png',
      buffer: texture,
    });
    await page.getByLabel('Atlas Asset名').fill('mobile_atlas');
    expect((await page.getByLabel('Atlas Asset名').boundingBox())!.height).toBeGreaterThanOrEqual(
      44,
    );
    expect(
      (await page.getByLabel('Atlas fallback Asset type').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    const prepare = page.getByRole('button', { name: 'Chameleon Atlas previewを準備' });
    expect((await prepare.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await prepare.tap();

    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await dialog.getByLabel(/loss・warningを確認/).tap();
    const confirm = dialog.getByRole('button', { name: '取り込みを確定' });
    expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await confirm.tap();
    await expect.poll(async () => (await readAssets(page))[0]?.frames.length).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await page.reload();
    await page.getByRole('button', { name: '「mobile atlas」を開く' }).tap();
    expect((await readAssets(page))[0].frames).toHaveLength(1);
  });
});
