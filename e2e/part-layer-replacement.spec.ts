import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredAsset {
  id: string;
  updatedAt: string;
  layers: Array<{ id: string; name: string }>;
  parts: Array<{
    id: string;
    name: string;
    layerIds: string[];
  }>;
  frames?: Array<{
    id: string;
    layerStates: Array<{ layerId: string }>;
  }>;
  animations: Array<{ id: string; frameIds: string[] }>;
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

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page, '#c0392b');
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function addImageLayer(page: Page, name: string, color: string): Promise<void> {
  await page.getByLabel('画像レイヤーを追加').setInputFiles({
    name: `${name}.png`,
    mimeType: 'image/png',
    buffer: await makePngBuffer(page, color),
  });
  await confirmImageImport(page);
  await expect(page.getByRole('list', { name: 'レイヤー一覧' })).toContainText(name);
}

async function createPart(page: Page, layerName: string, partName: string): Promise<void> {
  await page.getByLabel(`「${layerName}」を複数レイヤー操作の対象にする`).check();
  await page.getByLabel('新しいパーツ名').fill(partName);
  await page.getByRole('button', { name: /パーツを作成/ }).click();
  await expect(page.getByRole('listitem', { name: `パーツ「${partName}」` })).toBeVisible();
  await expect
    .poll(async () => (await readStoredAsset(page)).parts.some((part) => part.name === partName))
    .toBe(true);
  await expect(page.getByRole('button', { name: '元に戻す' })).toHaveAttribute(
    'title',
    'パーツ作成',
  );
}

async function readStoredAsset(page: Page): Promise<StoredAsset> {
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
    return records[0]?.data as never;
  });
}

async function reopenProject(page: Page, name: string): Promise<void> {
  await page.reload();
  await page.getByRole('button', { name: `「${name}」を開く` }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function setupReplacementFixture(page: Page, name: string): Promise<void> {
  await setupProjectWithImage(page, name);
  await addImageLayer(page, 'arm', '#2980b9');
  await addImageLayer(page, 'spare', '#27ae60');
  await createPart(page, 'main', 'Body');
  await createPart(page, 'arm', 'Arm');
}

test('Part構成レイヤーを拒否・取消でき、1履歴でUndo/Redo・reloadできる', async ({ page }) => {
  const projectName = 'Part差し替えE2E';
  await setupReplacementFixture(page, projectName);
  await reopenProject(page, projectName);

  const bodyRow = page.getByRole('listitem', { name: 'パーツ「Body」' });
  const armRow = page.getByRole('listitem', { name: 'パーツ「Arm」' });
  const before = await readStoredAsset(page);
  const bodyBefore = before.parts.find((part) => part.name === 'Body')!;
  const armBefore = before.parts.find((part) => part.name === 'Arm')!;
  const mainId = before.layers.find((layer) => layer.name === 'main')!.id;
  const spareId = before.layers.find((layer) => layer.name === 'spare')!.id;

  await bodyRow.getByRole('button', { name: '構成レイヤーを変更' }).click();
  const armOption = bodyRow.getByRole('checkbox', { name: /arm/ });
  await expect(armOption).toBeDisabled();
  await expect(bodyRow).toContainText('「Arm」で使用中');

  await bodyRow.getByRole('checkbox', { name: /spare/ }).check();
  await bodyRow.getByRole('button', { name: '取消' }).click();
  expect(await readStoredAsset(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await bodyRow.getByRole('button', { name: '構成レイヤーを変更' }).click();
  await bodyRow.getByRole('checkbox', { name: /main/ }).uncheck();
  await bodyRow.getByRole('button', { name: '構成レイヤーを確定' }).click();
  await expect(bodyRow.getByRole('alert')).toContainText('1件以上選択');
  expect(await readStoredAsset(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await bodyRow.getByRole('checkbox', { name: /spare/ }).focus();
  await page.keyboard.press('Space');
  await bodyRow.getByRole('button', { name: '構成レイヤーを確定' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  await expect
    .poll(async () => {
      const stored = await readStoredAsset(page);
      return stored.parts.find((part) => part.name === 'Body')?.layerIds;
    })
    .toEqual([spareId]);
  expect((await readStoredAsset(page)).parts.find((part) => part.name === 'Arm')).toEqual(
    armBefore,
  );

  const undo = page.getByRole('button', { name: '元に戻す' });
  await expect(undo).toHaveAttribute('title', 'パーツ構成レイヤー変更');
  await undo.click();
  await expect
    .poll(async () => {
      const stored = await readStoredAsset(page);
      return stored.parts.find((part) => part.name === 'Body')?.layerIds;
    })
    .toEqual([mainId]);
  await expect(undo).toBeDisabled();

  const redo = page.getByRole('button', { name: 'やり直す' });
  await expect(redo).toHaveAttribute('title', 'パーツ構成レイヤー変更');
  await redo.click();
  await expect
    .poll(async () => {
      const stored = await readStoredAsset(page);
      return stored.parts.find((part) => part.name === 'Body')?.layerIds;
    })
    .toEqual([spareId]);

  await reopenProject(page, projectName);
  const reloaded = await readStoredAsset(page);
  expect(reloaded.parts.find((part) => part.name === 'Body')?.layerIds).toEqual([spareId]);
  expect(reloaded.parts.find((part) => part.name === 'Arm')).toEqual(armBefore);
  expect(bodyBefore.layerIds).toEqual([mainId]);
  await expect(armRow).toBeVisible();
});

test('Part差し替えの保存失敗はAssetとHistoryを保存前へ戻す', async ({ page }) => {
  const projectName = 'Part差し替えrollback';
  await setupReplacementFixture(page, projectName);
  await reopenProject(page, projectName);
  const before = await readStoredAsset(page);
  const bodyRow = page.getByRole('listitem', { name: 'パーツ「Body」' });

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let failNextAssetPut = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'assets' && failNextAssetPut) {
        failNextAssetPut = false;
        throw new DOMException('injected asset write failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });

  await bodyRow.getByRole('button', { name: '構成レイヤーを変更' }).click();
  await bodyRow.getByRole('checkbox', { name: /main/ }).uncheck();
  await bodyRow.getByRole('checkbox', { name: /spare/ }).check();
  await bodyRow.getByRole('button', { name: '構成レイヤーを確定' }).click();

  await expect(page.getByRole('status')).toContainText('保存失敗', { timeout: 10_000 });
  await expect.poll(async () => readStoredAsset(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await bodyRow.getByRole('button', { name: '構成レイヤーを変更' }).click();
  await bodyRow.getByRole('checkbox', { name: /main/ }).uncheck();
  await bodyRow.getByRole('checkbox', { name: /spare/ }).check();
  await bodyRow.getByRole('button', { name: '構成レイヤーを確定' }).click();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
});

async function seedLongLayerList(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('assets', 'readwrite');
    const store = transaction.objectStore('assets');
    const records = await new Promise<Array<{ id: string; projectId: string; data: StoredAsset }>>(
      (resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const record = records[0];
    const mainLayer = record.data.layers[0] as StoredAsset['layers'][number] & {
      layerType: string;
      visible: boolean;
      locked: boolean;
      opacity: number;
      transform: unknown;
      textureId?: string;
    };
    record.data.layers.push(
      ...Array.from({ length: 24 }, (_, index) => ({
        id: `layer_long_${index}`,
        name: `長い構成レイヤー名_${String(index).padStart(2, '0')}_keyboard_touch`,
        layerType: 'guide',
        visible: true,
        locked: false,
        opacity: 1,
        transform: structuredClone(mainLayer.transform),
      })),
    );
    record.data.parts = [
      {
        id: 'part_mobile',
        name: 'Mobile',
        layerIds: [mainLayer.id],
        partType: 'body',
      } as StoredAsset['parts'][number],
    ];
    record.data.updatedAt = new Date().toISOString();
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
}

test.describe('Part構成レイヤーのiPhone SE級操作', () => {
  test.use({ hasTouch: true });

  for (const viewport of [
    { name: '縦', width: 375, height: 667 },
    { name: '横', width: 667, height: 375 },
  ]) {
    test(`${viewport.name}で長い一覧をtouch操作でき、44pxと横overflowを守る`, async ({ page }) => {
      const projectName = `Part mobile ${viewport.name}`;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupProjectWithImage(page, projectName);
      await seedLongLayerList(page);
      await reopenProject(page, projectName);
      await page
        .getByRole('navigation', { name: '画面切り替え' })
        .getByRole('button', { name: 'プロパティ' })
        .tap();

      const partRow = page.getByRole('listitem', { name: 'パーツ「Mobile」' });
      const openButton = partRow.getByRole('button', { name: '構成レイヤーを変更' });
      await openButton.scrollIntoViewIfNeeded();
      await openButton.tap();

      const list = partRow.getByLabel('「Mobile」の構成レイヤー候補');
      await expect(list).toBeVisible();
      expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );

      const lastOption = partRow
        .locator('.part-layer-option')
        .filter({ hasText: '長い構成レイヤー名_23' });
      await lastOption.scrollIntoViewIfNeeded();
      const optionBox = await lastOption.boundingBox();
      expect(optionBox).not.toBeNull();
      expect(optionBox!.height).toBeGreaterThanOrEqual(44);
      await lastOption.tap();
      await expect(lastOption.getByRole('checkbox')).toBeChecked();

      for (const buttonName of ['構成レイヤーを確定', '取消']) {
        const button = partRow.getByRole('button', { name: buttonName });
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      if (viewport.name === '縦') {
        await partRow.getByRole('button', { name: '構成レイヤーを確定' }).tap();
        await expect
          .poll(async () => {
            const stored = await readStoredAsset(page);
            return stored.parts[0].layerIds;
          })
          .toHaveLength(2);
      } else {
        await partRow.getByRole('button', { name: '取消' }).tap();
      }
    });
  }
});
