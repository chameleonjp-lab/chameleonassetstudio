import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page, size = 64): Promise<Buffer> {
  const dataUrl = await page.evaluate((imageSize) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageSize;
    canvas.height = imageSize;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#8e44ad';
    context.fillRect(0, 0, imageSize, imageSize);
    return canvas.toDataURL('image/png');
  }, size);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string, imageSize = 64): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page, imageSize);
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
  id: string;
  displayName: string;
  updatedAt: string;
  canvasSize: { width: number; height: number };
  layers: Array<{
    id: string;
    name: string;
    layerType: string;
    visible: boolean;
    opacity: number;
    locked: boolean;
    transform: {
      position: { x: number; y: number };
      scale: { x: number; y: number };
      rotation: number;
    };
  }>;
  frames: Array<{
    id: string;
    name: string;
    durationMs?: number;
    layerStates: Array<{
      layerId: string;
      visible?: boolean;
      opacity?: number;
      transform?: {
        position: { x: number; y: number };
        scale: { x: number; y: number };
        rotation: number;
      };
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  animations: Array<{
    id: string;
    name: string;
    fps: number;
    loop: boolean;
    frameIds: string[];
    events?: StoredAnimationEvent[];
  }>;
  [key: string]: unknown;
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
  frameIndex?: number;
  frameId?: string;
  payload?: unknown;
  [key: string]: unknown;
}

interface StoredProject {
  id: string;
  updatedAt: string;
  assets: Array<{ id: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** IndexedDB の assets ストアから、指定ID（省略時は先頭）のアセットを読む。 */
async function readStoredAsset(page: Page, assetId?: string): Promise<StoredAnimationAsset> {
  return page.evaluate(async (targetAssetId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: StoredAnimationAsset }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ data: StoredAnimationAsset }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const record = targetAssetId
      ? records.find((candidate) => candidate.data.id === targetAssetId)
      : records[0];
    if (!record) {
      throw new Error(`対象Assetが見つかりません: ${targetAssetId ?? '先頭'}`);
    }
    return record.data;
  }, assetId);
}

async function readStoredAssetCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
}

async function readStoredProject(page: Page): Promise<StoredProject> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<StoredProject[]>((resolve, reject) => {
      const request = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result as StoredProject[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!records[0]) {
      throw new Error('保存済みProjectが見つかりません。');
    }
    return records[0];
  });
}

/** eventの再読込・再生・編集検査用fixtureを保存する。 */
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
    animation.events = storedFixture.events.map(
      ({ frameIndex, frameId: explicitFrameId, ...event }) => {
        const frameId =
          explicitFrameId ?? (frameIndex === undefined ? undefined : sourceFrameIds[frameIndex]);
        if (!frameId) {
          throw new Error(`event fixtureのFrame参照が不正です: ${frameIndex ?? explicitFrameId}`);
        }
        return { ...event, frameId } as StoredAnimationEvent;
      },
    );
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

type FrameAlignmentFixtureFailure = 'no-layers' | 'duplicate-layer-id' | 'missing-layer-state';

/** D4統合試験用に、完全LayerStateと共有・反復Frameを持つ保存済みfixtureを作る。 */
async function writeStoredFrameAlignmentFixture(
  page: Page,
  assetId: string,
  failure?: FrameAlignmentFixtureFailure,
): Promise<void> {
  await page.evaluate(
    async ({ targetAssetId, failureMode }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const readTransaction = db.transaction('assets', 'readonly');
      const records = await new Promise<Array<{ data: StoredAnimationAsset }>>(
        (resolve, reject) => {
          const request = readTransaction.objectStore('assets').getAll();
          request.onsuccess = () =>
            resolve(request.result as Array<{ data: StoredAnimationAsset }>);
          request.onerror = () => reject(request.error);
        },
      );
      const record = records.find((candidate) => candidate.data.id === targetAssetId);
      if (!record || record.data.layers.length === 0) {
        db.close();
        throw new Error('位置合わせfixtureを書き込むAsset Layerがありません。');
      }
      record.data.canvasSize = { width: 32, height: 32 };
      record.data.layers.push({
        id: 'layer_alignment_guide',
        name: 'alignment guide',
        layerType: 'guide',
        visible: false,
        opacity: 0.4,
        locked: true,
        transform: {
          position: { x: 3, y: 5 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
      });
      record.data.futureAssetField = { preserved: true };

      const states = record.data.layers.map((layer, index) => ({
        layerId: layer.id,
        visible: layer.visible,
        opacity: layer.opacity,
        transform: {
          position: {
            x: layer.transform.position.x + index,
            y: layer.transform.position.y + index * 2,
          },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
        futureLayerStateField: { preserved: true },
      }));
      const targetStates = structuredClone(states);
      for (const state of targetStates) {
        state.transform.position.x += 12;
        state.transform.position.y += 6;
      }
      record.data.frames = [
        {
          id: 'frame_alignment_reference',
          name: 'alignment_reference',
          layerStates: states,
          futureFrameField: { preserved: true },
        },
        {
          id: 'frame_alignment_target',
          name: 'alignment_target',
          durationMs: 175,
          layerStates: targetStates,
          futureFrameField: { preserved: true },
        },
      ];
      record.data.animations = [
        {
          id: 'animation_alignment_primary',
          name: 'alignment_primary',
          fps: 12,
          loop: true,
          frameIds: [
            'frame_alignment_reference',
            'frame_alignment_target',
            'frame_alignment_target',
          ],
          events: [
            {
              id: 'event_alignment_target',
              name: 'target_start',
              frameId: 'frame_alignment_target',
              payload: { preserved: true },
            },
          ],
        },
        {
          id: 'animation_alignment_shared',
          name: 'alignment_shared',
          fps: 8,
          loop: false,
          frameIds: ['frame_alignment_target', 'frame_alignment_reference'],
        },
      ];

      if (failureMode === 'no-layers') {
        record.data.layers = [];
      } else if (failureMode === 'duplicate-layer-id') {
        record.data.layers.push(structuredClone(record.data.layers[0]));
      } else if (failureMode === 'missing-layer-state') {
        record.data.frames[1].layerStates.pop();
      }

      const writeTransaction = db.transaction('assets', 'readwrite');
      writeTransaction.objectStore('assets').put(record);
      await new Promise<void>((resolve, reject) => {
        writeTransaction.oncomplete = () => resolve();
        writeTransaction.onerror = () => reject(writeTransaction.error);
        writeTransaction.onabort = () => reject(writeTransaction.error);
      });

      const projectReadTransaction = db.transaction('projects', 'readonly');
      const projects = await new Promise<StoredProject[]>((resolve, reject) => {
        const request = projectReadTransaction.objectStore('projects').getAll();
        request.onsuccess = () => resolve(request.result as StoredProject[]);
        request.onerror = () => reject(request.error);
      });
      const project = projects.find((candidate) =>
        candidate.assets.some((entry) => entry.id === targetAssetId),
      );
      const projectEntry = project?.assets.find((entry) => entry.id === targetAssetId);
      if (!project || !projectEntry) {
        db.close();
        throw new Error('位置合わせfixtureを書き込むProject Asset要約がありません。');
      }
      project.futureProjectField = { preserved: true };
      projectEntry.futureAssetEntryField = { preserved: true };
      const projectWriteTransaction = db.transaction('projects', 'readwrite');
      projectWriteTransaction.objectStore('projects').put(project);
      await new Promise<void>((resolve, reject) => {
        projectWriteTransaction.oncomplete = () => resolve();
        projectWriteTransaction.onerror = () => reject(projectWriteTransaction.error);
        projectWriteTransaction.onabort = () => reject(projectWriteTransaction.error);
      });
      db.close();
    },
    { targetAssetId: assetId, failureMode: failure },
  );
}

async function setupFrameAlignmentProject(
  page: Page,
  name: string,
  failure?: FrameAlignmentFixtureFailure,
  withSecondAsset = false,
): Promise<string> {
  await setupProjectWithImage(page, name, 8);
  const originalAsset = await readStoredAsset(page);
  const originalDisplayName = originalAsset.displayName;
  if (withSecondAsset) {
    const duplicateButton = page.getByRole('button', { name: '独立コピーを作成' });
    await duplicateButton.click();
    await expect.poll(async () => readStoredAssetCount(page)).toBe(2);
    await expect(duplicateButton).toBeEnabled();
  }
  await writeStoredFrameAlignmentFixture(page, originalAsset.id, failure);
  await page.reload();
  await page.getByRole('button', { name: `「${name}」を開く` }).click();
  if (withSecondAsset) {
    await page
      .locator('.asset-list')
      .getByRole('button', { name: originalDisplayName, exact: true })
      .click();
  }
  return originalAsset.id;
}

async function selectFrameAlignmentPair(page: Page): Promise<void> {
  await page.getByLabel('アニメーション選択').selectOption('animation_alignment_primary');
  await page.getByLabel('位置合わせの基準Frame').selectOption('frame_alignment_reference');
  await page.getByLabel('位置合わせの対象Frame').selectOption('frame_alignment_target');
}

async function canvasPositionForWorld(
  page: Page,
  world: { x: number; y: number },
  canvasSize: number,
): Promise<{ x: number; y: number }> {
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
  return canvas.evaluate(
    (element, input) => {
      const viewport = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      const availableWidth = Math.max(1, viewport.width - 64);
      const availableHeight = Math.max(1, viewport.height - 64);
      const scale = Math.min(
        8,
        Math.max(
          0.05,
          Math.min(availableWidth / input.canvasSize, availableHeight / input.canvasSize),
        ),
      );
      return {
        x: input.world.x * scale + (viewport.width - input.canvasSize * scale) / 2,
        y: input.world.y * scale + (viewport.height - input.canvasSize * scale) / 2,
      };
    },
    { world, canvasSize },
  );
}

async function readCanvasPixelAtWorld(
  page: Page,
  world: { x: number; y: number },
  canvasSize: number,
): Promise<[number, number, number, number]> {
  const canvas = page.getByLabel('アセットキャンバス');
  const position = await canvasPositionForWorld(page, world, canvasSize);
  return canvas.evaluate((element, point) => {
    const source = element as HTMLCanvasElement;
    const scaleX = source.width / source.clientWidth;
    const scaleY = source.height / source.clientHeight;
    const x = Math.min(source.width - 1, Math.max(0, Math.floor(point.x * scaleX)));
    const y = Math.min(source.height - 1, Math.max(0, Math.floor(point.y * scaleY)));
    return Array.from(source.getContext('2d')!.getImageData(x, y, 1, 1).data) as [
      number,
      number,
      number,
      number,
    ];
  }, position);
}

function expectTintedPixel(
  actual: readonly number[],
  background: readonly number[],
  color: readonly [number, number, number],
): void {
  expectTintedPixelStack(actual, background, [color]);
}

function expectTintedPixelStack(
  actual: readonly number[],
  background: readonly number[],
  colors: ReadonlyArray<readonly [number, number, number]>,
): void {
  let expectedAlpha = background[3] / 255;
  const expectedPremultiplied = background
    .slice(0, 3)
    .map((channel) => (channel / 255) * expectedAlpha);
  for (const color of colors) {
    for (const [index, channel] of color.entries()) {
      expectedPremultiplied[index] = (channel / 255) * 0.25 + expectedPremultiplied[index] * 0.75;
    }
    expectedAlpha = 0.25 + expectedAlpha * 0.75;
  }
  for (const index of [0, 1, 2]) {
    const expected = Math.round((expectedPremultiplied[index] / expectedAlpha) * 255);
    expect(Math.abs(actual[index] - expected)).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(actual[3] - Math.round(expectedAlpha * 255))).toBeLessThanOrEqual(2);
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

  const canvasSize = await canvas.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  const canvasCenter = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
  await canvas.click({ position: canvasCenter });
  const previewEditAlert = page
    .getByRole('alert')
    .filter({ hasText: 'フレームをプレビュー中です' });
  await expect(previewEditAlert).toHaveCount(1);
  await expect(previewEditAlert).toContainText('保存を伴う編集はできません');

  await panTool.click();
  await expect(panTool).toHaveAttribute('aria-pressed', 'true');
  const panDelta = Math.min(160, canvasSize.width / 2 - 8);
  await canvas.hover({ position: canvasCenter });
  await page.mouse.down();
  await canvas.hover({
    position: { x: canvasCenter.x + panDelta, y: canvasCenter.y },
    force: true,
  });
  await page.mouse.up();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  // PanでLayerを右へずらした結果を、元の中心で解除、移動後の中心で再選択できることから確認する。
  await selectTool.click();
  await canvas.click({ position: canvasCenter });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  const mainLayerButton = page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true });
  await expect(mainLayerButton).toHaveAttribute('aria-pressed', 'false');

  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await canvas.click({
    position: { x: canvasCenter.x + panDelta - 24, y: canvasCenter.y },
  });
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

test('iPhone幅で反復Frameの出現位置を選び、前後を赤・青の25%で個別表示できる', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, '前後フレーム表示テスト', 8);

  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await selectMainLayer(page);
  await setLayerX(page, 4);
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await setLayerX(page, 0);
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('onion');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByLabel('ループ').uncheck();
  await expect(page.getByRole('status')).toContainText('保存済み');

  await writeStoredAnimationFixture(page, { frameSequence: [0, 1, 0] });
  await page.reload();
  await page.getByRole('button', { name: '「前後フレーム表示テスト」を開く' }).click();
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'onion' });

  const occurrenceList = page.getByRole('list', { name: 'アニメーションの再生順' });
  await expect(occurrenceList.getByRole('listitem')).toHaveCount(3);
  const firstOccurrence = page.getByRole('button', { name: '出現 1: frame_1' });
  const secondOccurrence = page.getByRole('button', { name: '出現 2: frame_2' });
  const thirdOccurrence = page.getByRole('button', { name: '出現 3: frame_1' });
  const previousToggle = page.getByLabel('前のフレームを表示（赤・25%）');
  const nextToggle = page.getByLabel('次のフレームを表示（青・25%）');
  await expect(previousToggle).not.toBeChecked();
  await expect(nextToggle).not.toBeChecked();

  const previousLabel = page.locator('.timeline-onion-skin-toggle').filter({
    has: previousToggle,
  });
  const nextLabel = page.locator('.timeline-onion-skin-toggle').filter({ has: nextToggle });
  await expect(previousLabel).toContainText('前（赤・25%）');
  await expect(nextLabel).toContainText('次（青・25%）');
  expect(
    await previousLabel
      .locator('.timeline-onion-skin-swatch')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(209, 67, 79)');
  expect(
    await nextLabel
      .locator('.timeline-onion-skin-swatch')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(37, 99, 235)');
  for (const label of [previousLabel, nextLabel]) {
    const rect = await label.evaluate((element) => element.getBoundingClientRect());
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }

  await firstOccurrence.click();
  await expect(page.getByRole('status', { name: 'アニメーション再生位置' })).toHaveText(
    '出現位置: 1 / 3',
  );
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  const canvas = page.getByLabel('アセットキャンバス');
  const backgroundPixel = await readCanvasPixelAtWorld(page, { x: 2, y: 4 }, 8);
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await nextToggle.check();
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'true');
  await expect(canvas).toHaveAttribute('data-onion-skin-opacity', '0.25');
  const nextPixel = await readCanvasPixelAtWorld(page, { x: 2, y: 4 }, 8);
  expectTintedPixel(nextPixel, backgroundPixel, [37, 99, 235]);

  // ghostはpointer対象にならず、現在FrameだけをLayer選択に使う。
  const selectTool = page
    .getByRole('navigation', { name: '編集ツール' })
    .getByRole('button', { name: '選択', exact: true });
  await selectTool.click();
  await canvas.click({ position: await canvasPositionForWorld(page, { x: 2, y: 4 }, 8) });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  const mainLayerButton = page
    .getByRole('list', { name: 'レイヤー一覧' })
    .getByRole('button', { name: 'main', exact: true });
  await expect(mainLayerButton).toHaveAttribute('aria-pressed', 'false');
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await canvas.click({ position: await canvasPositionForWorld(page, { x: 10, y: 4 }, 8) });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await expect(mainLayerButton).toHaveAttribute('aria-pressed', 'true');

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await thirdOccurrence.click();
  await expect(page.getByRole('status', { name: 'アニメーション再生位置' })).toHaveText(
    '出現位置: 3 / 3',
  );
  await previousToggle.check();
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'true');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');
  const previousPixel = await readCanvasPixelAtWorld(page, { x: 2, y: 4 }, 8);
  expectTintedPixel(previousPixel, backgroundPixel, [209, 67, 79]);

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await previousToggle.uncheck();
  await nextToggle.uncheck();
  await secondOccurrence.click();
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  const bothBackgroundPixel = await readCanvasPixelAtWorld(page, { x: 10, y: 4 }, 8);
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await previousToggle.check();
  await nextToggle.check();
  await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'true');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'true');
  const bothPixel = await readCanvasPixelAtWorld(page, { x: 10, y: 4 }, 8);
  expectTintedPixelStack(bothPixel, bothBackgroundPixel, [
    [209, 67, 79],
    [37, 99, 235],
  ]);

  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await firstOccurrence.click();
  await page.clock.install();
  await page.getByRole('button', { name: '再生', exact: true }).click();
  await expect(previousToggle).toBeDisabled();
  await expect(nextToggle).toBeDisabled();
  await expect(previousToggle).toBeChecked();
  await expect(nextToggle).toBeChecked();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');

  await page.clock.runFor(375);
  await expect(page.getByRole('button', { name: '再生', exact: true })).toBeEnabled();
  await expect(page.getByRole('status', { name: 'アニメーション再生位置' })).toHaveText(
    '出現位置: 3 / 3',
  );
  await expect(previousToggle).toBeEnabled();
  await expect(nextToggle).toBeEnabled();
  await expect(previousToggle).toBeChecked();
  await expect(nextToggle).toBeChecked();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'true');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');

  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');
  await firstOccurrence.click();
  await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
  await expect(canvas).toHaveAttribute('data-onion-skin-next', 'true');
});

test('前後表示の切替はAssetと履歴を変えず、reloadでoffへ戻る', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setupProjectWithImage(page, '前後表示非保存テスト', 8);

  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await selectMainLayer(page);
  await setLayerX(page, 4);
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await mobileNav.getByRole('button', { name: 'プロパティ', exact: true }).click();
  await setLayerX(page, 0);
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByRole('button', { name: 'フレーム追加' }).click();
  await page.getByLabel('新しいアニメーション名').fill('history');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存済み');

  const storedBefore = await readStoredAsset(page);
  const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
  const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
  const undoTitle = await undoButton.getAttribute('title');
  const redoTitle = await redoButton.getAttribute('title');

  await page.getByRole('button', { name: '出現 1: frame_1' }).click();
  const previousToggle = page.getByLabel('前のフレームを表示（赤・25%）');
  const nextToggle = page.getByLabel('次のフレームを表示（青・25%）');
  await previousToggle.check();
  await nextToggle.check();
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();
  expect(await readStoredAsset(page)).toEqual(storedBefore);

  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(undoButton).toBeEnabled();
  await expect(undoButton).toHaveAttribute('title', undoTitle ?? '');
  if (redoTitle === null) {
    await expect(redoButton).not.toHaveAttribute('title', /.+/);
  } else {
    await expect(redoButton).toHaveAttribute('title', redoTitle);
  }

  await undoButton.click();
  await expect.poll(async () => (await readStoredAsset(page)).animations).toHaveLength(0);
  await undoButton.click();
  await expect.poll(async () => (await readStoredAsset(page)).frames).toHaveLength(1);
  await redoButton.click();
  await expect.poll(async () => (await readStoredAsset(page)).frames).toHaveLength(2);
  await redoButton.click();
  await expect.poll(async () => (await readStoredAsset(page)).animations).toHaveLength(1);
  expect(await readStoredAsset(page)).toEqual(storedBefore);

  await page.reload();
  await page.getByRole('button', { name: '「前後表示非保存テスト」を開く' }).click();
  await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
  await page.getByLabel('アニメーション選択').selectOption({ label: 'history' });
  await expect(previousToggle).not.toBeChecked();
  await expect(nextToggle).not.toBeChecked();
  await page.getByRole('button', { name: '出現 1: frame_1' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toHaveAttribute(
    'data-onion-skin-previous',
    'false',
  );
  await expect(page.getByLabel('アセットキャンバス')).toHaveAttribute(
    'data-onion-skin-next',
    'false',
  );
});

test.describe('D3 event編集', () => {
  test.use({ hasTouch: true });

  test('iPhone幅で追加・名前・参照・削除を各1履歴として保存し、取消・Undo・Redo・reloadを保つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupProjectWithImage(page, 'イベント編集履歴テスト');

    const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await page.getByRole('button', { name: 'フレーム追加' }).click();
    await page.getByRole('button', { name: 'フレーム追加' }).click();
    await page.getByLabel('新しいアニメーション名').fill('event_edit');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    await expect.poll(async () => (await readStoredAsset(page)).frames).toHaveLength(2);
    await expect.poll(async () => (await readStoredAsset(page)).animations).toHaveLength(1);

    const newEventName = page.getByLabel('新しいイベント名');
    const newEventFrame = page.getByLabel('新しいイベントの参照フレーム');
    const addButton = page.getByRole('button', { name: 'イベント追加', exact: true });
    await newEventName.fill('start');
    await newEventFrame.selectOption({ label: 'frame_1' });
    await addButton.tap();

    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events)
      .toHaveLength(1);
    const storedAfterAdd = await readStoredAsset(page);
    const addedEvent = storedAfterAdd.animations[0].events?.[0];
    expect(addedEvent).toMatchObject({
      name: 'start',
      frameId: storedAfterAdd.frames[0].id,
    });
    expect(addedEvent?.id).toMatch(/^event_/);
    expect(addedEvent?.payload).toBeUndefined();

    const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
    const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
    await expect(undoButton).toHaveAttribute('title', 'イベント追加');

    const startNameInput = page.getByLabel('イベント「start」の名前');
    await startNameInput.fill('entered');
    await startNameInput.press('Enter');
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('entered');
    await expect(undoButton).toHaveAttribute('title', 'イベント名変更');

    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('start');
    await expect(undoButton).toHaveAttribute('title', 'イベント追加');
    await expect(redoButton).toHaveAttribute('title', 'イベント名変更');
    await redoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('entered');

    const enteredNameInput = page.getByLabel('イベント「entered」の名前');
    await enteredNameInput.fill('cancelled');
    await enteredNameInput.press('Escape');
    await expect(enteredNameInput).toHaveValue('entered');
    await expect(undoButton).toHaveAttribute('title', 'イベント名変更');
    expect((await readStoredAsset(page)).animations[0].events?.[0]?.name).toBe('entered');

    await enteredNameInput.fill('blurred');
    await enteredNameInput.blur();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('blurred');
    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('entered');
    await expect(undoButton).toHaveAttribute('title', 'イベント名変更');
    await redoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('blurred');

    const eventFrameSelect = page.getByLabel('イベント「blurred」の参照フレーム');
    await eventFrameSelect.selectOption({ label: 'frame_2' });
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe(storedAfterAdd.frames[1].id);
    await expect(undoButton).toHaveAttribute('title', 'イベント参照変更');
    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe(storedAfterAdd.frames[0].id);
    await expect(undoButton).toHaveAttribute('title', 'イベント名変更');
    await redoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe(storedAfterAdd.frames[1].id);

    const deleteButton = page.getByRole('button', { name: 'イベント「blurred」を削除' });
    page.once('dialog', (dialog) => void dialog.dismiss());
    await deleteButton.tap();
    expect((await readStoredAsset(page)).animations[0].events).toHaveLength(1);
    await expect(undoButton).toHaveAttribute('title', 'イベント参照変更');

    page.once('dialog', (dialog) => void dialog.accept());
    await deleteButton.tap();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events)
      .toHaveLength(0);
    await expect(undoButton).toHaveAttribute('title', 'イベント削除');
    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events)
      .toHaveLength(1);
    await expect(undoButton).toHaveAttribute('title', 'イベント参照変更');
    await redoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events)
      .toHaveLength(0);
    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events)
      .toHaveLength(1);

    const restoredNameInput = page.getByLabel('イベント「blurred」の名前');
    const restoredFrameSelect = page.getByLabel('イベント「blurred」の参照フレーム');
    const restoredDeleteButton = page.getByRole('button', { name: 'イベント「blurred」を削除' });
    for (const control of [
      newEventName,
      newEventFrame,
      addButton,
      restoredNameInput,
      restoredFrameSelect,
      restoredDeleteButton,
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await restoredNameInput.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    await expect(page.getByRole('status')).toContainText('保存済み');
    await page.reload();
    await page.getByRole('button', { name: '「イベント編集履歴テスト」を開く' }).click();
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await page.getByLabel('アニメーション選択').selectOption({ label: 'event_edit' });
    await expect(page.getByLabel('イベント「blurred」の名前')).toHaveValue('blurred');
    await expect(page.getByLabel('イベント「blurred」の参照フレーム')).toHaveValue(
      storedAfterAdd.frames[1].id,
    );
    expect((await readStoredAsset(page)).animations[0].events?.[0]).toEqual({
      ...addedEvent,
      name: 'blurred',
      frameId: storedAfterAdd.frames[1].id,
    });
  });

  test('参照切れeventの対象外データを保持し、Frame preview中の編集を履歴前に拒否する', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupProjectWithImage(page, 'イベント参照切れテスト');

    const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await page.getByRole('button', { name: 'フレーム追加' }).click();
    await page.getByRole('button', { name: 'フレーム追加' }).click();
    await page.getByLabel('新しいアニメーション名').fill('dangling');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('保存済み');

    await writeStoredAnimationFixture(page, {
      events: [
        {
          id: 'event_dangling',
          name: 'old',
          frameId: 'outside',
          payload: { power: 2 },
          futureEventField: { preserved: true },
        },
        {
          id: 'event_sibling',
          name: 'sibling',
          frameIndex: 1,
          payload: { keep: true },
        },
      ],
    });
    await page.reload();
    await page.getByRole('button', { name: '「イベント参照切れテスト」を開く' }).click();
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await page.getByLabel('アニメーション選択').selectOption({ label: 'dangling' });

    const invalidFrameSelect = page.getByLabel('イベント「old」の参照フレーム');
    await expect(page.getByLabel('イベント「old」の名前')).toHaveValue('old');
    await expect(invalidFrameSelect).toHaveValue('outside');
    await expect(invalidFrameSelect).toHaveClass(/is-invalid/);
    await expect(invalidFrameSelect.getByRole('option', { name: '参照無効: outside' })).toHaveText(
      '参照無効: outside',
    );

    const beforeRename = await readStoredAsset(page);
    const oldNameInput = page.getByLabel('イベント「old」の名前');
    await oldNameInput.fill('renamed');
    await oldNameInput.press('Enter');
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.name)
      .toBe('renamed');
    const afterRename = await readStoredAsset(page);
    expect(afterRename.animations[0].events).toEqual([
      {
        ...beforeRename.animations[0].events?.[0],
        name: 'renamed',
      },
      beforeRename.animations[0].events?.[1],
    ]);

    const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
    const undoTitleBeforePreview = await undoButton.getAttribute('title');
    await page.getByRole('button', { name: 'frame_1', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止', exact: true })).toBeEnabled();
    const storedBeforePreview = await readStoredAsset(page);

    const renamedInput = page.getByLabel('イベント「renamed」の名前');
    await renamedInput.fill('blocked');
    await renamedInput.press('Enter');
    await expect(page.getByRole('alert')).toContainText('保存を伴う編集はできません');
    expect(await readStoredAsset(page)).toEqual(storedBeforePreview);
    await expect(undoButton).toHaveAttribute('title', undoTitleBeforePreview ?? '');

    await page.getByLabel('イベント「renamed」の参照フレーム').selectOption({ label: 'frame_1' });
    expect(await readStoredAsset(page)).toEqual(storedBeforePreview);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'イベント「renamed」を削除' }).tap();
    expect(await readStoredAsset(page)).toEqual(storedBeforePreview);
    await expect(undoButton).toHaveAttribute('title', undoTitleBeforePreview ?? '');

    await page.getByRole('button', { name: '停止', exact: true }).click();
    await renamedInput.focus();
    await renamedInput.press('Escape');
    await expect(renamedInput).toHaveValue('renamed');

    const firstFrameId = storedBeforePreview.frames[0].id;
    await page.getByLabel('イベント「renamed」の参照フレーム').selectOption({ label: 'frame_1' });
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe(firstFrameId);
    const afterReferenceChange = await readStoredAsset(page);
    expect(afterReferenceChange.animations[0].events).toEqual([
      {
        ...storedBeforePreview.animations[0].events?.[0],
        frameId: firstFrameId,
      },
      storedBeforePreview.animations[0].events?.[1],
    ]);

    await undoButton.click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe('outside');
    await page.getByRole('button', { name: 'やり直す', exact: true }).click();
    await expect
      .poll(async () => (await readStoredAsset(page)).animations[0].events?.[0]?.frameId)
      .toBe(firstFrameId);

    await expect(page.getByRole('status')).toContainText('保存済み');
    await page.reload();
    await page.getByRole('button', { name: '「イベント参照切れテスト」を開く' }).click();
    const reloaded = await readStoredAsset(page);
    expect(reloaded.animations[0].events).toEqual(afterReferenceChange.animations[0].events);
  });
});

test.describe('D4 frame alignment', () => {
  test.use({ hasTouch: true });

  test('iPhone幅で共有Frame全体を1履歴で移動し、Undo・Redo・reload・casprojを保つ', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const assetId = await setupFrameAlignmentProject(page, 'D4位置合わせ保存テスト');
    const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await selectFrameAlignmentPair(page);

    const previousOnionSkin = page.getByRole('checkbox', {
      name: /前のフレームを表示/,
    });
    const nextOnionSkin = page.getByRole('checkbox', {
      name: /次のフレームを表示/,
    });
    await previousOnionSkin.check();
    await expect(nextOnionSkin).not.toBeChecked();

    const storedBefore = await readStoredAsset(page, assetId);
    const projectBefore = await readStoredProject(page);
    const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
    const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
    const undoTitleBefore = await undoButton.getAttribute('title');
    const redoTitleBefore = await redoButton.getAttribute('title');
    await expect(undoButton).toBeDisabled();

    const alignmentGroup = page.getByRole('group', { name: 'フレーム位置合わせ' });
    await expect(alignmentGroup.getByLabel('位置合わせの基準Frame').locator('..')).toContainText(
      '基準Frame（半透明・読み取り専用）',
    );
    await expect(alignmentGroup.getByLabel('位置合わせの対象Frame').locator('..')).toContainText(
      '対象Frame（通常表示・移動）',
    );
    const startButton = page.getByRole('button', { name: '位置合わせを開始' });
    const startBox = await startButton.boundingBox();
    expect(startBox).not.toBeNull();
    expect(startBox!.width).toBeGreaterThanOrEqual(44);
    expect(startBox!.height).toBeGreaterThanOrEqual(44);
    await startButton.tap();
    const draftGroup = page.getByLabel('フレーム位置合わせ調整');
    await expect(draftGroup.getByRole('status')).toHaveText('影響: Animation 2件 / 総出現 3件');
    await expect(previousOnionSkin).toBeChecked();
    await expect(nextOnionSkin).not.toBeChecked();

    const upButton = page.getByRole('button', { name: '上へ1px' });
    const leftButton = page.getByRole('button', { name: '左へ1px' });
    const rightButton = page.getByRole('button', { name: '右へ1px' });
    const downButton = page.getByRole('button', { name: '下へ1px' });
    const xInput = page.getByLabel('X移動量（px）');
    const yInput = page.getByLabel('Y移動量（px）');
    await rightButton.tap();
    await expect(xInput).toHaveValue('1');
    await downButton.tap();
    await expect(yInput).toHaveValue('1');
    await leftButton.tap();
    await expect(xInput).toHaveValue('0');
    await upButton.tap();
    await expect(yInput).toHaveValue('0');
    await xInput.selectText();
    await xInput.pressSequentially('2.5');
    await yInput.fill('-4');
    await page.waitForTimeout(900);
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
    expect(await undoButton.getAttribute('title')).toBe(undoTitleBefore);
    expect(await redoButton.getAttribute('title')).toBe(redoTitleBefore);

    const confirmButton = page.getByRole('button', { name: '位置を確定' });
    const cancelButton = page.getByRole('button', { name: '取消', exact: true });
    for (const control of [
      page.getByLabel('位置合わせの基準Frame'),
      page.getByLabel('位置合わせの対象Frame'),
      xInput,
      yInput,
      upButton,
      leftButton,
      rightButton,
      downButton,
      confirmButton,
      cancelButton,
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const input of [xInput, yInput]) {
      expect(
        await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    }
    for (const control of [upButton, leftButton, rightButton, downButton]) {
      expect(await control.evaluate((element) => getComputedStyle(element).touchAction)).toBe(
        'manipulation',
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    await mobileNav.getByRole('button', { name: '編集', exact: true }).click();
    const canvas = page.getByLabel('アセットキャンバス');
    await expect(canvas).toHaveAttribute('aria-readonly', 'true');
    await expect(canvas).toHaveAttribute('data-frame-alignment-reference', 'true');
    await expect(canvas).toHaveAttribute('data-frame-alignment-reference-opacity', '0.5');
    await expect(canvas).toHaveAttribute('data-onion-skin-previous', 'false');
    await expect(canvas).toHaveAttribute('data-onion-skin-next', 'false');
    const referencePixel = await readCanvasPixelAtWorld(page, { x: 2, y: 4 }, 32);
    const targetPixel = await readCanvasPixelAtWorld(page, { x: 16, y: 4 }, 32);
    const purple = [142, 68, 173] as const;
    // mobile view切替でCanvasが再中央寄せされるため、同じworld座標でも市松模様の
    // 明暗cellは変わり得る。現在cellのどちらか一方とRGB全体が50%合成になっていることを確認する。
    expect(
      [233, 201].some((checkerChannel) =>
        purple.every(
          (purpleChannel, index) =>
            Math.abs(
              referencePixel[index] - Math.round(checkerChannel * 0.5 + purpleChannel * 0.5),
            ) <= 3,
        ),
      ),
    ).toBe(true);
    for (const [index, purpleChannel] of purple.entries()) {
      expect(Math.abs(targetPixel[index] - purpleChannel)).toBeLessThanOrEqual(2);
    }
    expect(referencePixel[3]).toBe(255);
    expect(targetPixel[3]).toBe(255);

    await mobileNav.getByRole('button', { name: 'タイムライン', exact: true }).click();
    await confirmButton.tap();
    await expect(previousOnionSkin).toBeChecked();
    await expect(nextOnionSkin).not.toBeChecked();
    await expect(undoButton).toHaveAttribute('title', 'フレーム位置合わせ');
    await expect(page.locator('.editor-save-status')).toContainText('保存済み');

    const storedAfter = await readStoredAsset(page, assetId);
    const expected = structuredClone(storedBefore);
    expected.updatedAt = storedAfter.updatedAt;
    const expectedTarget = expected.frames.find((frame) => frame.id === 'frame_alignment_target')!;
    for (const state of expectedTarget.layerStates) {
      state.transform!.position = {
        ...state.transform!.position,
        x: state.transform!.position.x + 2.5,
        y: state.transform!.position.y - 4,
      };
    }
    expect(storedAfter).toEqual(expected);

    const projectAfter = await readStoredProject(page);
    expect({ ...projectAfter, updatedAt: projectBefore.updatedAt }).toEqual(projectBefore);
    expect(Date.parse(projectAfter.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(projectBefore.updatedAt),
    );

    await undoButton.click();
    await expect.poll(async () => readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectAfter);
    await expect(redoButton).toHaveAttribute('title', 'フレーム位置合わせ');
    await redoButton.click();
    await expect.poll(async () => readStoredAsset(page, assetId)).toEqual(storedAfter);
    await expect(page.locator('.editor-save-status')).toContainText('保存済み');

    await page.reload();
    await page.getByRole('button', { name: '「D4位置合わせ保存テスト」を開く' }).click();
    expect(await readStoredAsset(page, assetId)).toEqual(storedAfter);

    await mobileNav.getByRole('button', { name: '書き出し', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '.casproj をダウンロード' }).tap(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const casprojBytes = await readFile(downloadPath!);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.goto('/');
    await page.getByRole('button', { name: '「D4位置合わせ保存テスト」を削除' }).click();
    await page.getByLabel('.casproj を読み込む').setInputFiles({
      name: 'D4位置合わせ保存テスト.casproj',
      mimeType: 'application/zip',
      buffer: casprojBytes,
    });
    await page.getByRole('button', { name: '「D4位置合わせ保存テスト」を開く' }).click();
    const importedAsset = await readStoredAsset(page);
    expect(importedAsset.id).not.toBe(assetId);
    expect({ ...importedAsset, id: assetId }).toEqual(storedAfter);
  });

  test('取消button・入力中Esc・0差分・Animation切替を非保存で終了する', async ({ page }) => {
    const assetId = await setupFrameAlignmentProject(page, 'D4取消テスト', undefined, true);
    await selectFrameAlignmentPair(page);
    const storedBefore = await readStoredAsset(page, assetId);
    const projectBefore = await readStoredProject(page);
    const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
    const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
    const undoTitleBefore = await undoButton.getAttribute('title');
    const redoTitleBefore = await redoButton.getAttribute('title');

    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await page.getByLabel('X移動量（px）').fill('9');
    await page.waitForTimeout(900);
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
    expect(await undoButton.getAttribute('title')).toBe(undoTitleBefore);
    expect(await redoButton.getAttribute('title')).toBe(redoTitleBefore);

    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    const yInput = page.getByLabel('Y移動量（px）');
    await yInput.fill('-3');
    await yInput.press('Escape');
    await expect(page.getByRole('button', { name: '位置合わせを開始' })).toBeVisible();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await page.getByRole('button', { name: '位置を確定' }).click();
    await expect(page.getByRole('button', { name: '位置合わせを開始' })).toBeVisible();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await page.getByLabel('アニメーション選択').selectOption('animation_alignment_shared');
    await expect(page.getByRole('button', { name: '位置合わせを開始' })).toBeVisible();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await page.getByLabel('アニメーション選択').selectOption('animation_alignment_primary');
    await page.getByLabel('位置合わせの基準Frame').selectOption('frame_alignment_reference');
    await page.getByLabel('位置合わせの対象Frame').selectOption('frame_alignment_target');
    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await page.locator('.asset-list button:not([aria-pressed="true"])').click();
    await expect(page.getByRole('button', { name: '位置を確定' })).toHaveCount(0);
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
  });

  test('再生・通常Frame preview・他の保存編集との同時実行を拒否する', async ({ page }) => {
    const assetId = await setupFrameAlignmentProject(page, 'D4防護テスト');
    await selectFrameAlignmentPair(page);
    const storedBefore = await readStoredAsset(page, assetId);
    const projectBefore = await readStoredProject(page);
    const undoButton = page.getByRole('button', { name: '元に戻す', exact: true });
    const redoButton = page.getByRole('button', { name: 'やり直す', exact: true });
    const undoTitleBefore = await undoButton.getAttribute('title');
    const redoTitleBefore = await redoButton.getAttribute('title');

    await page.getByRole('button', { name: '再生', exact: true }).click();
    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '再生中' })).toBeVisible();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await page.getByRole('button', { name: '停止', exact: true }).click();

    await page.getByRole('button', { name: 'alignment_reference', exact: true }).click();
    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'プレビュー中' })).toBeVisible();
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await page.getByRole('button', { name: '停止', exact: true }).click();

    await page.getByRole('button', { name: '位置合わせを開始' }).click();
    await expect(page.getByRole('button', { name: '再生', exact: true })).toBeDisabled();
    await page.getByLabel('フレーム名').first().fill('blocked');
    await expect(page.getByRole('alert').filter({ hasText: '位置合わせ中' })).toBeVisible();
    await page.waitForTimeout(900);
    expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
    expect(await readStoredProject(page)).toEqual(projectBefore);
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();
    expect(await undoButton.getAttribute('title')).toBe(undoTitleBefore);
    expect(await redoButton.getAttribute('title')).toBe(redoTitleBefore);
    await page.getByRole('button', { name: '取消', exact: true }).click();
  });

  for (const fixture of [
    {
      failure: 'no-layers',
      label: 'Layer 0件',
      reason: 'AssetにLayerがない',
    },
    {
      failure: 'duplicate-layer-id',
      label: 'Layer ID重複',
      reason: '同じLayer IDが複数',
    },
    {
      failure: 'missing-layer-state',
      label: 'LayerState欠落',
      reason: '状態がありません',
    },
  ] as const) {
    test(`${fixture.label}を理由付きで拒否し保存状態を変えない`, async ({ page }) => {
      const projectName = `D4拒否-${fixture.failure}`;
      const assetId = await setupFrameAlignmentProject(page, projectName, fixture.failure);
      await selectFrameAlignmentPair(page);
      const storedBefore = await readStoredAsset(page, assetId);
      const projectBefore = await readStoredProject(page);

      await page.getByRole('button', { name: '位置合わせを開始' }).click();
      await expect(page.getByRole('alert').filter({ hasText: fixture.reason })).toBeVisible();
      await expect(page.getByRole('button', { name: '位置合わせを開始' })).toBeVisible();
      expect(await readStoredAsset(page, assetId)).toEqual(storedBefore);
      expect(await readStoredProject(page)).toEqual(projectBefore);
      await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'やり直す', exact: true })).toBeDisabled();
    });
  }
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

  await expect(
    page
      .getByLabel('アニメーションイベント')
      .getByRole('textbox', { name: 'イベント「attack_start」の名前' }),
  ).toHaveValue('attack_start');
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
  // installだけでは実時間が進むため、再生開始前にmock clockを導入して停止する。
  await page.clock.pauseAt(new Date());

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
