import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('Rich output controls');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  // Structural History flushes asynchronously after the new asset first appears.
  // Finish setup before the cancellation test replaces the global flush boundary.
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  const panel = page.getByRole('region', { name: '新版配布用ZIP', exact: true });
  await expect(panel.getByRole('button', { name: '新版配布用ZIPをダウンロード' })).toBeEnabled();
  return panel;
}

test('新版設定は明示保存後の再表示で復元し、旧出力も残す', async ({ page }) => {
  const panel = await setup(page);
  await expect(panel.getByLabel('新版配布の利用先')).toHaveValue('canvas2d');
  await panel.getByLabel('新版配布の利用先').selectOption('phaser');
  await panel.getByLabel('新版配布画像の配置').selectOption('packed');
  await panel.getByLabel('新版配布画像の倍率').selectOption('3');
  await panel.getByLabel('新版配布画像間の余白').fill('7');
  await panel.getByRole('button', { name: '出力設定を保存', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('出力設定を保存しました');
  // Navigating away and reopening remounts the output controls and reads stored settings.
  await page.reload();
  await page.getByRole('button', { name: '「Rich output controls」を開く' }).click();
  await expect(panel.getByLabel('新版配布の利用先')).toHaveValue('phaser');
  await expect(panel.getByLabel('新版配布画像の配置')).toHaveValue('packed');
  await expect(panel.getByLabel('新版配布画像の倍率')).toHaveValue('3');
  await expect(panel.getByLabel('新版配布画像間の余白')).toHaveValue('7');
  await expect(page.getByRole('region', { name: '配布用ZIP', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ZIP をダウンロード', exact: true })).toBeVisible();
});

for (const action of ['cancel', 'selection'] as const) {
  test(`新版出力の${action}と連打で遅れてダウンロードしない`, async ({ page }) => {
    const panel = await setup(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.evaluate(async () => {
      const path = '/src/core/storage/index.ts';
      const { AutosaveQueue } = await import(path);
      const original = AutosaveQueue.flushAll;
      const state = window as typeof window & {
        releaseRichExport?: () => void;
        richFlushCount?: number;
      };
      state.richFlushCount = 0;
      AutosaveQueue.flushAll = () => {
        state.richFlushCount! += 1;
        return new Promise<void>((resolve) => {
          state.releaseRichExport = () => {
            AutosaveQueue.flushAll = original;
            resolve();
          };
        });
      };
    });
    await panel.getByRole('button', { name: '新版配布用ZIPをダウンロード' }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(panel.getByRole('button', { name: '新版配布出力を取り消す' })).toBeVisible();
    if (action === 'cancel') {
      await panel.getByRole('button', { name: '新版配布出力を取り消す' }).click();
    } else {
      await panel.getByRole('checkbox').first().uncheck();
    }
    await page.evaluate(() => {
      (window as typeof window & { releaseRichExport?: () => void }).releaseRichExport?.();
    });
    await expect(panel.getByRole('button', { name: '新版配布出力を取り消す' })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as typeof window & { richFlushCount?: number }).richFlushCount,
      ),
    ).toBe(1);
    expect(downloads).toEqual([]);
    await expect(panel.getByRole('status')).toContainText('出力を取り消しました');
  });
}
