import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

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
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

test('.casproj を書き出し、削除後に読み込むと画像ごと復元される', async ({ page }) => {
  await setupProjectWithImage(page, 'casproj-rt');

  // 書き出し
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('casproj-rt.casproj');
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);

  // ホームへ戻り、元プロジェクトを削除して空にする
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await page.getByRole('button', { name: '「casproj-rt」を削除' }).click();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();

  // 読み込み → 一覧に復元される
  await page
    .getByLabel('.casproj を読み込む')
    .setInputFiles({ name: 'casproj-rt.casproj', mimeType: 'application/zip', buffer: bytes });
  const openButton = page.getByRole('button', { name: '「casproj-rt」を開く' });
  await expect(openButton).toBeVisible();

  // 開くと画像レイヤーごと復元されている
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  // 読み込み後の正本を再び書き出し、もう一度読み込める
  const [reexport] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード' }).click(),
  ]);
  const reexportPath = await reexport.path();
  const reexportBytes = await readFile(reexportPath!);
  await page.goto('/');
  await page.getByRole('button', { name: '「casproj-rt」を削除' }).click();
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'casproj-rt-reexport.casproj',
    mimeType: 'application/zip',
    buffer: reexportBytes,
  });
  await expect(page.getByRole('button', { name: '「casproj-rt」を開く' })).toBeVisible();
});

test('casproj ではないファイルを読み込むと理由が表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'not-a-casproj.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from('これは ZIP ではありません', 'utf-8'),
  });
  await expect(page.getByRole('alert')).toContainText('.casproj を読み込めませんでした');
});

test('参照Assetの画像欠落は正本へ保存せず、理由とquarantineを表示する', async ({ page }) => {
  const [projectJson, assetJson] = await Promise.all([
    readFile('src/core/storage/__fixtures__/v0.1.0-project.json', 'utf-8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-asset.json', 'utf-8'),
  ]);
  const assetId = (JSON.parse(assetJson) as { id: string }).id;
  const zipped = zipSync({
    'project.json': strToU8(projectJson),
    [`assets/${assetId}/asset.json`]: strToU8(assetJson),
  });

  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'missing-images.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipped),
  });
  await expect(page.getByRole('alert')).toContainText('画像ファイルが不足');
  await expect(page.getByRole('alert')).toContainText(
    '既存の保存済みプロジェクトは変更されていません',
  );
  await expect(page.getByRole('button', { name: '「旧形式フィクスチャ」を開く' })).toHaveCount(0);
  const quarantine = page.getByRole('region', { name: '読み込みに失敗したファイル' });
  await expect(quarantine.getByText('missing-images.casproj')).toBeVisible();
});

test('future versionは理由付きで拒否し、元bytesをquarantineへ残す', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const projectJson = JSON.parse(
    await readFile('src/core/storage/__fixtures__/v0.1.0-project.json', 'utf-8'),
  ) as Record<string, unknown>;
  projectJson.version = '0.1.1';
  const zipped = zipSync({ 'project.json': strToU8(JSON.stringify(projectJson)) });

  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'future.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipped),
  });
  await expect(page.getByRole('alert')).toContainText('新しい形式');
  const quarantine = page.getByRole('region', { name: '読み込みに失敗したファイル' });
  await expect(quarantine.getByText('future.casproj')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('未参照Assetとorphan fileは警告付きで除外し、canonical Projectだけを保存する', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const [projectJson, assetJson, imageBase64] = await Promise.all([
    readFile('src/core/storage/__fixtures__/v0.1.0-project.json', 'utf-8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-asset.json', 'utf-8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-image-8x8.png.base64.txt', 'utf-8'),
  ]);
  const asset = JSON.parse(assetJson) as {
    id: string;
    textures: Array<{ path: string }>;
    [key: string]: unknown;
  };
  const unreferenced = {
    ...asset,
    id: 'asset_unreferenced_e2e',
    name: 'unreferenced',
    displayName: '未参照',
  };
  const image = Buffer.from(imageBase64.trim(), 'base64');
  const zipped = zipSync({
    'project.json': strToU8(projectJson),
    [`assets/${asset.id}/asset.json`]: strToU8(assetJson),
    [`assets/${asset.id}/${asset.textures[0].path}`]: image,
    [`assets/${asset.id}/orphan.bin`]: new Uint8Array([9]),
    [`assets/${unreferenced.id}/asset.json`]: strToU8(JSON.stringify(unreferenced)),
    [`assets/${unreferenced.id}/${asset.textures[0].path}`]: image,
  });

  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'legacy-extra.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipped),
  });
  const warnings = page.getByRole('status').filter({ hasText: '互換性に関する警告' });
  await expect(warnings).toContainText('Projectから参照されないAsset');
  await expect(warnings).toContainText('未参照Assetのfile');
  await expect(warnings).toContainText('TextureRefから参照されないfile');
  await expect(page.getByRole('button', { name: '「旧形式フィクスチャ」を開く' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
