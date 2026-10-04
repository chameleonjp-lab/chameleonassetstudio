import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { nativeBox } from '../src/core3d/fixtures/nativeBox';

const controls = (page: Page) =>
  page.getByRole('region', { name: '選択部品の差分変形', exact: true });
const revision = async (page: Page) => {
  const text = await page.locator('.editor3d-revision').textContent();
  return Number(text!.match(/編集中 revision (\d+)/)![1]);
};
async function snapshot(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const bytes = await readFile((await (await event).path())!);
  return { bytes, project: (await importBackup(bytes)).project };
}
async function attachImage(name: string, bytes: Buffer) {
  const path = test.info().outputPath(`native-visual-editing-${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await test.info().attach(name, { path, contentType: 'image/png' });
}
async function openControls(page: Page) {
  await controls(page).getByText('数値で差分変形', { exact: true }).click();
  await expect(
    controls(page).getByRole('button', { name: '数値変形を開始', exact: true }),
  ).toBeEnabled();
}
async function createBox(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native editing work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await openControls(page);
}
async function numeric(page: Page, x: string, y = '0', z = '0') {
  const panel = controls(page);
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  for (const [axis, value] of [
    ['X', x],
    ['Y', y],
    ['Z', z],
  ])
    await panel.getByLabel(`移動量 ${axis}（m）`, { exact: true }).fill(value);
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
}

async function warmPixels(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cannot decode canonical PNG'));
    });
    image.src = `data:image/png;base64,${base64}`;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] > 220 && pixels[i + 2] < 75 && pixels[i + 3] > 200) count++;
    return count;
  }, png.toString('base64'));
}

/** Locate the visible red X handle from rendered fixture pixels, without product debug hooks. */
async function xHandle(page: Page) {
  const canvas = page.locator('.native-viewport-host canvas');
  await canvas.scrollIntoViewIfNeeded();
  const pixels = await canvas.screenshot();
  const point = await page.evaluate(async (base64) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Cannot decode viewport evidence'));
    });
    image.src = `data:image/png;base64,${base64}`;
    await loaded;
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    const red: { x: number; y: number }[] = [];
    for (let y = 0; y < image.height; y++)
      for (let x = Math.floor(image.width / 2); x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        if (data[i] > 220 && data[i + 1] < 75 && data[i + 2] < 75 && data[i + 3] > 200)
          red.push({ x, y });
      }
    if (red.length < 3) throw new Error('Rendered X handle is missing');
    const right = Math.max(...red.map((p) => p.x));
    const cap = red.filter((p) => p.x >= right - Math.max(4, image.width / 160));
    return {
      x: cap.reduce((sum, p) => sum + p.x, 0) / cap.length / image.width,
      y: cap.reduce((sum, p) => sum + p.y, 0) / cap.length / image.height,
    };
  }, pixels.toString('base64'));
  const box = (await canvas.boundingBox())!;
  return { x: box.x + point.x * box.width, y: box.y + point.y * box.height };
}

for (const projection of ['perspective', 'orthographic'] as const) {
  test(`product ${projection} pointer and numeric edits share one saved transaction`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await createBox(page);
    const panel = controls(page);
    await panel.getByLabel('スナップ間隔（m）', { exact: true }).fill('0.25');
    await panel.getByRole('button', { name: 'スナップ設定を適用', exact: true }).click();
    await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
    await page.getByRole('button', { name: '正面から見る', exact: true }).click();
    await page.getByRole('combobox', { name: '投影方式', exact: true }).selectOption(projection);
    await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
    const original = (await snapshot(page)).project;
    const before = await revision(page);
    const point = await xHandle(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect(panel.getByRole('status').first()).toContainText('画面で変形中');
    await page.mouse.move(point.x + 55, point.y, { steps: 8 });
    expect(await revision(page)).toBe(before);
    await page.mouse.up();
    await expect.poll(() => revision(page)).toBe(before + 1);
    const dragged = (await snapshot(page)).project;
    const delta =
      dragged.nodes[0].transform.translation[0] - original.nodes[0].transform.translation[0];
    expect(Math.abs(delta)).toBeGreaterThan(0);
    expect(delta / 0.25).toBeCloseTo(Math.round(delta / 0.25), 8);
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await numeric(page, String(delta));
    const typed = (await snapshot(page)).project;
    expect(typed.nodes).toEqual(dragged.nodes);
    await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '保存済み · revision' })).toBeVisible();
    await attachImage(
      `${projection}-handles`,
      await page.locator('.native-viewport-host').screenshot(),
    );
    const pngEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
    const canonicalPng = await readFile((await (await pngEvent).path())!);
    expect(await warmPixels(page, canonicalPng)).toBe(0); // Green fixture excludes edit axes/selection overlays.
    await attachImage(`${projection}-canonical`, canonicalPng);
  });
}

test('numeric editing without WebGL rejects invalid and interrupted drafts, then restores independently', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const project = nativeBox('native-no-gpu');
  project.name = 'Native editing work';
  const original = await exportBackup(project, new Map());
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'native-no-gpu.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(original),
  });
  const author = page.getByRole('region', { name: '3D制作', exact: true });
  await author
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption('box-node');
  await openControls(page);
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  const panel = controls(page);
  const before = await revision(page);
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  const x = panel.getByLabel('移動量 X（m）', { exact: true });
  await x.fill('1.25');
  await panel.getByRole('button', { name: '数値変形をプレビュー', exact: true }).click();
  expect(await revision(page)).toBe(before);
  await x.fill('');
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('空欄');
  expect(await revision(page)).toBe(before);
  await x.fill('1.25');
  await x.dispatchEvent('compositionstart');
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
  expect(await revision(page)).toBe(before);
  await x.dispatchEvent('compositionend');
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
  await expect.poll(() => revision(page)).toBe(before + 1);
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  const saved = await snapshot(page);
  expect(saved.project.nodes[0].transform.translation).toEqual([1.25, 0, 0]);
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  await x.fill('4');
  await panel.getByRole('button', { name: '数値変形をプレビュー', exact: true }).click();
  const rescued = await snapshot(page); // Explicit backup cancels an uncommitted preview.
  expect(rescued.project.nodes).toEqual(saved.project.nodes);
  await expect(panel.getByRole('button', { name: '数値変形を開始', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await attachImage('numeric-mobile', await page.screenshot({ fullPage: true }));

  const fresh = await context.browser()!.newContext({ viewport: { width: 375, height: 812 } });
  const restored = await fresh.newPage();
  try {
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'restored.cas3dproj',
      mimeType: 'application/zip',
      buffer: saved.bytes,
    });
    await restored
      .getByRole('combobox', { name: '制作オブジェクト', exact: true })
      .selectOption('box-node');
    await openControls(restored);
    await numeric(restored, '0.75');
    const edited = (await snapshot(restored)).project;
    expect(edited.nodes[0].transform.translation).toEqual([2, 0, 0]);
    expect(edited.meshes).toEqual(saved.project.meshes);
    const restoredControls = controls(restored);
    await restoredControls
      .getByRole('combobox', { name: '変形の種類', exact: true })
      .selectOption('rotate');
    await restoredControls.getByRole('button', { name: '数値変形を開始', exact: true }).click();
    await restoredControls.getByLabel('回転量 Y（度）', { exact: true }).fill('90');
    await restoredControls.getByRole('button', { name: '数値変形を適用', exact: true }).click();
    await restoredControls
      .getByRole('combobox', { name: '変形の座標', exact: true })
      .selectOption('local');
    await restoredControls
      .getByRole('combobox', { name: '変形の種類', exact: true })
      .selectOption('scale');
    await restoredControls.getByRole('button', { name: '数値変形を開始', exact: true }).click();
    await restoredControls.getByLabel('拡縮率 X（倍）', { exact: true }).fill('2');
    await restoredControls.getByLabel('拡縮率 Y（倍）', { exact: true }).fill('0.5');
    await restoredControls.getByRole('button', { name: '数値変形を適用', exact: true }).click();
    const shaped = (await snapshot(restored)).project.nodes[0].transform;
    shaped.translation.forEach((value, index) => expect(value).toBeCloseTo([2, 0, 0][index], 8));
    expect(shaped.rotation[0]).toBeCloseTo(0, 8);
    expect(Math.abs(shaped.rotation[1])).toBeCloseTo(Math.SQRT1_2, 8);
    expect(shaped.rotation[2]).toBeCloseTo(0, 8);
    expect(Math.abs(shaped.rotation[3])).toBeCloseTo(Math.SQRT1_2, 8);
    shaped.scale.forEach((value, index) => expect(value).toBeCloseTo([2, 0.5, 1][index], 8));
    await expect(restored.locator('.native-viewport-host canvas')).toHaveCount(0);
  } finally {
    await fresh.close();
  }
});

test('shared multi-selection, cancellation, PNG barriers and GPU suspension preserve canonical edits', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createBox(page);
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  const project = (await snapshot(page)).project;
  await page.getByText('部品の組立を開く', { exact: true }).click();
  const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
  for (const node of project.nodes)
    await assembly
      .getByRole('checkbox', { name: `組立対象 ${node.name} (${node.id})`, exact: true })
      .check();
  const panel = controls(page);
  await expect(panel.getByRole('status').first()).toContainText('選択中 2 個');
  const active = project.nodes[0].id;
  await page.getByRole('combobox', { name: '制作オブジェクト', exact: true }).selectOption(active);
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: '注目するオブジェクト', exact: true }),
  ).toHaveValue(active);
  await expect(panel.getByRole('status').first()).toContainText('選択中 2 個');
  const beforeIme = await revision(page);
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  const imeX = panel.getByLabel('移動量 X（m）', { exact: true });
  await imeX.fill('0.5');
  await imeX.dispatchEvent('compositionstart');
  await expect(imeX).toBeEnabled();
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
  expect(await revision(page)).toBe(beforeIme);
  await imeX.focus();
  await page.keyboard.press('Escape');
  await expect(imeX).toBeEnabled();
  await expect(imeX).toHaveValue('0.5');
  await imeX.dispatchEvent('compositionend');
  await panel.getByRole('button', { name: '数値変形を適用', exact: true }).click();
  await expect.poll(() => revision(page)).toBe(beforeIme + 1);
  const moved = (await snapshot(page)).project;
  for (let i = 0; i < moved.nodes.length; i++)
    expect(moved.nodes[i].transform.translation[0]).toBeCloseTo(
      project.nodes[i].transform.translation[0] + 0.5,
    );
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  await panel.getByLabel('移動量 X（m）', { exact: true }).fill('4');
  await panel.getByRole('button', { name: '数値変形をプレビュー', exact: true }).click();
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '操作を完了できませんでした' }),
  ).toBeVisible();
  await expect(panel.getByRole('status').first()).toContainText('プレビュー中');
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '数値変形を開始', exact: true })).toBeEnabled();
  expect((await snapshot(page)).project.nodes).toEqual(moved.nodes);
  await numeric(page, '0.25');
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const resumed = (await snapshot(page)).project;
  expect(resumed.nodes[0].transform.translation[0]).toBeCloseTo(
    moved.nodes[0].transform.translation[0] + 0.25,
  );
});

test('real context loss cancels preview, permits numeric edits and binds the restored canvas', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createBox(page);
  const panel = controls(page);
  const original = (await snapshot(page)).project;
  await panel.getByRole('button', { name: '数値変形を開始', exact: true }).click();
  await panel.getByLabel('移動量 X（m）', { exact: true }).fill('3');
  await panel.getByRole('button', { name: '数値変形をプレビュー', exact: true }).click();
  const owner = await page.evaluateHandle(() => {
    const canvas = document.querySelector('.native-viewport-host canvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context unavailable');
    return { canvas, extension };
  });
  try {
    await owner.evaluate(async ({ canvas, extension }) => {
      const lost = new Promise<void>((resolve) =>
        canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }),
      );
      extension.loseContext();
      await lost;
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'GPUとの接続が失われました' }),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: '数値変形を開始', exact: true })).toBeEnabled();
    expect(await revision(page)).toBe(original.revision);
    await numeric(page, '0.5');
    const offlineEdit = (await snapshot(page)).project;
    expect(offlineEdit.nodes[0].transform.translation[0]).toBeCloseTo(
      original.nodes[0].transform.translation[0] + 0.5,
    );
    await owner.evaluate(({ extension }) => extension.restoreContext());
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
    expect(await owner.evaluate(({ canvas }) => canvas.isConnected)).toBe(false);
    const canvas = page.locator('.native-viewport-host canvas');
    await expect(canvas).toHaveCount(1);
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => revision(page)).toBe(offlineEdit.revision + 1);
    const restored = (await snapshot(page)).project;
    expect(restored.nodes[0].transform.translation[0]).toBeCloseTo(
      offlineEdit.nodes[0].transform.translation[0] + 0.1,
    );
    const pngEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
    await attachImage('context-restored', await readFile((await (await pngEvent).path())!));
  } finally {
    await owner.dispose();
  }
});
