import { expect, test, type Locator, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredVariant {
  assetId: string;
  kind: 'manual' | 'linked-mirror' | 'linked-palette';
  fingerprint?: { base: string; variant: string };
}

interface StoredFamily {
  id: string;
  name: string;
  baseAssetId: string;
  variants: StoredVariant[];
}

interface StoredProject {
  id: string;
  name: string;
  assets: Array<{ id: string; displayName: string }>;
  families?: StoredFamily[];
}

interface StoredAsset {
  id: string;
  name: string;
  displayName: string;
  layers: Array<{ id: string; name: string; transform: { position: { x: number } } }>;
}

async function readStoredState(
  page: Page,
): Promise<{ projects: StoredProject[]; assets: StoredAsset[] }> {
  return page.evaluate(async () => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const projects = (await requestResult(
        db.transaction('projects', 'readonly').objectStore('projects').getAll(),
      )) as unknown[];
      const records = (await requestResult(
        db.transaction('assets', 'readonly').objectStore('assets').getAll(),
      )) as Array<{ data: unknown }>;
      return { projects, assets: records.map((record) => record.data) } as never;
    } finally {
      db.close();
    }
  });
}

async function makePngBuffer(page: Page, color = '#ff0000'): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png');
  }, color);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createProject(page: Page, name: string): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.getByRole('complementary', { name: 'プロパティ' });
}

async function createBlankAsset(properties: Locator, name: string): Promise<void> {
  await properties.getByLabel('新規アセット名').fill(name);
  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(
    properties.locator('.asset-list').getByRole('button', { name, exact: true }),
  ).toBeVisible();
}

function variantPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Family / Variant' });
}

async function createFamily(panel: Locator, name: string, baseLabel: string): Promise<void> {
  await panel.getByLabel('Family名').fill(name);
  await panel.getByLabel('standalone base Asset').selectOption({ label: baseLabel });
  await panel.getByRole('button', { name: 'Familyを作成', exact: true }).click();
  await expect(panel.getByText('Family base', { exact: true })).toBeVisible();
}

test('Family作成、manual登録・detach・variant削除・Family解除が永続化される', async ({ page }) => {
  const properties = await createProject(page, 'variant管理');
  await createBlankAsset(properties, 'base');
  await createBlankAsset(properties, 'detach-target');
  await createBlankAsset(properties, 'delete-target');

  const panel = variantPanel(page);
  await createFamily(panel, 'hero-family', 'base');

  await panel.getByLabel('standalone member').selectOption({ label: 'detach-target' });
  await panel.getByRole('button', { name: 'manual variantとして登録' }).click();
  await expect(panel.getByText('manual（自動更新なし）', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('manual variantとしての登録は失われます');
    void dialog.accept();
  });
  await panel.getByRole('button', { name: 'Familyから外す（Assetは残す）' }).click();
  await expect(panel.getByText('standalone / 独立', { exact: true })).toBeVisible();

  await properties
    .locator('.asset-list')
    .getByRole('button', { name: 'base', exact: true })
    .click();
  await panel.getByLabel('standalone member').selectOption({ label: 'delete-target' });
  await panel.getByRole('button', { name: 'manual variantとして登録' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'variantアセットを削除' }).click();
  await expect(
    properties.locator('.asset-list').getByRole('button', { name: 'delete-target', exact: true }),
  ).toHaveCount(0);

  await properties
    .locator('.asset-list')
    .getByRole('button', { name: 'base', exact: true })
    .click();
  page.once('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'Familyを解除（Assetは残す）' }).click();
  await expect(panel.getByText('standalone / 独立', { exact: true })).toBeVisible();

  const beforeReload = await readStoredState(page);
  expect(beforeReload.projects[0].families).toEqual([]);
  expect(beforeReload.assets.map((asset) => asset.displayName).sort()).toEqual([
    'base',
    'detach-target',
  ]);

  await page.reload();
  await page.getByRole('button', { name: '「variant管理」を開く' }).click();
  await expect(variantPanel(page).getByText('standalone / 独立', { exact: true })).toBeVisible();
});

test('linked mirrorはbase変更をstale判定し、preview後の明示refreshとUndo/Redoを行う', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const properties = await createProject(page, 'mirror refresh');
  const buffer = await makePngBuffer(page, '#c0392b');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'hero.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  const stateBefore = await readStoredState(page);
  const base = stateBefore.assets[0];
  const panel = variantPanel(page);
  await createFamily(panel, 'mirror-family', base.displayName);
  await panel.getByRole('button', { name: 'linked左右反転を作成' }).click();
  await expect(panel.getByText('linked左右反転', { exact: true })).toBeVisible();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

  const linkedState = await readStoredState(page);
  const linked = linkedState.projects[0].families![0].variants[0];
  const linkedAsset = linkedState.assets.find((asset) => asset.id === linked.assetId)!;
  const originalLayerIds = linkedAsset.layers.map((layer) => layer.id);
  const originalFingerprint = linked.fingerprint;

  await properties
    .locator('.asset-list')
    .getByRole('button', { name: base.displayName, exact: true })
    .click();
  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();
  const xInput = properties.locator('.layer-fields').getByLabel('X', { exact: true });
  await xInput.fill('7');
  await xInput.blur();

  await panel.getByRole('button', { name: /このvariant.*を選択/ }).click();
  await expect(panel.getByText(/状態: 更新候補（stale）/)).toBeVisible();
  await panel.getByRole('button', { name: 'refresh前後をpreview' }).click();
  await expect(panel.getByRole('region', { name: 'linked refresh preview' })).toBeVisible();
  await panel.getByRole('button', { name: 'このvariantを明示refresh' }).click();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

  const refreshedState = await readStoredState(page);
  const refreshedFamily = refreshedState.projects[0].families![0];
  const refreshedLinked = refreshedFamily.variants[0];
  const refreshedAsset = refreshedState.assets.find((asset) => asset.id === linked.assetId)!;
  expect(refreshedAsset.layers.map((layer) => layer.id)).toEqual(originalLayerIds);
  expect(refreshedLinked.fingerprint).not.toEqual(originalFingerprint);

  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();
  const variantXInput = properties.locator('.layer-fields').getByLabel('X', { exact: true });
  await variantXInput.fill('21');
  await variantXInput.blur();
  await expect(panel.getByText(/状態: 手動調整あり/)).toBeVisible();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(panel.getByText(/状態: 更新候補（stale）/)).toBeVisible();
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();
  await properties.locator('.layer-fields').getByLabel('X', { exact: true }).fill('12');
  await properties.locator('.layer-fields').getByLabel('X', { exact: true }).blur();
  await expect(panel.getByText(/状態: 手動調整あり/)).toBeVisible();
  await panel.getByRole('button', { name: 'refresh前後をpreview' }).click();
  const refreshButton = panel.getByRole('button', { name: 'このvariantを明示refresh' });
  await expect(refreshButton).toBeDisabled();
  await panel.getByLabel('write-set内の手動調整を上書きすることを確認しました').check();
  await expect(refreshButton).toBeEnabled();
  await panel.getByRole('button', { name: 'refresh前後をpreview' }).click();
  await expect(
    panel.getByLabel('write-set内の手動調整を上書きすることを確認しました'),
  ).not.toBeChecked();
  await expect(refreshButton).toBeDisabled();
  await panel.getByLabel('write-set内の手動調整を上書きすることを確認しました').check();
  await refreshButton.click();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '「mirror refresh」を開く' }).click();
  const reloadedVariantButton = panel.getByRole('button', { name: /このvariant.*を選択/ });
  if ((await reloadedVariantButton.count()) > 0) {
    await reloadedVariantButton.click();
  }
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();
});

test('linked paletteはbase Blob変更をpreview画像で比較して明示refreshする', async ({ page }) => {
  const properties = await createProject(page, 'palette refresh');
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();

  const base = (await readStoredState(page)).assets[0];
  const panel = variantPanel(page);
  await createFamily(panel, 'palette-family', base.displayName);
  await panel.getByRole('button', { name: 'linked paletteを作成' }).click();
  await expect(panel.getByText('linked palette', { exact: true })).toBeVisible();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

  await properties
    .locator('.asset-list')
    .getByRole('button', { name: base.displayName, exact: true })
    .click();
  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();
  await properties.getByLabel('色相（-180〜180）').fill('180');
  await properties.getByRole('button', { name: '色調整を適用' }).click();

  await panel.getByRole('button', { name: /このvariant.*を選択/ }).click();
  await expect(panel.getByText(/状態: 更新候補（stale）/)).toBeVisible();
  await panel.getByRole('button', { name: 'refresh前後をpreview' }).click();
  const preview = panel.getByRole('region', { name: 'linked refresh preview' });
  await expect(preview.getByRole('img', { name: 'refresh前のvariant画像' })).toBeVisible();
  await expect(preview.getByRole('img', { name: 'refresh後のvariant画像' })).toBeVisible();
  await panel.getByRole('button', { name: 'このvariantを明示refresh' }).click();
  await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();
});

test('不正familiesの保存済みProjectは通常openせず、元を残してstandalone隔離copyを作る', async ({
  page,
}) => {
  const properties = await createProject(page, 'invalid family stored');
  await createBlankAsset(properties, 'safe-asset');
  await page.getByRole('button', { name: '← ホーム' }).click();

  await page.evaluate(async () => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const projects = (await requestResult(store.getAll())) as Array<Record<string, unknown>>;
      const project = projects[0];
      project.families = [
        {
          id: 'family_invalid_e2e',
          name: 'broken',
          baseAssetId: 'asset_missing_e2e',
          variants: [],
        },
      ];
      await requestResult(store.put(project));
    } finally {
      db.close();
    }
  });
  await page.reload();

  await expect(page.locator('.home-family-recovery-warning')).toContainText('Family情報が不正');
  await expect(page.getByRole('button', { name: '「invalid family stored」を開く' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: '「invalid family stored」を削除' })).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByRole('button', {
      name: '「invalid family stored」のFamily情報を隔離してcopyを作成',
    })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Family隔離copy' })).toContainText(
    '未知のProject root field内にAsset ID参照がある場合',
  );
  await page
    .getByRole('button', { name: '「invalid family stored（Family隔離copy）」を開く' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'invalid family stored（Family隔離copy）' }),
  ).toBeVisible();
  await expect(variantPanel(page).getByText('standalone / 独立', { exact: true })).toBeVisible();

  const recoveredState = await readStoredState(page);
  expect(recoveredState.projects).toHaveLength(2);
  const original = recoveredState.projects.find(
    (project) => project.name === 'invalid family stored',
  )!;
  const recovered = recoveredState.projects.find((project) => project.id !== original.id)!;
  expect(original.families?.[0].baseAssetId).toBe('asset_missing_e2e');
  expect(recovered.families).toBeUndefined();
  expect(recovered.assets[0].id).not.toBe(original.assets[0].id);
});

test.describe('スマホtouchでのFamily / Variant操作', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('長い名前でもFamily作成からmirror preview・明示refreshまでtap操作できる', async ({
    page,
  }) => {
    await createProject(page, 'variant mobile touch');
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    await page
      .getByRole('navigation', { name: '画面切り替え' })
      .getByRole('button', { name: 'プロパティ' })
      .tap();
    const properties = page.getByRole('complementary', { name: 'プロパティ' });
    const longAssetName = `mobile-base-${'A'.repeat(180)}`;
    await properties.getByLabel('新規アセット名').fill(longAssetName);
    await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).tap();
    await expect(
      properties.locator('.asset-list').getByRole('button', { name: longAssetName, exact: true }),
    ).toBeVisible();

    const panel = variantPanel(page);
    const longFamilyName = `mobile-family-${'B'.repeat(180)}`;
    await panel.getByLabel('Family名').fill(longFamilyName);
    await panel.getByLabel('standalone base Asset').selectOption({ label: longAssetName });
    await panel.getByRole('button', { name: 'Familyを作成', exact: true }).tap();
    await expect(panel.getByText(longFamilyName, { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'linked左右反転を作成' }).tap();
    await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

    await properties
      .locator('.asset-list')
      .getByRole('button', { name: longAssetName, exact: true })
      .tap();
    await page
      .getByRole('list', { name: 'レイヤー一覧' })
      .getByRole('button', { name: 'main', exact: true })
      .tap();
    const xInput = properties.locator('.layer-fields').getByLabel('X', { exact: true });
    await xInput.fill('9');
    await xInput.blur();
    await panel.getByRole('button', { name: /このvariant.*を選択/ }).tap();
    await expect(panel.getByText(/状態: 更新候補（stale）/)).toBeVisible();
    await panel.getByRole('button', { name: 'refresh前後をpreview' }).tap();
    await expect(panel.getByRole('region', { name: 'linked refresh preview' })).toBeVisible();
    await expect(panel.getByText('layerの具体的な差分')).toBeVisible();
    await expect(
      panel
        .getByRole('region', { name: 'write-setの具体的な差分' })
        .getByText(/transform\.position\.x/),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'このvariantを明示refresh' }).tap();
    await expect(panel.getByText(/状態: 同期済み/)).toBeVisible();

    await page
      .getByRole('list', { name: 'レイヤー一覧' })
      .getByRole('button', { name: 'main', exact: true })
      .tap();
    const variantX = properties.locator('.layer-fields').getByLabel('X', { exact: true });
    await variantX.fill('17');
    await variantX.blur();
    await expect(panel.getByText(/状態: 手動調整あり/)).toBeVisible();
    await panel.getByRole('button', { name: 'refresh前後をpreview' }).tap();
    const overwriteConfirmation = panel.locator('.variant-confirm-overwrite');
    await expect(overwriteConfirmation).toBeVisible();
    expect((await overwriteConfirmation.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    const undersizedControls = await panel
      .locator(
        "button:visible, select:visible, input:not([type='checkbox']):visible, .variant-confirm-overwrite:visible",
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => ({
            label: element.getAttribute('aria-label') ?? element.textContent ?? element.tagName,
            height: element.getBoundingClientRect().height,
          }))
          .filter(({ height }) => height < 44),
      );
    expect(undersizedControls).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const target of [properties, panel, properties.locator('.asset-list')]) {
      const internalOverflow = await target.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      expect(internalOverflow).toBeLessThanOrEqual(0);
    }
  });

  test('Properties表示中のrig mirror拒否理由がCanvasへ隠れない', async ({ page }) => {
    await createProject(page, 'variant mobile rig error');
    await page
      .getByRole('navigation', { name: '画面切り替え' })
      .getByRole('button', { name: 'プロパティ' })
      .tap();
    const properties = page.getByRole('complementary', { name: 'プロパティ' });
    await properties.getByLabel('新規アセット名').fill('rig-base');
    await properties.getByLabel('新規アセットの種別').selectOption('character');
    await properties.getByLabel('新規アセットのテンプレート').selectOption('character-basic');
    await properties.getByLabel('character body Partを作成').check();
    await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).tap();

    const panel = variantPanel(page);
    await panel.getByLabel('Family名').fill('rig-family');
    await panel.getByLabel('standalone base Asset').selectOption({ label: 'rig-base' });
    await panel.getByRole('button', { name: 'Familyを作成', exact: true }).tap();
    const rotation = properties.getByLabel('ポーズ回転');
    await rotation.fill('10');
    await rotation.blur();
    await panel.getByRole('button', { name: 'linked左右反転を作成' }).tap();
    const globalStatus = page.locator('.editor-global-status');
    await expect(globalStatus).toBeVisible();
    await expect(globalStatus).toContainText('bind pose');
    await expect(page.getByRole('region', { name: 'キャンバス', exact: true })).toBeHidden();
  });
});
