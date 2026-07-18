import type { Asset, Project } from '../model';
import { validateProjectFamilies } from '../model';
import { validateProject } from '../schema/validate';
import { hasRecoverableInvalidFamilies } from './projectStore';
import {
  STORE_ASSETS,
  STORE_PROJECTS,
  STORE_TRASH,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

interface StoredAssetRecord {
  id: string;
  projectId: string;
  data: Asset;
}

interface TrashRecord {
  id: string;
  deletedAt: string;
  project: Project;
  assets: Asset[];
}

/**
 * ごみ箱のProjectを正本storeへ戻す。
 *
 * 復元先に同じProject IDまたはAsset IDが存在する場合は、既存データを上書きせず拒否する。
 * 衝突検査と復元書き込みを同じtransaction内で行い、検査後に別処理が同じIDを作る競合も防ぐ。
 */
export async function restoreProject(trashId: string): Promise<void> {
  await runTransaction([STORE_TRASH, STORE_PROJECTS, STORE_ASSETS], 'readwrite', async (tx) => {
    const trashStore = tx.objectStore(STORE_TRASH);
    const projectStore = tx.objectStore(STORE_PROJECTS);
    const assetStore = tx.objectStore(STORE_ASSETS);
    const record = await requestToPromise(
      trashStore.get(trashId) as IDBRequest<TrashRecord | undefined>,
    );

    if (!record) {
      throw new StorageError(`ごみ箱にプロジェクト（id: ${trashId}）が見つかりません`);
    }
    if (record.id !== trashId || record.project.id !== trashId) {
      throw new StorageError(
        `ごみ箱のProject IDが一致しないため復元できません: trash=${trashId}, project=${record.project.id}`,
      );
    }
    const projectValidation = validateProject(record.project);
    const recoverableInvalidFamilies = hasRecoverableInvalidFamilies(record.project);
    if (!projectValidation.valid && !recoverableInvalidFamilies) {
      throw new StorageError(
        `ごみ箱のProjectがschema不正なため復元できません: ${projectValidation.errors.join(' / ')}`,
      );
    }
    const familyErrors = projectValidation.valid ? validateProjectFamilies(record.project) : [];
    if (familyErrors.length > 0 && !recoverableInvalidFamilies) {
      throw new StorageError(
        `ごみ箱のProject familiesが不正なため復元できません: ${familyErrors.join(' / ')}`,
      );
    }

    const existingProject = await requestToPromise(
      projectStore.get(record.project.id) as IDBRequest<Project | undefined>,
    );
    if (existingProject) {
      throw new StorageError(
        `同じProject ID（${record.project.id}）のプロジェクトが既に存在するため復元できません`,
      );
    }

    const assetIds = new Set<string>();
    for (const asset of record.assets) {
      if (assetIds.has(asset.id)) {
        throw new StorageError(`ごみ箱内で同じAsset IDが重複しています: ${asset.id}`);
      }
      assetIds.add(asset.id);

      const existingAsset = await requestToPromise(
        assetStore.get(asset.id) as IDBRequest<StoredAssetRecord | undefined>,
      );
      if (existingAsset) {
        throw new StorageError(
          `同じAsset ID（${asset.id}）のアセットが既に存在するため復元できません`,
        );
      }
    }

    await requestToPromise(projectStore.put(record.project));
    for (const asset of record.assets) {
      const assetRecord: StoredAssetRecord = {
        id: asset.id,
        projectId: record.project.id,
        data: asset,
      };
      await requestToPromise(assetStore.put(assetRecord));
    }
    await requestToPromise(trashStore.delete(trashId));
  });
}
