import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

/** IndexedDB の assets ストアから最初のアセットを読む。 */
async function readStoredAsset(page: Page): Promise<{
  textures: Array<{ id: string; kind: string }>;
  provenance?: Array<{
    sourceFileName?: string;
    hash?: string;
    textureId?: string;
  }>;
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    transform: { scale: { x: number; y: number } };
  }>;
  parts: Array<{
    name: string;
    partType: string;
    layerIds: string[];
    pivot?: { x: number; y: number };
  }>;
}> {
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

async function readBlobKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return keys as string[];
  });
}

test('画像レイヤーを追加し、名前変更・並べ替え・表示切り替えができる', async ({ page }) => {
  await setupProjectWithImage(page, 'レイヤーテスト');

  // 2 枚目をレイヤーとして追加
  const overlay = await makePngBuffer(page, '#2980b9');
  await page
    .getByLabel('画像レイヤーを追加')
    .setInputFiles({ name: 'overlay.png', mimeType: 'image/png', buffer: overlay });

  const imported = await readStoredAsset(page);
  expect(imported.provenance).toHaveLength(2);
  const overlayProvenance = imported.provenance?.find(
    (record) => record.sourceFileName === 'overlay.png',
  );
  expect(overlayProvenance?.hash).toBe(
    `sha256:${createHash('sha256').update(overlay).digest('hex')}`,
  );
  expect(
    imported.textures.find((texture) => texture.id === overlayProvenance?.textureId)?.kind,
  ).toBe('source');

  const layerList = page.getByRole('list', { name: 'レイヤー一覧' });
  await expect(layerList.getByRole('listitem')).toHaveCount(2);
  // 前面が上に表示される
  await expect(layerList.getByRole('listitem').first()).toContainText('overlay');

  // 名前変更（追加直後は overlay レイヤーが選択されている）
  const nameInput = page.getByLabel('レイヤー名');
  await nameInput.fill('前景');
  await nameInput.blur();
  await expect(layerList.getByRole('listitem').first()).toContainText('前景');

  // 背面へ移動すると順序が入れ替わる
  await page.getByRole('button', { name: '「前景」を背面へ' }).click();
  await expect(layerList.getByRole('listitem').first()).toContainText('main');

  // 表示切り替えとロック
  await page.getByRole('button', { name: '「前景」の表示を切り替え' }).click();
  await page.getByRole('button', { name: '「前景」のロックを切り替え' }).click();
  await expect
    .poll(async () => {
      const asset = await readStoredAsset(page);
      const layer = asset.layers.find((l) => l.name === '前景');
      return layer && !layer.visible && layer.locked;
    })
    .toBe(true);

  // Undo でロックが戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect
    .poll(async () => {
      const asset = await readStoredAsset(page);
      return asset.layers.find((l) => l.name === '前景')?.locked;
    })
    .toBe(false);
});

test('画像Layer batchは1回のUndoで全追加Blobが消え、Redoと再読み込みで戻る', async ({ page }) => {
  await setupProjectWithImage(page, '画像レイヤー改訂E2E');

  const beforeKeys = await readBlobKeys(page);
  const overlay = await makePngBuffer(page, '#2980b9');
  const overlay2 = await makePngBuffer(page, '#27ae60');
  await page.getByLabel('画像レイヤーを追加').setInputFiles([
    { name: 'overlay.png', mimeType: 'image/png', buffer: overlay },
    { name: 'overlay-2.png', mimeType: 'image/png', buffer: overlay2 },
  ]);
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    3,
  );
  const addedKeys = (await readBlobKeys(page)).filter((key) => !beforeKeys.includes(key));
  expect(addedKeys.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await expect
    .poll(async () => (await readBlobKeys(page)).some((key) => addedKeys.includes(key)))
    .toBe(false);

  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    3,
  );
  await expect
    .poll(async () => (await readBlobKeys(page)).some((key) => addedKeys.includes(key)))
    .toBe(true);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await page.reload();
  await page.getByRole('button', { name: '「画像レイヤー改訂E2E」を開く' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    1,
  );
  expect((await readBlobKeys(page)).some((key) => addedKeys.includes(key))).toBe(false);
});

test('画像Layer batchの途中に不正画像があればLayerとBlobを1件も保存しない', async ({ page }) => {
  await setupProjectWithImage(page, 'Layer batch原子性');
  const beforeKeys = await readBlobKeys(page);
  const valid = await makePngBuffer(page, '#2980b9');

  await page.getByLabel('画像レイヤーを追加').setInputFiles([
    { name: 'valid-overlay.png', mimeType: 'image/png', buffer: valid },
    { name: 'spoofed-overlay.jpg', mimeType: 'image/jpeg', buffer: valid },
  ]);

  await expect(page.getByRole('alert')).toContainText(
    '選択した画像レイヤーは1件も追加されていません',
  );
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await expect.poll(async () => (await readStoredAsset(page)).layers.length).toBe(1);
  expect(await readBlobKeys(page)).toEqual(beforeKeys);
});

test('レイヤーを削除するとパーツからの参照も外れる', async ({ page }) => {
  await setupProjectWithImage(page, 'レイヤー削除テスト');
  const overlay = await makePngBuffer(page, '#27ae60');
  await page
    .getByLabel('画像レイヤーを追加')
    .setInputFiles({ name: 'arm.png', mimeType: 'image/png', buffer: overlay });

  // 両方のレイヤーでパーツを作る
  await page.getByLabel('「main」を複数レイヤー操作の対象にする').check();
  await page.getByLabel('「arm」を複数レイヤー操作の対象にする').check();
  await page.getByRole('button', { name: /パーツを作成/ }).click();
  await expect.poll(async () => (await readStoredAsset(page)).parts[0]?.layerIds.length).toBe(2);

  // arm レイヤーを削除
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '「arm」を削除' }).click();
  await expect(page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await expect.poll(async () => (await readStoredAsset(page)).parts[0]?.layerIds.length).toBe(1);
});

test('パーツを作成して種別と pivot を設定でき、再読み込み後も残る', async ({ page }) => {
  await setupProjectWithImage(page, 'パーツテスト');

  await page.getByLabel('「main」を複数レイヤー操作の対象にする').check();
  await page.getByLabel('新しいパーツ名').fill('剣');
  await page.getByLabel('パーツ種別').selectOption('weapon');
  await page.getByRole('button', { name: /パーツを作成/ }).click();

  const partList = page.getByRole('list', { name: 'パーツ一覧' });
  await expect(partList.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByLabel('パーツ名', { exact: true })).toHaveValue('剣');

  // pivot を設定
  await page.getByLabel('pivot X').fill('32');
  await page.getByLabel('pivot X').blur();
  await page.getByLabel('pivot Y').fill('60');
  await page.getByLabel('pivot Y').blur();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  await expect
    .poll(async () => (await readStoredAsset(page)).parts[0])
    .toMatchObject({ name: '剣', partType: 'weapon', pivot: { x: 32, y: 60 } });

  // 再読み込み後も保持される
  await page.reload();
  await page.getByRole('button', { name: '「パーツテスト」を開く' }).click();
  await expect(page.getByLabel('パーツ名', { exact: true })).toHaveValue('剣');
  await expect(page.getByLabel('pivot X')).toHaveValue('32');
  const stored = await readStoredAsset(page);
  expect(stored.parts[0].partType).toBe('weapon');
});

test('選択レイヤーを左右反転でき、拡大率表示は正のまま二度で戻る', async ({ page }) => {
  await setupProjectWithImage(page, '左右反転テスト');

  // main レイヤーを選択して「選択中レイヤー」パネルを開く
  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();

  const flipButton = page.getByRole('button', { name: '左右反転', exact: true });
  await expect(flipButton).toHaveAttribute('aria-pressed', 'false');
  const scaleInput = page.getByLabel('拡大率（%）');
  await expect(scaleInput).toHaveValue('100');

  // 反転すると scale.x が負になり、ボタンは押下状態、拡大率表示は正のまま
  await flipButton.click();
  await expect(flipButton).toHaveAttribute('aria-pressed', 'true');
  await expect(scaleInput).toHaveValue('100');
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0].transform.scale.x)
    .toBeLessThan(0);

  // もう一度反転すると元の向きへ戻る
  await flipButton.click();
  await expect(flipButton).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0].transform.scale.x)
    .toBeGreaterThan(0);

  // Undo で反転前へ戻せる（履歴に乗っている）
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(flipButton).toHaveAttribute('aria-pressed', 'true');
});

test('ガイドレイヤーを追加できる', async ({ page }) => {
  await setupProjectWithImage(page, 'ガイドテスト');
  await page.getByRole('button', { name: 'ガイドレイヤーを追加' }).click();
  const layerList = page.getByRole('list', { name: 'レイヤー一覧' });
  await expect(layerList.getByRole('listitem')).toHaveCount(2);
  await expect(layerList.getByRole('listitem').first()).toContainText('ガイド');
});
