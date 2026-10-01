import type { ExportPresetFile, Project } from '../model';
import { migrateExportPresets } from '../model';
import { validateExportPresets } from '../schema/validate';
import { STORE_BLOBS, STORE_PROJECTS, StorageError, requestToPromise, runTransaction } from './db';

/** 画像とは異なる名前空間。既存Blob storeのproject所有・ごみ箱・完全削除を共有する。 */
export function exportSettingsKey(projectId: string): string {
  return `settings:${projectId}/export-presets.json`;
}

export function prepareExportSettings(projectId: string, presets: ExportPresetFile) {
  const result = validateExportPresets(presets);
  if (!result.valid) throw new StorageError(`出力設定が不正です: ${result.errors.join(' / ')}`);
  return {
    key: exportSettingsKey(projectId),
    projectId,
    mimeType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(presets)).buffer,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveProjectExportPresets(
  projectId: string,
  presets: ExportPresetFile,
): Promise<void> {
  const record = prepareExportSettings(projectId, presets);
  await runTransaction([STORE_PROJECTS, STORE_BLOBS], 'readwrite', async (tx) => {
    const project = await requestToPromise(
      tx.objectStore(STORE_PROJECTS).get(projectId) as IDBRequest<Project | undefined>,
    );
    if (!project) throw new StorageError('出力設定のプロジェクトが見つかりません');
    await requestToPromise(tx.objectStore(STORE_BLOBS).put(record));
  });
}

export async function loadProjectExportPresets(
  projectId: string,
): Promise<ExportPresetFile | undefined> {
  return runTransaction([STORE_PROJECTS, STORE_BLOBS], 'readonly', async (tx) => {
    const project = await requestToPromise(tx.objectStore(STORE_PROJECTS).get(projectId));
    if (!project) throw new StorageError('出力設定のプロジェクトが見つかりません');
    const record = (await requestToPromise(
      tx.objectStore(STORE_BLOBS).get(exportSettingsKey(projectId)),
    )) as ReturnType<typeof prepareExportSettings> | undefined;
    if (!record) return undefined;
    if (record.projectId !== projectId || record.mimeType !== 'application/json')
      throw new StorageError('出力設定の所有者または形式が不正です');
    const { data } = migrateExportPresets(JSON.parse(new TextDecoder().decode(record.bytes)));
    const result = validateExportPresets(data);
    if (!result.valid)
      throw new StorageError(`保存済みの出力設定が不正です: ${result.errors.join(' / ')}`);
    return data as unknown as ExportPresetFile;
  });
}
