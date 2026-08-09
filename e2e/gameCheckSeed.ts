import { expect, type Page } from '@playwright/test';
import type { Asset, AssetType, Project } from '../src/core/model';
import { confirmImageImport } from './importTestHelpers';

export type GameCheckScenario =
  | 'normal'
  | 'export-compatible'
  | 'frame-override'
  | 'unset'
  | 'invalid-collider'
  | 'dangling-reference'
  | 'decode-failure'
  | 'missing-blob';

interface StoredAssetRecord {
  id: string;
  projectId: string;
  data: Asset;
}

interface StoredBlobRecord {
  key: string;
  projectId: string;
  mimeType: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#457b9d';
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = '#f4a261';
    context.fillRect(4, 4, 8, 8);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

export async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'g14-base.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await expect(page.locator('.editor-save-status')).toHaveText('保存済み', { timeout: 10_000 });
}

export async function reopenProject(page: Page, name: string): Promise<void> {
  await page.reload();
  await page.getByRole('button', { name: `「${name}」を開く` }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

export async function seedGameCheckAsset(
  page: Page,
  assetType: AssetType,
  scenario: GameCheckScenario = 'normal',
): Promise<void> {
  await page.evaluate(
    async ({ nextAssetType, nextScenario }) => {
      const requestResult = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const transactionDone = (transaction: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const read = db.transaction(['assets', 'projects'], 'readonly');
      const assetRecordsRequest = read.objectStore('assets').getAll() as IDBRequest<
        StoredAssetRecord[]
      >;
      const projectsRequest = read.objectStore('projects').getAll() as IDBRequest<Project[]>;
      const [assetRecords, projects] = await Promise.all([
        requestResult(assetRecordsRequest),
        requestResult(projectsRequest),
      ]);
      const record = assetRecords[0];
      const project = projects[0];
      if (!record || !project) {
        db.close();
        throw new Error('Group 14 fixtureの保存済みAssetまたはProjectが見つかりません。');
      }

      const asset = record.data;
      const primaryTexture =
        asset.textures.find((texture) => texture.kind === 'edit') ?? asset.textures[0];
      const primaryLayer = asset.layers.find((layer) => layer.layerType === 'image');
      if (!primaryTexture || !primaryLayer) {
        db.close();
        throw new Error('Group 14 fixtureの画像TextureまたはLayerが見つかりません。');
      }

      asset.assetType = nextAssetType;
      asset.canvasSize = { width: 32, height: 32 };
      asset.origin = { x: 16, y: 28 };
      asset.textures = asset.textures.map((texture) => ({
        ...texture,
        size: { width: 32, height: 32 },
      }));
      asset.layers = asset.layers.map((layer) => {
        const nextLayer = {
          ...layer,
          transform: {
            ...layer.transform,
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          },
        };
        delete nextLayer.background;
        if (nextLayer.id === primaryLayer.id) {
          nextLayer.textureId = primaryTexture.id;
          nextLayer.visible = true;
        }
        return nextLayer;
      });
      asset.anchors = [
        {
          id: 'g14_anchor',
          name: 'g14_anchor',
          role: 'foot',
          position: { x: 16, y: 28 },
        },
      ];
      asset.colliders = [
        {
          id: 'g14_collider',
          name: 'g14_collider',
          purpose: 'body',
          shape: 'rect',
          visible: true,
          rect: { x: 4, y: 4, width: 24, height: 24 },
        },
      ];
      asset.frames = [
        {
          id: 'g14_frame_0',
          name: 'g14_frame_0',
          durationMs: 120,
          layerStates: [
            {
              layerId: primaryLayer.id,
              visible: true,
              opacity: 1,
              transform: {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 },
                rotation: 0,
              },
            },
          ],
        },
        {
          id: 'g14_frame_1',
          name: 'g14_frame_1',
          durationMs: 180,
          layerStates: [
            {
              layerId: primaryLayer.id,
              visible: true,
              opacity: 1,
              transform: {
                position: { x: 1, y: 0 },
                scale: { x: 1, y: 1 },
                rotation: 0,
              },
            },
          ],
        },
      ];
      asset.animations = [
        {
          id: 'g14_animation',
          name: 'g14_animation',
          fps: 8,
          loop: true,
          frameIds: ['g14_frame_0', 'g14_frame_1'],
        },
      ];
      if (nextScenario === 'export-compatible') {
        asset.frames.forEach((frame) => {
          delete frame.durationMs;
        });
      }
      delete asset.tile;
      delete asset.gimmick;
      delete asset.effect;

      if (nextAssetType === 'background') {
        const layer = asset.layers.find((candidate) => candidate.id === primaryLayer.id);
        if (layer) {
          layer.background = {
            role: 'mid',
            parallaxSpeed: { x: 0.5, y: 0.25 },
            loopX: true,
            loopY: false,
          };
        }
      } else if (nextAssetType === 'tile') {
        asset.tile = {
          tileSize: { width: 32, height: 32 },
          collisionType: 'solid',
          visualType: 'floor',
        };
      } else if (nextAssetType === 'gimmick') {
        asset.gimmick = { movementPreset: 'horizontal' };
      } else if (nextAssetType === 'effect') {
        asset.effect = {
          effectType: 'spark',
          durationMs: 500,
          loop: true,
          blendMode: 'add',
        };
      }

      if (nextScenario === 'frame-override') {
        asset.frames![0]!.colliderOverrides = [
          {
            colliderId: 'g14_collider',
            rect: { x: 8, y: 6, width: 16, height: 20 },
            visible: true,
          },
        ];
      } else if (nextScenario === 'unset') {
        asset.colliders = [];
        const layer = asset.layers.find((candidate) => candidate.id === primaryLayer.id);
        if (layer) {
          delete layer.textureId;
        }
      } else if (nextScenario === 'invalid-collider') {
        asset.frames![0]!.colliderOverrides = [
          { colliderId: 'missing-collider', visible: true },
        ];
      } else if (nextScenario === 'dangling-reference') {
        const layer = asset.layers.find((candidate) => candidate.id === primaryLayer.id);
        if (layer) {
          layer.textureId = 'missing-texture';
        }
      }

      record.data = asset;
      project.assets = project.assets.map((entry) =>
        entry.id === asset.id
          ? {
              ...entry,
              name: asset.name,
              displayName: asset.displayName,
              assetType: asset.assetType,
            }
          : entry,
      );

      const write = db.transaction(['assets', 'projects', 'blobs'], 'readwrite');
      const writeDone = transactionDone(write);
      write.objectStore('assets').put(record);
      write.objectStore('projects').put(project);
      const blobStore = write.objectStore('blobs');
      const blobKey = `${asset.id}/${primaryTexture.path}`;
      if (nextScenario === 'missing-blob') {
        blobStore.delete(blobKey);
      } else if (nextScenario === 'decode-failure') {
        const blobRecord = await requestResult(
          blobStore.get(blobKey) as IDBRequest<StoredBlobRecord | undefined>,
        );
        if (!blobRecord) {
          write.abort();
          db.close();
          throw new Error('decode failure用のBlob recordが見つかりません。');
        }
        blobStore.put({
          ...blobRecord,
          mimeType: 'image/png',
          bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
        });
      }
      await writeDone;
      db.close();
    },
    { nextAssetType: assetType, nextScenario: scenario },
  );
}

export async function openGameCheck(page: Page): Promise<void> {
  const openButton = page.getByRole('button', { name: 'ゲーム確認', exact: true });
  await expect(openButton).toBeEnabled();
  await openButton.click();
  await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
  await expect(page.getByText(/物理演算・engine固有挙動/)).toBeVisible();
}

export async function closeGameCheck(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Editorへ戻る', exact: true }).first().click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}
