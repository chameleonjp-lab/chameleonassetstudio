import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#27ae60';
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

async function createBodyPart(page: Page): Promise<void> {
  await page.getByLabel('「main」を複数レイヤー操作の対象にする').check();
  await page.getByRole('button', { name: /パーツを作成/ }).click();
  await expect(page.getByLabel('パーツ一覧')).toBeVisible();
}

async function downloadAssetJson(page: Page): Promise<{
  frames?: unknown[];
  animations: Array<{ name: string }>;
}> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf-8'));
}

test('リグを作りキーフレームを焼き込むとフレームアニメーションになる', async ({ page }) => {
  await setupProjectWithImage(page, 'rig-bake-e2e');
  await createBodyPart(page);

  await page.getByRole('button', { name: 'リグを作成' }).click();
  await page.getByRole('button', { name: 'キーフレーム追加' }).click();
  await page.getByLabel('キーフレーム時刻').fill('1');
  await page.getByRole('button', { name: 'キーフレーム追加' }).click();

  // 1 つ目のキーフレームに body パーツのポーズを追加する
  await page.getByLabel('ポーズ対象パーツ').first().selectOption({ label: '胴体' });
  await page.getByRole('button', { name: 'ポーズ追加' }).first().click();

  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();

  const data = await downloadAssetJson(page);
  expect((data.frames ?? []).length).toBeGreaterThanOrEqual(2);
  expect(data.animations.length).toBeGreaterThanOrEqual(1);
});

test('モーションテンプレートを適用して焼き込める', async ({ page }) => {
  await setupProjectWithImage(page, 'rig-template-e2e');
  await createBodyPart(page);

  await page.getByLabel('モーションテンプレート').selectOption('idle_sway');
  await page.getByRole('button', { name: 'テンプレートを適用' }).click();
  await expect(page.getByLabel('リグ', { exact: true })).toHaveValue(/rig_/);

  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();

  const data = await downloadAssetJson(page);
  expect(data.animations.map((animation) => animation.name)).toContain('idle_sway');
});

test('jump_squash の scale を手動調整して焼き込むと frame に反映される', async ({ page }) => {
  await setupProjectWithImage(page, 'rig-scale-e2e');
  await createBodyPart(page);

  await page.getByLabel('モーションテンプレート').selectOption('jump_squash');
  await page.getByRole('button', { name: 'テンプレートを適用' }).click();

  // squash キーフレームの拡大 X を手動調整する（Phase 15.5-D）
  await page.getByLabel('「胴体」のポーズ拡大X').nth(1).fill('1.3');
  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();

  const data = await downloadAssetJson(page);
  const frames = (data.frames ?? []) as Array<{
    layerStates: Array<{ transform?: { scale?: { x: number; y: number } } }>;
  }>;
  expect(frames.length).toBeGreaterThanOrEqual(2);
  const scaleXs = frames.flatMap((frame) =>
    frame.layerStates.map((state) => state.transform?.scale?.x ?? 1),
  );
  expect(scaleXs.some((x) => Math.abs(x - 1) > 0.05)).toBe(true);
});
