import { expect, test, type Page } from '@playwright/test';

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

test('PNG を取り込むと表示され、透明部分が保持される', async ({ page }) => {
  await createProject(page, '画像取り込み');
  const buffer = await makePngBuffer(page);

  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer });

  const preview = page.getByRole('img', { name: 'hero' });
  await expect(preview).toBeVisible();

  // 右半分（透明で描いた領域）のアルファが 0 のまま維持されている
  const alpha = await preview.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0);
    return context.getImageData(img.naturalWidth - 4, 4, 1, 1).data[3];
  });
  expect(alpha).toBe(0);

  // アセット一覧にも出る
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByRole('button', { name: 'hero' }),
  ).toBeVisible();
});

test('再読み込み後も取り込んだ画像が残る', async ({ page }) => {
  await createProject(page, '画像永続化');
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'keeper.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('img', { name: 'keeper' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '「画像永続化」を開く' }).click();
  await expect(page.getByRole('img', { name: 'keeper' })).toBeVisible();
});

test('JPG と WebP も取り込める', async ({ page }) => {
  await createProject(page, '形式テスト');

  const jpegBuffer = await makeImageBuffer(page, 'image/jpeg');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpegBuffer });
  await expect(page.getByRole('img', { name: 'photo' })).toBeVisible();

  const webpBuffer = await makeImageBuffer(page, 'image/webp');
  await page
    .getByLabel('画像を追加')
    .setInputFiles({ name: 'sticker.webp', mimeType: 'image/webp', buffer: webpBuffer });
  await expect(page.getByRole('img', { name: 'sticker' })).toBeVisible();

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
