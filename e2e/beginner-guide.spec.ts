import { expect, test } from '@playwright/test';

test('初心者向けビジュアルガイドを開ける', async ({ page }) => {
  await page.goto('/guide/');

  await expect(page).toHaveTitle('はじめての使い方 | Chameleon Asset Studio');
  await expect(page.getByRole('heading', { name: /まずは画像1枚.*5ステップ.*完成/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '最初の1作品を作る' })).toBeVisible();
  await expect(page.getByRole('link', { name: '今すぐサービスを開く' })).toHaveAttribute(
    'href',
    '../',
  );
  await expect(page.getByRole('link', { name: '詳しいガイドを読む' })).toHaveAttribute(
    'href',
    /docs\/USER_GUIDE\.md$/,
  );
});

test('ホーム画面から初心者向けガイドを開ける', async ({ page }) => {
  await page.goto('/');

  const guideLink = page.getByRole('link', {
    name: '初心者向けの図で分かる使い方を開く',
  });
  await expect(guideLink).toBeVisible();
  await expect(guideLink).toHaveAttribute('href', '/guide/');
});

test('初心者向けビジュアルガイドはスマホ幅で横スクロールしない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/guide/');

  await expect(page.getByRole('heading', { name: '画面下の4つだけ、先に覚える' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
