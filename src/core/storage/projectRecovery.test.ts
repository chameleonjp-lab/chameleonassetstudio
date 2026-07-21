import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset, type Project } from '../model';
import characterAsset from '../samples/asset.character.json';
import { requestToPromise, resetDbForTests, runTransaction, STORE_ASSETS } from './db';
import { restoreProject } from './index';
import {
  deleteProject,
  listProjectAssets,
  listTrash,
  loadAsset,
  loadProject,
  saveAsset,
  saveProject,
} from './projectStore';

beforeEach(async () => {
  await resetDbForTests();
});

function projectWithAssets(name: string, assets: Asset[]): Project {
  return {
    ...createEmptyProject(name),
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    })),
  };
}

describe('Project trash復元のID衝突拒否', () => {
  it('衝突がなければProjectとAssetを復元し、trashだけを削除する', async () => {
    const asset = characterAsset as unknown as Asset;
    const project = projectWithAssets('通常復元', [asset]);
    await saveProject(project);
    await saveAsset(project.id, asset);
    await deleteProject(project.id);

    await restoreProject(project.id);

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(await listTrash()).toEqual([]);
  });

  it('旧0.1.0 Assetをごみ箱から復元すると0.2.0へ移行し、未知fieldを保持する', async () => {
    const current = characterAsset as unknown as Asset;
    const legacy = {
      ...structuredClone(current),
      id: 'asset_legacy_trash',
      version: '0.1.0',
      legacyRoot: { keep: true },
    } as unknown as Asset;
    const project = projectWithAssets('旧Asset復元', [legacy]);
    await saveProject(project);
    await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
      requestToPromise(
        tx.objectStore(STORE_ASSETS).put({
          id: legacy.id,
          projectId: project.id,
          data: legacy,
        }),
      ),
    );
    await deleteProject(project.id);

    await restoreProject(project.id);

    const restored = await runTransaction([STORE_ASSETS], 'readonly', (tx) =>
      requestToPromise(tx.objectStore(STORE_ASSETS).get(legacy.id)),
    );
    expect(restored).toMatchObject({
      data: { version: '0.2.0', legacyRoot: { keep: true } },
    });
    expect((restored as { data: Record<string, unknown> }).data).not.toHaveProperty('provenance');
    expect(await listTrash()).toEqual([]);
  });

  it('ごみ箱内にfuture AssetがあればProjectも旧Assetも部分復元しない', async () => {
    const base = characterAsset as unknown as Asset;
    const legacy = { ...base, id: 'asset_trash_legacy', version: '0.1.0' } as unknown as Asset;
    const future = { ...base, id: 'asset_trash_future', version: '0.2.1' } as unknown as Asset;
    const project = projectWithAssets('復元migration失敗', [legacy, future]);
    await saveProject(project);
    await runTransaction([STORE_ASSETS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_ASSETS);
      await requestToPromise(store.put({ id: legacy.id, projectId: project.id, data: legacy }));
      await requestToPromise(store.put({ id: future.id, projectId: project.id, data: future }));
    });
    await deleteProject(project.id);

    await expect(restoreProject(project.id)).rejects.toThrow(/新しい形式/);

    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(legacy.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(future.id)).rejects.toThrow(/見つかりません/);
    expect(await listTrash()).toHaveLength(1);
  });

  it('同じProject IDが正本storeに存在する場合は既存Projectを上書きせずtrashを残す', async () => {
    const deletedProject = createEmptyProject('削除されたProject');
    await saveProject(deletedProject);
    await deleteProject(deletedProject.id);

    const existingProject: Project = {
      ...deletedProject,
      name: '現在のProject',
      updatedAt: '2026-07-15T12:30:00.000Z',
    };
    await saveProject(existingProject);

    await expect(restoreProject(deletedProject.id)).rejects.toThrow(/同じProject ID/);

    expect((await loadProject(existingProject.id)).project).toEqual(existingProject);
    expect(await listTrash()).toHaveLength(1);
    expect((await listTrash())[0].id).toBe(deletedProject.id);
  });

  it('復元対象のAsset IDが1件でも存在する場合はProjectも他Assetも部分復元しない', async () => {
    const assetA = characterAsset as unknown as Asset;
    const assetB: Asset = {
      ...assetA,
      id: 'asset_restore_collision_b',
      name: 'collision-b',
      displayName: '復元対象B',
    };
    const deletedProject = projectWithAssets('Asset衝突Project', [assetA, assetB]);
    await saveProject(deletedProject);
    await saveAsset(deletedProject.id, assetA);
    await saveAsset(deletedProject.id, assetB);
    await deleteProject(deletedProject.id);

    const existingAssetB: Asset = {
      ...assetB,
      displayName: '現在のAsset B',
      updatedAt: '2026-07-15T12:31:00.000Z',
    };
    const ownerProject = projectWithAssets('現在のAsset所有Project', [existingAssetB]);
    await saveProject(ownerProject);
    await saveAsset(ownerProject.id, existingAssetB);

    await expect(restoreProject(deletedProject.id)).rejects.toThrow(/同じAsset ID/);

    await expect(loadProject(deletedProject.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(assetA.id)).rejects.toThrow(/見つかりません/);
    expect((await loadAsset(assetB.id)).asset).toEqual(existingAssetB);
    expect(await listProjectAssets(ownerProject.id)).toEqual([existingAssetB]);
    expect(await listTrash()).toHaveLength(1);
    expect((await listTrash())[0].id).toBe(deletedProject.id);
  });
});
