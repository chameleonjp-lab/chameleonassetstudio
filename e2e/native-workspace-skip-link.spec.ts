import { expect, test } from '@playwright/test';

test('3D workspace skip link reaches and focuses the main content', async ({ page }) => {
  await page.goto('/3d/');

  const skipLink = page.getByRole('link', { name: '本文へ移動', exact: true });
  const main = page.locator('#editor3d-main');

  await expect(skipLink).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS('top', '0px');
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await expect(skipLink).toHaveCSS('outline-width', '3px');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/3d\/#editor3d-main$/);
  await expect(main).toBeFocused();
  await expect(main).toHaveCSS('outline-style', 'solid');
  await expect(main).toHaveCSS('outline-width', '3px');
});
