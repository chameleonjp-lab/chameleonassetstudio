import { expect, test } from '@playwright/test';

test('トップページが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Chameleon Asset Studio/);
  await expect(page.getByRole('heading', { name: 'Chameleon Asset Studio' })).toBeVisible();
});
