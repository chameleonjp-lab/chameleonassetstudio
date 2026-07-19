import { expect, test, type Locator, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c0392b';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'sprite.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
  return canvas;
}

async function clickCanvasCenter(page: Page, canvas: Locator): Promise<void> {
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('ズーム倍率を切り替えられ、倍率が表示される', async ({ page }) => {
  await setupProjectWithImage(page, 'ズームテスト');

  // 取り込み直後は fit 表示。プリセットへ切り替えると表示が変わる
  await expect(page.getByText(/^ズーム \d+%$/)).toBeVisible();
  await page.getByRole('button', { name: '200%' }).click();
  await expect(page.getByText('ズーム 200%')).toBeVisible();
  await page.getByRole('button', { name: '25%' }).click();
  await expect(page.getByText('ズーム 25%')).toBeVisible();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.getByText('ズーム 100%')).toBeVisible();
  await page.getByRole('button', { name: '全体表示' }).click();
  await expect(page.getByText(/^ズーム \d+%$/)).toBeVisible();
});

test('レイヤーを選択して数値入力で移動し、Undo / Redo できる', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, '数値編集テスト');

  await clickCanvasCenter(page, canvas);
  const xInput = page.getByLabel('X', { exact: true });
  await expect(xInput).toBeVisible();
  await expect(xInput).toHaveValue('0');

  await xInput.fill('40');
  await xInput.blur();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(xInput).toHaveValue('0');
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(xInput).toHaveValue('40');
});

test('ドラッグでレイヤーを移動でき、Ctrl+Z で戻せる', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, 'ドラッグテスト');

  await clickCanvasCenter(page, canvas);
  const xInput = page.getByLabel('X', { exact: true });
  await expect(xInput).toHaveValue('0');

  const box = (await canvas.boundingBox())!;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 60, centerY + 30, { steps: 5 });
  await page.mouse.up();

  await expect(xInput).not.toHaveValue('0');
  const yInput = page.getByLabel('Y', { exact: true });
  await expect(yInput).not.toHaveValue('0');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(xInput).toHaveValue('0');
  await expect(yInput).toHaveValue('0');
});

test('パンツールで表示位置を動かしても保存データは変わらない', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, 'パンテスト');

  await page
    .getByRole('navigation', { name: 'ツール' })
    .getByRole('button', { name: 'パン' })
    .click();
  const box = (await canvas.boundingBox())!;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 40, { steps: 4 });
  await page.mouse.up();

  // パンでは選択もレイヤー移動も起こらない
  await expect(
    page.getByText('キャンバス上のレイヤーをクリックすると選択できます。'),
  ).toBeVisible();
  // 選択ツールへ戻してレイヤーを選ぶと位置は 0 のまま
  await page
    .getByRole('navigation', { name: 'ツール' })
    .getByRole('button', { name: '選択' })
    .click();
  await clickCanvasCenter(page, canvas);
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('0');
});

test('スマホ幅でもキャンバス編集画面が破綻しない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'スマホキャンバス');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByText(/^ズーム \d+%$/)).toBeVisible();
});

test('グリッド表示とスナップを切り替えてもキャンバスが破綻しない', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, 'グリッドスナップ');

  await page.getByLabel('グリッド表示').check();
  await expect(canvas).toBeVisible();

  await page.getByLabel('グリッドサイズ').selectOption('32');
  await expect(canvas).toBeVisible();

  await page.getByLabel('スナップ').check();
  await expect(canvas).toBeVisible();
});

test('スナップ ON でレイヤー数値移動と原点入力がグリッドに揃い、OFF では自由移動できる', async ({
  page,
}) => {
  const canvas = await setupProjectWithImage(page, 'スナップ移動テスト');
  await clickCanvasCenter(page, canvas);

  await page.getByLabel('グリッド表示').check();
  await page.getByLabel('グリッドサイズ').selectOption('16');
  await page.getByLabel('スナップ').check();

  const layerX = page.getByLabel('X', { exact: true });
  await layerX.fill('23');
  await layerX.blur();
  await expect(layerX).toHaveValue('16');

  const originX = page.getByLabel('原点 X');
  await originX.fill('23');
  await originX.blur();
  await expect(originX).toHaveValue('16');

  await page.getByLabel('スナップ').uncheck();
  await layerX.fill('23');
  await layerX.blur();
  await expect(layerX).toHaveValue('23');
});
