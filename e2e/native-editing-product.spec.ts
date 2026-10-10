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

test('world alignment keeps a selected reference fixed through touch, Undo and independent recovery', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const project = nativeBox('alignment-fixture');
  project.name = 'Alignment fixture';
  project.nodes[0].transform.translation = [2, 1, 0];
  const moving = structuredClone(project.nodes[0]);
  moving.id = 'moving-box';
  moving.name = 'Moving box';
  moving.transform.translation = [-2, -1, 0];
  moving.transform.scale = [2, 1, 1];
  project.nodes.push(moving);
  const bytes = await exportBackup(project, new Map());
  try {
    const page = await context.newPage();
    await page.goto('/3d/');
    await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'alignment.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(bytes),
    });
    await expect(
      page.getByRole('heading', { name: 'Alignment fixture', exact: true }),
    ).toBeVisible();
    await page.getByText('部品の組立を開く', { exact: true }).tap();
    const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
    for (const node of project.nodes) {
      const selected = assembly.getByRole('checkbox', {
        name: `組立対象 ${node.name} (${node.id})`,
        exact: true,
      });
      if (!(await selected.isChecked())) await selected.tap();
    }
    await assembly.getByText('部品をworld軸に整列', { exact: true }).tap();
    const reference = assembly.getByRole('combobox', {
      name: '整列の基準部品（移動しない）',
      exact: true,
    });
    const apply = assembly.getByRole('button', { name: 'world軸の整列を適用', exact: true });
    await expect(apply).toBeDisabled();
    await reference.selectOption('box-node');
    await assembly.getByRole('combobox', { name: '揃える位置', exact: true }).selectOption('max');
    await assembly.getByRole('button', { name: '現在の組立対象を確認', exact: true }).tap();
    await expect(apply).toBeEnabled();
    await reference.selectOption('moving-box');
    await expect(apply).toBeDisabled();
    await reference.selectOption('box-node');
    await assembly.getByRole('button', { name: '現在の組立対象を確認', exact: true }).tap();
    const referenceSelection = assembly.getByRole('checkbox', {
      name: '組立対象 Box (box-node)',
      exact: true,
    });
    await referenceSelection.tap();
    await expect(apply).toBeDisabled();
    await referenceSelection.tap();
    await expect(apply).toBeDisabled();
    await assembly.getByRole('button', { name: '現在の組立対象を確認', exact: true }).tap();
    const before = await snapshot(page);
    await reference.dispatchEvent('compositionstart');
    await apply.tap();
    expect((await snapshot(page)).project).toEqual(before.project);
    await reference.dispatchEvent('compositionend');
    for (const mode of ['composing', 'legacy'] as const) {
      expect(
        await apply.evaluate(
          (button, kind) =>
            !button.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
                isComposing: kind === 'composing',
                keyCode: kind === 'legacy' ? 229 : 13,
              }),
            ),
          mode,
        ),
      ).toBe(true);
      expect((await snapshot(page)).project).toEqual(before.project);
    }
    await apply.focus();
    await page.keyboard.press('Enter');
    const aligned = await snapshot(page);
    expect(aligned.project.revision).toBe(before.project.revision + 1);
    expect(aligned.project.nodes[0]).toEqual(before.project.nodes[0]);
    expect(aligned.project.nodes[1].transform).toEqual({
      ...moving.transform,
      translation: [1.5, -1, 0],
    });
    expect(aligned.project.meshes).toEqual(before.project.meshes);
    expect(aligned.project.materials).toEqual(before.project.materials);
    await expect(apply).toBeDisabled();
    await page.getByRole('button', { name: '元に戻す', exact: true }).tap();
    expect((await snapshot(page)).project.nodes).toEqual(before.project.nodes);
    await expect(apply).toBeDisabled();
    await page.getByRole('button', { name: 'やり直す', exact: true }).tap();
    const beforeNoop = await snapshot(page);
    expect(beforeNoop.project.nodes).toEqual(aligned.project.nodes);
    await assembly.getByRole('button', { name: '現在の組立対象を確認', exact: true }).tap();
    await apply.tap();
    await expect(assembly.getByRole('alert')).toBeVisible();
    expect((await snapshot(page)).project).toEqual(beforeNoop.project);
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
    await attachImage(
      'alignment-canvas',
      await page.locator('.native-viewport-host canvas').screenshot(),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await attachImage('alignment-controls', await assembly.screenshot());
    const independent = await browser.newContext({
      baseURL,
      viewport: { width: 375, height: 812 },
    });
    try {
      const restored = await independent.newPage();
      await restored.goto('/3d/');
      await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
        name: 'aligned.cas3dproj',
        mimeType: 'application/zip',
        buffer: Buffer.from(aligned.bytes),
      });
      await expect(
        restored.getByRole('heading', { name: 'Alignment fixture', exact: true }),
      ).toBeVisible();
      expect((await snapshot(restored)).project.nodes).toEqual(aligned.project.nodes);
      expect((await snapshot(restored)).project.meshes).toEqual(aligned.project.meshes);
    } finally {
      await independent.close();
    }
  } finally {
    await context.close();
  }
});

test('native 0.2.0 six attributes survive Undo, save and independent backup restoration', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await createBox(page);
  const panel = page.getByRole('region', { name: '3D制作', exact: true });
  const start = (await snapshot(page)).project;
  await panel
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption(start.nodes[0].id);
  await panel.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await panel
    .getByRole('combobox', { name: '制作材質', exact: true })
    .selectOption(start.materials[0].id);
  await panel.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  for (const [name, value] of [
    ['発光色 R', '0.2'],
    ['発光色 G', '0.3'],
    ['発光色 B', '0.4'],
    ['透過しきい値 alphaCutoff', '0.25'],
  ] as const)
    await panel.getByLabel(name, { exact: true }).fill(value);
  await panel.getByRole('combobox', { name: '透過モード', exact: true }).selectOption('MASK');
  await panel.getByRole('checkbox', { name: '両面を表示', exact: true }).check();
  await panel.getByRole('button', { name: '材質を適用', exact: true }).click();
  let saved = (await snapshot(page)).project;
  expect(saved.materials[0]).toMatchObject({
    emissiveColor: [0.2, 0.3, 0.4],
    alphaMode: 'MASK',
    alphaCutoff: 0.25,
    doubleSided: true,
  });
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect((await snapshot(page)).project.materials).toEqual(start.materials);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await panel.getByText('部品の名前・位置・複製', { exact: true }).click();
  await panel.getByRole('button', { name: '部品を非表示', exact: true }).click();
  await panel.getByRole('button', { name: '部品を編集ロック', exact: true }).click();
  saved = (await snapshot(page)).project;
  expect(saved.nodes[0]).toMatchObject({ visible: false, locked: true });
  expect(saved.schemaVersion).toBe('0.3.0');
  await panel.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await panel.getByLabel('部品名', { exact: true }).fill('Blocked name');
  const lockedRevision = await revision(page);
  await panel.getByRole('button', { name: '部品名を適用', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('ロック');
  expect(await revision(page)).toBe(lockedRevision);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const archive = (await snapshot(page)).bytes;
  await page.reload();
  await page.getByRole('button', { name: /Native editing work.*revision/ }).click();
  expect((await snapshot(page)).project.nodes).toEqual(saved.nodes);
  expect((await snapshot(page)).project.materials).toEqual(saved.materials);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 } });
  try {
    const restored = await context.newPage();
    await restored.goto('/3d/');
    await restored
      .getByLabel('.cas3dproj を選んでコピー復元', { exact: true })
      .setInputFiles({ name: 'six.cas3dproj', mimeType: 'application/zip', buffer: archive });
    await expect(
      restored.getByRole('heading', { name: 'Native editing work', exact: true }),
    ).toBeVisible();
    const result = (await snapshot(restored)).project;
    expect(result.id).not.toBe(saved.id);
    expect(result.nodes).toEqual(saved.nodes);
    expect(result.materials).toEqual(saved.materials);
    const form = restored.getByRole('region', { name: '3D制作', exact: true });
    await form
      .getByRole('combobox', { name: '制作オブジェクト', exact: true })
      .selectOption(saved.nodes[0].id);
    await form.getByText('部品の名前・位置・複製', { exact: true }).click();
    await form.getByRole('button', { name: '部品の編集ロックを解除', exact: true }).click();
    await form.getByRole('button', { name: '部品を表示', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
    await form.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
    await form.getByLabel('部品名', { exact: true }).fill('Re-edited copy');
    await form.getByRole('button', { name: '部品名を適用', exact: true }).click();
    expect((await snapshot(restored)).project.nodes[0].name).toBe('Re-edited copy');
  } finally {
    await context.close();
  }
});

test('legacy copy confirmation, cancellation, quota retry and original recovery download preserve old storage', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { hashProject } = await import('../src/core3d/storage/repository');
  const { STORAGE_STORES, LEGACY_PROJECT_3D_DB_NAME, PROJECT_3D_DB_NAME } =
    await import('../src/core3d/storage/db');
  const { game: _game, ...legacyBase } = nativeBox('legacy-browser');
  void _game;
  const old = {
    ...legacyBase,
    schemaVersion: '0.1.0' as const,
    name: 'Legacy retained',
  };
  const contentHash = await hashProject(old);
  await page.goto('/3d/');
  await page.getByRole('button', { name: '旧作品の一覧を読む', exact: true }).click();
  await expect(page.getByText('旧保存領域に作品はありません。', { exact: true })).toBeVisible();
  await page.evaluate(
    async ({ old, contentHash, stores, legacyName, currentName }) => {
      const open = indexedDB.open(legacyName, 1);
      open.onupgradeneeded = () =>
        stores.forEach((name) => open.result.createObjectStore(name, { keyPath: 'id' }));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction(['roots', 'snapshots'], 'readwrite');
      tx.objectStore('roots').add({
        id: old.id,
        name: old.name,
        revision: 0,
        snapshotId: 'old',
        recoverySnapshotIds: [],
        trashed: false,
      });
      tx.objectStore('snapshots').add({ id: 'old', project: old, contentHash });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      const add = IDBObjectStore.prototype.add;
      Object.assign(window, { failLegacyCopy: true });
      IDBObjectStore.prototype.add = function (...args) {
        if (
          (window as unknown as { failLegacyCopy: boolean }).failLegacyCopy &&
          this.transaction.db.name === currentName &&
          this.name === 'legacyBackups'
        )
          throw new DOMException('Test copy quota', 'QuotaExceededError');
        return add.apply(this, args);
      };
    },
    {
      old,
      contentHash,
      stores: STORAGE_STORES.filter((store) => store !== 'legacyBackups'),
      legacyName: LEGACY_PROJECT_3D_DB_NAME,
      currentName: PROJECT_3D_DB_NAME,
    },
  );
  await page.getByRole('button', { name: '旧作品の一覧を読む', exact: true }).click();
  const choose = page.getByRole('button', {
    name: 'Legacy retained をコピーして編集',
    exact: true,
  });
  await choose.click();
  await page.getByRole('button', { name: 'コピーを取り消す', exact: true }).click();
  await expect(page.getByRole('group', { name: '旧作品のコピー確認', exact: true })).toHaveCount(0);
  await choose.click();
  await page.getByRole('button', { name: '容量増加を確認してコピーを作成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存容量');
  await expect(page.getByRole('heading', { name: 'Legacy retained', exact: true })).toHaveCount(0);
  await page.evaluate(() => Object.assign(window, { failLegacyCopy: false }));
  await page.getByRole('button', { name: '容量増加を確認してコピーを作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Legacy retained', exact: true })).toBeVisible();
  const copy = (await snapshot(page)).project;
  expect(copy.id).not.toBe(old.id);
  expect(copy.materials[0].alphaMode).toBe('LEGACY_AUTO');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '移行前の復元控えを取得', exact: true }).click();
  const originalBytes = await readFile((await (await download).path())!);
  const { unzipSync, strFromU8 } = await import('fflate');
  expect(JSON.parse(strFromU8(unzipSync(originalBytes)['project.json']))).toEqual(old);
  const stored = await page.evaluate(async (name) => {
    const open = indexedDB.open(name);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(['snapshots', 'roots'], 'readonly');
    const snapshots = tx.objectStore('snapshots').getAll();
    const roots = tx.objectStore('roots').getAll();
    const result = await new Promise<{ snapshots: unknown[]; roots: unknown[] }>(
      (resolve, reject) => {
        tx.oncomplete = () => resolve({ snapshots: snapshots.result, roots: roots.result });
        tx.onabort = () => reject(tx.error);
      },
    );
    db.close();
    return result;
  }, LEGACY_PROJECT_3D_DB_NAME);
  expect(stored.snapshots).toEqual([{ id: 'old', project: old, contentHash }]);
  expect(stored.roots).toEqual([
    {
      id: old.id,
      name: old.name,
      revision: 0,
      snapshotId: 'old',
      recoverySnapshotIds: [],
      trashed: false,
    },
  ]);
});

test('history guidance distinguishes commit budget from owned estimates without changing content', async ({
  page,
}) => {
  await createBox(page);
  const before = await snapshot(page);
  const beforeRevision = await revision(page);
  const history = page.getByRole('group', { name: 'このタブのUndo履歴と予算', exact: true });
  await history.getByText('Undo履歴と予算を確認', { exact: true }).click();
  await expect(history).toContainText('元に戻せる操作: 1 件 / やり直せる操作: 0 件');
  await expect(history).toContainText('32 MiB');
  await expect(history).toContainText('上のJSON上限とは別の値');
  await expect(history).toContainText('Undo・Redo履歴は含みません');
  expect(await revision(page)).toBe(beforeRevision);
  expect((await snapshot(page)).project).toEqual(before.project);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(history).toContainText('元に戻せる操作: 0 件 / やり直せる操作: 1 件');
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect(history).toContainText('元に戻せる操作: 1 件 / やり直せる操作: 0 件');
  const restored = (await snapshot(page)).project;
  expect({ ...restored, revision: before.project.revision }).toEqual(before.project);
  await history.getByText('Undo履歴と予算を確認', { exact: true }).click();
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await history.getByText('Undo履歴と予算を確認', { exact: true }).click();
  await expect(history).toContainText('元に戻せる操作: 1 件 / やり直せる操作: 0 件');
  await expect(history.getByRole('button')).toHaveCount(0);
});

test('locked hierarchy copy and deletion explain refusal without applying or dropping data', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createBox(page);
  const authoring = page.getByRole('region', { name: '3D制作', exact: true });
  await authoring.getByLabel('制作オブジェクト', { exact: true }).selectOption({ index: 1 });
  await authoring.getByText('部品の名前・位置・複製', { exact: true }).click();
  await authoring.getByRole('button', { name: '部品を編集ロック', exact: true }).click();
  const before = (await snapshot(page)).project;
  expect(before.nodes[0].locked).toBe(true);
  for (const operation of [
    {
      summary: '階層と依存情報を複製',
      button: '部品と階層の複製内容を確認',
      target: '階層の複製',
      confirmation: '階層複製の確認',
    },
    {
      summary: '選択した部品の削除',
      button: '部品の削除内容を確認',
      target: '部品の削除',
      confirmation: '部品削除の確認',
    },
  ]) {
    await authoring.getByText(operation.summary, { exact: true }).click();
    const panel = authoring
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: operation.summary }) });
    await panel.getByRole('button', { name: operation.button, exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText(operation.target);
    await expect(panel.getByRole('alert')).toContainText(
      '編集ロック中の部品または共有資源に影響します。',
    );
    await expect(panel.getByRole('alert')).toContainText('[EDIT_LOCKED]');
    await expect(
      panel.getByRole('region', { name: operation.confirmation, exact: true }),
    ).toHaveCount(0);
    expect((await snapshot(page)).project).toEqual(before);
  }
});
