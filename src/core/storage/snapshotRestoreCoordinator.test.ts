import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { AutosaveQueue } from './autosave';
import { resetDbForTests } from './db';
import {
  loadAsset,
  loadBlob,
  saveAsset,
  saveAssetRevision as saveAssetRevisionBase,
  saveProjectBundle,
} from './projectStore';
import { restoreSnapshot, saveAssetRevision } from './snapshotRestoreCoordinator';
import { listSnapshots, saveSnapshot } from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

function editTexture(asset: Asset) {
  const texture = asset.textures.find((entry) => entry.kind === 'edit');
  if (!texture) {
    throw new Error('fixture に edit TextureRef がありません');
  }
  return texture;
}

async function readBytes(key: string): Promise<Uint8Array> {
  const blob = await loadBlob(key);
  expect(blob).not.toBeNull();
  return new Uint8Array(await blob!.arrayBuffer());
}

async function seedCoordinatorFlow() {
  const projectId = 'project_restore_coordinator';
  const baseAsset = characterAsset as unknown as Asset;
  const currentAsset: Asset = {
    ...baseAsset,
    id: 'asset_restore_coordinator',
    displayName: '保存中',
    textures: baseAsset.textures.map((texture) =>
      texture.kind === 'edit' ? { ...texture, size: { width: 10, height: 10 } } : { ...texture },
    ),
  };
  const snapshotAsset: Asset = {
    ...baseAsset,
    id: currentAsset.id,
    displayName: '復旧点',
    textures: baseAsset.textures.map((texture) =>
      texture.kind === 'edit' ? { ...texture, size: { width: 5, height: 5 } } : { ...texture },
    ),
  };
  const project = { ...createEmptyProject('復旧調整テスト'), id: projectId };
  const editKey = `${currentAsset.id}/${editTexture(currentAsset).path}`;
  const currentBytes = new Uint8Array([9, 9, 9, 9]);
  const snapshotBytes = new Uint8Array([1, 1, 1, 1]);

  await saveProjectBundle(
    project,
    [currentAsset],
    [{ key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) }],
  );
  await saveSnapshot({
    projectId,
    assetId: currentAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: new Blob([snapshotBytes], { type: 'image/png' }),
  });
  const [summary] = await listSnapshots(currentAsset.id);

  return {
    projectId,
    currentAsset,
    snapshotAsset,
    editKey,
    currentBytes,
    snapshotBytes,
    snapshotId: summary.id,
  };
}

describe('snapshot復元の保存層調整', () => {
  it('復元準備前に保留中autosaveをflushし、最新の正本をUndo用として取得する', async () => {
    const fixture = await seedCoordinatorFlow();
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    const latestAsset: Asset = { ...fixture.currentAsset, displayName: 'autosave反映後' };
    queue.schedule(() => saveAsset(fixture.projectId, latestAsset));

    const restored = await restoreSnapshot(fixture.snapshotId);

    expect(restored.beforeAsset.displayName).toBe('autosave反映後');
    await saveAssetRevision({
      projectId: fixture.projectId,
      asset: restored.asset,
      putBlobs: [{ key: restored.blobKey, blob: restored.blob }],
    });

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(fixture.snapshotAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
  });

  it('復元準備後にAssetまたはBlobが変わった場合は上書きせず拒否する', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await restoreSnapshot(fixture.snapshotId);
    const concurrentAsset: Asset = { ...fixture.currentAsset, displayName: '別操作の保存' };
    const concurrentBytes = new Uint8Array([4, 4, 4, 4]);

    await saveAssetRevisionBase({
      projectId: fixture.projectId,
      asset: concurrentAsset,
      putBlobs: [
        {
          key: fixture.editKey,
          blob: new Blob([concurrentBytes], { type: 'image/png' }),
        },
      ],
    });

    await expect(
      saveAssetRevision({
        projectId: fixture.projectId,
        asset: restored.asset,
        putBlobs: [{ key: restored.blobKey, blob: restored.blob }],
      }),
    ).rejects.toThrow(/変更されたため、復元を中止/);

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(concurrentAsset);
    expect(await readBytes(fixture.editKey)).toEqual(concurrentBytes);
  });

  it('復元書き込みが途中で失敗した場合はAssetとBlobの元状態を維持する', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await restoreSnapshot(fixture.snapshotId);
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === 'blobs' &&
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === fixture.editKey
      ) {
        throw new DOMException('restore coordinator fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });

    try {
      await expect(
        saveAssetRevision({
          projectId: fixture.projectId,
          asset: restored.asset,
          putBlobs: [{ key: restored.blobKey, blob: restored.blob }],
        }),
      ).rejects.toThrow();
    } finally {
      putSpy.mockRestore();
    }

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(fixture.currentAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.currentBytes);
  });
});
