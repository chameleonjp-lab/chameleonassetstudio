import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredColliderOverride {
  colliderId: string;
  rect?: { x: number; y: number; width: number; height: number; [key: string]: unknown };
  circle?: { x: number; y: number; radius: number; [key: string]: unknown };
  visible?: boolean;
  [key: string]: unknown;
}

interface StoredO1Asset {
  id: string;
  version: string;
  updatedAt: string;
  colliders: Array<{ id: string; name: string; shape: string; visible: boolean }>;
  frames: Array<{
    id: string;
    name: string;
    colliderOverrides?: StoredColliderOverride[];
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#1d3557';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function readStoredAsset(page: Page): Promise<StoredO1Asset> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: StoredO1Asset }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ data: StoredO1Asset }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!records[0]) throw new Error('保存済みAssetが見つかりません。');
    return records[0].data;
  });
}

async function readStoredProject(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records[0];
  });
}

async function readBlobDigests(page: Page): Promise<Array<{ key: string; bytes: number[] }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ key: string; blob: Blob }>>((resolve, reject) => {
      const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ key: string; blob: Blob }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return Promise.all(
      records.map(async (record) => ({
        key: record.key,
        bytes: [...new Uint8Array(await record.blob.arrayBuffer())],
      })),
    );
  });
}

async function reopenProject(page: Page, name: string): Promise<void> {
  await page.reload();
  await page.getByRole('button', { name: `「${name}」を開く` }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function setupO1Project(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'base.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  if (await mobileNav.isVisible()) {
    await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).tap();
  }
  await page.getByRole('button', { name: '矩形判定を追加' }).click();
  if (await mobileNav.isVisible()) {
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).tap();
  }
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('o1_animation');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  await reopenProject(page, name);
}

async function selectFrameScope(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'frame_1', exact: true }).click();
  await page.getByLabel('当たり判定の編集範囲').selectOption('frame');
  await expect(page.getByText('Frame別編集中: 「frame_1」')).toBeVisible();
}

async function seedUnknownOverride(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db.transaction('assets', 'readonly').objectStore('assets').getAll();
    const records = await new Promise<Array<{ data: StoredO1Asset }>>((resolve, reject) => {
      read.onsuccess = () => resolve(read.result as Array<{ data: StoredO1Asset }>);
      read.onerror = () => reject(read.error);
    });
    const record = records[0];
    const collider = record.data.colliders[0];
    record.data.frames[0].colliderOverrides = [
      {
        colliderId: collider.id,
        rect: { x: 16, y: 16, width: 32, height: 32, futureGeometry: { exact: true } },
        name: 'reserved-is-unknown',
        futureEntry: { exact: true },
      },
    ];
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
}

test('Frame別geometry/visibleを1履歴で確定・取消・Undo/Redo・reload・JSON保持できる', async ({
  page,
}) => {
  const projectName = 'O1編集E2E';
  await setupO1Project(page, projectName);
  await selectFrameScope(page);

  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });
  const width = page.getByLabel('Frame「frame_1」判定「body」幅');
  const x = page.getByLabel('Frame「frame_1」判定「body」X');
  const visible = page.getByLabel('Frame「frame_1」判定「body」の表示');
  await expect(width).toHaveValue('32');
  await expect(undo).toBeDisabled();

  await width.fill('032');
  await width.press('Enter');
  await expect(width).toHaveValue('32');
  await expect(undo).toBeDisabled();

  await width.fill('99');
  await width.press('Escape');
  await expect(width).toHaveValue('32');
  await expect(undo).toBeDisabled();

  await width.fill('20');
  await width.press('Enter');
  await expect(undo).toHaveAttribute('title', 'Frame別当たり判定: geometry変更');
  await undo.click();
  await expect(width).toHaveValue('32');
  await expect(redo).toHaveAttribute('title', 'Frame別当たり判定: geometry変更');
  await redo.click();
  await expect(width).toHaveValue('20');

  await x.fill('5');
  await visible.focus();
  await expect(x).toHaveValue('5');
  await visible.selectOption('hide');
  await expect(page.getByText(/Frameで非表示/)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  const stored = await readStoredAsset(page);
  expect(stored.version).toBe('0.2.0');
  expect(stored.frames[0].colliderOverrides).toEqual([
    {
      colliderId: stored.colliders[0].id,
      rect: { x: 5, y: 16, width: 20, height: 32 },
      visible: false,
    },
  ]);

  const zip = page.getByRole('button', { name: 'ZIP をダウンロード' });
  await expect(zip).toBeDisabled();
  await expect(page.getByText(/Frame別の当たり判定情報がAtlas 0\.1\.0では失われる/)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, 'utf-8')) as StoredO1Asset;
  expect(exported.frames[0].colliderOverrides).toEqual(stored.frames[0].colliderOverrides);

  await reopenProject(page, projectName);
  await selectFrameScope(page);
  await expect(page.getByLabel('Frame「frame_1」判定「body」幅')).toHaveValue('20');
  await expect(page.getByLabel('Frame「frame_1」判定「body」の表示')).toHaveValue('hide');
});

test('参照中collider削除と未知fieldだけを残すresetを拒否し、明示全解除だけ許可する', async ({
  page,
}) => {
  const projectName = 'O1未知field E2E';
  await setupO1Project(page, projectName);
  await seedUnknownOverride(page);
  await reopenProject(page, projectName);
  await page.getByRole('button', { name: 'frame_1', exact: true }).click();

  await page.getByRole('button', { name: '判定「body」を削除' }).click();
  await expect(page.getByRole('alert')).toContainText('Frame上書き');
  expect((await readStoredAsset(page)).colliders).toHaveLength(1);

  await page.getByLabel('当たり判定の編集範囲').selectOption('frame');
  await expect(page.getByText(/未知field（name、futureEntry）を保持中/)).toBeVisible();
  await page.getByRole('button', { name: '位置・サイズを共通へ戻す' }).click();
  await expect(page.getByRole('alert')).toContainText('未知field');
  expect((await readStoredAsset(page)).frames[0].colliderOverrides?.[0]).toHaveProperty('rect');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'このFrameの上書きをすべて解除' }).click();
  expect((await readStoredAsset(page)).frames[0].colliderOverrides?.[0]).toHaveProperty('rect');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'このFrameの上書きをすべて解除' }).click();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  expect((await readStoredAsset(page)).frames[0]).not.toHaveProperty('colliderOverrides');
});

test('保存失敗はBlobを変えずAsset/Project/History/UIを戻しerrorを残して次の保存で回復する', async ({
  page,
}) => {
  const projectName = 'O1 rollback E2E';
  await setupO1Project(page, projectName);
  await selectFrameScope(page);
  const beforeAsset = await readStoredAsset(page);
  const beforeProject = await readStoredProject(page);
  const beforeBlobs = await readBlobDigests(page);

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let failNextAssetPut = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'assets' && failNextAssetPut) {
        failNextAssetPut = false;
        throw new DOMException('injected O1 asset write failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });

  const width = page.getByLabel('Frame「frame_1」判定「body」幅');
  await width.fill('20');
  await width.press('Enter');
  await expect(page.getByRole('status')).toContainText('保存失敗', { timeout: 10_000 });
  await expect(width).toHaveValue('32');
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await expect.poll(async () => readStoredAsset(page)).toEqual(beforeAsset);
  expect(await readStoredProject(page)).toEqual(beforeProject);
  expect(await readBlobDigests(page)).toEqual(beforeBlobs);

  await width.fill('24');
  await width.press('Enter');
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  await expect
    .poll(async () => (await readStoredAsset(page)).frames[0].colliderOverrides?.[0])
    .toMatchObject({
      rect: { width: 24 },
    });
});

test.describe('mobile O1', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('再生中はFrame scopeを無効化し、375×667で44px・16px・touch・横幅を維持する', async ({
    page,
  }) => {
    const projectName = 'O1 mobile E2E';
    await setupO1Project(page, projectName);
    const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).tap();
    await page.getByLabel('アニメーション選択').selectOption({ label: 'o1_animation' });
    await page.getByRole('button', { name: '再生', exact: true }).tap();
    await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).tap();
    await expect(
      page.getByLabel('当たり判定の編集範囲').getByRole('option', { name: /選択Frame/ }),
    ).toBeDisabled();

    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).tap();
    await page.getByRole('button', { name: '停止', exact: true }).tap();
    await page.getByRole('button', { name: 'frame_1', exact: true }).tap();
    await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).tap();
    const scope = page.getByLabel('当たり判定の編集範囲');
    await scope.selectOption('frame');
    const width = page.getByLabel('Frame「frame_1」判定「body」幅');
    const reset = page.getByRole('button', { name: 'このFrameの上書きをすべて解除' });
    await width.tap();
    await width.fill('28');
    await width.press('Enter');
    await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

    const metrics = await page.evaluate(() => {
      const scopeSelect = document.querySelector<HTMLSelectElement>(
        'select[aria-label="当たり判定の編集範囲"]',
      )!;
      const widthInput = document.querySelector<HTMLInputElement>(
        'input[aria-label*="判定"][aria-label$="幅"]',
      )!;
      const resetButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.includes('このFrameの上書きをすべて解除'),
      )!;
      const properties = document.querySelector<HTMLElement>('.editor-properties.mobile-active')!;
      const dimensions = (element: HTMLElement) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        touchAction: getComputedStyle(element).touchAction,
      });
      return {
        scope: dimensions(scopeSelect),
        input: dimensions(widthInput),
        reset: dimensions(resetButton),
        documentFits: document.documentElement.scrollWidth <= window.innerWidth,
        propertiesFit: properties.scrollWidth <= properties.clientWidth,
      };
    });
    for (const target of [metrics.scope, metrics.input, metrics.reset]) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.touchAction).toBe('manipulation');
    }
    expect(metrics.scope.fontSize).toBeGreaterThanOrEqual(16);
    expect(metrics.input.fontSize).toBeGreaterThanOrEqual(16);
    expect(metrics.documentFits).toBe(true);
    expect(metrics.propertiesFit).toBe(true);
    await expect(reset).toBeEnabled();
  });
});
