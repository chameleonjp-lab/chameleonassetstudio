import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page, color: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  }, color);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page, '#c0392b');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

/** IndexedDB の assets ストアから最初のアセットの layers を読む（layer position 検証用）。 */
async function readStoredLayers(
  page: Page,
): Promise<Array<{ id: string; name: string; transform: { position: { x: number; y: number } } }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: unknown }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const asset = records[0]?.data as { layers: unknown } | undefined;
    return (asset?.layers ?? []) as never;
  });
}

async function positionByName(page: Page): Promise<Map<string, { x: number; y: number }>> {
  const layers = await readStoredLayers(page);
  return new Map(layers.map((layer) => [layer.name, layer.transform.position]));
}

/** レイヤー一覧で名前をクリックして選択する。 */
async function selectLayer(page: Page, name: string): Promise<void> {
  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name, exact: true })
    .click();
}

/** 選択中レイヤーの X / Y を設定して確定する（blur で commit）。 */
async function setLayerPosition(page: Page, name: string, x: number, y: number): Promise<void> {
  await selectLayer(page, name);
  const xInput = page.getByLabel('X', { exact: true });
  await xInput.fill(String(x));
  await xInput.blur();
  const yInput = page.getByLabel('Y', { exact: true });
  await yInput.fill(String(y));
  await yInput.blur();
}

async function checkLayer(page: Page, name: string): Promise<void> {
  await page.getByLabel(`「${name}」を複数レイヤー操作の対象にする`).check();
}

async function addImageLayers(
  page: Page,
  files: Array<{ name: string; color: string }>,
): Promise<void> {
  const inputs = [];
  for (const file of files) {
    const buffer = await makePngBuffer(page, file.color);
    inputs.push({ name: file.name, mimeType: 'image/png' as const, buffer });
  }
  await page.getByLabel('画像レイヤーを追加').setInputFiles(inputs);
  await confirmImageImport(page);
}

test('3つのレイヤーを左揃えでき、保存・reload後も位置が残る（選択状態・整列基準は残らない）', async ({
  page,
}) => {
  await setupProjectWithImage(page, '整列テスト_左揃え');
  await addImageLayers(page, [
    { name: 'layer-b.png', color: '#2980b9' },
    { name: 'layer-c.png', color: '#27ae60' },
  ]);
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    3,
  );

  // main は (0,0) のまま。layer-b / layer-c をずらす。
  await setLayerPosition(page, 'layer-b', 100, 50);
  await setLayerPosition(page, 'layer-c', 200, 150);
  await expect
    .poll(async () => (await positionByName(page)).get('layer-c'))
    .toEqual({
      x: 200,
      y: 150,
    });
  const beforeAlign = await positionByName(page);

  await checkLayer(page, 'main');
  await checkLayer(page, 'layer-b');
  await checkLayer(page, 'layer-c');

  // 整列基準は既定で「選択範囲（合成bounds）」。
  await expect(page.getByLabel('整列基準')).toHaveValue('selection');

  await page.getByRole('button', { name: '左揃え' }).click();

  // 選択群の合成 bounds（minX=0）に対して、各 layer の bounds.minX を 0 に揃える。
  // main: bounds 0..64 -> 変化なし。layer-b: bounds 100..164 -> x = 0（y は 50 のまま）。
  // layer-c: bounds 200..264 -> x = 0（y は 150 のまま）。
  await expect.poll(async () => (await positionByName(page)).get('layer-c')?.x).toBe(0);
  const afterAlign = await positionByName(page);
  expect(afterAlign.get('main')).toEqual({ x: 0, y: 0 });
  expect(afterAlign.get('layer-b')).toEqual({ x: 0, y: 50 });
  expect(afterAlign.get('layer-c')).toEqual({ x: 0, y: 150 });

  // 1 回の Undo で 3 layer 全部の position が一括で元に戻る。
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => (await positionByName(page)).get('layer-c')?.x)
    .toBe(beforeAlign.get('layer-c')!.x);
  const afterUndo = await positionByName(page);
  expect(afterUndo.get('main')).toEqual(beforeAlign.get('main'));
  expect(afterUndo.get('layer-b')).toEqual(beforeAlign.get('layer-b'));
  expect(afterUndo.get('layer-c')).toEqual(beforeAlign.get('layer-c'));

  // Redo で再び align 後の位置へ。
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await positionByName(page)).get('layer-c')?.x).toBe(0);

  // 保存 -> reload。position は残るが、checkbox の選択状態・整列基準は残らない。
  await page.reload();
  await page.getByRole('button', { name: '「整列テスト_左揃え」を開く' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    3,
  );

  const reloaded = await positionByName(page);
  expect(reloaded.get('main')).toEqual({ x: 0, y: 0 });
  expect(reloaded.get('layer-b')).toEqual({ x: 0, y: 50 });
  expect(reloaded.get('layer-c')).toEqual({ x: 0, y: 150 });

  await expect(page.getByLabel('「main」を複数レイヤー操作の対象にする')).not.toBeChecked();
  await expect(page.getByLabel('「layer-b」を複数レイヤー操作の対象にする')).not.toBeChecked();
  await expect(
    page.getByText('レイヤーのチェックを付けると、複数レイヤーの整列・等間隔配置ができます。'),
  ).toBeVisible();
});

test('3つのレイヤーを水平方向に等間隔配置できる', async ({ page }) => {
  await setupProjectWithImage(page, '整列テスト_等間隔');
  await addImageLayers(page, [
    { name: 'layer-b.png', color: '#2980b9' },
    { name: 'layer-c.png', color: '#27ae60' },
  ]);

  // main(0,0) / layer-b(100,0) / layer-c(260,0)。textureSize は全部 64x64（half=32）。
  // 中心: main=32, layer-b=132, layer-c=292。等間隔なら layer-b の中心は 32+(292-32)/2=162 -> x=130。
  await setLayerPosition(page, 'layer-b', 100, 0);
  await setLayerPosition(page, 'layer-c', 260, 0);
  await expect
    .poll(async () => (await positionByName(page)).get('layer-c'))
    .toEqual({
      x: 260,
      y: 0,
    });

  await checkLayer(page, 'main');
  await checkLayer(page, 'layer-b');
  await checkLayer(page, 'layer-c');

  await page.getByRole('button', { name: '水平方向に等間隔配置' }).click();

  await expect.poll(async () => (await positionByName(page)).get('layer-b')?.x).toBeCloseTo(130, 5);

  const positions = await positionByName(page);
  // 両端は固定のまま。
  expect(positions.get('main')).toEqual({ x: 0, y: 0 });
  expect(positions.get('layer-c')).toEqual({ x: 260, y: 0 });
});

test('整列は対象2件未満、等間隔配置は対象3件未満で disabled になり理由が示される', async ({
  page,
}) => {
  await setupProjectWithImage(page, '整列テスト_disabled');
  await addImageLayers(page, [{ name: 'layer-b.png', color: '#2980b9' }]);

  // チェック0件: 整列パネルは案内文のみ。
  await expect(
    page.getByText('レイヤーのチェックを付けると、複数レイヤーの整列・等間隔配置ができます。'),
  ).toBeVisible();

  // チェック1件: align も distribute も disabled。
  await checkLayer(page, 'main');
  const leftAlignButton = page.getByRole('button', { name: '左揃え' });
  const horizontalDistributeButton = page.getByRole('button', { name: '水平方向に等間隔配置' });
  await expect(leftAlignButton).toBeDisabled();
  await expect(leftAlignButton).toHaveAttribute('title', /2件以上/);
  await expect(horizontalDistributeButton).toBeDisabled();
  await expect(horizontalDistributeButton).toHaveAttribute('title', /3件以上/);

  // チェック2件: align は有効、distribute は引き続き disabled（3件必要）。
  await checkLayer(page, 'layer-b');
  await expect(leftAlignButton).toBeEnabled();
  await expect(horizontalDistributeButton).toBeDisabled();
  await expect(horizontalDistributeButton).toHaveAttribute('title', /3件以上/);
});

test('iPhone SE級viewportのタッチ操作でactive基準へ1レイヤーを整列できる', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 667 },
  });
  const page = await context.newPage();

  try {
    await setupProjectWithImage(page, '整列テスト_モバイル');

    const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
    await mobileNav.getByRole('button', { name: 'プロパティ' }).tap();
    await addImageLayers(page, [{ name: 'layer-b.png', color: '#2980b9' }]);
    await expect(
      page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem'),
    ).toHaveCount(2);

    await setLayerPosition(page, 'layer-b', 120, 40);
    await selectLayer(page, 'main');
    await page.getByLabel('「main」を複数レイヤー操作の対象にする').tap();
    await page.getByLabel('「layer-b」を複数レイヤー操作の対象にする').tap();
    await page.getByLabel('整列基準').selectOption('active');

    const leftAlignButton = page.getByRole('button', { name: '左揃え' });
    await expect(leftAlignButton).toBeEnabled();
    const buttonBox = await leftAlignButton.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    await leftAlignButton.tap();

    await expect
      .poll(async () => (await positionByName(page)).get('layer-b'))
      .toEqual({
        x: 0,
        y: 40,
      });
    expect((await positionByName(page)).get('main')).toEqual({ x: 0, y: 0 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});
