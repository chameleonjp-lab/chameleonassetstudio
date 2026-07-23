import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

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
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function createBodyPart(page: Page): Promise<void> {
  await page.getByLabel('「main」を複数レイヤー操作の対象にする').check();
  await page.getByRole('button', { name: /パーツを作成/ }).click();
  await expect(page.getByLabel('パーツ一覧')).toBeVisible();
  await expect(page.getByRole('button', { name: '元に戻す' })).toHaveAttribute(
    'title',
    'パーツ作成',
  );
}

interface ExportedAsset {
  layers: Array<{ id: string; name: string }>;
  parts: Array<{ id: string; name: string; layerIds: string[] }>;
  frames?: Array<{
    id: string;
    name: string;
    layerStates: Array<{
      layerId: string;
      transform?: { scale?: { x: number; y: number } };
    }>;
  }>;
  animations: Array<{ name: string }>;
}

async function downloadAssetJson(page: Page): Promise<ExportedAsset> {
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

test('Part差し替えは既存bakeを維持し、次回bakeだけを新しいLayerへ切り替える', async ({ page }) => {
  await setupProjectWithImage(page, 'rig-part-replacement-e2e');
  await page.getByLabel('画像レイヤーを追加').setInputFiles({
    name: 'spare.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await createBodyPart(page);

  await page.getByLabel('モーションテンプレート').selectOption('idle_sway');
  await page.getByRole('button', { name: 'テンプレートを適用' }).click();
  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();

  const first = await downloadAssetJson(page);
  const existingFrames = structuredClone(first.frames ?? []);
  const mainLayerId = first.layers.find((layer) => layer.name === 'main')!.id;
  const spareLayerId = first.layers.find((layer) => layer.name === 'spare')!.id;
  expect(
    existingFrames.flatMap((frame) => frame.layerStates.map((state) => state.layerId)),
  ).toContain(mainLayerId);

  const bodyRow = page.getByRole('listitem', { name: 'パーツ「胴体」' });
  await bodyRow.getByRole('button', { name: '構成レイヤーを変更' }).click();
  await bodyRow.getByRole('checkbox', { name: /main/ }).uncheck();
  await bodyRow.getByRole('checkbox', { name: /spare/ }).check();
  await bodyRow.getByRole('button', { name: '構成レイヤーを確定' }).click();
  await expect(page.getByRole('button', { name: '元に戻す' })).toHaveAttribute(
    'title',
    'パーツ構成レイヤー変更',
  );

  const afterReplacement = await downloadAssetJson(page);
  expect(afterReplacement.frames).toEqual(existingFrames);
  expect(afterReplacement.parts[0].layerIds).toEqual([spareLayerId]);

  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();
  const second = await downloadAssetJson(page);
  const newFrames = second.frames?.slice(existingFrames.length) ?? [];
  expect(newFrames.length).toBeGreaterThan(0);
  expect(newFrames.flatMap((frame) => frame.layerStates.map((state) => state.layerId))).toEqual(
    Array(newFrames.length).fill(spareLayerId),
  );
});

test('H2=L1違反のPartは理由を表示してbakeを拒否する', async ({ page }) => {
  await setupProjectWithImage(page, 'rig-part-l1-refusal-e2e');
  await createBodyPart(page);
  await page.getByLabel('モーションテンプレート').selectOption('idle_sway');
  await page.getByRole('button', { name: 'テンプレートを適用' }).click();
  await expect(page.getByRole('button', { name: '元に戻す' })).toHaveAttribute(
    'title',
    'テンプレート適用',
  );

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '「main」を削除' }).click();
  await page.getByRole('button', { name: 'フレームへ焼き込み' }).click();

  await expect(page.locator('.rig-panel').getByRole('alert')).toContainText(
    '構成レイヤーがありません',
  );
  const data = await downloadAssetJson(page);
  expect(data.frames ?? []).toEqual([]);
});
