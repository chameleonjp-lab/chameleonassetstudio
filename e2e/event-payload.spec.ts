import { expect, test, type Page } from '@playwright/test';

async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<
      Array<{ data: { animations: Array<{ events: Array<{ payload?: unknown }> }> } }>
    >((resolve, reject) => {
      const request = db.transaction('assets').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows[0].data;
  });
}

async function setup(page: Page) {
  await page.goto('/2d/');
  await page.getByLabel('プロジェクト名').fill('Payload authoring');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('見本の絵を入れて始める').check();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
  await page.getByLabel('新しいアニメーション名').fill('walk');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('新しいイベント名').fill('step');
  await page.getByLabel('新しいイベントの参照フレーム').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'イベント追加', exact: true }).click();
  await expect.poll(async () => (await stored(page)).animations[0].events?.length).toBe(1);
}

test('payload draft validates, cancels, commits once, restores through history and reload', async ({
  page,
}) => {
  await setup(page);
  const edit = page.getByRole('button', { name: 'イベント「step」の追加データを編集' });
  const input = page.getByLabel('イベント「step」の追加データJSON');
  const save = page.getByRole('button', { name: '追加データを保存', exact: true });
  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });
  const before = await stored(page);
  await edit.click();
  await input.fill('{"sound":{"nested":true}}');
  await save.click();
  await expect(
    page.getByRole('group', { name: 'イベント「step」の追加データ編集' }).getByRole('alert'),
  ).toContainText('入れ子');
  expect(await stored(page)).toEqual(before);
  await input.fill('1e400');
  await save.click();
  await expect(
    page.getByRole('group', { name: 'イベント「step」の追加データ編集' }).getByRole('alert'),
  ).toContainText('有限');
  await input.fill('{"sound":"cancel"}');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  await edit.click();
  await input.fill('{"sound":"footstep","volume":0.8}');
  await input.blur();
  expect(await stored(page)).toEqual(before);
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toEqual({ sound: 'footstep', volume: 0.8 });
  await expect(undo).toHaveAttribute('title', 'イベント追加データ変更');
  await undo.click();
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toBeUndefined();
  await expect(undo).toHaveAttribute('title', 'イベント追加');
  await redo.click();
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toEqual({ sound: 'footstep', volume: 0.8 });
  await edit.click();
  await input.fill('{ "volume": 0.8, "sound": "footstep" }');
  await save.click();
  await undo.click();
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toBeUndefined();
  await redo.click();
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toEqual({ sound: 'footstep', volume: 0.8 });
  await page.reload();
  await page.getByRole('button', { name: '「Payload authoring」を開く' }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'walk' });
  await edit.click();
  await expect(input).toHaveValue(/footstep/);
  await input.fill('null');
  await save.click();
  await expect.poll(async () => (await stored(page)).animations[0].events[0].payload).toBeNull();
  await edit.click();
  await page.getByRole('button', { name: '追加データを削除', exact: true }).click();
  await expect
    .poll(async () => (await stored(page)).animations[0].events[0].payload)
    .toBeUndefined();
  await undo.click();
  await expect.poll(async () => (await stored(page)).animations[0].events[0].payload).toBeNull();
});

test('payload controls remain reachable on mobile and preview cannot save a stale draft', async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await page
    .getByRole('navigation', { name: '画面切り替え' })
    .getByRole('button', { name: 'タイムライン', exact: true })
    .click();
  const edit = page.getByRole('button', { name: 'イベント「step」の追加データを編集' });
  await edit.click();
  const input = page.getByLabel('イベント「step」の追加データJSON');
  await input.fill('{"sound":"discard"}');
  expect(
    await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  for (const button of [
    edit,
    page.getByRole('button', { name: '追加データを保存', exact: true }),
    page.getByRole('button', { name: '追加データの編集を取消', exact: true }),
  ]) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(edit).toBeDisabled();
  await expect(input).toHaveCount(0);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await edit.click();
  await expect(input).toHaveValue('{}');
  expect((await stored(page)).animations[0].events[0].payload).toBeUndefined();
});

test('rejected commit keeps the draft available and retry submits once', async ({ page }) => {
  await page.goto('/e2e/fixtures/event-payload-harness.html');
  await page.getByRole('button', { name: 'イベント「blocked」の追加データを編集' }).click();
  const input = page.getByLabel('イベント「blocked」の追加データJSON');
  await input.fill('{"sound":"step"}');
  const save = page.getByRole('button', { name: '追加データを保存', exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('再試行');
  await expect(input).toHaveValue('{"sound":"step"}');
  await page.evaluate(() => {
    (window as typeof window & { acceptPayload?: boolean }).acceptPayload = true;
  });
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(input).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { payloadCommits?: number }).payloadCommits,
    ),
  ).toBe(1);
});
