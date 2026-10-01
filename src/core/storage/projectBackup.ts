import type { Asset, Project, ExportPresetFile } from '../model';
import { migrateAndValidateAssetDocument } from './assetDocument';
import type { CasprojBundle } from './casproj';
import { exportSettingsKey } from './exportSettings';
import {
  STORE_PROJECTS,
  STORE_ASSETS,
  STORE_BLOBS,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

/** 他タブの変更を混ぜず、Project・素材・全画像・設定を同じ読み取りtransactionで固定する。 */
export async function loadProjectBackup(projectId: string): Promise<CasprojBundle> {
  return runTransaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readonly', async (tx) => {
    const project = await requestToPromise(
      tx.objectStore(STORE_PROJECTS).get(projectId) as IDBRequest<Project | undefined>,
    );
    if (!project) throw new StorageError('バックアップ対象のプロジェクトが見つかりません');
    const assets: Asset[] = [];
    const files: CasprojBundle['files'] = [];
    for (const entry of project.assets) {
      const record = await requestToPromise(tx.objectStore(STORE_ASSETS).get(entry.id));
      if (!record || record.projectId !== projectId)
        throw new StorageError(`バックアップ対象の素材が見つかりません: ${entry.id}`);
      const asset = migrateAndValidateAssetDocument(record.data, 'バックアップのasset').asset;
      assets.push(asset);
      for (const texture of asset.textures) {
        const blob = await requestToPromise(
          tx.objectStore(STORE_BLOBS).get(`${asset.id}/${texture.path}`),
        );
        if (!blob || blob.projectId !== projectId || blob.mimeType !== texture.mimeType)
          throw new StorageError(`バックアップ対象の画像が不足しています: ${texture.path}`);
        files.push({
          path: `assets/${asset.id}/${texture.path}`,
          bytes: new Uint8Array(blob.bytes),
        });
      }
    }
    const settings = await requestToPromise(
      tx.objectStore(STORE_BLOBS).get(exportSettingsKey(projectId)),
    );
    if (settings && (settings.projectId !== projectId || settings.mimeType !== 'application/json'))
      throw new StorageError('バックアップ対象の出力設定が不正です');
    const exportPresets: ExportPresetFile | undefined = settings
      ? JSON.parse(new TextDecoder().decode(settings.bytes))
      : undefined;
    return { project, assets, files, exportPresets };
  });
}
