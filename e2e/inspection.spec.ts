import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * ゲームデータ検査パネル（2D-3-GAMEDATA-01）の E2E。
 *
 * `<section aria-label="ゲームデータ検査">` はアクセシブル名を持つため role="region" として
 * 露出する。座標依存を避けるため、当たり判定の追加・「対象を選択」ボタンの押下は role / name /
 * DOM 状態だけで検証する。アンカー追加だけはキャンバス上のクリックが必要（既存
 * e2e/gamedata.spec.ts と同じ、中央 1 クリックのみでドラッグは行わない）。
 */

/**
 * character の新規アセットを作成し（2D-2-CREATE-01 の「新規アセットを作成」フォーム）、
 * 「ゲームデータ検査」region を返す。character には starter の body 矩形当たり判定が
 * 自動で 1 件付くため collider.characterBodyMissing の info は出ないが、anchors は空の
 * ままなので anchor.characterAnchorsEmpty の info が出る。
 */
async function setupCharacterAsset(
  page: Page,
  projectName: string,
  assetName = '主人公',
): Promise<{ properties: Locator; canvas: Locator; inspection: Locator }> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(projectName);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  const properties = page.getByRole('complementary', { name: 'プロパティ' });
  await properties.getByLabel('新規アセット名').fill(assetName);
  await properties.getByLabel('新規アセットの種別').selectOption('character');
  await properties.getByLabel('新規アセットのサイズ').selectOption('64');
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();

  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();

  const inspection = page.getByRole('region', { name: 'ゲームデータ検査' });
  return { properties, canvas, inspection };
}

test('character の新規アセットは anchors 空の info 所見を示し、アンカーを追加すると消える', async ({
  page,
}) => {
  const { inspection, canvas } = await setupCharacterAsset(page, '検査アンカーテスト');

  // starter の body 判定が自動で付くため collider.characterBodyMissing は出ないが、
  // anchors は空のままなので anchor.characterAnchorsEmpty の info 所見が 1 件だけ出る。
  await expect(inspection.getByText('情報 1', { exact: true })).toBeVisible();
  const anchorEmptyItem = inspection
    .getByRole('listitem')
    .filter({ hasText: 'アンカーが 1 つもありません' });
  await expect(anchorEmptyItem).toHaveCount(1);
  await expect(anchorEmptyItem.getByText('情報', { exact: true })).toBeVisible();
  // target を持たない所見なので「対象を選択」ボタンは出ない
  await expect(anchorEmptyItem.getByRole('button', { name: '対象を選択' })).toHaveCount(0);

  // アンカーツールでキャンバス中央に 1 つ追加すると、anchors 空の info は消える
  await page
    .getByRole('navigation', { name: 'ツール' })
    .getByRole('button', { name: 'アンカー' })
    .click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const anchorList = page.getByRole('list', { name: 'アンカー一覧' });
  await expect(anchorList.getByRole('listitem')).toHaveCount(1);
  await expect(anchorEmptyItem).toHaveCount(0);
  await expect(inspection.getByText('問題は見つかりませんでした。', { exact: true })).toBeVisible();
});

test('当たり判定の名前重複 warning が表示され、「対象を選択」で GameDataPanel の選択と同期する', async ({
  page,
}) => {
  const { inspection } = await setupCharacterAsset(page, '検査判定重複テスト');

  // starter の body 矩形判定（1 件）に加えて、既定名が両方 body になる矩形判定をさらに 2 件追加する
  const addRectButton = page.getByRole('button', { name: '矩形判定を追加' });
  await addRectButton.click();
  await addRectButton.click();

  const colliderList = page.getByRole('list', { name: '当たり判定一覧' });
  const colliderItems = colliderList.getByRole('listitem');
  await expect(colliderItems).toHaveCount(3);

  // 3 件とも名前が「body」のまま重複するため、名前重複の warning 所見が出る
  const duplicateItem = inspection
    .getByRole('listitem')
    .filter({ hasText: '当たり判定の名前「body」が' });
  await expect(duplicateItem).toHaveCount(1);
  await expect(duplicateItem.getByText('警告', { exact: true })).toBeVisible();

  // 「対象を選択」ボタンを押すと、対象（最初に追加された starter の body 判定）が
  // GameDataPanel 側でも選択状態（aria-pressed="true"）になる（検査パネル→GameDataPanel の選択同期）
  await duplicateItem.getByRole('button', { name: '対象を選択' }).click();
  const starterSelectButton = colliderItems
    .first()
    .getByRole('button', { name: '判定「body」を選択' });
  await expect(starterSelectButton).toHaveAttribute('aria-pressed', 'true');
  // 選択状態の判定は一覧内で一意（他の同名 body 判定は選択されない）
  await expect(page.locator('.gamedata-select-button[aria-pressed="true"]')).toHaveCount(1);
});
