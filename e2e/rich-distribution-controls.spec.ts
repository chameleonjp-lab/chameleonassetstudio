import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { useVerifiedEngineCache } from './engineTestHelpers';

test('公開用の確認素材から全倍率・全engineの実ZIP見本を直接開ける', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await useVerifiedEngineCache(page, 'pixi');
  await useVerifiedEngineCache(page, 'phaser');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/release-fixtures/index.html');
  await expect(page.getByRole('heading', { name: '配布素材の確認' })).toBeVisible();
  await expect(page.getByRole('link')).toHaveCount(16);
  for (const link of await page.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ),
  ).toBeLessThanOrEqual(320);
  for (const scale of [1, 2, 3]) {
    for (const engine of ['canvas2d', 'pixijs', 'phaser']) {
      await page.goto(`/release-fixtures/r05-${scale}x/examples/${engine}.html`);
      await expect(page.locator('#status')).toHaveText('読み込み成功: 1. rich_engine');
      await expect(page.getByRole('combobox', { name: '素材' }).locator('option')).toHaveText([
        '1. rich_engine',
        '2. rich_engine',
      ]);
      await expect(page.locator('#stage canvas')).toBeVisible();
      await page.getByRole('combobox', { name: '素材' }).selectOption('1');
      await expect(page.locator('#status')).toHaveText('読み込み成功: 2. rich_engine');
      await expect(page.locator('#stage canvas')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('Rich output controls');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Rich output controls', exact: true }),
  ).toBeVisible();
  const nav = page.getByRole('navigation', { name: '画面切り替え' });
  if (await nav.isVisible()) await nav.getByRole('button', { name: 'プロパティ' }).click();
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  // Structural History flushes asynchronously after the new asset first appears.
  // Finish setup before the cancellation test replaces the global flush boundary.
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  if (await nav.isVisible()) await nav.getByRole('button', { name: '書き出し' }).click();
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

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]) {
  test(`新版出力の設定と保存に${viewport.width}×${viewport.height}・文字拡大で到達できる`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const panel = await setup(page);
    const legacy = page.getByRole('region', { name: '配布用ZIP', exact: true });
    const inputs = panel
      .locator('select, input:not([type="checkbox"])')
      .or(legacy.locator('select, input:not([type="checkbox"])'));
    for (const input of await inputs.all()) {
      expect(
        await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    }
    await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
    const controls = panel
      .locator('select, input:not([type="checkbox"]), button')
      .or(legacy.locator('select, input:not([type="checkbox"])'));
    expect(
      await controls.evaluateAll((elements) =>
        elements.map((element) => ({
          label: element.getAttribute('aria-label') ?? element.textContent,
          height: element.getBoundingClientRect().height,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
        })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '新版配布の利用先' }),
        expect.objectContaining({ label: '出力設定を保存' }),
      ]),
    );
    for (const control of await controls.all()) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(
        await control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      ).toBe(true);
    }
    for (const input of await inputs.all()) {
      expect(
        await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    }
    const checkbox = panel.getByRole('checkbox').first();
    const label = checkbox.locator('..');
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkbox.uncheck();
    await expect(panel.getByRole('button', { name: '新版配布用ZIPをダウンロード' })).toBeDisabled();
    await checkbox.check();
    await panel.getByLabel('新版配布の利用先').selectOption('phaser');
    await panel.getByLabel('新版配布画像の倍率').selectOption('3');
    await panel.getByRole('button', { name: '出力設定を保存', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('出力設定を保存しました');
    expect(
      await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      ),
    ).toBeLessThanOrEqual(viewport.width);
  });
}

test('新版設定を含む画面のバックアップを別ブラウザへ取り込んで復元できる', async ({
  page,
  browser,
}) => {
  const panel = await setup(page);
  const frames = page.getByRole('list', { name: 'フレーム一覧' }).getByRole('listitem');
  await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
  await expect(frames).toHaveCount(1);
  await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
  await expect(frames).toHaveCount(2);
  await panel.getByLabel('新版配布の利用先').selectOption('pixijs');
  await panel.getByLabel('新版配布画像の配置').selectOption('packed');
  await panel.getByLabel('新版配布画像の倍率').selectOption('2');
  await panel.getByLabel('新版配布画像間の余白').fill('5');
  await panel.getByRole('button', { name: '出力設定を保存', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('出力設定を保存しました');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click(),
  ]);
  const bytes = await readFile((await download.path())!);
  const context = await browser.newContext();
  try {
    const restored = await context.newPage();
    await restored.goto(new URL('/', page.url()).href);
    await restored.getByLabel('.casproj を読み込む').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: bytes,
    });
    await restored.getByRole('button', { name: '「Rich output controls」を開く' }).click();
    const restoredPanel = restored.getByRole('region', { name: '新版配布用ZIP', exact: true });
    await expect(restoredPanel.getByLabel('新版配布の利用先')).toHaveValue('pixijs');
    await expect(restoredPanel.getByLabel('新版配布画像の配置')).toHaveValue('packed');
    await expect(restoredPanel.getByLabel('新版配布画像の倍率')).toHaveValue('2');
    await expect(restoredPanel.getByLabel('新版配布画像間の余白')).toHaveValue('5');
    const [output] = await Promise.all([
      restored.waitForEvent('download'),
      restoredPanel.getByRole('button', { name: '新版配布用ZIPをダウンロード' }).click(),
    ]);
    expect(output.suggestedFilename()).toBe('chameleon-distribution-0.2.zip');
    const entries = unzipSync(await readFile((await output.path())!));
    const pkg = JSON.parse(new TextDecoder().decode(entries['package-manifest.json']));
    expect(pkg).toMatchObject({ format: 'chameleon-package', version: '0.2.0', target: 'pixijs' });
    expect(pkg.assets).toHaveLength(1);
    const manifest = JSON.parse(new TextDecoder().decode(entries[pkg.assets[0].manifest]));
    expect(manifest).toMatchObject({ scale: 2, profile: 'packed' });
    expect(manifest.frames).toHaveLength(2);
    const [left, right] = manifest.frames;
    expect(right.page).toBe(left.page);
    expect(right.rect.y).toBe(left.rect.y);
    expect(right.rect.x - left.rect.x - left.rect.width).toBe(5);
    await expect(panel.getByLabel('新版配布の利用先')).toHaveValue('pixijs');
  } finally {
    await context.close();
  }
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
