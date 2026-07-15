import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import { restoreProject } from './index';
import {
  deleteProject,
  listTrash,
  loadAsset,
  loadBlob,
  loadProject,
  purgeTrash,
  saveAsset,
  saveBlob,
  saveProject,
} from './projectStore';
import { listSnapshots, saveSnapshot } from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

async function seedRecoveryProject() {
  const project = { ...createEmptyProject('recovery trash'), id: 'project_recovery_trash' };
  const asset = { ...(characterAsset as unknown as Asset), id: 'asset_recovery_trash' };
  const editTexture = asset.textures.find((texture) => texture.kind === 'edit');
  if (!editTexture) {
    throw new Error('fixture に edit TextureRef がありません');
  }
  const key = `${asset.id}/${editTexture.path}`;
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const blob = new Blob([bytes], { type: 'image/png' });
  await saveProject(project);
  await saveAsset(project.id, asset);
  await saveBlob(project.id, key, blob);
  await saveSnapshot({
    projectId: project.id,
    assetId: asset.id,
    label: '消しゴム',
    asset,
    blobKey: key,
    blob,
  });
  return { project, asset, key };
}

describe('trash の失敗時原子性', () => {
  it('ごみ箱移動中の Asset 削除失敗で Project、Asset、Blob、snapshot を元状態に保つ', async () => {
    const fixture = await seedRecoveryProject();
    const originalDelete = IDBObjectStore.prototype.delete;
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      query: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'assets' && query === fixture.asset.id) {
        throw new DOMException('trash move fail injection', 'DataError');
      }
      return originalDelete.call(this, query);
    });

    try {
      await expect(deleteProject(fixture.project.id)).rejects.toThrow();
    } finally {
      deleteSpy.mockRestore();
    }

    expect((await loadProject(fixture.project.id)).project).toEqual(fixture.project);
    expect((await loadAsset(fixture.asset.id)).asset).toEqual(fixture.asset);
    expect(await loadBlob(fixture.key)).not.toBeNull();
    expect(await listSnapshots(fixture.asset.id)).toHaveLength(1);
    expect(await listTrash()).toEqual([]);
  });

  it('完全削除中の snapshot 削除失敗で trash、Blob、snapshot を部分削除しない', async () => {
    const fixture = await seedRecoveryProject();
    await deleteProject(fixture.project.id);
    const [trash] = await listTrash();

    const originalDelete = IDBObjectStore.prototype.delete;
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      query: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'snapshots') {
        throw new DOMException('trash purge fail injection', 'DataError');
      }
      return originalDelete.call(this, query);
    });

    try {
      await expect(purgeTrash(trash.id)).rejects.toThrow();
    } finally {
      deleteSpy.mockRestore();
    }

    expect(await listTrash()).toHaveLength(1);
    expect(await loadBlob(fixture.key)).not.toBeNull();
    await restoreProject(trash.id);
    expect((await loadProject(fixture.project.id)).project).toEqual(fixture.project);
    expect((await loadAsset(fixture.asset.id)).asset).toEqual(fixture.asset);
    expect(await listSnapshots(fixture.asset.id)).toHaveLength(1);
  });
});
