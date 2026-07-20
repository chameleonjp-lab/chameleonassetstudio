import { expect, test, type Locator, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredAsset {
  id: string;
  displayName: string;
  canvasSize: { width: number; height: number };
  textures: Array<{ id: string; kind: string; path: string }>;
}

interface StoredAssetState {
  id: string;
  canvasSize: { width: number; height: number };
  sourceDigest?: string;
  editDigest?: string;
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

async function readAssetStates(page: Page): Promise<Record<string, StoredAssetState>> {
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
      const records = (await requestResult(
        db.transaction('assets', 'readonly').objectStore('assets').getAll(),
      )) as Array<{ data: StoredAsset }>;
      const result: Record<string, StoredAssetState> = {};
      for (const { data: asset } of records) {
        const state: StoredAssetState = { id: asset.id, canvasSize: asset.canvasSize };
        for (const kind of ['source', 'edit'] as const) {
          const texture = asset.textures.find((candidate) => candidate.kind === kind);
          if (!texture) {
            continue;
          }
          const blob = (await requestResult(
            db
              .transaction('blobs', 'readonly')
              .objectStore('blobs')
              .get(`${asset.id}/${texture.path}`),
          )) as { bytes: ArrayBuffer } | undefined;
          if (blob) {
            const hash = await crypto.subtle.digest('SHA-256', blob.bytes);
            state[`${kind}Digest`] = Array.from(new Uint8Array(hash), (byte) =>
              byte.toString(16).padStart(2, '0'),
            ).join('');
          }
        }
        result[asset.displayName] = state;
      }
      return result;
    } finally {
      db.close();
    }
  });
}

async function readLayerPositions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<
        Array<{
          data: {
            displayName: string;
            layers: Array<{ transform: { position: { x: number; y: number } } }>;
          };
        }>
      >((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
        request.onsuccess = () =>
          resolve(
            request.result as Array<{
              data: {
                displayName: string;
                layers: Array<{ transform: { position: { x: number; y: number } } }>;
              };
            }>,
          );
        request.onerror = () => reject(request.error);
      });
      return Object.fromEntries(
        records.map(({ data }) => [data.displayName, { ...data.layers[0].transform.position }]),
      );
    } finally {
      db.close();
    }
  });
}

async function snapshotCount(page: Page, assetId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<Array<{ assetId: string }>>((resolve, reject) => {
        const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
        request.onsuccess = () => resolve(request.result as Array<{ assetId: string }>);
        request.onerror = () => reject(request.error);
      });
      return records.filter((record) => record.assetId === id).length;
    } finally {
      db.close();
    }
  }, assetId);
}

function batchPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Asset一括変更' });
}

async function selectPickerTarget(panel: Locator, name: string): Promise<void> {
  const checkbox = panel
    .locator('.asset-batch-target-picker')
    .getByText(name, { exact: true })
    .locator('..')
    .getByRole('checkbox');
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
}

test('canvas resizeはpreview除外を守り、1履歴でUndo / Redo・reloadできる', async ({ page }) => {
  const properties = await createProject(page, 'batch canvas atomic');
  await createBlankAsset(properties, 'batch-first');
  await createBlankAsset(properties, 'batch-excluded');
  const before = await readAssetStates(page);

  const panel = batchPanel(page);
  await panel.getByLabel('一括操作').selectOption('canvas-resize');
  await selectPickerTarget(panel, 'batch-first');
  await selectPickerTarget(panel, 'batch-excluded');
  await panel.getByLabel('一括canvas幅').fill('520');
  await panel.getByLabel('一括canvas高さ').fill('520');
  await panel.getByRole('button', { name: 'target previewを準備' }).click();

  const preview = panel.getByRole('region', { name: '一括変更preview' });
  await expect(preview.getByText('batch-first', { exact: true })).toBeVisible();
  await expect(preview.getByText('batch-excluded', { exact: true })).toBeVisible();
  await preview
    .locator(':scope > ul > li')
    .filter({ hasText: 'batch-excluded' })
    .getByRole('checkbox')
    .uncheck();
  await preview.getByRole('button', { name: '選択targetを一括実行' }).click();

  await expect
    .poll(async () => (await readAssetStates(page))['batch-first'].canvasSize)
    .toEqual({
      width: 520,
      height: 520,
    });
  expect((await readAssetStates(page))['batch-excluded'].canvasSize).toEqual(
    before['batch-excluded'].canvasSize,
  );
  await expect(page.getByRole('button', { name: '元に戻す' })).toHaveAttribute(
    'title',
    '一括canvasサイズ変更',
  );

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => (await readAssetStates(page))['batch-first'].canvasSize)
    .toEqual(before['batch-first'].canvasSize);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect
    .poll(async () => (await readAssetStates(page))['batch-first'].canvasSize)
    .toEqual({
      width: 520,
      height: 520,
    });

  await page.reload();
  await page.getByRole('button', { name: '「batch canvas atomic」を開く' }).click();
  await expect(page.getByRole('heading', { name: 'batch canvas atomic' })).toBeVisible();
  expect((await readAssetStates(page))['batch-first'].canvasSize).toEqual({
    width: 520,
    height: 520,
  });
});

test('palette置換は明示した2 Asset / layerだけを変え、sourceと初回snapshotを保持する', async ({
  page,
}) => {
  await createProject(page, 'batch palette atomic');
  const red = await makePngBuffer(page, '#ff0000');
  await page.getByLabel('画像を選ぶ').setInputFiles([
    { name: 'palette-one.png', mimeType: 'image/png', buffer: red },
    { name: 'palette-two.png', mimeType: 'image/png', buffer: red },
  ]);
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const before = await readAssetStates(page);

  const panel = batchPanel(page);
  await panel.getByLabel('一括操作').selectOption('palette');
  await selectPickerTarget(panel, 'palette-one');
  await selectPickerTarget(panel, 'palette-two');
  await panel.getByLabel('一括palette置換元色').fill('#ff0000');
  await panel.getByLabel('一括palette置換先色').fill('#0000ff');
  await panel.getByRole('button', { name: 'target previewを準備' }).click();
  const preview = panel.getByRole('region', { name: '一括変更preview' });
  await expect(preview.getByText('実行可能')).toHaveCount(2);
  await expect(preview.getByRole('button', { name: '.casproj退避を開く' })).toBeVisible();
  await preview.getByRole('button', { name: '選択targetを一括実行' }).click();

  await expect
    .poll(async () => (await readAssetStates(page))['palette-one'].editDigest)
    .not.toBe(before['palette-one'].editDigest);
  const after = await readAssetStates(page);
  for (const name of ['palette-one', 'palette-two']) {
    expect(after[name].sourceDigest).toBe(before[name].sourceDigest);
    expect(after[name].editDigest).not.toBe(before[name].editDigest);
    expect(await snapshotCount(page, after[name].id)).toBe(1);
  }

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => (await readAssetStates(page))['palette-one'].editDigest)
    .toBe(before['palette-one'].editDigest);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect
    .poll(async () => (await readAssetStates(page))['palette-one'].editDigest)
    .toBe(after['palette-one'].editDigest);
  for (const name of ['palette-one', 'palette-two']) {
    expect(await snapshotCount(page, after[name].id)).toBe(1);
  }
});

test('縮小canvas resizeはwarningを提示し、明示確認まで実行できず、座標をclampしない', async ({
  page,
}) => {
  const properties = await createProject(page, 'batch canvas warning');
  await createBlankAsset(properties, 'warn-target');
  const before = await readAssetStates(page);
  const beforeLayers = await readLayerPositions(page);
  const beforeSize = before['warn-target'].canvasSize;

  const panel = batchPanel(page);
  await panel.getByLabel('一括操作').selectOption('canvas-resize');
  await selectPickerTarget(panel, 'warn-target');
  await panel.getByLabel('一括canvas幅').fill('16');
  await panel.getByLabel('一括canvas高さ').fill('16');
  await panel.getByRole('button', { name: 'target previewを準備' }).click();

  const preview = panel.getByRole('region', { name: '一括変更preview' });
  await expect(preview.locator('.asset-batch-status.warning')).toBeVisible();
  await expect(preview.getByText(/変更後にcanvas外へ出るデータが\d+件あります/)).toBeVisible();

  const execute = preview.getByRole('button', { name: '選択targetを一括実行' });
  await expect(execute).toBeDisabled();
  await preview.getByRole('checkbox', { name: /warning対象を確認しました/ }).check();
  await expect(execute).toBeEnabled();
  await execute.click();

  await expect
    .poll(async () => (await readAssetStates(page))['warn-target'].canvasSize)
    .toEqual({ width: 16, height: 16 });
  const afterLayers = await readLayerPositions(page);
  const expectedPosition = {
    x: beforeLayers['warn-target'].x + (16 - beforeSize.width) / 2,
    y: beforeLayers['warn-target'].y + (16 - beforeSize.height) / 2,
  };
  expect(afterLayers['warn-target']).toEqual(expectedPosition);
  expect(expectedPosition.x).toBeLessThan(0);
  const after = await readAssetStates(page);
  expect(after['warn-target'].sourceDigest).toBe(before['warn-target'].sourceDigest);
  expect(after['warn-target'].editDigest).toBe(before['warn-target'].editDigest);
});

test('2 target保存の途中失敗は全件rollbackしHistoryを追加しない', async ({ page }) => {
  const properties = await createProject(page, 'batch transaction rollback');
  await createBlankAsset(properties, 'rollback-one');
  await createBlankAsset(properties, 'rollback-two');
  const before = await readAssetStates(page);

  const panel = batchPanel(page);
  await panel.getByLabel('一括操作').selectOption('canvas-resize');
  await selectPickerTarget(panel, 'rollback-one');
  await selectPickerTarget(panel, 'rollback-two');
  await panel.getByLabel('一括canvas幅').fill('530');
  await panel.getByLabel('一括canvas高さ').fill('530');
  await panel.getByRole('button', { name: 'target previewを準備' }).click();

  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype as IDBObjectStore & {
      __batchOriginalPut?: IDBObjectStore['put'];
    };
    const original = prototype.put;
    prototype.__batchOriginalPut = original;
    let assetPuts = 0;
    prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'assets' && ++assetPuts === 2) {
        throw new DOMException('forced batch failure', 'DataError');
      }
      return original.call(this, value, key);
    } as IDBObjectStore['put'];
  });
  await panel.getByRole('button', { name: '選択targetを一括実行' }).click();
  await expect(panel.getByRole('alert')).toContainText('正本は部分更新されていません');
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype as IDBObjectStore & {
      __batchOriginalPut?: IDBObjectStore['put'];
    };
    if (prototype.__batchOriginalPut) {
      prototype.put = prototype.__batchOriginalPut;
      delete prototype.__batchOriginalPut;
    }
  });

  expect(await readAssetStates(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
});

test.describe('iPhone SE級touchのbatch準備', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('target選択、progress、取消へ到達でき、正本と横幅を変えない', async ({ page }) => {
    const properties = await createProject(page, 'batch mobile cancel');
    await page
      .getByRole('navigation', { name: '画面切り替え' })
      .getByRole('button', { name: 'プロパティ' })
      .tap();
    await createBlankAsset(properties, 'mobile-one');
    await createBlankAsset(properties, 'mobile-two');
    const before = await readAssetStates(page);

    const panel = batchPanel(page);
    await panel.getByLabel('一括操作').selectOption('canvas-resize');
    await selectPickerTarget(panel, 'mobile-one');
    await selectPickerTarget(panel, 'mobile-two');
    await panel.getByLabel('一括canvas幅').fill('540');
    await panel.getByLabel('一括canvas高さ').fill('540');
    await page.evaluate(() => {
      let resolveEstimate!: (value: StorageEstimate) => void;
      const pending = new Promise<StorageEstimate>((resolve) => {
        resolveEstimate = resolve;
      });
      Object.defineProperty(navigator.storage, 'estimate', {
        configurable: true,
        value: () => pending,
      });
      (window as typeof window & { __resolveBatchEstimate?: () => void }).__resolveBatchEstimate =
        () => resolveEstimate({ usage: 100, quota: 1_000_000 });
    });

    await panel.getByRole('button', { name: 'target previewを準備' }).tap();
    await expect(panel.getByRole('status', { name: '一括処理の進捗' })).toBeVisible();
    await panel.getByRole('button', { name: '準備を取消' }).tap();
    await page.evaluate(() =>
      (
        window as typeof window & { __resolveBatchEstimate?: () => void }
      ).__resolveBatchEstimate?.(),
    );
    await expect(panel.getByRole('status')).toContainText('正本は変更されていません');
    expect(await readAssetStates(page)).toEqual(before);

    const undersizedControls = await panel
      .locator(
        "button:visible, select:visible, input:not([type='checkbox']):not([type='color']):visible, .asset-batch-target-picker > label:visible",
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
});
