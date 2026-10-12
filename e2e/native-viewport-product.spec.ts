import { expect, test, type Page, type Locator } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { nativeBox } from '../src/core3d/fixtures/nativeBox';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';

const literalPattern = (value: string) => new RegExp(value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'));

async function attachNativeVisual(name: string, body: Buffer) {
  const path = test.info().outputPath(`native-visual-${name}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  await test.info().attach(name, { path, contentType: 'image/png' });
}

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

async function snapshot(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return importBackup(await readFile((await (await event).path())!));
}

type ViewerKeyProbe = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

async function dispatchViewerKey(viewer: Locator, probe: ViewerKeyProbe) {
  return viewer.evaluate((element, keyProbe) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: keyProbe.key,
      isComposing: keyProbe.isComposing,
      ctrlKey: keyProbe.ctrlKey,
      metaKey: keyProbe.metaKey,
      altKey: keyProbe.altKey,
    });
    if (keyProbe.keyCode !== undefined)
      Object.defineProperty(event, 'keyCode', { get: () => keyProbe.keyCode });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, probe);
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

test('3D viewer and active-object selector expose text alternatives for canvas information', async ({
  page,
}) => {
  await createBox(page);

  const viewer = page.getByRole('group', { name: 'Native box workの3D表示', exact: true });
  await expect(viewer).toHaveAttribute('aria-describedby', /\S+/);
  const viewerDescriptionIds = (await viewer.getAttribute('aria-describedby'))!
    .split(/\s+/)
    .filter(Boolean);
  expect(viewerDescriptionIds).not.toHaveLength(0);
  const viewerDescriptions = await Promise.all(
    viewerDescriptionIds.map(async (id) => {
      const description = page.locator(`[id="${id}"]`);
      await expect(description).toHaveCount(1);
      return (await description.textContent()) ?? '';
    }),
  );
  const viewerDescriptionText = viewerDescriptions.join(' ');
  expect(viewerDescriptionText).toContain('Tabキーで操作ボタンと3D表示領域へ移動できます');
  expect(viewerDescriptionText).toContain('表示領域の外枠にフォーカスして矢印キーでカメラを回転');
  expect(viewerDescriptionText).toContain('PNGは背景付きの表示画像です。');

  const authoring = page.getByRole('region', { name: '3D制作', exact: true });
  const objectSelect = authoring.getByRole('combobox', { name: '制作オブジェクト', exact: true });
  await expect(objectSelect).toHaveAttribute('aria-describedby', /\S+/);
  const objectDescriptionIds = (await objectSelect.getAttribute('aria-describedby'))!
    .split(/\s+/)
    .filter(Boolean);
  expect(objectDescriptionIds).not.toHaveLength(0);
  const objectDescriptions = await Promise.all(
    objectDescriptionIds.map(async (id) => {
      const description = page.locator(`[id="${id}"]`);
      await expect(description).toHaveCount(1);
      return (await description.textContent()) ?? '';
    }),
  );
  expect(objectDescriptions.join(' ')).toMatch(/制作対象（アクティブ）: 箱 \/ .+/);
  await expect(objectSelect.locator('option:checked')).toHaveText('1: 箱');
  await expect(page.getByRole('status').filter({ hasText: '3D表示中' })).toBeVisible();
  await page.getByText('部品の組立を開く', { exact: true }).click();
  const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
  await expect(
    assembly.getByRole('heading', { name: '部品を組み立てる', level: 3, exact: true }),
  ).toBeVisible();
  const sceneList = assembly.locator('.native-assembly-list');
  await expect(sceneList).toHaveAttribute('aria-describedby', /\S+/);
  const sceneDescriptionIds = (await sceneList.getAttribute('aria-describedby'))!
    .split(/\s+/)
    .filter(Boolean);
  expect(sceneDescriptionIds).not.toHaveLength(0);
  const selectionStatus = assembly.getByRole('status');
  await expect(selectionStatus).toHaveAttribute('aria-live', 'polite');
  await expect(selectionStatus).toHaveAttribute('aria-atomic', 'true');
  const sceneDescriptions = await Promise.all(
    sceneDescriptionIds.map(async (id) => {
      const description = page.locator(`[id="${id}"]`);
      await expect(description).toHaveCount(1);
      return (await description.textContent()) ?? '';
    }),
  );
  expect(sceneDescriptions.join(' ')).toContain('複数の部品を選べます');
  expect(sceneDescriptions.join(' ')).toContain('各項目には名前とIDがあります');
  const sceneItem = sceneList.getByRole('listitem');
  await expect(sceneItem).toHaveCount(1);
  await expect(sceneItem).toContainText('アクティブ');
  await expect(sceneItem).toContainText('ID:');
  await expect(sceneItem).toContainText('親: なし');
  const assemblyCheckbox = sceneList.getByRole('checkbox', { name: /^組立対象 箱 \(.+\)$/ });
  await expect(assemblyCheckbox).toBeChecked();
  await expect(selectionStatus).toContainText('選択中 1 個');
  const selectedId = (await assemblyCheckbox.getAttribute('aria-label'))?.match(
    /\(([^)]+)\)$/,
  )?.[1];
  expect(selectedId).toBeTruthy();
  await expect(selectionStatus).toContainText(`アクティブ: 箱 (ID: ${selectedId})`);
});
test('keyboard-focused viewer orbits, zooms, frames selection and fit without editing the project', async ({
  page,
}) => {
  await createBox(page);
  const viewer = page.getByRole('group', {
    name: 'Native box workの3D表示',
    exact: true,
  });
  await expect(viewer).toHaveAttribute('tabindex', '0');
  const details = page.locator('details.native-inspection');
  await details.locator('summary').click();
  const readCameraButton = details.getByRole('button', {
    name: '現在のカメラを読み取る',
    exact: true,
  });
  const cameraFields = [
    'カメラ位置 X',
    'カメラ位置 Y',
    'カメラ位置 Z',
    '注視点 X',
    '注視点 Y',
    '注視点 Z',
  ];
  const readCamera = async () => {
    await readCameraButton.click();
    return Promise.all(
      cameraFields.map((label) => details.getByLabel(label, { exact: true }).inputValue()),
    );
  };
  const before = (await snapshot(page)).project;
  const initialCamera = await readCamera();
  await viewer.focus();
  await expect(viewer).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  const leftCamera = await readCamera();
  expect(leftCamera).not.toEqual(initialCamera);
  await viewer.focus();
  await page.keyboard.press('ArrowUp');
  const upperCamera = await readCamera();
  expect(upperCamera).not.toEqual(leftCamera);
  await viewer.focus();
  await page.keyboard.press('ArrowRight');
  const rightCamera = await readCamera();
  expect(rightCamera).not.toEqual(upperCamera);
  await viewer.focus();
  await page.keyboard.press('ArrowDown');
  const lowerCamera = await readCamera();
  expect(lowerCamera).not.toEqual(rightCamera);
  await viewer.focus();
  await page.keyboard.press('Shift+Equal');
  const zoomedCamera = await readCamera();
  expect(zoomedCamera).not.toEqual(lowerCamera);
  await viewer.focus();
  await page.keyboard.press('-');
  const reducedCamera = await readCamera();
  expect(reducedCamera).not.toEqual(zoomedCamera);

  await page.getByRole('button', { name: 'カメラを右へ平行移動', exact: true }).click();
  const beforeFocus = await readCamera();
  await viewer.focus();
  await page.keyboard.press('r');
  const focusedCamera = await readCamera();
  expect(focusedCamera).not.toEqual(beforeFocus);

  await page.getByRole('button', { name: '3D表示を拡大', exact: true }).click();
  const beforeFit = await readCamera();
  await viewer.focus();
  await page.keyboard.press('f');
  const fitCamera = await readCamera();
  expect(fitCamera).not.toEqual(beforeFit);
  expect((await snapshot(page)).project).toEqual(before);
});

test('viewer camera shortcuts leave IME and browser-modified key events untouched', async ({
  page,
}) => {
  await createBox(page);
  const viewer = page.getByRole('group', {
    name: 'Native box workの3D表示',
    exact: true,
  });
  const details = page.locator('details.native-inspection');
  await details.locator('summary').click();
  const readCameraButton = details.getByRole('button', {
    name: '現在のカメラを読み取る',
    exact: true,
  });
  const cameraFields = [
    'カメラ位置 X',
    'カメラ位置 Y',
    'カメラ位置 Z',
    '注視点 X',
    '注視点 Y',
    '注視点 Z',
  ];
  const readCamera = async () => {
    await readCameraButton.click();
    return Promise.all(
      cameraFields.map((label) => details.getByLabel(label, { exact: true }).inputValue()),
    );
  };
  const before = (await snapshot(page)).project;
  const initialCamera = await readCamera();
  const ignoredKeys: ViewerKeyProbe[] = [
    { key: 'ArrowLeft', isComposing: true },
    { key: 'r', keyCode: 229 },
    { key: 'ArrowLeft', ctrlKey: true },
    { key: 'r', metaKey: true },
    { key: 'f', altKey: true },
  ];

  for (const probe of ignoredKeys) {
    await viewer.focus();
    const prevented = await dispatchViewerKey(viewer, probe);
    expect(prevented, JSON.stringify(probe)).toBe(false);
    expect(await readCamera(), JSON.stringify(probe)).toEqual(initialCamera);
  }

  expect((await snapshot(page)).project).toEqual(before);
});

test('assembly selection status announces names, IDs and active-object changes', async ({
  page,
}) => {
  await createBox(page);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  }

  const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
  await assembly.getByText('部品の組立を開く', { exact: true }).click();
  const sceneList = assembly.locator('.native-assembly-list');
  const rows = Array.from({ length: 4 }, (_, index) => sceneList.getByRole('listitem').nth(index));
  await expect(sceneList.getByRole('listitem')).toHaveCount(4);
  const objects = await Promise.all(
    rows.map(async (row) => {
      const checkbox = row.getByRole('checkbox');
      const accessibleName = await checkbox.getAttribute('aria-label');
      return {
        row,
        checkbox,
        name: (await row.locator('strong').textContent())?.trim() ?? '',
        id: accessibleName?.match(/\(([^)]+)\)$/)?.[1] ?? '',
      };
    }),
  );
  for (const object of objects) {
    expect(object.name).not.toBe('');
    expect(object.id).not.toBe('');
  }

  const selectionStatus = assembly.getByRole('status').filter({ hasText: '選択中' });
  for (const { checkbox } of objects) {
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await expect(selectionStatus).toHaveText('選択中 0 個。組立対象はありません。');

  for (const { checkbox } of objects.slice(0, 3)) await checkbox.check();
  await expect(selectionStatus).toContainText('選択中 3 個');
  for (const { name, id } of objects.slice(0, 3)) {
    await expect(selectionStatus).toContainText(`${name} (ID: ${id})`);
  }
  await objects[3].checkbox.check();
  await expect(selectionStatus).toContainText('選択中 4 個');
  await expect(selectionStatus).toContainText('ほか 1 個');
  await expect(selectionStatus).toContainText(
    `アクティブ: ${objects[3].name} (ID: ${objects[3].id})`,
  );

  await objects[0].row
    .getByRole('button', { name: `${objects[0].name} をアクティブにする`, exact: true })
    .click();
  await expect(selectionStatus).toContainText(
    `アクティブ: ${objects[0].name} (ID: ${objects[0].id})`,
  );
  const firstActiveStatus = await selectionStatus.textContent();
  await objects[3].row
    .getByRole('button', { name: `${objects[3].name} をアクティブにする`, exact: true })
    .click();
  await expect(selectionStatus).toContainText(
    `アクティブ: ${objects[3].name} (ID: ${objects[3].id})`,
  );
  await expect(selectionStatus).toContainText('選択中 4 個');
  expect(await selectionStatus.textContent()).not.toBe(firstActiveStatus);
});

test('scene text summary exposes each object transform and geometry size', async ({ page }) => {
  await createBox(page);

  const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
  await assembly.getByText('部品の組立を開く', { exact: true }).click();
  const summary = assembly.locator('.native-scene-text-alternative');
  await expect(summary.locator('summary')).toContainText('シーンの部品情報をテキストで確認（1個）');
  await summary.locator('summary').click();

  const sceneItems = summary.getByRole('list', { name: 'シーン内の部品情報', exact: true });
  const sceneItem = sceneItems.getByRole('listitem');
  await expect(sceneItem).toHaveCount(1);
  await expect(sceneItem).toContainText('位置（親に対するlocal・m）');
  await expect(sceneItem).toContainText('X 0, Y 0, Z 0');
  await expect(sceneItem).toContainText('回転（local・度 XYZ）');
  await expect(sceneItem).toContainText('倍率（local）');
  await expect(sceneItem).toContainText('表示 / 編集可能');
  await expect(sceneItem).toContainText(/\d+ 頂点、\d+ 面/);
  await expect(summary).toContainText('アニメーション再生中の姿勢');

  const authoring = page.getByRole('region', { name: '3D制作', exact: true });
  await authoring.getByText('部品の名前・位置・複製', { exact: true }).click();
  await authoring.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await authoring.getByLabel('位置 X（m）', { exact: true }).fill('0.25');
  await authoring.getByLabel('回転 Y（度）', { exact: true }).fill('30');
  await authoring.getByRole('button', { name: '部品の変形を適用', exact: true }).click();
  await expect(sceneItem).toContainText('X 0.25, Y 0, Z 0');
  await expect(sceneItem).toContainText('X 0, Y 30, Z 0');
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

test('material panel reflows at 320 CSS px with 200% root text-size simulation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await createBox(page);
  const panel = page.getByRole('region', { name: '画像とUVを編集', exact: true });
  await expect(panel).toBeVisible();
  await panel.getByText('画像とUVを開く', { exact: true }).click();
  await expect(
    panel.getByRole('combobox', { name: '画像を編集する材質', exact: true }),
  ).toBeVisible();

  // This simulates enlarged root text and narrow reflow, not browser/OS zoom itself.
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const textureFileInput = panel.locator('input[type="file"]');
  const textureFileStatus = panel.locator('#native-texture-file-status');
  await expect(textureFileInput).toBeVisible();
  await expect(textureFileStatus).toHaveText('画像ファイル未選択');
  await expect(textureFileStatus).toHaveAttribute('aria-live', 'polite');
  const descriptionIds =
    (await textureFileInput.getAttribute('aria-describedby'))?.split(/\s+/) ?? [];
  expect(descriptionIds).toEqual(
    expect.arrayContaining(['native-2d-texture-handoff', 'native-texture-file-status']),
  );
  await textureFileInput.setInputFiles({
    name: 'sample-texture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('selection-only; no image import is run'),
  });
  await expect(textureFileStatus).toHaveText('選択中: sample-texture.png');
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const panelElement = document.querySelector<HTMLElement>('.native-textures');
    if (!panelElement) throw new Error('Native texture panel is missing');
    const visibleElementBounds = Array.from(
      panelElement.querySelectorAll<HTMLElement>('h3, p, summary, label, legend, button'),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
    const panelRect = panelElement.getBoundingClientRect();
    return {
      rootFontSize: getComputedStyle(root).fontSize,
      viewportWidth: window.innerWidth,
      documentScrollWidth: root.scrollWidth,
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      panelScrollWidth: panelElement.scrollWidth,
      panelClientWidth: panelElement.clientWidth,
      visibleElementBounds,
    };
  });
  expect(metrics.rootFontSize).toBe('32px');
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.panelLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.panelRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(metrics.panelClientWidth + 1);
  expect(
    metrics.visibleElementBounds.filter(
      (element) => element.left < 0 || element.right > metrics.viewportWidth,
    ),
  ).toEqual([]);

  const importButton = panel.getByRole('button', { name: '画像を取り込み適用', exact: true });
  const importButtonBox = await importButton.boundingBox();
  expect(importButtonBox?.height).toBeGreaterThanOrEqual(44);
});

test('shared 3D workspace text contrast is measured without assuming an acceptance threshold', async ({
  page,
}) => {
  await page.goto('/3d/');
  await expect(page.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();

  const samples = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.editor3d');
    const header = root?.querySelector<HTMLElement>('.editor3d-header');
    if (!root || !header) throw new Error('The 3D workspace palette is not mounted');

    const probes: { name: string; element: HTMLElement }[] = [];
    const addProbe = (
      name: string,
      tag: keyof HTMLElementTagNameMap,
      className = '',
      parent = root,
    ) => {
      const element = document.createElement(tag) as HTMLElement;
      element.className = className;
      element.textContent = name;
      element.setAttribute('aria-hidden', 'true');
      element.style.position = 'fixed';
      element.style.left = '-10000px';
      parent.append(element);
      probes.push({ name, element });
      return element;
    };

    addProbe('base text', 'p');
    addProbe('link', 'a');
    addProbe('eyebrow', 'span', 'editor3d-eyebrow', header);
    addProbe('button', 'button');
    const disabledButton = addProbe('disabled button', 'button');
    if (!(disabledButton instanceof HTMLButtonElement))
      throw new Error('The disabled contrast probe is not a button');
    disabledButton.disabled = true;
    addProbe('error status', 'p', 'editor3d-alert');
    addProbe('success status', 'p', 'editor3d-notice');
    addProbe('dirty save status', 'p', 'editor3d-save-status is-dirty');
    addProbe('revision text', 'p', 'editor3d-revision');
    addProbe('empty state', 'div', 'editor3d-placeholder');

    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g);
      if (!values || values.length < 3) throw new Error(`Unsupported computed color: ${color}`);
      return values.slice(0, 3).map(Number);
    };
    const luminance = (color: number[]) => {
      const [red, green, blue] = color.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const solidBackground = (element: HTMLElement) => {
      let current: HTMLElement | null = element;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        const components = value.match(/[\d.]+/g);
        if (components && Number(components[3] ?? 1) > 0)
          return { channels: channels(value), color: value };
        current = current.parentElement;
      }
      throw new Error('No solid background was found for a contrast probe');
    };

    const measurements = probes.map(({ name, element }) => {
      const foreground = channels(getComputedStyle(element).color);
      const background = solidBackground(element);
      const [lighter, darker] = [luminance(foreground), luminance(background.channels)].sort(
        (left, right) => right - left,
      );
      return {
        name,
        foreground: getComputedStyle(element).color,
        background: background.color,
        ratio: (lighter + 0.05) / (darker + 0.05),
      };
    });
    probes.forEach(({ element }) => element.remove());
    return measurements;
  });

  expect(samples.map(({ name }) => name)).toEqual([
    'base text',
    'link',
    'eyebrow',
    'button',
    'disabled button',
    'error status',
    'success status',
    'dirty save status',
    'revision text',
    'empty state',
  ]);
  expect(samples.every(({ ratio }) => Number.isFinite(ratio))).toBe(true);
  await test.info().attach('native-shell-contrast-measurements.json', {
    body: JSON.stringify(samples, null, 2),
    contentType: 'application/json',
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
    await expect(page.getByTestId('viewport-load-error')).not.toContainText('Failed to fetch');
    await expect(page.getByTestId('viewport-load-error')).not.toContainText('http://');
    await expect(page.getByTestId('viewport-load-error')).not.toContainText('https://');
    await expect(page.getByTestId('viewport-load-error')).toContainText('[EDIT_');
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
  await expect(objects).toHaveAccessibleDescription(literalPattern(id!));
  await page.getByRole('button', { name: '選択対象に合わせる', exact: true }).click();
  await page.getByRole('combobox', { name: '投影方式', exact: true }).selectOption('orthographic');
  await page.getByLabel('平行投影の高さ', { exact: true }).fill('3');
  await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('combobox', { name: '描画モード', exact: true }).selectOption('wireframe');
  await page.getByRole('combobox', { name: '背景', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: '照明', exact: true }).selectOption('soft');
  await page.getByLabel('グリッド', { exact: true }).check();
  await page.getByLabel('地面（Y=0）', { exact: true }).check();
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
  await expect(select).toHaveAccessibleDescription(literalPattern(name));
  await expect(select).toHaveAccessibleDescription(literalPattern(secondId));
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
  await panel.getByLabel('分割数', { exact: true }).fill('4');
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
  await panel.getByText('階層と依存情報を複製', { exact: true }).click();
  await panel.getByRole('button', { name: '部品と階層の複製内容を確認', exact: true }).click();
  await panel.getByRole('button', { name: '確認した階層と依存情報を複製', exact: true }).click();
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
  await attachNativeVisual('authoring-mobile.png', await page.screenshot({ fullPage: true }));
  await page.getByRole('button', { name: 'カメラをリセット', exact: true }).click();
  await attachNativeVisual('authoring-model.png', await png(page));
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

test('native scene assembly preserves world pose and restores independently assigned materials', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const { importBackup } = await import('../src/core3d/backup/backup');
  const { worldMatrix, transformPoint } = await import('../src/core3d/model/coordinates');
  type Project = Awaited<ReturnType<typeof importBackup>>['project'];
  const snapshot = async (target: Page) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    const bytes = await readFile((await (await event).path())!);
    return { bytes, project: (await importBackup(bytes)).project };
  };
  const worldVertices = (project: Project, id: string) => {
    const node = project.nodes.find((n) => n.id === id)!;
    return project.meshes
      .find((m) => m.id === node.meshId)!
      .vertices.map((v) => transformPoint(worldMatrix(project, id), v.position));
  };
  const samePose = (before: Project, after: Project, id: string) => {
    const expected = worldVertices(before, id),
      actual = worldVertices(after, id);
    actual.forEach((point, index) =>
      point.forEach((value, axis) => expect(value).toBeCloseTo(expected[index][axis], 8)),
    );
  };
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Native box work');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  const author = page.getByRole('region', { name: '3D制作', exact: true });
  await author.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await author.getByLabel('赤 R', { exact: true }).fill('0.8');
  await author.getByLabel('緑 G', { exact: true }).fill('0.2');
  await author.getByRole('button', { name: '入力した値で材質を新規作成', exact: true }).click();
  await expect(page.locator('.native-viewport-host canvas')).toHaveCount(0);
  const palette = (await snapshot(page)).project.materials[0].id;
  await author.getByText('基本形を作成', { exact: true }).click();
  await author.getByLabel('分割数', { exact: true }).fill('1');
  await author.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await author.getByRole('combobox', { name: '基本形', exact: true }).selectOption('cone');
  await author.getByLabel('分割数', { exact: true }).fill('4');
  await author.getByRole('button', { name: '基本形を追加', exact: true }).click();
  await author.getByText('部品の名前・位置・複製', { exact: true }).click();
  await author.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await author.getByLabel('位置 X（m）', { exact: true }).fill('1.5');
  await author.getByRole('button', { name: '部品の変形を適用', exact: true }).click();
  const original = (await snapshot(page)).project;
  const [box, cone] = original.nodes;
  const assembly = page.getByRole('region', { name: '3D部品の組立', exact: true });
  await expect(assembly).toHaveCount(1);
  await assembly.getByText('部品の組立を開く', { exact: true }).click();
  const checkbox = (node: Project['nodes'][number]) =>
    assembly.getByRole('checkbox', { name: `組立対象 ${node.name} (${node.id})`, exact: true });
  const clear = () =>
    assembly.getByRole('button', { name: '組立対象の選択を解除', exact: true }).click();
  const review = () =>
    assembly.getByRole('button', { name: '現在の組立対象を確認', exact: true }).click();
  await checkbox(box).check();
  await checkbox(cone).check();
  await assembly.getByText('グループ・親子関係', { exact: true }).click();
  await assembly.getByLabel('新しいグループ名', { exact: true }).fill('組立');
  await review();
  await assembly.getByRole('button', { name: '選択部品をグループ化', exact: true }).click();
  const grouped = (await snapshot(page)).project;
  const group = grouped.nodes.find((n) => n.name === '組立')!;
  expect(group).toBeTruthy();
  samePose(original, grouped, box.id);
  samePose(original, grouped, cone.id);
  await author
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption(group.id);
  await author.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await author.getByLabel('位置 X（m）', { exact: true }).fill('1');
  await author.getByLabel('回転 Y（度）', { exact: true }).fill('45');
  await author.getByRole('button', { name: '部品の変形を適用', exact: true }).click();
  const transformed = (await snapshot(page)).project;
  await clear();
  await checkbox(box).check();
  await assembly.getByRole('combobox', { name: '新しい親', exact: true }).selectOption('');
  await review();
  await assembly.getByRole('button', { name: '選択部品の親を付け替え', exact: true }).click();
  const detached = (await snapshot(page)).project;
  expect(detached.nodes.find((n) => n.id === box.id)!.parentId).toBeNull();
  samePose(transformed, detached, box.id);
  await clear();
  await checkbox(group).check();
  await review();
  await assembly.getByText('グループを解除', { exact: true }).click();
  await assembly.getByRole('button', { name: '選択グループを解除', exact: true }).click();
  const ungrouped = (await snapshot(page)).project;
  expect(ungrouped.nodes.some((n) => n.id === group.id)).toBe(false);
  samePose(transformed, ungrouped, cone.id);
  await clear();
  await checkbox(box).check();
  await review();
  await assembly.getByText('原点（pivot）を移す', { exact: true }).click();
  await assembly.getByLabel('原点移動 X（m）', { exact: true }).fill('0.25');
  await assembly.getByRole('button', { name: '原点移動を適用', exact: true }).click();
  const pivoted = (await snapshot(page)).project;
  samePose(ungrouped, pivoted, box.id);
  await review();
  await assembly.getByText('反転した部品を複製', { exact: true }).click();
  await assembly.getByRole('button', { name: '反転した独立部品を作成', exact: true }).click();
  const mirrored = (await snapshot(page)).project;
  expect(mirrored.nodes).toHaveLength(3);
  const copy = mirrored.nodes.find((n) => !pivoted.nodes.some((old) => old.id === n.id))!;
  expect(copy.meshId).not.toBe(box.meshId);
  expect(mirrored.meshes.find((m) => m.id === box.meshId)).toEqual(
    pivoted.meshes.find((m) => m.id === box.meshId),
  );
  await author
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption(copy.id);
  await author.getByRole('button', { name: '部品の現在値を読む', exact: true }).click();
  await author.getByLabel('位置 X（m）', { exact: true }).fill('-1');
  await author.getByRole('button', { name: '部品の変形を適用', exact: true }).click();
  await author.getByRole('combobox', { name: '制作材質', exact: true }).selectOption(palette);
  await author.getByRole('button', { name: '対象meshの全ての面へ材質を割当', exact: true }).click();
  const assigned = (await snapshot(page)).project;
  expect(assigned.nodes.find((n) => n.id === copy.id)!.transform.translation[0]).toBe(-1);
  samePose(pivoted, assigned, box.id);
  expect(
    assigned.meshes.find((m) => m.id === copy.meshId)!.faces.every((f) => f.materialId === palette),
  ).toBe(true);
  await author.getByText('頂点・辺・面を編集', { exact: true }).click();
  await author.getByRole('combobox', { name: '編集要素', exact: true }).selectOption('face');
  await author.getByRole('combobox', { name: '制作要素', exact: true }).selectOption({ index: 1 });
  await author.getByRole('button', { name: '選択材質の保存値を複製', exact: true }).click();
  const accent = await author.getByRole('combobox', { name: '制作材質', exact: true }).inputValue();
  await author.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await author.getByLabel('緑 G', { exact: true }).fill('0.9');
  await author.getByRole('button', { name: '材質を適用', exact: true }).click();
  await author.getByRole('button', { name: '選択面へ材質を割当', exact: true }).click();
  const accented = (await snapshot(page)).project;
  expect(
    accented.meshes.find((m) => m.id === copy.meshId)!.faces.filter((f) => f.materialId === accent),
  ).toHaveLength(1);
  expect(accented.materials.find((m) => m.id === palette)!.baseColor[1]).toBe(0.2);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await expect(assembly.getByRole('alert')).toHaveCount(0);
  await expect(author.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'カメラをリセット', exact: true }).click();
  await attachNativeVisual('assembly-model.png', await png(page));
  await attachNativeVisual('assembly-mobile.png', await page.screenshot({ fullPage: true }));
  const final = await snapshot(page);
  const fresh = await context.browser()!.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const restored = await fresh.newPage();
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'assembly.cas3dproj',
      mimeType: 'application/zip',
      buffer: final.bytes,
    });
    await expect(
      restored.getByRole('heading', { name: 'Native box work', exact: true }),
    ).toBeVisible();
    const recovered = (await snapshot(restored)).project;
    expect(recovered.nodes).toEqual(final.project.nodes);
    expect(recovered.meshes).toEqual(final.project.meshes);
    expect(recovered.materials).toEqual(final.project.materials);
  } finally {
    await fresh.close();
  }
});

test('ground is an independent view-only helper and never enters canonical backup or GLB geometry', async ({
  page,
}) => {
  await createBox(page);
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await pending).path())!));
  };
  const { importBackup } = await import('../src/core3d/backup/backup');
  const before = await importBackup(await download('現在の内容をバックアップ'));
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await page
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const firstGlb = await download('GLBを保存');
  const plain = await png(page);
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  await expect(page.getByLabel('グリッド', { exact: true })).not.toBeChecked();
  await page.getByLabel('地面（Y=0）', { exact: true }).check();
  await expect(page.getByLabel('グリッド', { exact: true })).not.toBeChecked();
  const grounded = await png(page);
  expect(grounded.equals(plain)).toBe(false);
  await attachNativeVisual('ground-only.png', grounded);
  const after = await importBackup(await download('現在の内容をバックアップ'));
  expect(after.project).toEqual(before.project);
  await page
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await download('GLBを保存')).toEqual(firstGlb);
  await page.getByLabel('地面（Y=0）', { exact: true }).uncheck();
  expect((await png(page)).equals(plain)).toBe(true);
});

// Synthetic key dispatch checks event contracts, not OS/IME behavior or trusted default clicks.
async function compositionKey(
  target: Locator,
  key: 'Enter' | 'Escape',
  signal: 'native' | '229' | 'none',
) {
  return target.evaluate(
    (element, { key, signal }) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        isComposing: signal === 'native',
      });
      if (signal === '229') Object.defineProperty(event, 'keyCode', { value: 229 });
      let reachedDocument = false;
      const observe = () => {
        reachedDocument = true;
      };
      document.addEventListener('keydown', observe);
      try {
        element.dispatchEvent(event);
        return { prevented: event.defaultPrevented, reachedDocument };
      } finally {
        document.removeEventListener('keydown', observe);
      }
    },
    { key, signal },
  );
}

test('new project form separates IME confirmation from ordinary Enter submission', async ({
  page,
}) => {
  await page.goto('/3d/');
  const name = page.getByLabel('新しいプロジェクト名', { exact: true });
  await name.fill('IME guarded project');
  await name.dispatchEvent('compositionstart');
  expect(await compositionKey(name, 'Enter', 'none')).toEqual({
    prevented: true,
    reachedDocument: false,
  });
  await name.evaluate((element) => (element as HTMLInputElement).form!.requestSubmit());
  await expect(page.getByRole('heading', { name: 'IME guarded project', exact: true })).toHaveCount(
    0,
  );
  await name.dispatchEvent('compositionend');
  for (const signal of ['native', '229'] as const) {
    expect(await compositionKey(name, 'Enter', signal)).toEqual({
      prevented: true,
      reachedDocument: false,
    });
    expect(await compositionKey(name, 'Escape', signal)).toEqual({
      prevented: false,
      reachedDocument: false,
    });
  }
  await expect(name).toHaveValue('IME guarded project');
  expect(await compositionKey(name, 'Enter', 'none')).toEqual({
    prevented: false,
    reachedDocument: true,
  });
  await name.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'IME guarded project', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '箱を追加', exact: true })).toBeEnabled();
});

test('native authoring, rig, animation and transform buttons suppress composition Enter defaults', async ({
  page,
}) => {
  await createBox(page);
  const authoring = page.getByRole('region', { name: '3D制作', exact: true });
  await authoring.getByText('基本形を作成', { exact: true }).click();
  await authoring
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption({ index: 1 });
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  await page.getByText('数値で差分変形', { exact: true }).click();
  const rig = page.getByRole('region', { name: '3D骨と重み', exact: true });
  const bone = rig.getByRole('button', { name: '骨を追加', exact: true });
  const buttons = [
    authoring.getByRole('button', { name: '基本形を追加', exact: true }),
    bone,
    page.getByRole('button', { name: '新しいclipを作成', exact: true }),
    page.getByRole('button', { name: '数値変形を開始', exact: true }),
  ];
  for (const button of buttons) {
    await expect(button).toBeEnabled();
    await button.focus();
    await button.dispatchEvent('compositionstart');
    expect(await compositionKey(button, 'Enter', 'none')).toEqual({
      prevented: true,
      reachedDocument: false,
    });
    await button.dispatchEvent('compositionend');
    for (const signal of ['native', '229'] as const)
      expect(await compositionKey(button, 'Enter', signal)).toEqual({
        prevented: true,
        reachedDocument: false,
      });
    await expect(button).toBeFocused();
  }
  const boneOptions = rig
    .getByRole('combobox', { name: '骨を選択', exact: true })
    .locator('option');
  const count = await boneOptions.count();
  await bone.press('Enter');
  await expect(boneOptions).toHaveCount(count + 1);
});

test('composition Escape keeps hierarchy confirmation and focus, ordinary Escape cancels', async ({
  page,
}) => {
  await createBox(page);
  const authoring = page.getByRole('region', { name: '3D制作', exact: true });
  await authoring
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption({ index: 1 });
  await authoring.getByText('階層と依存情報を複製', { exact: true }).click();
  const prepare = authoring.getByRole('button', {
    name: '部品と階層の複製内容を確認',
    exact: true,
  });
  await prepare.click();
  const confirmation = authoring.getByRole('region', { name: '階層複製の確認', exact: true });
  const apply = confirmation.getByRole('button', {
    name: '確認した階層と依存情報を複製',
    exact: true,
  });
  await apply.focus();
  for (const signal of ['native', '229'] as const) {
    expect(await compositionKey(apply, 'Escape', signal)).toEqual({
      prevented: false,
      reachedDocument: false,
    });
    await expect(confirmation).toBeVisible();
    await expect(apply).toBeFocused();
  }
  await apply.dispatchEvent('compositionstart');
  expect(await compositionKey(apply, 'Escape', 'none')).toEqual({
    prevented: false,
    reachedDocument: false,
  });
  await expect(confirmation).toBeVisible();
  await apply.dispatchEvent('compositionend');
  await apply.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(prepare).toBeFocused();
});

test('invalid material factors show Japanese guidance without applying a partial material', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await createBox(page);
  const snapshot = async () => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    return importBackup(await readFile((await (await event).path())!));
  };
  const before = await snapshot();
  const panel = page.getByRole('region', { name: '3D制作', exact: true });
  await panel.getByText('材質の色・金属・粗さ', { exact: true }).click();
  for (const label of ['赤 R', '発光色 R', '透過しきい値 alphaCutoff']) {
    const field = panel.getByLabel(label, { exact: true });
    const original = await field.inputValue();
    await field.fill('2');
    await panel.getByRole('button', { name: '入力した値で材質を新規作成', exact: true }).click();
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText('0〜1');
    await expect(alert).toContainText('形状・材質の編集');
    await expect(alert).toContainText('[EDIT_MATERIAL_RANGE]');
    await expect(alert).not.toContainText('factor out of range');
    await expect(alert).not.toContainText('Invalid alpha cutoff');
    await expect(alert).toContainText('現在');
    expect((await snapshot()).project).toEqual(before.project);
    await field.fill(original);
  }
});
