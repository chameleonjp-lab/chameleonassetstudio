import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { importBackup } from '../src/core3d/backup/backup';
const panel = (page: Page) => page.getByRole('region', { name: '3D骨と重み', exact: true });
async function setup(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Rig work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  const rig = panel(page);
  await rig.getByLabel('骨の名前', { exact: true }).fill('Root');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const root = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('combobox', { name: '親の骨', exact: true }).selectOption(root);
  await rig.getByLabel('骨の名前', { exact: true }).fill('Tip');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const tip = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('button', { name: '骨の現在値を読む' }).click();
  await rig.getByLabel('骨位置 Y', { exact: true }).fill('1');
  await rig.getByRole('button', { name: 'restを適用して再bind', exact: true }).click();
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(root);
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0.25');
  await rig.getByRole('combobox', { name: '影響 2 の骨', exact: true }).selectOption(tip);
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0.75');
  await rig.getByRole('button', { name: '全頂点へ明示weightをbind', exact: true }).click();
  await expect(rig.getByText(/bind済み/)).toBeVisible();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  return { rig, root, tip };
}
async function backup(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return readFile((await (await download).path())!);
}
async function visual(page: Page, name: string) {
  const path = test.info().outputPath(`native-visual-rig-${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await page.screenshot({ fullPage: true }));
  await test.info().attach(name, { path, contentType: 'image/png' });
}

test('authors mixed skin, previews deformation, preserves rest backup and re-edits after independent restore', async ({
  page,
  browser,
}) => {
  const { rig, tip } = await setup(page);
  const canvas = page.getByRole('region', { name: '3D表示', exact: true }).locator('canvas');
  const rest = await canvas.screenshot();
  await visual(page, 'mixed-rest');
  await rig.getByRole('button', { name: '骨の現在値を読む' }).click();
  await rig.getByLabel('骨位置 X', { exact: true }).fill('0.8');
  await rig.getByRole('button', { name: 'poseで変形を確認', exact: true }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'pose確認中' })).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(rest)).toBe(false);
  await visual(page, 'mixed-pose');
  const beforeFit = await canvas.screenshot();
  await page.getByRole('button', { name: '全体を表示', exact: true }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'pose確認中' })).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(beforeFit)).toBe(false);
  await visual(page, 'mixed-pose-fit');
  const fittedPath = test.info().outputPath('native-visual-rig-pose-fit-canvas.png');
  await writeFile(fittedPath, await canvas.screenshot());
  await test.info().attach('pose-fit-canvas', { path: fittedPath, contentType: 'image/png' });
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  await expect(
    page
      .locator('section[aria-label="3D骨と重み"] [role="status"]')
      .filter({ hasText: 'rest表示' }),
  ).toHaveCount(1);
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).toBeVisible();
  await rig.getByRole('button', { name: 'poseで変形を確認', exact: true }).click();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  const png = await readFile((await (await pngDownload).path())!);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).toBeVisible();
  await rig.getByRole('button', { name: 'poseで変形を確認', exact: true }).click();
  const bytes = await backup(page);
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).toBeVisible();
  const saved = await importBackup(new Uint8Array(bytes));
  expect(saved.project.nodes.find((node) => node.id === tip)!.transform.translation).toEqual([
    0, 1, 0,
  ]);
  expect(
    saved.project.skins[0].weights.every(
      (entry) => entry.values[0] === 0.25 && entry.values[1] === 0.75,
    ),
  ).toBe(true);
  const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const restored = await fresh.newPage();
    await restored.goto('/3d/');
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'rig.cas3dproj',
      mimeType: 'application/octet-stream',
      buffer: bytes,
    });
    await expect(restored.getByRole('heading', { name: 'Rig work', exact: true })).toBeVisible();
    await restored.getByText('骨と重みの編集を開く', { exact: true }).click();
    const rp = panel(restored);
    await rp
      .getByRole('combobox', { name: '重み対象の部品', exact: true })
      .selectOption(saved.project.nodes.find((node) => node.meshId)!.id);
    await rp
      .getByRole('combobox', { name: '編集する頂点', exact: true })
      .selectOption(saved.project.meshes[0].vertices[0].id);
    await rp.getByRole('button', { name: '頂点の現在weightを読む' }).click();
    await rp.getByLabel('影響 1 の重み', { exact: true }).fill('0.5');
    await rp.getByLabel('影響 2 の重み', { exact: true }).fill('0.5');
    await rp.getByRole('button', { name: '選択頂点のweightを適用' }).click();
    let updated = await importBackup(new Uint8Array(await backup(restored)));
    expect(updated.project.skins[0].weights[0].values).toEqual([0.5, 0.5]);
    await restored.getByRole('button', { name: '元に戻す', exact: true }).click();
    updated = await importBackup(new Uint8Array(await backup(restored)));
    expect(updated.project.skins[0].weights[0].values).toEqual([0.25, 0.75]);
    await restored.getByRole('button', { name: 'やり直す', exact: true }).click();
    await restored.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('phone numeric rig handles IME, invalid input, pause and repeated rest previews without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { rig } = await setup(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await rig.getByRole('button', { name: '骨の現在値を読む' }).click();
  await rig.getByLabel('骨位置 X', { exact: true }).fill('bad');
  await rig.getByRole('button', { name: 'poseで変形を確認' }).click();
  await expect(rig.getByRole('alert')).toContainText('有限');
  await rig.getByLabel('骨位置 X', { exact: true }).fill('0.3');
  await rig.getByLabel('骨位置 X', { exact: true }).dispatchEvent('compositionstart');
  await rig.getByRole('button', { name: 'poseで変形を確認' }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'pose確認中' })).toHaveCount(0);
  await rig.getByLabel('骨位置 X', { exact: true }).dispatchEvent('compositionend');
  for (let i = 0; i < 3; i++) {
    await rig.getByRole('button', { name: 'poseで変形を確認' }).click();
    await expect(rig.getByRole('status').filter({ hasText: 'pose確認中' })).toBeVisible();
    await rig.getByRole('button', { name: 'poseを解除してrestへ戻す' }).click();
  }
  await rig.getByRole('button', { name: 'poseで変形を確認' }).click();
  await page.getByRole('button', { name: '保存してGPU表示を休止' }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).toBeVisible();
  await page.getByRole('button', { name: 'GPU表示を再開' }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await visual(page, 'phone-controls');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});

test('extends a skin palette beyond four joints without replacing existing weights', async ({
  page,
}) => {
  const { rig } = await setup(page);
  await rig.getByRole('button', { name: '人型の骨ガイドを追加', exact: true }).click();
  const extraJoint = await rig
    .getByRole('combobox', { name: '骨を選択', exact: true })
    .inputValue();
  await rig.getByText('bindに含める骨を選ぶ', { exact: true }).click();
  const candidates = rig.getByRole('group', { name: 'skinに含める骨の候補' }).getByRole('checkbox');
  for (let i = 2; i < 7; i++) await candidates.nth(i).check();
  await rig.getByRole('button', { name: '候補の骨を現在skinに追加', exact: true }).click();
  await expect(rig.getByText(/現在skinに含まれる骨: 7/)).toBeVisible();
  const before = await importBackup(new Uint8Array(await backup(page)));
  expect(before.project.skins[0].weights[0].values).toEqual([0.25, 0.75]);
  await rig
    .getByRole('combobox', { name: '編集する頂点', exact: true })
    .selectOption(before.project.meshes[0].vertices[0].id);
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(extraJoint);
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('1');
  await rig.getByRole('combobox', { name: '影響 2 の骨', exact: true }).selectOption('');
  await rig.getByRole('button', { name: '選択頂点のweightを適用', exact: true }).click();
  const after = await importBackup(new Uint8Array(await backup(page)));
  expect(after.project.skins[0].joints).toHaveLength(7);
  expect(after.project.skins[0].weights[0].jointIds).toEqual([extraJoint]);
  expect(after.project.skins[0].weights[1]).toEqual(before.project.skins[0].weights[1]);
});

test('assigns a rigid part separately from smooth skin, previews an unbound guide and restores rest hierarchy', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Rigid work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  const rig = panel(page);
  await rig.getByLabel('骨の名前', { exact: true }).fill('Rigid guide');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const jointId = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('button', { name: '骨の現在値を読む', exact: true }).click();
  await rig.getByLabel('骨位置 Y', { exact: true }).fill('1');
  await rig.getByRole('button', { name: 'restを適用して再bind', exact: true }).click();
  const before = (await importBackup(new Uint8Array(await backup(page)))).project;
  const partId = before.nodes.find((node) => node.meshId)!.id;
  const rigid = rig.getByRole('region', { name: 'rigid部品の骨割当', exact: true });
  await rigid.getByRole('combobox', { name: 'rigid割当の部品', exact: true }).selectOption(partId);
  await rigid.getByRole('combobox', { name: 'rigid割当先の骨', exact: true }).selectOption(jointId);
  await rigid.getByRole('button', { name: 'rigid割当の内容を確認', exact: true }).click();
  await expect(rigid.getByRole('region', { name: 'rigid割当の確認', exact: true })).toContainText(
    'restのworld配置を保持',
  );
  await rigid.getByRole('button', { name: 'rigid割当を取り消す', exact: true }).click();
  expect((await importBackup(new Uint8Array(await backup(page)))).project).toEqual(before);
  await rigid.getByRole('button', { name: 'rigid割当の内容を確認', exact: true }).click();
  await rigid.getByRole('button', { name: '確認したrigid割当を適用', exact: true }).click();
  const attachedBytes = new Uint8Array(await backup(page));
  const attached = (await importBackup(attachedBytes)).project;
  expect(attached.skins).toEqual([]);
  expect(attached.nodes.find((node) => node.id === partId)).toMatchObject({
    parentId: jointId,
    transform: { translation: [0, -1, 0] },
  });
  expect(attached.meshes).toEqual(before.meshes);
  await rigid.getByRole('button', { name: 'rigid割当の内容を確認', exact: true }).click();
  await expect(rigid.getByRole('alert')).toBeVisible();
  expect((await importBackup(new Uint8Array(await backup(page)))).project).toEqual(attached);
  const canvas = page.getByRole('region', { name: '3D表示', exact: true }).locator('canvas');
  const rest = await canvas.screenshot();
  await rig.getByRole('button', { name: '骨の現在値を読む', exact: true }).click();
  await rig.getByLabel('骨位置 X', { exact: true }).fill('1');
  await rig.getByRole('button', { name: 'poseで変形を確認', exact: true }).click();
  await expect(rig.getByRole('status').filter({ hasText: 'pose確認中' })).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(rest)).toBe(false);
  await visual(page, 'rigid-guide-pose');
  expect((await importBackup(new Uint8Array(await backup(page)))).project).toEqual(attached);
  await rig.getByRole('button', { name: 'poseを解除してrestへ戻す', exact: true }).click();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  const undone = (await importBackup(new Uint8Array(await backup(page)))).project;
  expect({ ...undone, revision: before.revision }).toEqual(before);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  const redone = (await importBackup(new Uint8Array(await backup(page)))).project;
  expect({ ...redone, revision: attached.revision }).toEqual(attached);
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage();
    await restored.goto(
      new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
    );
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'rigid.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(attachedBytes),
    });
    await expect(restored.getByRole('heading', { name: 'Rigid work', exact: true })).toBeVisible();
    await restored.getByText('骨と重みの編集を開く', { exact: true }).click();
    const copyPanel = panel(restored).getByRole('region', {
      name: 'rigid部品の骨割当',
      exact: true,
    });
    await copyPanel
      .getByRole('combobox', { name: 'rigid割当の部品', exact: true })
      .selectOption(partId);
    await copyPanel
      .getByRole('button', { name: 'rigid割当をrootへ解除する内容を確認', exact: true })
      .click();
    await copyPanel.getByRole('button', { name: '確認したrigid割当を適用', exact: true }).click();
    const detached = (await importBackup(new Uint8Array(await backup(restored)))).project;
    expect(detached.nodes.find((node) => node.id === partId)).toMatchObject({
      parentId: null,
      transform: { translation: [0, 0, 0] },
    });
    expect(detached.meshes).toEqual(before.meshes);
    expect(detached.skins).toEqual([]);
  } finally {
    await fresh.close();
  }
});

test('invalid joint names and zero-weight normalization preserve the rig with Japanese guidance', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { rig } = await setup(page);
  const before = await importBackup(await backup(page));
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).toContainText(
    '編集や保存の操作に合わせて',
  );
  await expect(rig.getByRole('status').filter({ hasText: 'rest表示' })).not.toContainText(
    'session boundary',
  );
  for (const name of ['', 'x'.repeat(4097)]) {
    await rig.getByLabel('骨の名前', { exact: true }).fill(name);
    await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
    const alert = rig.getByRole('alert');
    await expect(alert).toContainText('[EDIT_RIG_NAME]');
    await expect(alert).toContainText('骨と重みの編集');
    await expect(alert).not.toContainText('Joint name');
    expect((await importBackup(await backup(page))).project).toEqual(before.project);
  }
  await rig.getByRole('combobox', { name: '編集する頂点', exact: true }).selectOption({ index: 1 });
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0');
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0');
  await rig.getByLabel('このweight更新で正規化する', { exact: true }).check();
  await rig.getByRole('button', { name: '選択頂点のweightを適用', exact: true }).click();
  await expect(rig.getByRole('alert')).toContainText('[EDIT_WEIGHT_ZERO]');
  await expect(rig.getByRole('alert')).toContainText('正規化');
  await expect(rig.getByRole('alert')).not.toContainText('Cannot normalize');
  expect((await importBackup(await backup(page))).project).toEqual(before.project);
});
