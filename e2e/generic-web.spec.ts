import { expect, test } from '@playwright/test';

test('Generic Web fixtureはHTTP経由でpackageとCanvasを確認できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/generic-web-fixture/');
  await expect(page.getByRole('heading', { name: 'Generic Web fixture' })).toBeVisible();
  await expect(page.locator('#status')).toContainText('読み込み成功');
  await expect(page.locator('canvas')).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
