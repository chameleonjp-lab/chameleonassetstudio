import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#3d5a80';
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

test('タイル種別にすると tile 設定を atlas.json に書き出せる', async ({ page }) => {
  await setupProjectWithImage(page, 'tile-e2e');

  await page.getByLabel('アセット種別').selectOption('tile');
  await page.getByRole('button', { name: 'タイル設定を追加' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  const entries = unzipSync(new Uint8Array(bytes));
  const atlas = JSON.parse(Buffer.from(entries['atlas/atlas.json']).toString('utf-8'));

  expect(atlas.tile).toEqual({
    tileSize: { width: 32, height: 32 },
    collisionType: 'solid',
    visualType: 'floor',
  });
});

test('背景種別でパララックスプレビューが表示され、リロードしても保持される', async ({ page }) => {
  await setupProjectWithImage(page, 'background-e2e');

  await page.getByLabel('アセット種別').selectOption('background');
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await page.getByRole('button', { name: '背景設定を追加' }).click();

  const roleSelect = page.getByLabel('役割');
  await roleSelect.selectOption('far');

  await expect(page.getByLabel('背景プレビュー')).toBeVisible();
  await expect(page.getByLabel('カメラ位置')).toBeVisible();

  // 自動保存の完了を待ってからリロードする（リロード後はホーム画面に戻るため開き直す）
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  await page.reload();
  await page.getByRole('button', { name: '「background-e2e」を開く' }).click();
  await expect(page.getByRole('heading', { name: 'background-e2e' })).toBeVisible();
  await expect(page.getByLabel('アセット種別')).toHaveValue('background');
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await expect(page.getByLabel('役割')).toHaveValue('far');
});

test('アイテム種別でテンプレートを適用すると gameAttributes と tags に反映される', async ({
  page,
}) => {
  await setupProjectWithImage(page, 'item-e2e');

  await page.getByLabel('アセット種別').selectOption('item');
  await page.getByRole('button', { name: 'アイテムテンプレートを適用' }).click();

  await expect(page.getByText('score')).toBeVisible();
  await expect(page.getByText('rarity')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf-8');
  const data = JSON.parse(content);

  expect(data.gameAttributes.score).toBe(0);
  expect(data.gameAttributes.rarity).toBe('common');
  expect(data.tags).toContain('item');
});

test('ギミック種別で movementPreset とタグを設定できる', async ({ page }) => {
  await setupProjectWithImage(page, 'gimmick-e2e');

  await page.getByLabel('アセット種別').selectOption('gimmick');
  await page.getByRole('button', { name: 'ギミック設定を追加' }).click();
  await page.getByLabel('移動プリセット').selectOption('horizontal');
  await page.getByRole('button', { name: 'hazard', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf-8');
  const data = JSON.parse(content);

  expect(data.gimmick.movementPreset).toBe('horizontal');
  expect(data.tags).toContain('hazard');
});

test('エフェクト種別で種類を変更すると asset.json に反映される', async ({ page }) => {
  await setupProjectWithImage(page, 'effect-e2e');

  await page.getByLabel('アセット種別').selectOption('effect');
  await page.getByRole('button', { name: 'エフェクト設定を追加' }).click();
  await page.getByLabel('エフェクト種類').selectOption('explosion');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const content = await readFile(path!, 'utf-8');
  const data = JSON.parse(content);

  expect(data.effect.effectType).toBe('explosion');
  expect(data.effect.durationMs).toBe(500);
});
