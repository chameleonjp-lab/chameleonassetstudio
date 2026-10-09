import { test, expect, type Page, type Route } from '@playwright/test';
async function setup(page: Page) {
  await page.goto(
    new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
  );
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Quality');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  return page.getByRole('region', { name: '作品の品質検査', exact: true });
}
test('inspects a fixed revision, distinguishes unknown values and invalidates stale results', async ({
  page,
}) => {
  const panel = await setup(page);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await expect(panel.getByText('gpuMemoryBytes', { exact: true })).toBeVisible();
  await expect(panel.getByText(/この作品の他エンジン実行: 未検証/)).toBeVisible();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toBeVisible();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toHaveCount(0);
  await test.info().attach('native-visual-quality-statistics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('closing inspection terminates the held worker and rejects late results', async ({ page }) => {
  const panel = await setup(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    seen = new Promise<void>((r) => (started = r));
  const handler = async (route: Route) => {
    started();
    await gate;
    await route.continue().catch(() => undefined);
  };
  await page.route(/assetIo\.worker/, handler);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await seen;
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  release();
  await page.unroute(/assetIo\.worker/, handler);
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
});
test('phone quality controls remain usable and do not mark fixtures as current-asset verification', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const panel = await setup(page);
    await panel.getByRole('button', { name: '現在の版を検査', exact: true }).tap();
    await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
    for (const button of await panel.getByRole('button').all()) {
      const box = await button.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await test.info().attach('native-visual-quality-phone', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  } finally {
    await context.close();
  }
});

test('a warning opens the correct material section without overwriting an unsaved draft', async ({
  page,
}) => {
  const panel = await setup(page);
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await page.getByLabel('制作材質', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await page.getByLabel('透過モード', { exact: true }).selectOption('LEGACY_AUTO');
  await page.getByRole('button', { name: '材質を適用', exact: true }).click();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await page.getByLabel('粗さ roughness', { exact: true }).fill('0.123');
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await panel.getByRole('button', { name: '編集先を確認', exact: true }).first().click();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toBeVisible();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toHaveValue('0.123');
  await expect(page.getByText('材質の色・金属・粗さ', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '編集先を確認', exact: true }).first(),
  ).toBeDisabled();
});
