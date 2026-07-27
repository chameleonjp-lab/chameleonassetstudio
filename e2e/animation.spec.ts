import { readFile } from 'node:fs/promises';
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
  layers: Array<{
    transform: { position: { x: number; y: number } };
  }>;
  frames: Array<{ id: string; name: string; durationMs?: number }>;
  animations: Array<{
    id: string;
    name: string;
    fps: number;
    loop: boolean;
    frameIds: string[];
    events?: StoredAnimationEvent[];
  }>;
}

interface StoredAnimationEvent {
  id: string;
  name: string;
  frameId: string;
  payload?: unknown;
  [key: string]: unknown;
}

interface StoredAnimationEventFixture {
  id: string;
  name: string;
  frameIndex: number;
  payload?: unknown;
  [key: string]: unknown;
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
async function writeStoredAnimationFixture(
  page: Page,
  options: {
    events?: StoredAnimationEventFixture[];
    frameSequence?: number[];
  } = {},
): Promise<void> {
  const fixture = {
    events: options.events ?? [
      {
        id: 'event_e2e',
        name: 'attack_start',
        frameIndex: 0,
        payload: { power: 2 },
        futureEventField: { preserved: true },
      },
    ],
    frameSequence: options.frameSequence,
  };
  await page.evaluate(async (storedFixture) => {
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
    const sourceFrameIds = [...animation.frameIds];
    if (storedFixture.frameSequence) {
      animation.frameIds = storedFixture.frameSequence.map((frameIndex) => {
        const frameId = sourceFrameIds[frameIndex];
        if (!frameId) {
          throw new Error(`event fixtureのFrame indexが不正です: ${frameIndex}`);
        }
        return frameId;
      });
    }
    animation.events = storedFixture.events.map(({ frameIndex, ...event }) => {
      const frameId = sourceFrameIds[frameIndex];
      if (!frameId) {
        throw new Error(`event fixtureのFrame indexが不正です: ${frameIndex}`);
      }
      return { ...event, frameId } as StoredAnimationEvent;
    });
    const writeTransaction = db.transaction('assets', 'readwrite');
    writeTransaction.objectStore('assets').put(record);
    await new Promise<void>((resolve, reject) => {
      writeTransaction.oncomplete = () => resolve();
      writeTransaction.onerror = () => reject(writeTransaction.error);
      writeTransaction.onabort = () => reject(writeTransaction.error);
    });
    db.close();
  }, fixture);
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

test('iPhone幅のFrame preview中は保存編集を拒否し、停止後に再開できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, 'preview安全テスト');

  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await selectMainLayer(page);

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await setLayerX(page, 32);
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(32);

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('once');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('ループ').uncheck();
  await expect.poll(async () => (await readStoredAsset(page)).frames).toHaveLength(2);
  await expect.poll(async () => (await readStoredAsset(page)).animations[0]?.loop).toBe(false);
  await expect(page.getByRole('status')).toContainText('保存済み');

  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await setLayerX(page, 40);
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(40);

  const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
  const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
  await expect(undoButton).toBeEnabled();
  const undoLabelBeforePreview = await undoButton.getAttribute('title');
  const redoLabelBeforePreview = await redoButton.getAttribute('title');

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  const playButton = page.getByRole('button', { name: '再生', exact: true });
  const stopButton = page.getByRole('button', { name: '停止', exact: true });
  await playButton.click();
  await expect(playButton).toBeDisabled();
  await expect(playButton).toBeEnabled();
  await expect(stopButton).toBeEnabled();
  await stopButton.click();
  await expect(stopButton).toBeDisabled();

  const storedBeforePreview = await readStoredAsset(page);

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  const toolbar = page.getByRole('navigation', { name: '編集ツール' });
  await toolbar.getByRole('button', { name: 'ブラシ', exact: true }).click();

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'frame_1', exact: true }).click();
  await expect(stopButton).toBeEnabled();

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  const previewGuard = page.getByRole('status', {
    name: 'フレームプレビューの編集制限',
  });
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(previewGuard).toContainText('パン・ズーム・レイヤー選択');
  await expect(canvas).toHaveAttribute('aria-readonly', 'true');

  const selectTool = toolbar.getByRole('button', { name: '選択', exact: true });
  const panTool = toolbar.getByRole('button', { name: 'パン', exact: true });
  const brushTool = toolbar.getByRole('button', { name: 'ブラシ', exact: true });
  await expect(selectTool).toBeEnabled();
  await expect(panTool).toBeEnabled();
  await expect(brushTool).toBeDisabled();
  await expect(brushTool).toHaveAttribute('aria-pressed', 'true');
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('preview中のキャンバス領域を取得できません。');
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  const previewEditAlert = page
    .getByRole('alert')
    .filter({ hasText: 'フレームをプレビュー中です' });
  await expect(previewEditAlert).toHaveCount(1);
  await expect(previewEditAlert).toContainText('保存を伴う編集はできません');

  await panTool.click();
  const canvasBeforePan = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).toDataURL(),
  );
  const panDelta = Math.min(160, canvasBox.width / 2 - 8);
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + panDelta,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.up();
  await expect
    .poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()))
    .not.toBe(canvasBeforePan);

  // PanでLayerを右へずらし、元の中心で解除、移動後の中心で再選択できることを実操作で確認する。
  await selectTool.click();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  const mainLayerButton = page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true });
  await expect(mainLayerButton).toHaveAttribute('aria-pressed', 'false');

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await page.mouse.click(
    canvasBox.x + canvasBox.width / 2 + panDelta - 24,
    canvasBox.y + canvasBox.height / 2,
  );
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await expect(mainLayerButton).toHaveAttribute('aria-pressed', 'true');

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await page.getByRole('button', { name: '200%', exact: true }).click();
  await expect(page.getByText('ズーム 200%', { exact: true })).toBeVisible();

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByLabel('新しいアニメーション名').fill('blocked');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect.poll(async () => (await readStoredAsset(page)).animations).toHaveLength(1);
  await expect(stopButton).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'アニメーション削除', exact: true }).click();
  await expect.poll(async () => (await readStoredAsset(page)).animations).toHaveLength(1);
  await expect(stopButton).toBeEnabled();

  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  const xInput = page.getByLabel('X', { exact: true });
  const previewLayerX = await xInput.inputValue();
  await xInput.fill('96');
  await xInput.blur();
  await expect(previewEditAlert).toHaveCount(1);
  await expect(xInput).toHaveValue(previewLayerX);
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(40);
  expect(await readStoredAsset(page)).toEqual(storedBeforePreview);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await stopButton.click();
  await expect(stopButton).toBeDisabled();
  await expect(undoButton).toBeEnabled();
  await expect(undoButton).toHaveAttribute('title', undoLabelBeforePreview ?? '');
  if (redoLabelBeforePreview === null) {
    await expect(redoButton).not.toHaveAttribute('title', /.+/);
  } else {
    await expect(redoButton).toHaveAttribute('title', redoLabelBeforePreview);
  }

  await undoButton.click();
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(32);
  await redoButton.click();
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(40);

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await expect(previewGuard).toHaveCount(0);
  await expect(canvas).toHaveAttribute('aria-readonly', 'false');

  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await setLayerX(page, 48);
  await expect
    .poll(async () => (await readStoredAsset(page)).layers[0]?.transform.position.x)
    .toBe(48);
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

test('T1データを保持する4形式を実出力・再読込し、情報を失うZIPだけ拒否する', async ({ page }) => {
  await setupProjectWithImage(page, 'イベント再生テスト');
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('attack');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const durationInput = page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）');
  await durationInput.fill('180');
  await durationInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).animations[0]?.name).toBe('attack');
  await expect.poll(async () => (await readStoredAsset(page)).frames[0]?.durationMs).toBe(180);
  await expect(page.getByRole('status')).toContainText('保存済み');

  await writeStoredAnimationFixture(page);
  await page.reload();
  await page.getByRole('button', { name: '「イベント再生テスト」を開く' }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'attack' });

  await expect(page.getByLabel('アニメーションイベント')).toContainText('attack_start');
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '発火:' })).toContainText('attack_start');
  await page.getByRole('button', { name: '停止', exact: true }).click();

  await expect(page.getByRole('button', { name: 'ZIP をダウンロード' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('attack_start');

  const storedBeforeExport = await readStoredAsset(page);
  const expectedEvent = storedBeforeExport.animations[0].events?.[0];
  expect(expectedEvent).toMatchObject({
    id: 'event_e2e',
    name: 'attack_start',
    frameId: storedBeforeExport.frames[0].id,
    payload: { power: 2 },
    futureEventField: { preserved: true },
  });

  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
  ]);
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  expect((await readFile(pngPath!)).byteLength).toBeGreaterThan(0);

  const [webpDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'WebP をダウンロード' }).click(),
  ]);
  const webpPath = await webpDownload.path();
  expect(webpPath).not.toBeNull();
  expect((await readFile(webpPath!)).byteLength).toBeGreaterThan(0);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'asset.json をダウンロード' }).click(),
  ]);
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const exportedAsset = JSON.parse(await readFile(jsonPath!, 'utf-8')) as StoredAnimationAsset;
  expect(exportedAsset.frames[0].durationMs).toBe(180);
  expect(exportedAsset.animations[0].events).toEqual([expectedEvent]);

  const [casprojDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード' }).click(),
  ]);
  expect(casprojDownload.suggestedFilename()).toBe('イベント再生テスト.casproj');
  const casprojPath = await casprojDownload.path();
  expect(casprojPath).not.toBeNull();
  const casprojBytes = await readFile(casprojPath!);
  expect(casprojBytes.byteLength).toBeGreaterThan(0);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.goto('/');
  await page.getByRole('button', { name: '「イベント再生テスト」を削除' }).click();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: 'イベント再生テスト.casproj',
    mimeType: 'application/zip',
    buffer: casprojBytes,
  });
  await expect(page.getByRole('button', { name: '「イベント再生テスト」を開く' })).toBeVisible();

  // 読込後の再起動相当でもID・時間・event・payload・未知fieldをexactに保持する。
  await page.reload();
  await page.getByRole('button', { name: '「イベント再生テスト」を開く' }).click();
  const restored = await readStoredAsset(page);
  expect(restored.frames.map(({ id, durationMs }) => ({ id, durationMs }))).toEqual(
    storedBeforeExport.frames.map(({ id, durationMs }) => ({ id, durationMs })),
  );
  expect(restored.animations.map(({ id, frameIds, events }) => ({ id, frameIds, events }))).toEqual(
    storedBeforeExport.animations.map(({ id, frameIds, events }) => ({ id, frameIds, events })),
  );
});

test('mock clockで可変時間・反復Frame・loop event・再生中の先頭へを順序どおり再生する', async ({
  page,
}) => {
  await setupProjectWithImage(page, '決定的再生テスト');
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('loop_timing');
  await page.getByRole('button', { name: '作成', exact: true }).click();

  const durationInput = page.getByLabel('フレーム「frame_1」の表示時間（ミリ秒）');
  await durationInput.fill('220');
  await durationInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).frames[0]?.durationMs).toBe(220);
  await expect(page.getByRole('status')).toContainText('保存済み');

  await writeStoredAnimationFixture(page, {
    frameSequence: [0, 1, 0, 1],
    events: [
      { id: 'event_start', name: 'start', frameIndex: 0 },
      { id: 'event_ready', name: 'ready', frameIndex: 0 },
      { id: 'event_turn', name: 'turn', frameIndex: 1 },
    ],
  });
  await page.reload();
  await page.getByRole('button', { name: '「決定的再生テスト」を開く' }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'loop_timing' });
  await page.clock.install();

  const frameList = page.getByRole('list', { name: 'フレーム一覧' });
  const currentFrame = frameList.getByRole('button', { pressed: true });
  const occurrenceStatus = page.getByRole('status', { name: 'アニメーション再生位置' });
  const firedStatus = page.getByRole('status').filter({ hasText: '発火:' });
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(currentFrame).toHaveText('frame_1');
  await expect(occurrenceStatus).toHaveText('出現位置: 1 / 4');
  await expect(firedStatus).toHaveText('発火: start、ready');

  await page.clock.runFor(219);
  await expect(currentFrame).toHaveText('frame_1');
  await page.clock.runFor(1);
  await expect(currentFrame).toHaveText('frame_2');
  await expect(occurrenceStatus).toHaveText('出現位置: 2 / 4');
  await expect(firedStatus).toHaveText('発火: turn');

  // 同じFrameの2回目の出現でも、保存順のeventを再発火する。
  await page.clock.runFor(125);
  await expect(currentFrame).toHaveText('frame_1');
  await expect(occurrenceStatus).toHaveText('出現位置: 3 / 4');
  await expect(firedStatus).toHaveText('発火: start、ready');
  await page.clock.runFor(220);
  await expect(currentFrame).toHaveText('frame_2');
  await expect(occurrenceStatus).toHaveText('出現位置: 4 / 4');
  await expect(firedStatus).toHaveText('発火: turn');

  // loopの次周回でも先頭Frameとeventを再発火する。
  await page.clock.runFor(125);
  await expect(currentFrame).toHaveText('frame_1');
  await expect(occurrenceStatus).toHaveText('出現位置: 1 / 4');
  await expect(firedStatus).toHaveText('発火: start、ready');
  await page.clock.runFor(220);
  await expect(currentFrame).toHaveText('frame_2');

  // 再生中の巻き戻しは旧予約を取消し、先頭Frameの220msを丸ごと再開する。
  await page.getByRole('button', { name: '先頭へ' }).click();
  await expect(currentFrame).toHaveText('frame_1');
  await expect(occurrenceStatus).toHaveText('出現位置: 1 / 4');
  await expect(firedStatus).toHaveText('発火: start、ready');
  await page.clock.runFor(219);
  await expect(currentFrame).toHaveText('frame_1');
  await page.clock.runFor(1);
  await expect(currentFrame).toHaveText('frame_2');
  await expect(firedStatus).toHaveText('発火: turn');

  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(currentFrame).toHaveCount(0);
  await expect(firedStatus).toHaveCount(0);
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
