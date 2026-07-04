import { readFile, stat } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2a9d8f';
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
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

test('PNG をダウンロードできる', async ({ page }) => {
  await setupProjectWithImage(page, 'PNG書き出しテスト');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('base.png');
  const path = await download.path();
  expect(path).not.toBeNull();
  const stats = await stat(path!);
  expect(stats.size).toBeGreaterThan(0);
});

test('WebP をダウンロードできる', async ({ page }) => {
  await setupProjectWithImage(page, 'WebP書き出しテスト');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'WebP をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('base.webp');
  const path = await download.path();
  expect(path).not.toBeNull();
  const stats = await stat(path!);
  expect(stats.size).toBeGreaterThan(0);
});

test('asset.json をダウンロードでき、内容が正しい', async ({ page }) => {
  await setupProjectWithImage(page, 'JSON書き出しテスト');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('base.asset.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf-8');
  const data = JSON.parse(content);
  expect(data.format).toBe('chameleon-asset');
  expect(data.name).toBe('base');
});

test('ZIP をダウンロードでき、中身一式が揃う', async ({ page }) => {
  await setupProjectWithImage(page, 'ZIP書き出しテスト');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('base-export.zip');
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  const entries = unzipSync(new Uint8Array(bytes));

  expect(Object.keys(entries)).toEqual(
    expect.arrayContaining([
      'asset.json',
      'textures/main.png',
      'atlas/spritesheet.png',
      'atlas/atlas.json',
      'examples/example-canvas.html',
      'examples/example-pixi.html',
      'examples/example-phaser.html',
      'helpers/chameleon-helpers.js',
      'helpers/chameleon-pixi.js',
      'helpers/chameleon-phaser.js',
      'engines/README-godot.md',
      'engines/README-unity.md',
      'README.md',
    ]),
  );

  // helper は ESM の部品としてコピーして使える形（Phase 16）
  const canvasHelpers = Buffer.from(entries['helpers/chameleon-helpers.js']).toString('utf-8');
  expect(canvasHelpers).toContain('export async function loadChameleonAtlas');
  expect(canvasHelpers).toContain('drawColliderDebug');
  const godotGuide = Buffer.from(entries['engines/README-godot.md']).toString('utf-8');
  expect(godotGuide).toContain('自動生成するものではありません');

  const atlas = JSON.parse(Buffer.from(entries['atlas/atlas.json']).toString('utf-8'));
  expect(atlas.format).toBe('chameleon-atlas');
  expect(atlas.frames.length).toBeGreaterThanOrEqual(1);

  const readme = Buffer.from(entries['README.md']).toString('utf-8');
  expect(readme).toContain('examples');

  // Phaser サンプルは Phaser 4.2.0 の CDN を使う
  const phaserHtml = Buffer.from(entries['examples/example-phaser.html']).toString('utf-8');
  expect(phaserHtml).toContain('https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js');
});

test('画像 Blob が欠落していると ZIP 書き出しは理由を表示して失敗する', async ({ page }) => {
  await setupProjectWithImage(page, 'Blob欠落テスト');

  // IndexedDB の blobs ストアを空にして画像 Blob 欠落状態を作る（Phase 15.5-A）
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chameleon-asset-studio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('blobs', 'readwrite');
          tx.objectStore('blobs').clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  await page.getByRole('button', { name: 'ZIP をダウンロード' }).click();
  await expect(page.getByRole('alert')).toContainText('画像 Blob が見つかりません');
});
