import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredGameDataAsset {
  id: string;
  assetType: string;
  updatedAt: string;
  gameAttributes: Record<string, unknown>;
  tile?: unknown;
  gimmick?: unknown;
  effect?: unknown;
  layers: Array<{
    id: string;
    name: string;
    background?: unknown;
    [key: string]: unknown;
  }>;
}

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#457b9d';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'base.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
}

async function reopenProject(page: Page, name: string): Promise<void> {
  await page.reload();
  await page.getByRole('button', { name: `「${name}」を開く` }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function readStoredAsset(page: Page): Promise<StoredGameDataAsset> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: StoredGameDataAsset }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ data: StoredGameDataAsset }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!records[0]) {
      throw new Error('保存済みAssetが見つかりません。');
    }
    return records[0].data;
  });
}

async function writeStoredFixture(page: Page, fixture: 'attributes' | 'retained'): Promise<void> {
  await page.evaluate(async (fixtureKind) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: StoredGameDataAsset }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ data: StoredGameDataAsset }>);
      request.onerror = () => reject(request.error);
    });
    const record = records[0];
    if (!record) {
      db.close();
      throw new Error('fixtureを書き込む保存済みAssetがありません。');
    }
    if (fixtureKind === 'attributes') {
      record.data.assetType = 'item';
      record.data.gameAttributes = {
        config: { nested: [1, true], label: 'preserve-me' },
        checkpoints: ['start', { x: 3, y: 4 }],
        enabled: false,
        nullable: null,
        score: 10,
        title: 'coin',
      };
    } else {
      record.data.assetType = 'item';
      record.data.tile = {
        tileSize: { width: 48, height: 24 },
        collisionType: 'one_way',
        visualType: 'bridge',
      };
      record.data.gimmick = { movementPreset: 'pendulum' };
      record.data.effect = {
        effectType: 'aura',
        durationMs: 900,
        loop: true,
        blendMode: 'add',
      };
      record.data.layers[0].background = {
        role: 'near',
        parallaxSpeed: { x: 0.8, y: 0.1 },
        loopX: true,
        loopY: false,
      };
      record.data.layers.push({
        ...structuredClone(record.data.layers[0]),
        id: 'layer_old_background',
        name: '旧背景レイヤー',
        background: {
          role: 'far',
          parallaxSpeed: { x: 0.2, y: 0 },
          loopX: true,
          loopY: true,
        },
      });
    }
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, fixture);
}

test('構造属性を壊さず、primitive入力を1履歴で確定・取消・no-opにできる', async ({ page }) => {
  const projectName = 'G1属性安全性';
  await setupProjectWithImage(page, projectName);
  await writeStoredFixture(page, 'attributes');
  await reopenProject(page, projectName);

  const attributes = page.getByRole('list', { name: 'ゲーム属性一覧' });
  await expect(attributes.getByText('読み取り専用（object）')).toBeVisible();
  await expect(attributes.getByText('読み取り専用（array）')).toBeVisible();
  await expect(attributes.getByText('読み取り専用（boolean）')).toBeVisible();
  await expect(attributes.getByText('読み取り専用（null）')).toBeVisible();
  await expect(attributes).toContainText('preserve-me');

  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });
  const score = page.getByLabel('属性「score」の値');
  const before = await readStoredAsset(page);
  await expect(undo).toBeDisabled();

  await score.fill('010');
  await score.press('Enter');
  await expect(score).toHaveValue('10');
  await expect(undo).toBeDisabled();
  await page.waitForTimeout(400);
  expect((await readStoredAsset(page)).updatedAt).toBe(before.updatedAt);

  await score.fill('99');
  await score.press('Escape');
  await expect(score).toHaveValue('10');
  await expect(undo).toBeDisabled();

  await score.fill('12');
  await score.press('Enter');
  await expect(undo).toHaveAttribute('title', '属性値変更');
  await undo.click();
  await expect(score).toHaveValue('10');
  await expect(redo).toHaveAttribute('title', '属性値変更');
  await redo.click();
  await expect(score).toHaveValue('12');

  const title = page.getByLabel('属性「title」の値');
  await title.fill('gem');
  await page.getByLabel('新しい属性名').focus();
  await expect(undo).toHaveAttribute('title', '属性値変更');
  await expect(title).toHaveValue('gem');

  await page.getByLabel('新しい属性名').fill('config');
  await expect(page.getByRole('button', { name: '属性を追加' })).toBeDisabled();
  await expect(page.getByText(/同じ属性名があります/)).toBeVisible();

  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  const stored = await readStoredAsset(page);
  expect(stored.gameAttributes).toEqual({
    config: { nested: [1, true], label: 'preserve-me' },
    checkpoints: ['start', { x: 3, y: 4 }],
    enabled: false,
    nullable: null,
    score: 12,
    title: 'gem',
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, 'utf-8'));
  expect(exported.gameAttributes).toEqual(stored.gameAttributes);

  await reopenProject(page, projectName);
  await expect(page.getByLabel('属性「score」の値')).toHaveValue('12');
  await expect(page.getByRole('list', { name: 'ゲーム属性一覧' })).toContainText('preserve-me');
});

test('旧tile・gimmick・effect・全Layer背景を保持表示し、対象だけ明示削除できる', async ({
  page,
}) => {
  const projectName = 'G1旧設定';
  await setupProjectWithImage(page, projectName);
  await writeStoredFixture(page, 'retained');
  await reopenProject(page, projectName);

  const retained = page.getByRole('list', { name: '保持中の旧種別設定一覧' });
  await expect(retained.getByRole('listitem')).toHaveCount(5);
  await expect(retained).toContainText('タイル設定');
  await expect(retained).toContainText('ギミック設定');
  await expect(retained).toContainText('エフェクト設定');
  await expect(retained).toContainText('背景設定（レイヤー: main）');
  await expect(retained).toContainText('背景設定（レイヤー: 旧背景レイヤー）');

  await page.getByLabel('アセット種別').selectOption('tile');
  await expect(page.getByLabel('タイル幅')).toHaveValue('48');
  await page.getByLabel('アセット種別').selectOption('item');
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  await reopenProject(page, projectName);
  await expect(
    page.getByRole('list', { name: '保持中の旧種別設定一覧' }).getByRole('listitem'),
  ).toHaveCount(5);

  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });
  await page.getByRole('button', { name: 'タイル設定を削除', exact: true }).click();
  await expect(undo).toHaveAttribute('title', '保持中のタイル設定を削除');
  expect((await readStoredAsset(page)).gimmick).toEqual({ movementPreset: 'pendulum' });
  await undo.click();
  await expect(page.getByRole('button', { name: 'タイル設定を削除', exact: true })).toBeVisible();
  await redo.click();
  await expect(page.getByRole('button', { name: 'タイル設定を削除', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'ギミック設定を削除', exact: true }).click();
  await page.getByRole('button', { name: 'エフェクト設定を削除', exact: true }).click();
  await page.getByRole('button', { name: '背景設定（レイヤー: main）を削除', exact: true }).click();
  await page
    .getByRole('button', { name: '背景設定（レイヤー: 旧背景レイヤー）を削除', exact: true })
    .click();
  await expect(page.getByRole('list', { name: '保持中の旧種別設定一覧' })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });

  const stored = await readStoredAsset(page);
  expect(stored.tile).toBeUndefined();
  expect(stored.gimmick).toBeUndefined();
  expect(stored.effect).toBeUndefined();
  expect(stored.layers.every((layer) => layer.background === undefined)).toBe(true);
  await reopenProject(page, projectName);
  await expect(page.getByText('保持中の旧種別設定')).toHaveCount(0);
});

test('tile・effect・backgroundの文字数値入力をEnterまたはblurで確定する', async ({ page }) => {
  const projectName = 'G1種別入力';
  await setupProjectWithImage(page, projectName);
  const undo = page.getByRole('button', { name: '元に戻す', exact: true });
  const redo = page.getByRole('button', { name: 'やり直す', exact: true });

  await page.getByLabel('アセット種別').selectOption('tile');
  await page.getByRole('button', { name: 'タイル設定を追加' }).click();
  const tileWidth = page.getByLabel('タイル幅');
  await tileWidth.fill('48');
  await tileWidth.press('Enter');
  await expect(undo).toHaveAttribute('title', 'タイル幅変更');
  await undo.click();
  await expect(tileWidth).toHaveValue('32');
  await redo.click();
  await expect(tileWidth).toHaveValue('48');

  await tileWidth.fill('048');
  await tileWidth.press('Enter');
  await expect(tileWidth).toHaveValue('48');
  await undo.click();
  await expect(tileWidth).toHaveValue('32');
  await redo.click();

  const tileHeight = page.getByLabel('タイル高さ');
  await tileHeight.fill('24');
  await page.getByLabel('当たり判定タイプ').focus();
  await expect(undo).toHaveAttribute('title', 'タイル高さ変更');
  const visualType = page.getByLabel('見た目タイプ');
  await visualType.fill('wall');
  await visualType.press('Escape');
  await expect(visualType).toHaveValue('floor');
  await visualType.fill('bridge');
  await page.getByLabel('当たり判定タイプ').focus();
  await expect(undo).toHaveAttribute('title', '見た目タイプ変更');

  await page.getByLabel('アセット種別').selectOption('effect');
  await page.getByRole('button', { name: 'エフェクト設定を追加' }).click();
  const duration = page.getByLabel('エフェクト長さ(ms)');
  await duration.fill('750');
  await duration.press('Enter');
  await expect(undo).toHaveAttribute('title', 'エフェクト長さ変更');

  await page.getByLabel('アセット種別').selectOption('background');
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await page.getByRole('button', { name: '背景設定を追加' }).click();
  const speedX = page.getByLabel('視差速度 X');
  const speedY = page.getByLabel('視差速度 Y');
  await speedX.fill('1.25');
  await speedX.press('Enter');
  await expect(undo).toHaveAttribute('title', '視差速度変更');
  await speedY.fill('-0.25');
  await page.getByLabel('役割').focus();
  await expect(undo).toHaveAttribute('title', '視差速度変更');

  await expect(page.getByRole('status')).toHaveText('保存済み', { timeout: 10_000 });
  await reopenProject(page, projectName);
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await expect(page.getByLabel('視差速度 X')).toHaveValue('1.25');
  await expect(page.getByLabel('視差速度 Y')).toHaveValue('-0.25');
});

test.describe('mobile G1', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('長い構造値でも横幅を壊さず、入力と選択を44px・16pxで表示する', async ({ page }) => {
    const projectName = 'G1モバイル';
    await setupProjectWithImage(page, projectName);
    await writeStoredFixture(page, 'attributes');
    await reopenProject(page, projectName);
    await page.getByRole('button', { name: 'プロパティ', exact: true }).click();

    const score = page.getByLabel('属性「score」の値');
    const typeSelect = page.getByLabel('アセット種別');
    await expect(score).toBeVisible();
    await expect(typeSelect).toBeVisible();
    const dimensions = await page.evaluate(() => {
      const scoreInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="属性「score」の値"]',
      )!;
      const assetType = document.querySelector<HTMLSelectElement>('select')!;
      const properties = document.querySelector<HTMLElement>('.editor-properties.mobile-active')!;
      return {
        scoreHeight: scoreInput.getBoundingClientRect().height,
        scoreFontSize: Number.parseFloat(getComputedStyle(scoreInput).fontSize),
        selectHeight: assetType.getBoundingClientRect().height,
        selectFontSize: Number.parseFloat(getComputedStyle(assetType).fontSize),
        documentFits: document.documentElement.scrollWidth <= window.innerWidth,
        propertiesFits: properties.scrollWidth <= properties.clientWidth,
      };
    });
    expect(dimensions.scoreHeight).toBeGreaterThanOrEqual(44);
    expect(dimensions.scoreFontSize).toBeGreaterThanOrEqual(16);
    expect(dimensions.selectHeight).toBeGreaterThanOrEqual(44);
    expect(dimensions.selectFontSize).toBeGreaterThanOrEqual(16);
    expect(dimensions.documentFits).toBe(true);
    expect(dimensions.propertiesFits).toBe(true);
    await expect(page.getByRole('list', { name: 'ゲーム属性一覧' })).toContainText('preserve-me');
  });
});
