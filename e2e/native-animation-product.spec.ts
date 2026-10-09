import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { importBackup } from '../src/core3d/backup/backup';
const panel = (page: Page) => page.getByRole('region', { name: '3Dアニメーション', exact: true });
async function setup(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Animation work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  const animation = panel(page);
  await animation.getByLabel('clip名', { exact: true }).fill('Move');
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  const target = animation.getByRole('combobox', { name: 'キー対象', exact: true });
  const id = await target.locator('option').nth(1).getAttribute('value');
  await target.selectOption(id!);
  await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
  await animation.getByLabel('キー値 X', { exact: true }).fill('1');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  return animation;
}
async function backup(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return readFile((await (await pending).path())!);
}
async function seek(page: Page, time: string) {
  const animation = panel(page);
  await animation.getByLabel('指定時刻（秒）', { exact: true }).fill(time);
  await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).click();
  await expect(animation.getByRole('status')).toContainText('アニメーション停止pose');
}
async function visual(page: Page, name: string) {
  const path = test.info().outputPath('native-visual-animation-' + name + '.png');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await page.screenshot({ fullPage: true }));
  await test.info().attach(name, { path, contentType: 'image/png' });
}
test('authors object keys, scrubs, preserves rest PNG and restores editable clips independently', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const animation = await setup(page);
  const canvas = page.getByRole('region', { name: '3D表示', exact: true }).locator('canvas');
  const rest = await canvas.screenshot();
  await seek(page, '0.5');
  await expect.poll(async () => (await canvas.screenshot()).equals(rest)).toBe(false);
  await page.getByRole('button', { name: '全体を表示', exact: true }).click();
  await visual(page, 'object-midpoint');
  await animation
    .getByRole('combobox', { name: 'タイムライン拡大', exact: true })
    .selectOption('4');
  await expect(animation.getByText(/表示範囲:/)).toContainText('0.250');
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  expect([...(await readFile((await (await png).path())!)).subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  await expect(animation.getByRole('status')).toContainText('アニメーションrest表示');
  await seek(page, '0.5');
  const bytes = await backup(page),
    saved = await importBackup(new Uint8Array(bytes));
  expect(saved.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
  expect(saved.project.clips[0].tracks[0].keys).toHaveLength(2);
  const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const restored = await fresh.newPage();
    await restored.goto('/3d/');
    await restored
      .getByLabel('.cas3dproj を選んでコピー復元', { exact: true })
      .setInputFiles({ name: 'animation.cas3dproj', mimeType: 'application/zip', buffer: bytes });
    await expect(
      restored.getByRole('heading', { name: 'Animation work', exact: true }),
    ).toBeVisible();
    await restored.getByText('アニメーション編集を開く', { exact: true }).click();
    const rp = panel(restored);
    await rp
      .getByRole('combobox', { name: 'clipを選択', exact: true })
      .selectOption(saved.project.clips[0].id);
    await rp
      .getByRole('combobox', { name: 'キー対象', exact: true })
      .selectOption(saved.project.nodes[0].id);
    await rp.getByRole('button', { name: 'キー 1秒: 1, 0, 0', exact: true }).click();
    await rp.getByLabel('キー値 X', { exact: true }).fill('2');
    await rp.getByRole('button', { name: '選択キーの時刻と値を適用', exact: true }).click();
    expect(
      (await importBackup(new Uint8Array(await backup(restored)))).project.clips[0].tracks[0]
        .keys[1].value,
    ).toEqual([2, 0, 0]);
    await restored.getByRole('button', { name: '元に戻す', exact: true }).click();
    expect(
      (await importBackup(new Uint8Array(await backup(restored)))).project.clips[0].tracks[0]
        .keys[1].value,
    ).toEqual([1, 0, 0]);
    await restored.getByRole('button', { name: 'やり直す', exact: true }).click();
    await restored.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
    await rp.getByRole('button', { name: 'clipを再生', exact: true }).click();
    await expect(rp.getByRole('status')).toContainText('アニメーション再生中');
  } finally {
    await fresh.close();
  }
});
test('creates a bone track, edits STEP, duplicates clips and returns non-keyed channels to rest', async ({
  page,
}) => {
  const animation = await setup(page);
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  const rig = page.getByRole('region', { name: '3D骨と重み', exact: true });
  await rig.getByLabel('骨の名前', { exact: true }).fill('Bone');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const joint = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(joint);
  await rig.getByRole('button', { name: '全頂点へ明示weightをbind', exact: true }).click();
  await animation.getByRole('combobox', { name: 'キー対象', exact: true }).selectOption(joint);
  await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Y', { exact: true }).fill('0.5');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByRole('combobox', { name: 'キー補間', exact: true }).selectOption('STEP');
  await animation.getByRole('button', { name: 'trackの補間を適用', exact: true }).click();
  await seek(page, '1');
  await page.getByRole('button', { name: '全体を表示', exact: true }).click();
  await visual(page, 'bone-step');
  await animation.getByLabel('clip名', { exact: true }).fill('Copy');
  await animation.getByRole('button', { name: 'clipを複製', exact: true }).click();
  const saved = await importBackup(new Uint8Array(await backup(page)));
  expect(saved.project.clips).toHaveLength(2);
  expect(saved.project.clips[1].tracks.find((track) => track.nodeId === joint)!.interpolation).toBe(
    'STEP',
  );
  await animation.getByRole('button', { name: 'clipを削除', exact: true }).click();
  expect((await importBackup(new Uint8Array(await backup(page)))).project.clips).toHaveLength(1);
});
test('phone timeline supports IME, duplicate-time rejection and explicit resume after background or GPU pause', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const animation = await setup(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
    await expect(animation.getByRole('alert')).toContainText('Invalid key time');
    await animation.getByLabel('指定時刻（秒）', { exact: true }).fill('0.5');
    await animation.getByLabel('指定時刻（秒）', { exact: true }).dispatchEvent('compositionstart');
    await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).click();
    await expect(animation.getByRole('status')).toContainText('アニメーションrest表示');
    await animation.getByLabel('指定時刻（秒）', { exact: true }).dispatchEvent('compositionend');
    await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(animation.getByRole('status')).toContainText('アニメーション停止pose');
    await animation
      .getByRole('combobox', { name: 'タイムライン拡大', exact: true })
      .selectOption('2');
    await animation.getByRole('button', { name: 'clipを再生', exact: true }).tap();
    await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
    await expect(animation.getByRole('status')).not.toContainText('アニメーション再生中');
    await page.evaluate(() => document.dispatchEvent(new Event('resume')));
    await expect(animation.getByRole('status')).not.toContainText('アニメーション再生中');
    await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
    await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
    await animation.getByRole('button', { name: 'clipを再生', exact: true }).tap();
    await expect(animation.getByRole('status')).toContainText('アニメーション再生中');
    await animation.getByRole('button', { name: 'clipを停止', exact: true }).tap();
    await visual(page, 'phone-timeline');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});

test('a clip with an undisplayable key stays selectable for repair', async ({ page }) => {
  const animation = await setup(page);
  const select = animation.getByRole('combobox', { name: 'clipを選択', exact: true });
  const original = await select.inputValue();
  await animation.getByRole('combobox', { name: 'キー属性', exact: true }).selectOption('scale');
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('0');
  for (const axis of ['X', 'Y', 'Z'])
    await animation.getByLabel('キー値 ' + axis, { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('clip名', { exact: true }).fill('Other');
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  await select.selectOption(original);
  await expect(select).toHaveValue(original);
  await expect(animation.getByRole('alert')).toBeVisible();
  await animation.getByRole('button', { name: 'キー 0秒: 0, 0, 0', exact: true }).click();
  for (const axis of ['X', 'Y', 'Z'])
    await animation.getByLabel('キー値 ' + axis, { exact: true }).fill('1');
  await animation.getByRole('button', { name: '選択キーの時刻と値を適用', exact: true }).click();
  await seek(page, '0');
  await expect(animation.getByRole('alert')).toHaveCount(0);
});
