import { expect, test } from '@playwright/test';

test('ホーム画面が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Chameleon Asset Studio/);
  await expect(page.getByRole('heading', { name: 'Chameleon Asset Studio' })).toBeVisible();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();
});

test('新規プロジェクトを作成して編集画面へ移動できる', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('E2E テスト');
  await page.getByRole('button', { name: '作成' }).click();

  // 編集画面の枠が揃っている
  await expect(page.getByRole('heading', { name: 'E2E テスト' })).toBeVisible();
  await expect(page.getByText('画像をここへドラッグ&ドロップ')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'ツール' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'プロパティ' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'タイムライン' })).toBeVisible();
});

test('プロジェクト名の変更が自動保存される', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('自動保存テスト');
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name: '自動保存テスト' })).toBeVisible();

  const nameInput = page
    .getByRole('complementary', { name: 'プロパティ' })
    .getByLabel('プロジェクト名');
  await nameInput.fill('自動保存テスト（改名）');
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  await page.getByRole('button', { name: '← ホーム' }).click();
  await expect(page.getByText('自動保存テスト（改名）')).toBeVisible();
});

test('再読み込み後もプロジェクトが一覧に残る', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('永続化テスト');
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name: '永続化テスト' })).toBeVisible();
  await page.getByRole('button', { name: '← ホーム' }).click();
  await expect(page.getByText('永続化テスト')).toBeVisible();

  await page.reload();
  await expect(page.getByText('永続化テスト')).toBeVisible();
});

test('プロジェクトを確認付きで削除できる', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('削除テスト');
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name: '削除テスト' })).toBeVisible();
  await page.getByRole('button', { name: '← ホーム' }).click();

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '「削除テスト」を削除' }).click();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();
});

test('スマホ幅で横スクロールが出ない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chameleon Asset Studio' })).toBeVisible();

  const homeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(homeOverflow).toBeLessThanOrEqual(0);

  // 編集画面でも横スクロールが出ず、下部ナビで画面を切り替えられる
  await page.getByLabel('プロジェクト名').fill('スマホテスト');
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByText('画像をここへドラッグ&ドロップ')).toBeVisible();

  const editorOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(editorOverflow).toBeLessThanOrEqual(0);

  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole('button', { name: 'プロパティ' }).click();
  await expect(
    page.getByRole('complementary', { name: 'プロパティ' }).getByLabel('プロジェクト名'),
  ).toBeVisible();
  await mobileNav.getByRole('button', { name: '書き出し' }).click();
  await expect(page.getByText('書き出しは Phase 10 で実装します。')).toBeVisible();
});

test('iPad 幅でキャンバス領域が確保される', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('iPad テスト');
  await page.getByRole('button', { name: '作成' }).click();

  const canvas = page.getByRole('region', { name: 'キャンバス' });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // 左右パネルを開いた状態でも画面幅の半分以上をキャンバスが占める
  expect(box!.width).toBeGreaterThan(820 / 2);
});

test('PC 幅で基本レイアウトが揃い、パネルを折りたためる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('PC テスト');
  await page.getByRole('button', { name: '作成' }).click();

  await expect(page.getByRole('navigation', { name: 'ツール' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'プロパティ' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'タイムライン' })).toBeVisible();

  // 折りたたみ
  await page.getByRole('button', { name: 'ツール', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'ツール' })).toBeHidden();
  await page.getByRole('button', { name: 'ツール', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'ツール' })).toBeVisible();
});
