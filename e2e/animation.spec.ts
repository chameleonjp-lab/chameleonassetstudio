import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#8e44ad';
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
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

/** レイヤーパネルの「main」レイヤーを選択する。 */
async function selectMainLayer(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true })
    .click();
}

/** 選択中レイヤーの X 座標を数値入力で変更し、blur で確定する。 */
async function setLayerX(page: Page, value: number): Promise<void> {
  const xInput = page.getByLabel('X', { exact: true });
  await xInput.fill(String(value));
  await xInput.blur();
}

interface StoredAnimationAsset {
  frames: Array<{ id: string; name: string; durationMs?: number }>;
  animations: Array<{
    id: string;
    name: string;
    fps: number;
    loop: boolean;
    frameIds: string[];
    events?: Array<{ id: string; name: string; frameId: string; payload?: unknown }>;
  }>;
}

/** IndexedDB の assets ストアから最初のアセットを読む。 */
async function readStoredAsset(page: Page): Promise<StoredAnimationAsset> {
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

/** Slice Aにはevent編集UIを含めないため、既存作品eventの再読込・再生検査用fixtureを保存する。 */
async function addStoredAnimationEvent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readTransaction = db.transaction('assets', 'readonly');
    const records = await new Promise<Array<{ data: StoredAnimationAsset }>>((resolve, reject) => {
      const request = readTransaction.objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ data: StoredAnimationAsset }>);
      request.onerror = () => reject(request.error);
    });
    const record = records[0];
    const animation = record?.data.animations[0];
    if (!record || !animation) {
      db.close();
      throw new Error('event fixtureを書き込む保存済みAnimationがありません。');
    }
    animation.events = [
      {
        id: 'event_e2e',
        name: 'attack_start',
        frameId: animation.frameIds[0],
        payload: { power: 2 },
      },
    ];
    const writeTransaction = db.transaction('assets', 'readwrite');
    writeTransaction.objectStore('assets').put(record);
    await new Promise<void>((resolve, reject) => {
      writeTransaction.oncomplete = () => resolve();
      writeTransaction.onerror = () => reject(writeTransaction.error);
      writeTransaction.onabort = () => reject(writeTransaction.error);
    });
    db.close();
  });
}

test('フレームを2枚作って idle アニメーションを作れる', async ({ page }) => {
  await setupProjectWithImage(page, 'idleテスト');
  await selectMainLayer(page);

  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await setLayerX(page, 20);
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  const frameList = page.getByRole('list', { name: 'フレーム一覧' });
  await expect(frameList.getByRole('listitem')).toHaveCount(2);

  await page.getByLabel('新しいアニメーション名').fill('idle');
  await page.getByRole('button', { name: '作成', exact: true }).click();

  await expect
    .poll(async () => (await readStoredAsset(page)).animations[0])
    .toMatchObject({ name: 'idle', fps: 8, loop: true });
  const stored = await readStoredAsset(page);
  expect(stored.animations[0].frameIds).toHaveLength(2);
});

test('fps とループを変更でき、リロード後も保持される', async ({ page }) => {
  await setupProjectWithImage(page, 'fpsテスト');
  await selectMainLayer(page);

  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await setLayerX(page, 10);
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  await page.getByLabel('新しいアニメーション名').fill('walk');
  await page.getByRole('button', { name: '作成', exact: true }).click();

  const fpsInput = page.getByLabel('fps', { exact: true });
  await fpsInput.fill('12');
  await fpsInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).animations[0]?.fps).toBe(12);

  await page.getByLabel('ループ').uncheck();
  await expect.poll(async () => (await readStoredAsset(page)).animations[0]?.loop).toBe(false);

  // 再読み込み後も残る
  await page.reload();
  await page.getByRole('button', { name: '「fpsテスト」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const stored = await readStoredAsset(page);
  expect(stored.animations[0].fps).toBe(12);
  expect(stored.animations[0].loop).toBe(false);
});

test('Frame表示時間をfps既定へ戻せ、Undo・Redo・reload後も再生時間が一致する', async ({ page }) => {
  await setupProjectWithImage(page, '可変時間テスト');
  await selectMainLayer(page);

  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await setLayerX(page, 10);
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('walk');
  await page.getByRole('button', { name: '作成', exact: true }).click();

  const durationInput = page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）');
  await durationInput.fill('220');
  await durationInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).frames[0].durationMs).toBe(220);
  await expect(page.getByLabel('アニメーション再生時間')).toContainText('345ms');

  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(async () => (await readStoredAsset(page)).frames[0].durationMs).toBeUndefined();
  await expect(durationInput).toHaveValue('');

  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(async () => (await readStoredAsset(page)).frames[0].durationMs).toBe(220);

  await page.reload();
  await page.getByRole('button', { name: '「可変時間テスト」を開く' }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'walk' });
  await expect(page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）')).toHaveValue('220');
  await expect(page.getByLabel('アニメーション再生時間')).toContainText('345ms');

  const reloadedInput = page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）');
  await reloadedInput.fill('');
  await reloadedInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).frames[0].durationMs).toBeUndefined();
  await expect(page.getByLabel('アニメーション再生時間')).toContainText('250ms');
});

test('保存済みeventをFrame表示開始時に通知し、情報を失うZIPだけ理由付きで拒否する', async ({
  page,
}) => {
  await setupProjectWithImage(page, 'イベント再生テスト');
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('attack');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect.poll(async () => (await readStoredAsset(page)).animations[0]?.name).toBe('attack');
  await expect(page.getByRole('status')).toContainText('保存済み');

  await addStoredAnimationEvent(page);
  await page.reload();
  await page.getByRole('button', { name: '「イベント再生テスト」を開く' }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'attack' });

  await expect(page.getByLabel('アニメーションイベント')).toContainText('attack_start');
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '発火:' })).toContainText('attack_start');

  await expect(page.getByRole('button', { name: 'ZIP をダウンロード' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('attack_start');
  await expect(page.getByRole('button', { name: 'PNG をダウンロード' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'asset.json をダウンロード' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '.casproj をダウンロード' })).toBeEnabled();
});

test('スマホ縦横でFrame時間入力が44px・16pxを保ち、横スクロールを発生させない', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, '可変時間モバイル');
  await page.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  const durationInput = page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）');
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(durationInput).toBeVisible();
    const metrics = await durationInput.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientWidth: document.documentElement.clientWidth,
      };
    });
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
    expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth);
  }
});

test('再生・停止・先頭へでフレームのハイライトが変わる', async ({ page }) => {
  await setupProjectWithImage(page, '再生テスト');
  await selectMainLayer(page);

  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_1
  await setLayerX(page, 10);
  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_2
  await setLayerX(page, 20);
  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_3

  await page.getByLabel('新しいアニメーション名').fill('run');
  await page.getByRole('button', { name: '作成', exact: true }).click();

  const frameList = page.getByRole('list', { name: 'フレーム一覧' });
  const playButton = page.getByRole('button', { name: '再生', exact: true });
  const stopButton = page.getByRole('button', { name: '停止', exact: true });
  const rewindButton = page.getByRole('button', { name: '先頭へ' });

  await expect(playButton).toBeEnabled();
  await playButton.click();
  await expect(stopButton).toBeEnabled();

  // 再生開始直後は先頭フレームがハイライトされる
  await expect(frameList.getByRole('button', { pressed: true })).toHaveText('frame_1');

  // fps に従って時間経過でハイライトが変わる
  await expect
    .poll(async () => frameList.getByRole('button', { pressed: true }).textContent(), {
      timeout: 3000,
    })
    .not.toBe('frame_1');

  // 停止するとハイライトが消える
  await stopButton.click();
  await expect(frameList.getByRole('button', { pressed: true })).toHaveCount(0);

  // 先頭へで 1 枚目がハイライトされる
  await rewindButton.click();
  await expect(frameList.getByRole('button', { pressed: true })).toHaveText('frame_1');
});

test('フレームの複製・削除・並べ替えが保存データに反映される', async ({ page }) => {
  await setupProjectWithImage(page, 'フレーム編集テスト');
  await selectMainLayer(page);

  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_1
  await setLayerX(page, 10);
  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_2
  await setLayerX(page, 20);
  await page.getByRole('button', { name: 'フレーム追加' }).click(); // frame_3

  const frameList = page.getByRole('list', { name: 'フレーム一覧' });
  await expect(frameList.getByRole('listitem')).toHaveCount(3);

  // 複製: frame_1 の直後に frame_1_copy が挿入される
  await page.getByRole('button', { name: 'フレーム「frame_1」を複製' }).click();
  await expect(frameList.getByRole('listitem')).toHaveCount(4);
  await expect
    .poll(async () => (await readStoredAsset(page)).frames.map((f) => f.name))
    .toEqual(['frame_1', 'frame_1_copy', 'frame_2', 'frame_3']);

  // 並べ替え: frame_3 を前へ動かす
  await page.getByRole('button', { name: 'フレーム「frame_3」を前へ' }).click();
  await expect
    .poll(async () => (await readStoredAsset(page)).frames.map((f) => f.name))
    .toEqual(['frame_1', 'frame_1_copy', 'frame_3', 'frame_2']);

  // 削除
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'フレーム「frame_2」を削除' }).click();
  await expect(frameList.getByRole('listitem')).toHaveCount(3);
  await expect
    .poll(async () => (await readStoredAsset(page)).frames.map((f) => f.name))
    .toEqual(['frame_1', 'frame_1_copy', 'frame_3']);
});
