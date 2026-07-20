import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { AutosaveQueue } from './autosave';
import {
  requestToPromise,
  resetDbForTests,
  runTransaction,
  STORE_ASSETS,
  STORE_SNAPSHOTS,
} from './db';
import {
  loadAsset,
  loadBlob,
  saveAsset,
  saveAssetRevision as saveAssetRevisionBase,
  saveProjectBundle,
} from './projectStore';
import {
  cancelSnapshotRestore,
  commitSnapshotRestore,
  prepareSnapshotRestore,
} from './snapshotRestoreCoordinator';
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
  const project = {
    ...createEmptyProject('復旧調整テスト'),
    id: projectId,
    assets: [
      {
        id: snapshotAsset.id,
        name: snapshotAsset.name,
        displayName: snapshotAsset.displayName,
        assetType: snapshotAsset.assetType,
      },
    ],
  };
  const editKey = `${currentAsset.id}/${editTexture(currentAsset).path}`;
  const sourceTexture = currentAsset.textures.find((texture) => texture.kind === 'source');
  if (!sourceTexture) {
    throw new Error('fixture に source TextureRef がありません');
  }
  const sourceKey = `${currentAsset.id}/${sourceTexture.path}`;
  const currentBytes = new Uint8Array([9, 9, 9, 9]);
  const snapshotBytes = new Uint8Array([1, 1, 1, 1]);
  const sourceBytes = new Uint8Array([7, 7, 7, 7]);

  const snapshotBlob = new Blob([snapshotBytes], { type: 'image/png' });
  await saveProjectBundle(
    project,
    [snapshotAsset],
    [
      { key: sourceKey, blob: new Blob([sourceBytes], { type: 'image/png' }) },
      { key: editKey, blob: snapshotBlob },
    ],
  );
  await saveSnapshot({
    projectId,
    assetId: snapshotAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: snapshotBlob,
  });
  await saveAssetRevisionBase({
    projectId,
    asset: currentAsset,
    putBlobs: [{ key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) }],
  });
  const [summary] = await listSnapshots(currentAsset.id);

  return {
    projectId,
    currentAsset,
    snapshotAsset,
    editKey,
    sourceKey,
    currentBytes,
    snapshotBytes,
    sourceBytes,
    snapshotId: summary.id,
  };
}

describe('snapshot復元の保存層調整', () => {
  it('復元準備前に保留中autosaveをflushし、最新の正本をUndo用として取得する', async () => {
    const fixture = await seedCoordinatorFlow();
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    const latestAsset: Asset = { ...fixture.currentAsset, displayName: 'autosave反映後' };
    queue.schedule(() => saveAsset(fixture.projectId, latestAsset));

    const restored = await prepareSnapshotRestore(fixture.snapshotId);

    expect(restored.beforeAsset.displayName).toBe('autosave反映後');
    await commitSnapshotRestore(restored.restoreToken);

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(fixture.snapshotAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);
  });

  it('復元準備後にAssetまたはBlobが変わった場合は上書きせず拒否する', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await prepareSnapshotRestore(fixture.snapshotId);
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

    await expect(commitSnapshotRestore(restored.restoreToken)).rejects.toThrow(
      /変更されたため、復元を中止/,
    );

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(concurrentAsset);
    expect(await readBytes(fixture.editKey)).toEqual(concurrentBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);
  });

  it('復元書き込みが途中で失敗した場合はAssetとBlobの元状態を維持する', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await prepareSnapshotRestore(fixture.snapshotId);
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
      await expect(commitSnapshotRestore(restored.restoreToken)).rejects.toThrow();
    } finally {
      putSpy.mockRestore();
    }

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(fixture.currentAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.currentBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);
  });

  it('cancelしたtokenは再利用できず、同じAssetの通常保存を妨げない', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await prepareSnapshotRestore(fixture.snapshotId);
    cancelSnapshotRestore(restored.restoreToken);

    await expect(commitSnapshotRestore(restored.restoreToken)).rejects.toThrow(
      /tokenが無効または使用済み/,
    );

    const nextAsset: Asset = { ...fixture.currentAsset, displayName: 'cancel後の通常保存' };
    await saveAssetRevisionBase({
      projectId: fixture.projectId,
      asset: nextAsset,
    });

    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(nextAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.currentBytes);
  });

  it('commit済みtokenは一度しか利用できない', async () => {
    const fixture = await seedCoordinatorFlow();
    const restored = await prepareSnapshotRestore(fixture.snapshotId);

    await commitSnapshotRestore(restored.restoreToken);

    await expect(commitSnapshotRestore(restored.restoreToken)).rejects.toThrow(
      /tokenが無効または使用済み/,
    );
    expect((await loadAsset(fixture.currentAsset.id)).asset).toEqual(fixture.snapshotAsset);
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
  });

  it('旧0.1.0の正本とsnapshotを準備時に0.2.0へ移行し、復元後も逆戻りしない', async () => {
    const fixture = await seedCoordinatorFlow();
    await runTransaction([STORE_ASSETS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
      const assetStore = tx.objectStore(STORE_ASSETS);
      const snapshotStore = tx.objectStore(STORE_SNAPSHOTS);
      const assetRecord = (await requestToPromise(assetStore.get(fixture.currentAsset.id))) as {
        data: Asset;
      };
      const snapshotRecord = (await requestToPromise(snapshotStore.get(fixture.snapshotId))) as {
        asset: Asset;
      };
      await requestToPromise(
        assetStore.put({
          ...assetRecord,
          data: {
            ...assetRecord.data,
            version: '0.1.0',
            legacyCurrent: { keep: true },
          },
        }),
      );
      await requestToPromise(
        snapshotStore.put({
          ...snapshotRecord,
          asset: {
            ...snapshotRecord.asset,
            version: '0.1.0',
            legacySnapshot: { keep: true },
          },
        }),
      );
    });

    const restored = await prepareSnapshotRestore(fixture.snapshotId);
    expect(restored.beforeAsset).toMatchObject({
      version: '0.2.0',
      legacyCurrent: { keep: true },
    });
    expect(restored.asset).toMatchObject({
      version: '0.2.0',
      legacySnapshot: { keep: true },
    });
    expect(restored.asset).not.toHaveProperty('provenance');

    await commitSnapshotRestore(restored.restoreToken);

    expect((await loadAsset(fixture.currentAsset.id)).asset).toMatchObject({
      version: '0.2.0',
      legacySnapshot: { keep: true },
    });
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
  });

  it('future snapshotを拒否した場合は旧正本もsnapshotも部分migrationしない', async () => {
    const fixture = await seedCoordinatorFlow();
    await runTransaction([STORE_ASSETS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
      const assetStore = tx.objectStore(STORE_ASSETS);
      const snapshotStore = tx.objectStore(STORE_SNAPSHOTS);
      const assetRecord = (await requestToPromise(assetStore.get(fixture.currentAsset.id))) as {
        data: Asset;
      };
      const snapshotRecord = (await requestToPromise(snapshotStore.get(fixture.snapshotId))) as {
        asset: Asset;
      };
      await requestToPromise(
        assetStore.put({
          ...assetRecord,
          data: { ...assetRecord.data, version: '0.1.0' },
        }),
      );
      await requestToPromise(
        snapshotStore.put({
          ...snapshotRecord,
          asset: { ...snapshotRecord.asset, version: '0.2.1' },
        }),
      );
    });

    await expect(prepareSnapshotRestore(fixture.snapshotId)).rejects.toThrow(/新しい形式/);

    const versions = await runTransaction(
      [STORE_ASSETS, STORE_SNAPSHOTS],
      'readonly',
      async (tx) => {
        const assetRecord = (await requestToPromise(
          tx.objectStore(STORE_ASSETS).get(fixture.currentAsset.id),
        )) as { data: Asset };
        const snapshotRecord = (await requestToPromise(
          tx.objectStore(STORE_SNAPSHOTS).get(fixture.snapshotId),
        )) as { asset: Asset };
        return {
          asset: assetRecord.data.version,
          snapshot: snapshotRecord.asset.version,
        };
      },
    );
    expect(versions).toEqual({ asset: '0.1.0', snapshot: '0.2.1' });
  });
});
