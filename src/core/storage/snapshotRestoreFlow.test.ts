import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import { loadAsset, loadBlob, saveAssetRevision, saveProjectBundle } from './projectStore';
import { listSnapshots, restoreSnapshot, saveSnapshot } from './snapshotStore';

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

async function seedRestoreFlow() {
  const projectId = 'project_restore_flow';
  const baseAsset = characterAsset as unknown as Asset;
  const currentAsset: Asset = {
    ...baseAsset,
    id: 'asset_restore_flow',
    textures: baseAsset.textures.map((texture) =>
      texture.kind === 'edit'
        ? { ...texture, size: { width: 10, height: 10 } }
        : { ...texture },
    ),
  };
  const snapshotAsset: Asset = {
    ...baseAsset,
    id: currentAsset.id,
    textures: baseAsset.textures.map((texture) =>
      texture.kind === 'edit'
        ? { ...texture, size: { width: 5, height: 5 } }
        : { ...texture },
    ),
  };
  const project = { ...createEmptyProject('復旧点フローテスト'), id: projectId };
  const editKey = `${currentAsset.id}/${editTexture(currentAsset).path}`;
  const sourceTexture = currentAsset.textures.find((texture) => texture.kind === 'source');
  if (!sourceTexture) {
    throw new Error('fixture に source TextureRef がありません');
  }
  const sourceKey = `${currentAsset.id}/${sourceTexture.path}`;
  const currentBytes = new Uint8Array([9, 9, 9, 9]);
  const snapshotBytes = new Uint8Array([1, 1, 1, 1]);
  const sourceBytes = new Uint8Array([7, 7, 7, 7]);

  await saveProjectBundle(project, [currentAsset], [
    { key: sourceKey, blob: new Blob([sourceBytes], { type: 'image/png' }) },
    { key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) },
  ]);
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
    sourceKey,
    currentBytes,
    snapshotBytes,
    sourceBytes,
    snapshotId: summary.id,
  };
}

describe('復旧点の復元、Undo、Redo の整合性', () => {
  it('edit Asset と Blob を復元し、Undo / Redo 後も source を変更しない', async () => {
    const fixture = await seedRestoreFlow();
    const restored = await restoreSnapshot(fixture.snapshotId);

    expect(restored.beforeAsset).toEqual(fixture.currentAsset);
    expect(new Uint8Array(await restored.beforeBlob.arrayBuffer())).toEqual(fixture.currentBytes);

    await saveAssetRevision({
      projectId: fixture.projectId,
      asset: restored.asset,
      putBlobs: [{ key: restored.blobKey, blob: restored.blob }],
    });

    let stored = (await loadAsset(fixture.currentAsset.id)).asset;
    expect(editTexture(stored).size).toEqual({ width: 5, height: 5 });
    expect(stored.textures.find((texture) => texture.kind === 'source')).toEqual(
      fixture.currentAsset.textures.find((texture) => texture.kind === 'source'),
    );
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);

    await saveAssetRevision({
      projectId: fixture.projectId,
      asset: restored.beforeAsset,
      putBlobs: [{ key: restored.blobKey, blob: restored.beforeBlob }],
    });

    stored = (await loadAsset(fixture.currentAsset.id)).asset;
    expect(editTexture(stored).size).toEqual({ width: 10, height: 10 });
    expect(await readBytes(fixture.editKey)).toEqual(fixture.currentBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);

    await saveAssetRevision({
      projectId: fixture.projectId,
      asset: restored.asset,
      putBlobs: [{ key: restored.blobKey, blob: restored.blob }],
    });

    stored = (await loadAsset(fixture.currentAsset.id)).asset;
    expect(editTexture(stored).size).toEqual({ width: 5, height: 5 });
    expect(await readBytes(fixture.editKey)).toEqual(fixture.snapshotBytes);
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);
  });

  it('復元 transaction の Blob 書き込みが失敗すると Asset と Blob の元状態を維持する', async () => {
    const fixture = await seedRestoreFlow();
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
        throw new DOMException('restore fail injection', 'DataError');
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
    expect(await readBytes(fixture.sourceKey)).toEqual(fixture.sourceBytes);
  });
});
