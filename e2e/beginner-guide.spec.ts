import { expect, test } from '@playwright/test';

test('初心者向けビジュアルガイドを開ける', async ({ page }) => {
  await page.goto('/guide/index.html');

  await expect(page).toHaveTitle('はじめての使い方 | Chameleon Asset Studio');
  await expect(page.getByRole('heading', { name: /まずは画像1枚.*5ステップ.*完成/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '最初の1作品を作る' })).toBeVisible();
  await expect(page.getByRole('link', { name: '今すぐサービスを開く' })).toHaveAttribute(
    'href',
    '../',
  );
  await expect(page.getByRole('link', { name: '各ボタンの説明を見る' })).toHaveAttribute(
    'href',
    'features/',
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
  await page.goto('/guide/index.html');

  await expect(page.getByRole('heading', { name: '画面下の5つだけ、先に覚える' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('機能別・操作図鑑はボタン名で検索でき、URLから対象カードを開ける', async ({ page }) => {
  await page.goto('/guide/features/index.html#tool-eraser');

  await expect(page).toHaveTitle('機能別・操作図鑑 | Chameleon Asset Studio');
  await expect(page.getByRole('heading', { name: /押す前に.*何が変わるか分かる/ })).toBeVisible();

  const eraser = page.locator('#tool-eraser');
  await expect(eraser).toHaveAttribute('open', '');
  await expect(eraser).toContainText('消したい場所を指でなぞります');

  await page.getByLabel('機能を検索').fill('.casproj');
  await expect(page.locator('.feature-card[data-search*="casproj"]')).toHaveCount(2);
  await expect(page.locator('.feature-card[data-search*="casproj"]').first()).toBeVisible();
  await expect(page.locator('#tool-eraser')).toBeHidden();
});

test('機能別・操作図鑑はスマホ幅で横スクロールしない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/guide/features/index.html');

  await expect(page.getByRole('heading', { name: 'ボタン名から機能を探す' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
