import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { nativeBox } from '../src/core3d/fixtures/nativeBox';
import { exportBackup } from '../src/core3d/backup/backup';

async function createBox(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native box work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '3D制作', exact: true })).toHaveCount(1);
}
async function png(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe('Native box work.png');
  return readFile((await download.path())!);
}

test('empty project to native box, keyboard camera, GPU pause, backup restore and re-edit', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/3d/');
  await expect(page.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  expect(
    requests.filter((url) =>
      /nativeViewport|adapters3d|assets\/renderer-|three\.js|OrbitControls/i.test(url),
    ),
  ).toEqual([]);
  await createBox(page);
  const before = await png(page);
  await test.info().attach('product-native-box.png', { body: before, contentType: 'image/png' });
  const rotate = page.getByRole('button', { name: 'カメラを左へ回転', exact: true });
  await rotate.focus();
  await page.keyboard.press('Enter');
  await expect(rotate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rotate).toBeFocused();
  const rotated = await png(page);
  expect(rotated.equals(before)).toBe(false);
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GPU表示を再開', exact: true })).toBeEnabled();
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  const backupEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const backup = await backupEvent;
  const backupBytes = await readFile((await backup.path())!);
  await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  expect((await png(page)).equals(rotated)).toBe(true);

  const fresh = await context.browser()!.newContext({
    viewport: page.viewportSize()!,
    deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
  });
  const restored = await fresh.newPage();
  try {
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: backup.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: backupBytes,
    });
    await expect(
      restored.getByRole('heading', { name: 'Native box work', exact: true }),
    ).toBeVisible();
    await restored.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
    expect((await png(restored)).equals(before)).toBe(true);
    await restored.getByRole('button', { name: '箱を追加', exact: true }).click();
    await restored.getByRole('button', { name: '元に戻す', exact: true }).click();
    await restored.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(
      restored.getByRole('status').filter({ hasText: '保存済み · revision' }),
    ).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('native panel fits a phone width and exposes keyboard-sized controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await createBox(page);
  const zoom = page.getByRole('button', { name: '3D表示を拡大', exact: true });
  const box = await zoom.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await zoom.focus();
  await page.keyboard.press('Space');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('product-native-panel-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('offline display chunk failure preserves saving and complete native backup', async ({
  page,
  context,
}) => {
  const events: unknown[] = [];
  page.on('request', (request) => events.push({ event: 'request', url: request.url() }));
  page.on('requestfailed', (request) =>
    events.push({ event: 'requestfailed', url: request.url(), error: request.failure() }),
  );
  page.on('response', (response) =>
    events.push({ event: 'response', url: response.url(), status: response.status() }),
  );
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) events.push({ event: 'navigation', url: frame.url() });
  });
  try {
    await page.goto('/3d/');
    await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Offline native work');
    await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
    await expect(
      page.getByRole('heading', { name: 'Offline native work', exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: '箱を追加', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '3D表示を読み込めませんでした' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '保存済み · revision' })).toBeVisible();
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    expect((await event).suggestedFilename()).toBe('Offline native work.cas3dproj');
    events.push({
      event: 'offline-boundary',
      error: await page.getByTestId('viewport-load-error').textContent(),
    });
    await context.setOffline(false);
    await page.getByRole('button', { name: '保存してページを再読み込み' }).click();
    await page.getByRole('button', { name: /Offline native work.*revision/ }).click();
    await expect(page.getByRole('button', { name: '箱を追加', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  } finally {
    const error = await page
      .getByTestId('viewport-load-error')
      .textContent({ timeout: 500 })
      .catch(() => null);
    events.push({ event: 'final-boundary', error });
    await test.info().attach('viewport-chunk-recovery.json', {
      body: Buffer.from(JSON.stringify(events, null, 2)),
      contentType: 'application/json',
    });
  }
});

test('inspection camera and helpers preserve canonical revision and survive GPU reconstruction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await createBox(page);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const revision = page.getByRole('status').filter({ hasText: '保存済み · revision' });
  await expect(revision).toContainText('revision 1');
  const original = await png(page);
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  await page.getByRole('button', { name: '正面から見る', exact: true }).click();
  const front = await png(page);
  expect(front.equals(original)).toBe(false);
  await page.getByRole('button', { name: '上面から見る', exact: true }).click();
  expect((await png(page)).equals(front)).toBe(false);
  const objects = page.getByRole('combobox', { name: '注目するオブジェクト', exact: true });
  const id = await objects.locator('option').nth(1).getAttribute('value');
  await objects.selectOption(id!);
  await expect(page.locator('.native-inspection p').filter({ hasText: '選択対象:' })).toContainText(
    id!,
  );
  await page.getByRole('button', { name: '選択対象に合わせる', exact: true }).click();
  await page.getByRole('combobox', { name: '投影方式', exact: true }).selectOption('orthographic');
  await page.getByLabel('平行投影の高さ', { exact: true }).fill('3');
  await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: '描画モード', exact: true }).selectOption('wireframe');
  await page.getByRole('combobox', { name: '背景', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: '照明', exact: true }).selectOption('soft');
  await page.getByLabel('グリッド', { exact: true }).check();
  await page.getByLabel('座標軸', { exact: true }).check();
  await page.getByLabel('全体の境界', { exact: true }).check();
  await expect(revision).toContainText('revision 1');
  const inspected = await png(page);
  expect(inspected.equals(original)).toBe(false);
  await page.getByRole('combobox', { name: '照明', exact: true }).selectOption('studio');
  expect((await png(page)).equals(inspected)).toBe(true);
  await page.getByRole('combobox', { name: '背景', exact: true }).selectOption('dark');
  const darkWireframe = await png(page);
  expect(darkWireframe.equals(inspected)).toBe(false);
  await test
    .info()
    .attach('native-inspection-dark.png', { body: darkWireframe, contentType: 'image/png' });
  await page.getByRole('combobox', { name: '背景', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: '照明', exact: true }).selectOption('soft');
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  expect((await png(page)).equals(inspected)).toBe(true);
  await page.getByRole('button', { name: '現在のカメラを読み取る', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '投影方式', exact: true })).toHaveValue(
    'orthographic',
  );
  await expect(page.getByRole('combobox', { name: '描画モード', exact: true })).toHaveValue(
    'wireframe',
  );
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (
        rect.right <= innerWidth &&
        rect.left >= 0 &&
        element.scrollWidth <= element.clientWidth &&
        !element.matches('input,select,option,fieldset,label,details')
      )
        return [];
      const style = getComputedStyle(element);
      return [
        {
          tag: element.tagName,
          className: element.className,
          width: rect.width,
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          offsetWidth: (element as HTMLElement).offsetWidth,
          label: (element as HTMLInputElement).labels?.[0]?.textContent?.slice(0, 100),
          textLength: element.matches('option') ? element.textContent?.length : undefined,
          valueLength: element.matches('input')
            ? (element as HTMLInputElement).value.length
            : undefined,
          overflowX: style.overflowX,
          font: style.font,
          display: style.display,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          gridTemplateColumns: style.gridTemplateColumns,
        },
      ];
    }),
  }));
  const nativeControlProbe =
    layout.documentWidth > layout.viewport
      ? await page.evaluate(() => {
          const width = () => {
            void document.body.offsetHeight;
            return document.documentElement.scrollWidth;
          };
          const before = width();
          const options = [...document.querySelectorAll('select option')].map((option) => ({
            option,
            text: option.textContent,
          }));
          options.forEach(({ option }, index) => {
            option.textContent = `Option ${index}`;
          });
          const shortOptions = width();
          options.forEach(({ option, text }) => {
            option.textContent = text;
          });
          const restoredOptions = width();
          const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="text"]')].map(
            (input) => ({ input, value: input.value }),
          );
          inputs.forEach(({ input }) => {
            input.value = '0';
          });
          const shortInputs = width();
          inputs.forEach(({ input, value }) => {
            input.value = value;
          });
          return { before, shortOptions, restoredOptions, shortInputs, restoredInputs: width() };
        })
      : null;
  await test.info().attach('native-inspection-layout.json', {
    body: Buffer.from(JSON.stringify({ ...layout, nativeControlProbe }, null, 2)),
    contentType: 'application/json',
  });
  await test.info().attach('native-inspection-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await test.info().attach('native-inspection.png', { body: inspected, contentType: 'image/png' });
  expect(layout.documentWidth - layout.viewport).toBeLessThanOrEqual(0);
});

test('long duplicate object names retain complete identity without phone overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const project = nativeBox('long-label-fixture');
  project.name = 'Long labels';
  const name = '非常に長い同じ名前のオブジェクトを識別して確認するための原本';
  project.nodes[0].id = 'long-original-canonical-node-1111111111111111';
  project.nodes[0].name = name;
  const secondId = 'long-original-canonical-node-2222222222222222';
  project.nodes.push({ ...structuredClone(project.nodes[0]), id: secondId });
  const backup = await exportBackup(project, new Map());
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'long-labels.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole('heading', { name: 'Long labels', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  const select = page.getByRole('combobox', { name: '注目するオブジェクト', exact: true });
  const labels = await select.locator('option').allTextContents();
  expect(labels[1]).not.toBe(labels[2]);
  await select.selectOption(secondId);
  const description = page.locator('.native-inspection p').filter({ hasText: '選択対象:' });
  await expect(description).toContainText(name);
  await expect(description).toContainText(secondId);
  await page.getByRole('button', { name: '選択対象に合わせる', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await test.info().attach('native-long-labels-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('native authoring creates, edits, undoes and restores independent mesh and material work', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native box work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  const panel = page.getByRole('region', { name: '3D制作', exact: true });
  await panel.getByText('基本形を作成', { exact: true }).click();
  await panel.getByRole('combobox', { name: '基本形', exact: true }).selectOption('plane');
  await panel.getByLabel('分割数', { exact: true }).fill('1');
  await panel.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const firstNode = await panel
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .inputValue();
  await panel.getByRole('combobox', { name: '基本形', exact: true }).selectOption('sphere');
  await panel.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await panel.getByText('部品の名前・位置・複製', { exact: true }).click();
  await panel.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await panel.getByLabel('位置 X（m）', { exact: true }).fill('1.5');
  await panel.getByLabel('回転 Y（度）', { exact: true }).fill('30');
  await panel.getByRole('button', { name: '部品の変形を適用', exact: true }).click();
  await expect(panel.getByRole('button', { name: '部品の変形を適用', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(panel.getByRole('button', { name: '部品の変形を適用', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await panel.getByRole('button', { name: '独立した部品を複製', exact: true }).click();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: '制作オブジェクト', exact: true })).toHaveValue(
    '',
  );
  await panel
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption(firstNode);
  await expect(panel.getByRole('button', { name: '部品の変形を適用', exact: true })).toBeDisabled();
  await panel.getByText('頂点・辺・面を編集', { exact: true }).click();
  const selection = panel.getByRole('combobox', { name: '制作要素', exact: true });
  await selection.selectOption({ index: 1 });
  await panel.getByLabel('移動量 Y（m）', { exact: true }).fill('0.1');
  await panel.getByRole('button', { name: '選択要素を移動', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByRole('combobox', { name: '編集要素', exact: true }).selectOption('edge');
  await selection.selectOption({ index: 1 });
  await panel.getByRole('button', { name: '選択要素を移動', exact: true }).click();
  await panel.getByRole('combobox', { name: '編集要素', exact: true }).selectOption('face');
  await selection.selectOption({ index: 1 });
  await panel.getByRole('button', { name: '選択面を押し出す', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByRole('button', { name: '選択面を削除', exact: true }).click();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await panel.getByRole('button', { name: 'smooth法線を適用', exact: true }).click();
  await panel.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await panel.getByRole('combobox', { name: '制作材質', exact: true }).selectOption({ index: 1 });
  await panel.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await panel.getByLabel('赤 R', { exact: true }).fill('0.85');
  await panel.getByRole('button', { name: '材質を適用', exact: true }).click();
  await expect(panel.getByRole('button', { name: '材質を適用', exact: true })).toBeDisabled();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const snapshot = async (target: Page) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    const file = await event;
    const bytes = await readFile((await file.path())!);
    const { importBackup } = await import('../src/core3d/backup/backup');
    return { bytes, project: (await importBackup(bytes)).project };
  };
  const before = await snapshot(page);
  expect(before.project.nodes).toHaveLength(2);
  expect(before.project.nodes[1].transform.translation).toEqual([1.5, 0, 0]);
  const editedMesh = before.project.meshes.find(
    (m) => m.id === before.project.nodes.find((n) => n.id === firstNode)!.meshId,
  )!;
  expect(editedMesh.faces).toHaveLength(7);
  expect(editedMesh.faces.every((f) => f.uv?.length === 3 && f.normals?.length === 3)).toBe(true);
  expect(before.project.materials[0].baseColor[0]).toBe(0.85);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('native-authoring-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'カメラをリセット', exact: true }).click();
  await test
    .info()
    .attach('native-authoring-model.png', { body: await png(page), contentType: 'image/png' });
  const fresh = await context.browser()!.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const restored = await fresh.newPage();
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'native.cas3dproj',
      mimeType: 'application/zip',
      buffer: before.bytes,
    });
    await expect(
      restored.getByRole('heading', { name: 'Native box work', exact: true }),
    ).toBeVisible();
    const copy = await snapshot(restored);
    expect(copy.project.meshes).toEqual(before.project.meshes);
    expect(copy.project.materials).toEqual(before.project.materials);
    expect(copy.project.nodes).toEqual(before.project.nodes);
    const authoring = restored.getByRole('region', { name: '3D制作', exact: true });
    await authoring
      .getByRole('combobox', { name: '制作オブジェクト', exact: true })
      .selectOption(firstNode);
    await authoring.getByText('頂点・辺・面を編集', { exact: true }).click();
    await authoring
      .getByRole('combobox', { name: '制作要素', exact: true })
      .selectOption({ index: 1 });
    await authoring.getByLabel('移動量 X（m）', { exact: true }).fill('0.05');
    await authoring.getByRole('button', { name: '選択要素を移動', exact: true }).click();
    await expect(authoring.getByRole('alert')).toHaveCount(0);
    const continued = await snapshot(restored);
    expect(continued.project.meshes).not.toEqual(before.project.meshes);
    expect((await snapshot(page)).project.meshes).toEqual(before.project.meshes);
  } finally {
    await fresh.close();
  }
});

test('authoring invalid drafts and composition do not change saved revision or geometry', async ({
  page,
}) => {
  await createBox(page);
  const panel = page.getByRole('region', { name: '3D制作', exact: true });
  await panel.getByText('基本形を作成', { exact: true }).click();
  const status = page.getByRole('status').filter({ hasText: 'revision' });
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await expect(status).toContainText('保存済み');
  const before = await status.textContent();
  const width = panel.getByLabel('幅 X（m）', { exact: true });
  await width.fill('');
  await panel.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('空欄');
  expect(await status.textContent()).toBe(before);
  await width.fill('1');
  await width.dispatchEvent('compositionstart');
  await panel.getByRole('button', { name: '基本形を追加', exact: true }).click();
  expect(await status.textContent()).toBe(before);
  await width.dispatchEvent('compositionend');
  await panel.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(await status.textContent()).not.toBe(before);
});
