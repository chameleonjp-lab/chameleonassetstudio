import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

test.use({ trace: 'retain-on-failure' });

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('Revision workflow');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revision workflow', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: '画面切り替え' });
  if (await nav.isVisible()) await nav.getByRole('button', { name: 'プロパティ' }).click();
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  if (await nav.isVisible()) await nav.getByRole('button', { name: '書き出し' }).click();
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  return page.getByRole('dialog', { name: '修正と受渡し', exact: true });
}
async function downloadBytes(page: Page, click: () => Promise<unknown>) {
  const pending = page.waitForEvent('download');
  await click();
  const download = await pending;
  return readFile((await download.path())!);
}
async function projectCount(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/core/storage/projectStore.ts';
    return (await (await import(path)).listProjects()).length;
  });
}
test('前版を変更せず参照し、編集・再比較・実ZIP・backupまでつなぐ', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await setup(page);
  await panel.getByRole('button', { name: '編集・書き出しへ戻る' }).click();
  const baseline = await downloadBytes(page, () =>
    page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click(),
  );
  const originalCount = await projectCount(page);
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  await panel
    .getByLabel('比較する前回のcasproj')
    .setInputFiles({ name: 'previous.casproj', mimeType: 'application/zip', buffer: baseline });
  await expect(panel.getByRole('status')).toContainText('保存中のプロジェクトは変更していません');
  expect(await projectCount(page)).toBe(originalCount);
  await panel.getByRole('button', { name: '現在の制作内容と比較', exact: true }).click();
  await expect(panel.getByLabel('制作差分の件数')).toContainText('変更なし 1件');
  await panel.getByLabel('変更または必須確認がある素材だけ表示').uncheck();
  await panel.getByRole('button', { name: /を編集$/ }).click();
  await page
    .getByRole('navigation', { name: 'プロパティ内メニュー' })
    .getByRole('link', { name: 'ゲーム情報', exact: true })
    .click();
  await page.getByLabel('原点 X', { exact: true }).fill('7');
  await page.getByLabel('原点 X', { exact: true }).press('Enter');
  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: '書き出し' })
    .click();
  await expect(
    page
      .getByRole('navigation', { name: '画面切り替え' })
      .getByRole('button', { name: '書き出し' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  await expect(
    panel.getByText(
      '制作内容が変わったため、以下は以前の比較結果です。現在の制作内容と比較し直してください。',
    ),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: '比較記録を保存' })).toBeDisabled();
  await panel.getByRole('button', { name: '現在の制作内容と比較', exact: true }).click();
  await expect(panel.getByLabel('制作差分の件数')).toContainText('変更 1件');
  await expect(panel.getByText(/変更:.*原点/)).toBeVisible();
  const report = JSON.parse(
    (
      await downloadBytes(page, () => panel.getByRole('button', { name: '比較記録を保存' }).click())
    ).toString(),
  );
  expect(report.assets[0].fields).toContain('origin');
  expect(report.baselineArchiveSha256).toMatch(/^[a-f0-9]{64}$/);
  await panel.getByRole('button', { name: '編集・書き出しへ戻る' }).click();
  const rich = page.getByRole('region', { name: '新版配布用ZIP', exact: true });
  const zip = unzipSync(
    await downloadBytes(page, () =>
      rich.getByRole('button', { name: '新版配布用ZIPをダウンロード' }).click(),
    ),
  );
  const assetPath = Object.keys(zip).find((path) => path.endsWith('/asset.json'))!;
  expect(JSON.parse(new TextDecoder().decode(zip[assetPath])).origin.x).toBe(7);
  const revised = unzipSync(
    await downloadBytes(page, () =>
      page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click(),
    ),
  );
  const before = unzipSync(baseline);
  const backupAssetPath = Object.keys(revised).find((path) => path.endsWith('/asset.json'))!;
  expect(JSON.parse(new TextDecoder().decode(revised[backupAssetPath])).origin.x).toBe(7);
  expect(JSON.parse(new TextDecoder().decode(before[backupAssetPath])).origin.x).not.toBe(7);
  expect(await projectCount(page)).toBe(originalCount);
});

test('取消・連打・不正参照で古い結果を上書きせず、320pxで再操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const panel = await setup(page);
  await panel.getByRole('button', { name: '現在を比較基準にする' }).click();
  await expect(panel.getByRole('status')).toContainText('現在の保存内容を比較基準にしました');
  await panel.getByLabel('比較する前回のcasproj').setInputFiles({
    name: 'bad.casproj',
    mimeType: 'application/zip',
    buffer: Buffer.from('not zip'),
  });
  await expect(panel.getByRole('alert')).toContainText('比較できませんでした');
  await page.evaluate(async () => {
    const path = '/src/core/storage/autosave.ts';
    const { AutosaveQueue } = await import(path);
    const original = AutosaveQueue.flushAll;
    const state = window as typeof window & { releaseReview?: () => void; reviewFlushes?: number };
    state.reviewFlushes = 0;
    AutosaveQueue.flushAll = () => {
      state.reviewFlushes! += 1;
      return new Promise<void>((resolve) => {
        state.releaseReview = () => {
          AutosaveQueue.flushAll = original;
          resolve();
        };
      });
    };
  });
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await panel.getByRole('button', { name: '比較を取り消す' }).click();
  await page.evaluate(() =>
    (window as typeof window & { releaseReview?: () => void }).releaseReview?.(),
  );
  await expect(panel.getByRole('button', { name: '比較を取り消す' })).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as typeof window & { reviewFlushes?: number }).reviewFlushes),
  ).toBe(1);
  await expect(panel.getByLabel('制作差分の件数')).toHaveCount(0);
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).click();
  await expect(panel.getByLabel('制作差分の件数')).toContainText('変更なし 1件');
  for (const control of await panel.locator('button,input[type=file]').all()) {
    const box = await control.boundingBox();
    if (!box) continue;
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await panel.getByRole('button', { name: '比較基準を外す' }).click();
  await expect(panel.getByRole('button', { name: '現在の制作内容と比較' })).toBeDisabled();
});

test('desktopで設定保存と全素材削除後も基準を保ち、適切な編集先へ戻れる', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const panel = await setup(page);
  await panel.getByRole('button', { name: '現在を比較基準にする' }).click();
  await expect(panel.getByRole('status')).toContainText('比較基準にしました');
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).click();
  await expect(panel.getByLabel('制作差分の件数')).toContainText('変更なし 1件');
  expect((await panel.boundingBox())!.height).toBeGreaterThan(400);
  await testInfo.attach('desktop-revision-dialog', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await panel.getByRole('button', { name: '編集・書き出しへ戻る' }).click();
  const rich = page.getByRole('region', { name: '新版配布用ZIP', exact: true });
  await rich.getByLabel('新版配布の利用先').selectOption('phaser');
  await rich.getByRole('button', { name: '出力設定を保存', exact: true }).click();
  await expect(rich.getByRole('status')).toContainText('出力設定を保存しました');
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  await expect(panel.getByRole('button', { name: '比較記録を保存' })).toBeDisabled();
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).click();
  await expect(
    panel.getByText('書き出し設定に変更があります。配布前に書き出し画面で設定を確認してください。'),
  ).toBeVisible();
  await panel.getByLabel('変更または必須確認がある素材だけ表示').uncheck();
  await panel.getByRole('button', { name: /を編集$/ }).click();
  await page
    .getByRole('navigation', { name: 'プロパティ内メニュー' })
    .getByRole('link', { name: 'ゲーム情報', exact: true })
    .click();
  await page.getByLabel('原点 X', { exact: true }).fill('9');
  await page.getByLabel('原点 X', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).click();
  await expect(panel.getByRole('button', { name: '原点を編集', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '原点を編集', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByLabel('原点 X', { exact: true })).toBeVisible();
  await expect(page.getByLabel('原点 X', { exact: true })).toHaveValue('9');
  await page
    .getByRole('navigation', { name: 'プロパティ内メニュー' })
    .getByRole('link', { name: 'アセット', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'アセットを削除', exact: true }).click();
  await expect(page.getByText('アセットを選ぶと書き出せます。')).toBeVisible();
  await page.getByRole('button', { name: '修正と受渡しを開く' }).click();
  await panel.getByRole('button', { name: '現在の制作内容と比較' }).click();
  await expect(panel.getByLabel('制作差分の件数')).toContainText('削除 1件');
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button', { name: '修正と受渡しを開く' })).toBeFocused();
});

test('保存中の背景設定を操作可能にせず、次の役割変更を確実に保存する', async ({ page }) => {
  const panel = await setup(page);
  await panel.getByRole('button', { name: '編集・書き出しへ戻る' }).click();
  await page.getByLabel('アセット種別').selectOption('background');
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/core/storage/autosave.ts';
    const { AutosaveQueue } = await import(path);
    const original = AutosaveQueue.flushAll;
    (window as typeof window & { releaseBackground?: () => void }).releaseBackground = undefined;
    AutosaveQueue.flushAll = () =>
      new Promise<void>((resolve, reject) => {
        (window as typeof window & { releaseBackground?: () => void }).releaseBackground = () => {
          AutosaveQueue.flushAll = original;
          original.call(AutosaveQueue).then(resolve, reject);
        };
      });
  });
  await page.getByRole('button', { name: '背景設定を追加' }).click();
  await expect(page.getByRole('combobox', { name: '役割', exact: true })).toBeDisabled();
  await page.evaluate(() =>
    (window as typeof window & { releaseBackground?: () => void }).releaseBackground?.(),
  );
  await expect(page.getByRole('combobox', { name: '役割', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: '役割', exact: true }).selectOption('far');
  await expect(page.getByRole('combobox', { name: '役割', exact: true })).toHaveValue('far');
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: '「Revision workflow」を開く' }).click();
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '役割', exact: true })).toHaveValue('far');
});
