import { expect, test, type Page } from '@playwright/test';
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

test('スマホ横（667x375）で横スクロールが出ず、下部ナビが表示される', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await setupProjectWithImage(page, 'スマホ横テスト');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await expect(page.getByRole('navigation', { name: '画面切り替え' })).toBeVisible();
});

test('スマホ縦で全編集ツールを選べ、選択中ツールの効果を確認できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'スマホ編集ツールテスト');

  const toolbar = page.getByRole('navigation', { name: '編集ツール' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button')).toHaveCount(15);
  await expect(page.getByRole('link', { name: '？ 操作ガイド' })).toHaveAttribute(
    'href',
    '/guide/features/',
  );

  const eraserButton = toolbar.getByRole('button', { name: '消しゴム', exact: true });
  await eraserButton.click();
  await expect(eraserButton).toHaveAttribute('aria-pressed', 'true');

  const help = page.locator('#active-tool-help');
  await expect(help).toContainText('現在：消しゴム');
  await expect(help).toContainText('できること：');
  await expect(help).toContainText('操作：');
  await expect(help).toContainText('変化と戻し方：');
  await expect(help.getByRole('link', { name: '図で詳しく見る' })).toHaveAttribute(
    'href',
    '/guide/features/#tool-eraser',
  );

  const box = await eraserButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('スマホのプロパティ画面で目的の設定へ移動できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'スマホプロパティ案内テスト');

  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: 'プロパティ' })
    .click();

  const menu = page.getByRole('navigation', { name: 'プロパティ内メニュー' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link')).toHaveCount(5);
  await expect(menu.getByRole('link', { name: '画像編集' })).toHaveAttribute(
    'href',
    '#property-image',
  );
});

test('スマホ縦（375x667）で下部ナビから書き出し画面へ到達できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'スマホ縦書き出しテスト');

  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' })
    .click();

  await expect(page.getByRole('button', { name: 'PNG をダウンロード' })).toBeVisible();
});

test('スマホ縦でプロジェクト名入力のフォントが 16px 以上（iOS ズーム防止）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const input = page.getByLabel('プロジェクト名');
  await expect(input).toBeVisible();
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test('iPad 幅（768x1024）で取り込み・レイヤー操作・書き出しの主要編集ができる', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await setupProjectWithImage(page, 'iPad主要編集テスト');

  // レイヤーパネルからレイヤーを選択し、名前を変更できる
  await page.getByRole('button', { name: 'main', exact: true }).click();
  const layerNameInput = page.getByLabel('レイヤー名', { exact: true });
  await expect(layerNameInput).toBeVisible();
  await layerNameInput.fill('ipad-layer');
  await layerNameInput.blur();

  // 書き出しパネルへ到達できる（iPad ではタイムライン下に常時表示）
  await expect(page.getByRole('button', { name: 'PNG をダウンロード' })).toBeVisible();
});

test('スマホ縦で下部ナビの主要ボタンのタップ対象が十分な高さを持つ', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'タップ対象テスト');

  const exportButton = page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' });
  const box = await exportButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(40);
});
