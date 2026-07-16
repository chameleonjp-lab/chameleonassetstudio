import { expect, test } from '@playwright/test';

test('tile inspector reports missing required settings and updates after manual correction', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('素材検査テスト');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '素材検査テスト' })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill('床タイル');
  await properties.getByLabel('新規アセットの種別').selectOption('tile');
  await properties.getByLabel('新規アセットのサイズ').selectOption('64');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  const inspection = properties.getByRole('region', { name: '素材検査' });
  await expect(inspection).toBeVisible();
  await expect(inspection.getByText('必須確認 1件 / 推奨確認 0件 / 情報 0件')).toBeVisible();
  await expect(inspection.getByText('タイル設定がありません。')).toBeVisible();
  await expect(inspection.getByText('tile.settingsMissing')).toBeVisible();

  await properties.getByRole('button', { name: 'タイル設定を追加' }).click();

  await expect(inspection.getByText('タイル設定がありません。')).toHaveCount(0);
  await expect(inspection.getByText('問題は見つかりませんでした。')).toBeVisible();
  await expect(inspection.getByText('必須確認 0件 / 推奨確認 0件 / 情報 0件')).toBeVisible();
});
