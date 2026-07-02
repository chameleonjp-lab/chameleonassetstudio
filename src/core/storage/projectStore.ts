import type { Asset, Project } from '../model';
import { migrateAsset, migrateProject } from '../model';
import { validateAsset, validateProject } from '../schema/validate';
import {
  INDEX_BY_PROJECT,
  STORE_ASSETS,
  STORE_BLOBS,
  STORE_PROJECTS,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

/** assets ストアの 1 レコード。asset 本体に projectId を持たせず、レコード側で持つ。 */
interface StoredAssetRecord {
  id: string;
  projectId: string;
  data: Asset;
}

/**
 * blobs ストアの 1 レコード。
 * Blob をそのまま入れず ArrayBuffer で保存する（ブラウザ差による Blob 保存の不具合を避ける）。
 */
interface StoredBlobRecord {
  key: string;
  projectId: string;
  mimeType: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

function formatValidationErrors(label: string, errors: string[]): string {
  return `${label} の内容が不正です: ${errors.join(' / ')}`;
}

/** プロジェクトを保存する。自動保存前の検証（要件 14）もここで行う。 */
export async function saveProject(project: Project): Promise<void> {
  const result = validateProject(project);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('project', result.errors));
  }
  await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_PROJECTS).put(project)),
  );
}

export interface LoadedProject {
  project: Project;
  /** 古い形式から移行した場合の適用ログ。 */
  appliedMigrations: string[];
}

export async function loadProject(id: string): Promise<LoadedProject> {
  const raw = await runTransaction([STORE_PROJECTS], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_PROJECTS).get(id)),
  );
  if (raw === undefined) {
    throw new StorageError(`プロジェクト（id: ${id}）が見つかりません`);
  }
  const { data, appliedMigrations } = migrateProject(raw);
  const result = validateProject(data);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('project', result.errors));
  }
  return { project: data as unknown as Project, appliedMigrations };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await runTransaction([STORE_PROJECTS], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_PROJECTS).getAll() as IDBRequest<Project[]>),
  );
  return rows
    .map((project) => ({
      id: project.id,
      name: project.name,
      assetCount: Array.isArray(project.assets) ? project.assets.length : 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** プロジェクトと、そのアセット・画像 Blob をまとめて削除する。 */
export async function deleteProject(id: string): Promise<void> {
  await runTransaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_PROJECTS).delete(id));

    const assetKeys = await requestToPromise(
      tx.objectStore(STORE_ASSETS).index(INDEX_BY_PROJECT).getAllKeys(id),
    );
    for (const key of assetKeys) {
      await requestToPromise(tx.objectStore(STORE_ASSETS).delete(key));
    }

    const blobKeys = await requestToPromise(
      tx.objectStore(STORE_BLOBS).index(INDEX_BY_PROJECT).getAllKeys(id),
    );
    for (const key of blobKeys) {
      await requestToPromise(tx.objectStore(STORE_BLOBS).delete(key));
    }
  });
}

export async function saveAsset(projectId: string, asset: Asset): Promise<void> {
  const result = validateAsset(asset);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('asset', result.errors));
  }
  const record: StoredAssetRecord = { id: asset.id, projectId, data: asset };
  await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_ASSETS).put(record)),
  );
}

export interface LoadedAsset {
  asset: Asset;
  appliedMigrations: string[];
}

export async function loadAsset(id: string): Promise<LoadedAsset> {
  const record = await runTransaction([STORE_ASSETS], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_ASSETS).get(id) as IDBRequest<StoredAssetRecord>),
  );
  if (record === undefined) {
    throw new StorageError(`アセット（id: ${id}）が見つかりません`);
  }
  const { data, appliedMigrations } = migrateAsset(record.data);
  const result = validateAsset(data);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('asset', result.errors));
  }
  return { asset: data as unknown as Asset, appliedMigrations };
}

export async function listProjectAssets(projectId: string): Promise<Asset[]> {
  const records = await runTransaction([STORE_ASSETS], 'readonly', (tx) =>
    requestToPromise(
      tx.objectStore(STORE_ASSETS).index(INDEX_BY_PROJECT).getAll(projectId) as IDBRequest<
        StoredAssetRecord[]
      >,
    ),
  );
  return records.map((record) => record.data);
}

export async function deleteAsset(id: string): Promise<void> {
  await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_ASSETS).delete(id)),
  );
}

/** 画像 Blob を保存する。key は TextureRef.path と対応させる。 */
export async function saveBlob(projectId: string, key: string, blob: Blob): Promise<void> {
  const bytes = await blob.arrayBuffer();
  const record: StoredBlobRecord = {
    key,
    projectId,
    mimeType: blob.type,
    bytes,
    updatedAt: new Date().toISOString(),
  };
  await runTransaction([STORE_BLOBS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_BLOBS).put(record)),
  );
}

export async function loadBlob(key: string): Promise<Blob | null> {
  const record = await runTransaction([STORE_BLOBS], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_BLOBS).get(key) as IDBRequest<StoredBlobRecord>),
  );
  if (record === undefined) {
    return null;
  }
  return new Blob([record.bytes], { type: record.mimeType });
}

export async function deleteBlob(key: string): Promise<void> {
  await runTransaction([STORE_BLOBS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_BLOBS).delete(key)),
  );
}
