import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { importBackup } from '../src/core3d/backup/backup';
const panel = (page: Page) => page.getByRole('region', { name: '3Dアニメーション', exact: true });
const revision = async (page: Page) =>
  Number(
    (await page.locator('.editor3d-revision').textContent())!.match(/編集中 revision (\d+)/)![1],
  );
async function tabTo(
  page: Page,
  target: ReturnType<Page['getByRole']>,
  direction: 'Tab' | 'Shift+Tab' = 'Tab',
) {
  await expect(target).toBeVisible();
  if (await target.evaluate((element) => element === document.activeElement)) return;
  for (let attempt = 0; attempt < 128; attempt++) {
    await page.keyboard.press(direction);
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Tab navigation did not reach the requested control.');
}
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
test('keyboard-only Tab flow selects and edits an animation key', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/3d/');

  const projectName = page.getByLabel('新しいプロジェクト名', { exact: true });
  await tabTo(page, projectName);
  await page.keyboard.type('Keyboard animation work');
  const create = page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true });
  await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');

  const addBox = page.getByRole('button', { name: '箱を追加', exact: true });
  await tabTo(page, addBox);
  await page.keyboard.press('Enter');
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();

  const openAnimation = page.getByText('アニメーション編集を開く', { exact: true });
  await tabTo(page, openAnimation);
  await page.keyboard.press('Enter');
  const animation = panel(page);
  const playbackStatus = animation.getByTestId('native-animation-playback-status');
  const selectionStatus = animation.getByTestId('native-animation-selection-status');
  const keyActionStatus = animation.getByTestId('native-animation-key-action-status');
  await expect(playbackStatus).toHaveAttribute('aria-live', 'off');
  await expect(selectionStatus).toHaveAttribute('aria-live', 'polite');
  await expect(selectionStatus).toHaveAttribute('aria-atomic', 'true');
  await expect(keyActionStatus).toHaveAttribute('aria-live', 'polite');
  await expect(keyActionStatus).toHaveAttribute('aria-atomic', 'true');

  const clipName = animation.getByLabel('clip名', { exact: true });
  await tabTo(page, clipName);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Keyboard Move');
  const createClip = animation.getByRole('button', { name: '新しいclipを作成', exact: true });
  await tabTo(page, createClip);
  await page.keyboard.press('Enter');

  const target = animation.getByRole('combobox', { name: 'キー対象', exact: true });
  await tabTo(page, target);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const targetId = await target.inputValue();
  expect(targetId).not.toBe('');
  await expect(target.locator('option:checked')).toContainText('箱 /');
  const readPose = animation.getByRole('button', { name: '表示中のTRSを読む', exact: true });
  await tabTo(page, readPose);
  await page.keyboard.press('Enter');

  const addKey = animation.getByRole('button', { name: 'キーを追加', exact: true });
  await tabTo(page, addKey);
  await page.keyboard.press('Enter');
  const targetLabel = (await target.locator('option:checked').innerText()).trim();
  await expect(keyActionStatus).toHaveText(
    `Keyboard Move / ${targetLabel} / 移動: キー 0秒を追加しました。`,
  );
  const timeline = animation.getByRole('group', {
    name: `タイムラインのキーマーカー: Keyboard Move / ${targetLabel} / 移動`,
  });
  const timelineKey = timeline.getByRole('button', {
    name: `${targetLabel} の 移動 キー 0秒`,
    exact: true,
  });
  await expect(timelineKey).toHaveAttribute('aria-pressed', 'false');
  await tabTo(page, timelineKey);
  await page.keyboard.press('Enter');
  await expect(timelineKey).toHaveAttribute('aria-pressed', 'true');
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 移動 / 0秒`,
  );

  const property = animation.getByRole('combobox', { name: 'キー属性', exact: true });
  await tabTo(page, property);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(property).toHaveValue('scale');
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 倍率 / 未選択`,
  );
  await tabTo(page, readPose);
  await page.keyboard.press('Enter');
  await tabTo(page, addKey);
  await page.keyboard.press('Enter');
  const scaleTimeline = animation.getByRole('group', {
    name: `タイムラインのキーマーカー: Keyboard Move / ${targetLabel} / 倍率`,
  });
  const scaleMarker = scaleTimeline.getByRole('button', {
    name: `${targetLabel} の 倍率 キー 0秒`,
    exact: true,
  });
  await expect(scaleMarker).toHaveAttribute('aria-pressed', 'false');
  await tabTo(page, scaleMarker);
  await page.keyboard.press('Enter');
  await expect(scaleMarker).toHaveAttribute('aria-pressed', 'true');
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 倍率 / 0秒`,
  );

  await tabTo(page, property, 'Shift+Tab');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(property).toHaveValue('translation');
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 移動 / 未選択`,
  );
  const translationTimeline = animation.getByRole('group', {
    name: `タイムラインのキーマーカー: Keyboard Move / ${targetLabel} / 移動`,
  });
  const translationMarker = translationTimeline.getByRole('button', {
    name: `${targetLabel} の 移動 キー 0秒`,
    exact: true,
  });
  await expect(translationMarker).toHaveAttribute('aria-pressed', 'false');

  const key = animation.getByRole('button', { name: 'キー 0秒: 0, 0, 0', exact: true });
  await tabTo(page, key);
  await page.keyboard.press('Enter');
  await expect(key).toHaveAttribute('aria-pressed', 'true');
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 移動 / 0秒`,
  );

  const keyTime = animation.getByLabel('キー時刻（秒）', { exact: true });
  const keyX = animation.getByLabel('キー値 X', { exact: true });
  await tabTo(page, keyTime, 'Shift+Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('1');
  await tabTo(page, keyX);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('2');
  const before = await revision(page);
  const applyKey = animation.getByRole('button', {
    name: '選択キーの時刻と値を適用',
    exact: true,
  });
  await tabTo(page, applyKey);
  await page.keyboard.press('Enter');
  const afterEdit = before + 1;
  await expect.poll(() => revision(page)).toBe(afterEdit);
  await expect(keyActionStatus).toHaveText(
    `Keyboard Move / ${targetLabel} / 移動: キーを 1秒へ更新しました。`,
  );
  await expect(
    animation.getByRole('button', { name: 'キー 1秒: 2, 0, 0', exact: true }),
  ).toBeVisible();
  await expect(selectionStatus).toHaveText(
    `選択中のキー: Keyboard Move / ${targetLabel} / 移動 / 未選択`,
  );

  const editedKey = animation.getByRole('button', { name: 'キー 1秒: 2, 0, 0', exact: true });
  await tabTo(page, editedKey);
  await page.keyboard.press('Enter');
  await tabTo(page, keyTime);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('0.5');
  const duplicateKey = animation.getByRole('button', {
    name: '選択キーを指定時刻へ複製',
    exact: true,
  });
  await tabTo(page, duplicateKey);
  await page.keyboard.press('Enter');
  const afterDuplicate = afterEdit + 1;
  await expect.poll(() => revision(page)).toBe(afterDuplicate);
  await expect(keyActionStatus).toHaveText(
    `Keyboard Move / ${targetLabel} / 移動: キー 1秒を 0.5秒へ複製しました。`,
  );
  const duplicatedKey = animation.getByRole('button', {
    name: 'キー 0.5秒: 2, 0, 0',
    exact: true,
  });
  await expect(duplicatedKey).toBeVisible();
  await tabTo(page, duplicatedKey);
  await page.keyboard.press('Enter');
  await tabTo(page, keyTime);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('1');
  await tabTo(page, duplicateKey);
  await page.keyboard.press('Enter');
  await expect.poll(() => revision(page)).toBe(afterDuplicate);
  const duplicateTimeAlert = animation.getByRole('alert');
  await expect(duplicateTimeAlert).toContainText('重複しない値');
  await expect(keyActionStatus).toHaveText('');
  await expect(duplicatedKey).toBeVisible();

  const deleteKey = animation.getByRole('button', { name: '選択キーを削除', exact: true });
  await tabTo(page, deleteKey);
  await page.keyboard.press('Enter');
  const afterDelete = afterDuplicate + 1;
  await expect.poll(() => revision(page)).toBe(afterDelete);
  await expect(keyActionStatus).toHaveText(
    `Keyboard Move / ${targetLabel} / 移動: キー 0.5秒を削除しました。`,
  );
  await expect(duplicatedKey).toHaveCount(0);

  const save = page.getByRole('button', { name: '今すぐ保存', exact: true });
  await tabTo(page, save);
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor3d-save-status')).toHaveText(
    `保存済み · revision ${afterDelete}`,
  );
  await expect(
    page.getByText(`編集中 revision ${afterDelete} / 保存済み revision ${afterDelete}`, {
      exact: true,
    }),
  ).toBeVisible();
  const backup = page.getByRole('button', { name: '現在の内容をバックアップ', exact: true });
  await tabTo(page, backup);
  const downloadEvent = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const bytes = await readFile((await (await downloadEvent).path())!);
  const saved = await importBackup(new Uint8Array(bytes));
  const savedTranslation = saved.project.clips[0].tracks.find(
    (track) => track.nodeId === targetId && track.property === 'translation',
  );
  const savedScale = saved.project.clips[0].tracks.find(
    (track) => track.nodeId === targetId && track.property === 'scale',
  );
  expect(savedTranslation?.keys).toHaveLength(1);
  expect(savedTranslation?.keys[0].time).toBe(1);
  expect(savedTranslation?.keys[0].value).toEqual([2, 0, 0]);
  expect(savedScale?.keys).toEqual([{ time: 0, value: [1, 1, 1] }]);
});
async function backup(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return readFile((await (await pending).path())!);
}
async function seek(page: Page, time: string) {
  const animation = panel(page);
  await animation.getByLabel('指定時刻（秒）', { exact: true }).fill(time);
  await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).click();
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション停止pose',
  );
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
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーションrest表示',
  );
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
    await expect(rp.getByTestId('native-animation-playback-status')).toContainText(
      'アニメーション再生中',
    );
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
    await expect(animation.getByRole('alert')).toContainText('[EDIT_ANIMATION_TIME]');
    await expect(animation.getByRole('alert')).toContainText(
      'キー時刻は0秒〜クリップの長さの範囲内で、同じ対象・属性の他のキーと重複しない値にしてください。',
    );
    await expect(animation.getByRole('alert')).not.toContainText('Invalid key time');
    await animation.getByLabel('指定時刻（秒）', { exact: true }).fill('0.5');
    await animation.getByLabel('指定時刻（秒）', { exact: true }).dispatchEvent('compositionstart');
    await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).click();
    await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
      'アニメーションrest表示',
    );
    await animation.getByLabel('指定時刻（秒）', { exact: true }).dispatchEvent('compositionend');
    await animation.getByRole('button', { name: '指定時刻を表示', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
      'アニメーション停止pose',
    );
    await animation
      .getByRole('combobox', { name: 'タイムライン拡大', exact: true })
      .selectOption('2');
    await animation.getByRole('button', { name: 'clipを再生', exact: true }).tap();
    await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
    await expect(animation.getByTestId('native-animation-playback-status')).not.toContainText(
      'アニメーション再生中',
    );
    await page.evaluate(() => document.dispatchEvent(new Event('resume')));
    await expect(animation.getByTestId('native-animation-playback-status')).not.toContainText(
      'アニメーション再生中',
    );
    await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
    await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
    await animation.getByRole('button', { name: 'clipを再生', exact: true }).tap();
    await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
      'アニメーション再生中',
    );
    await animation.getByRole('button', { name: 'clipを停止', exact: true }).tap();
    await page.getByRole('button', { name: '全体を表示', exact: true }).tap();
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

test('reduced motion applies editor CSS and pauses preview without changing clips', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const animation = await setup(page);
  await animation.getByLabel('clipをloop再生する', { exact: true }).check();
  await animation.getByRole('button', { name: 'clip設定を適用', exact: true }).click();
  const before = (await importBackup(new Uint8Array(await backup(page)))).project;
  await animation.getByRole('button', { name: 'clipを再生', exact: true }).click();
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション再生中',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(animation.getByTestId('native-motion-preference')).toContainText('設定を検出');
  const reducedMotionStyles = await page.locator('.editor3d').evaluate((element) => {
    const styles = getComputedStyle(element);
    const milliseconds = (value: string) =>
      value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
    return {
      animationDurationMs: milliseconds(styles.animationDuration),
      animationIterationCount: styles.animationIterationCount,
      scrollBehavior: styles.scrollBehavior,
      transitionDurationMs: milliseconds(styles.transitionDuration),
    };
  });
  expect(reducedMotionStyles.animationDurationMs).toBeCloseTo(0.01, 5);
  expect(reducedMotionStyles.animationIterationCount).toBe('1');
  expect(reducedMotionStyles.scrollBehavior).toBe('auto');
  expect(reducedMotionStyles.transitionDurationMs).toBeCloseTo(0.01, 5);
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション停止pose',
  );
  expect((await importBackup(new Uint8Array(await backup(page)))).project).toEqual(before);
  await animation.getByRole('button', { name: 'clipを再生', exact: true }).click();
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション再生中',
  );
  await animation.getByRole('button', { name: 'clipを停止', exact: true }).click();
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション停止pose',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(animation.getByTestId('native-motion-preference')).toContainText(
    '動き低減指定はありません',
  );
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    'アニメーション停止pose',
  );
  expect((await importBackup(new Uint8Array(await backup(page)))).project).toEqual(before);
});

test('duplicate and out-of-range key times retain the clip with Japanese corrective guidance', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const animation = await setup(page);
  const before = await importBackup(await backup(page));
  await expect(animation.getByTestId('native-animation-playback-status')).toContainText(
    '編集や保存の操作に合わせて',
  );
  await expect(animation.getByTestId('native-animation-playback-status')).not.toContainText(
    'session boundary',
  );
  for (const time of ['0', '-1', '2']) {
    await animation.getByLabel('キー時刻（秒）', { exact: true }).fill(time);
    await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
    const alert = animation.getByRole('alert');
    await expect(alert).toContainText('[EDIT_ANIMATION_TIME]');
    await expect(alert).toContainText('アニメーションの編集');
    await expect(alert).toContainText('0秒〜クリップの長さ');
    await expect(alert).toContainText('重複しない値');
    await expect(alert).not.toContainText('Invalid key time');
    expect((await importBackup(await backup(page))).project).toEqual(before.project);
  }
});
