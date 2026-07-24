import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

interface StoredAsset {
  id: string;
  name: string;
  displayName: string;
  textures: Array<{ id: string; path: string }>;
  layers: Array<{
    id: string;
    transform: {
      position: { x: number; y: number };
      scale: { x: number; y: number };
      rotation: number;
    };
  }>;
  parts: Array<{
    id: string;
    layerIds: string[];
    parentId?: string;
    pivot?: { x: number; y: number };
    bindPose?: {
      localPosition?: { x: number; y: number };
      localRotation?: number;
      localScale?: { x: number; y: number };
    };
    rotationLimit?: { min: number; max: number };
  }>;
  anchors: Array<{ id: string; name: string; position: { x: number; y: number } }>;
  colliders: Array<{ id: string; name: string }>;
  frames?: Array<{
    id: string;
    name?: string;
    layerStates: Array<{
      layerId: string;
      transform?: {
        position: { x: number; y: number };
        scale: { x: number; y: number };
        rotation: number;
      };
    }>;
  }>;
  animations: Array<{
    id: string;
    frameIds: string[];
    events?: Array<{ id: string; name: string; frameId: string }>;
  }>;
  rigAnimations?: Array<{
    id: string;
    name: string;
    fps: number;
    durationMs: number;
    keyframes: Array<{
      time: number;
      poses: Record<
        string,
        {
          localPosition?: { x: number; y: number };
          localRotation?: number;
          localScale?: { x: number; y: number };
        }
      >;
    }>;
  }>;
}

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.clearRect(0, 0, 64, 48);
    context.fillStyle = '#c0392b';
    context.fillRect(3, 4, 19, 31);
    context.fillStyle = 'rgba(41, 128, 185, 0.7)';
    context.fillRect(27, 8, 31, 13);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** IndexedDB の assets ストアから全アセットを読む。 */
async function readAllAssets(page: Page): Promise<StoredAsset[]> {
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
    return records.map((record) => record.data) as never;
  });
}

async function setupProjectWithImage(page: Page, projectName: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(projectName);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'hero.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function seedRigAsset(
  page: Page,
  options: { missingPoseReference?: boolean } = {},
): Promise<void> {
  await page.evaluate(async ({ missingPoseReference }) => {
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
    const transaction = db.transaction('assets', 'readwrite');
    const store = transaction.objectStore('assets');
    const records = (await requestResult(store.getAll())) as Array<{
      id: string;
      projectId: string;
      data: StoredAsset;
    }>;
    const record = records[0];
    const asset = record.data;
    const layer = asset.layers[0];
    layer.transform = {
      position: { x: 7, y: 9 },
      scale: { x: -1.5, y: 0.75 },
      rotation: 11,
    };
    asset.parts = [
      {
        id: 'part_left',
        name: 'arm_left',
        partType: 'arm_left',
        layerIds: [layer.id],
        pivot: { x: 22, y: 24 },
        bindPose: {
          localPosition: { x: 3, y: -2 },
          localRotation: 15,
          localScale: { x: -1, y: 1.25 },
        },
        rotationLimit: { min: -25, max: 40 },
      } as StoredAsset['parts'][number] & { name: string; partType: string },
    ];
    asset.anchors = [
      {
        id: 'anchor_left',
        name: 'hand_left',
        role: 'hand_left',
        position: { x: 18, y: 20 },
      } as StoredAsset['anchors'][number] & { role: string },
    ];
    asset.colliders = [
      {
        id: 'collider_left',
        name: 'hit_left',
        purpose: 'attack',
        shape: 'rect',
        visible: true,
        rect: { x: 4, y: 6, width: 12, height: 14 },
      } as StoredAsset['colliders'][number] & {
        purpose: string;
        shape: string;
        visible: boolean;
        rect: { x: number; y: number; width: number; height: number };
      },
    ];
    asset.frames = [
      {
        id: 'frame_left',
        name: 'pose_left',
        layerStates: [{ layerId: layer.id, transform: structuredClone(layer.transform) }],
      } as NonNullable<StoredAsset['frames']>[number],
    ];
    asset.animations = [
      {
        id: 'animation_left',
        name: 'attack_left',
        fps: 8,
        loop: false,
        frameIds: ['frame_left'],
        events: [{ id: 'event_left', name: 'game_left_event', frameId: 'frame_left' }],
      } as StoredAsset['animations'][number] & { name: string; fps: number; loop: boolean },
    ];
    asset.rigAnimations = [
      {
        id: 'rig_left',
        name: 'wave_left',
        fps: 2,
        loop: false,
        durationMs: 1000,
        keyframes: [
          {
            time: 0,
            poses: {
              [missingPoseReference ? 'part_missing' : 'part_left']: {
                localPosition: { x: 4, y: 5 },
                localRotation: -20,
                localScale: { x: -0.5, y: 2 },
              },
            },
          },
        ],
      } as NonNullable<StoredAsset['rigAnimations']>[number] & { loop: boolean },
    ];
    (asset as unknown as { updatedAt: string }).updatedAt = new Date().toISOString();
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, options);
}

async function reopenProject(page: Page, projectName: string): Promise<void> {
  await page.reload();
  const heading = page.getByRole('heading', { name: projectName });
  const openButton = page.getByRole('button', { name: `「${projectName}」を開く` });
  if (!(await heading.isVisible())) {
    await expect(openButton).toBeVisible();
    await openButton.click();
  }
  await expect(heading).toBeVisible();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function storageSnapshot(page: Page): Promise<unknown> {
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
      const [projects, assets, blobs] = await Promise.all([
        requestResult(db.transaction('projects', 'readonly').objectStore('projects').getAll()),
        requestResult(db.transaction('assets', 'readonly').objectStore('assets').getAll()),
        requestResult(db.transaction('blobs', 'readonly').objectStore('blobs').getAll()),
      ]);
      return {
        projects,
        assets,
        blobs: (
          blobs as Array<{ key: string; mimeType: string; bytes: ArrayBuffer; updatedAt: string }>
        )
          .map((blob) => ({
            key: blob.key,
            mimeType: blob.mimeType,
            bytes: Array.from(new Uint8Array(blob.bytes)),
            updatedAt: blob.updatedAt,
          }))
          .sort((left, right) => left.key.localeCompare(right.key)),
      };
    } finally {
      db.close();
    }
  });
}

async function sourceLayerScaleX(page: Page, sourceId: string): Promise<number | undefined> {
  return (await readAllAssets(page)).find(({ id }) => id === sourceId)?.layers[0].transform.scale.x;
}

test('rig付き独立左右反転copyを保存・再読込し、既存Undo / Redoを完全維持する', async ({ page }) => {
  const projectName = 'rig反転コピーテスト';
  await setupProjectWithImage(page, projectName);
  await seedRigAsset(page);
  await reopenProject(page, projectName);
  const sourceBefore = (await readAllAssets(page))[0];

  // UndoとRedoの両方を持つ状態を作る。
  await page.getByRole('button', { name: 'main', exact: true }).click();
  const layerFlip = page.getByRole('button', { name: '左右反転', exact: true });
  const undo = page.getByRole('button', { name: '元に戻す' });
  const redo = page.getByRole('button', { name: 'やり直す' });
  await layerFlip.click();
  await expect(undo).toHaveAttribute('title', '左右反転');
  await expect(undo).toBeEnabled();
  await layerFlip.click();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(redo).toHaveAttribute('title', '左右反転');
  await expect(redo).toBeEnabled();

  await page.getByRole('button', { name: '独立左右反転コピーを作成' }).click();
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(2);

  const assets = await readAllAssets(page);
  const original = assets.find((asset) => !asset.name.endsWith('_flipped'))!;
  const flipped = assets.find((asset) => asset.name.endsWith('_flipped'))!;
  expect(original.id).toBe(sourceBefore.id);
  expect(flipped.layers[0].transform.scale.x).toBe(-original.layers[0].transform.scale.x);
  expect(flipped.parts[0]).toMatchObject({
    pivot: { x: 42, y: 24 },
    bindPose: {
      localPosition: { x: -3, y: -2 },
      localRotation: -15,
      localScale: { x: -1, y: 1.25 },
    },
    rotationLimit: { min: -40, max: 25 },
  });
  expect(flipped.parts[0].id).not.toBe(original.parts[0].id);
  expect(flipped.rigAnimations![0]).toMatchObject({
    name: 'wave_right',
    fps: 2,
    durationMs: 1000,
    keyframes: [{ time: 0 }],
  });
  expect(Object.keys(flipped.rigAnimations![0].keyframes[0].poses)).toEqual([flipped.parts[0].id]);
  expect(flipped.animations[0].events![0].name).toBe('game_left_event');
  expect(flipped.animations[0].events![0].id).not.toBe(original.animations[0].events![0].id);
  expect(flipped.anchors[0].id).not.toBe(original.anchors[0].id);
  expect(flipped.colliders[0].id).not.toBe(original.colliders[0].id);
  expect(flipped.textures).toEqual(original.textures);

  // copy後も既存stackのlabelと実動作を維持する。
  await expect(undo).toHaveAttribute('title', '左右反転');
  await expect(redo).toHaveAttribute('title', '左右反転');
  await undo.click();
  await expect.poll(() => sourceLayerScaleX(page, original.id)).toBe(-1.5);
  await redo.click();
  await expect.poll(() => sourceLayerScaleX(page, original.id)).toBe(1.5);

  await expect(page.locator('.asset-list li')).toHaveCount(2);
  await expect(page.locator('.asset-list button[aria-pressed="true"]')).toContainText('(左右反転)');
  await expect(
    page.getByRole('region', { name: 'Family / Variant' }).getByText('standalone / 独立', {
      exact: true,
    }),
  ).toBeVisible();

  await reopenProject(page, projectName);
  const reloaded = await readAllAssets(page);
  expect(reloaded).toHaveLength(2);
  expect(reloaded.find(({ id }) => id === flipped.id)).toEqual(flipped);
  const snapshot = (await storageSnapshot(page)) as {
    blobs: Array<{ key: string; bytes: number[] }>;
  };
  for (const texture of original.textures) {
    const sourceBlob = snapshot.blobs.find(({ key }) => key === `${original.id}/${texture.path}`)!;
    const flippedBlob = snapshot.blobs.find(({ key }) => key === `${flipped.id}/${texture.path}`)!;
    expect(flippedBlob.bytes).toEqual(sourceBlob.bytes);
  }
});

test('Blob保存失敗はProject / Asset / Blob / 画面 / Historyを全rollbackし、再試行できる', async ({
  page,
}) => {
  const projectName = 'rig反転rollback';
  await setupProjectWithImage(page, projectName);
  await seedRigAsset(page);
  await reopenProject(page, projectName);
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await page.getByRole('button', { name: '左右反転', exact: true }).click();
  const undo = page.getByRole('button', { name: '元に戻す' });
  await expect(undo).toHaveAttribute('title', '左右反転');
  await expect(undo).toBeEnabled();
  const before = await storageSnapshot(page);

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let failNextBlobPut = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'blobs' && failNextBlobPut) {
        failNextBlobPut = false;
        throw new DOMException('injected blob write failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });

  await page.getByRole('button', { name: '独立左右反転コピーを作成' }).click();
  await expect(page.locator('.import-error')).toContainText(
    '独立左右反転コピーを作成できませんでした',
  );
  await expect.poll(() => storageSnapshot(page)).toEqual(before);
  await expect(page.locator('.asset-list li')).toHaveCount(1);
  await expect(undo).toHaveAttribute('title', '左右反転');
  await expect(page.getByRole('button', { name: 'やり直す' })).toBeDisabled();

  await page.getByRole('button', { name: '独立左右反転コピーを作成' }).click();
  await expect.poll(async () => (await readAllAssets(page)).length).toBe(2);
});

test('不正rigはUIで理由付き拒否し、IDBとHistoryを変更しない', async ({ page }) => {
  const projectName = 'rig反転preflight';
  await setupProjectWithImage(page, projectName);
  await seedRigAsset(page, { missingPoseReference: true });
  await reopenProject(page, projectName);
  const before = await storageSnapshot(page);

  await page.getByRole('button', { name: '独立左右反転コピーを作成' }).click();

  await expect(page.locator('.import-error')).toContainText('ポーズ参照');
  await expect.poll(() => storageSnapshot(page)).toEqual(before);
  await expect(page.locator('.asset-list li')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'やり直す' })).toBeDisabled();
});

test.describe('rig反転copyのiPhone SE級viewport', () => {
  test.use({ hasTouch: true });

  for (const viewport of [
    { name: '縦', width: 375, height: 667 },
    { name: '横', width: 667, height: 375 },
  ]) {
    test(`${viewport.name}でtap・保存・再読込でき、横overflowを出さない`, async ({ page }) => {
      const projectName = `rig flip mobile ${viewport.name}`;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await setupProjectWithImage(page, projectName);
      await seedRigAsset(page);
      await reopenProject(page, projectName);
      await page
        .getByRole('navigation', { name: '画面切り替え' })
        .getByRole('button', { name: 'プロパティ' })
        .tap();

      const flipButton = page.getByRole('button', { name: '独立左右反転コピーを作成' });
      await flipButton.scrollIntoViewIfNeeded();
      const buttonBox = await flipButton.boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

      await flipButton.tap();
      await expect.poll(async () => (await readAllAssets(page)).length).toBe(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);

      await reopenProject(page, projectName);
      expect(await readAllAssets(page)).toHaveLength(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }
});
