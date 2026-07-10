import type { Asset, Project } from '../model';
import { migrateAsset, migrateProject } from '../model';
import { validateAsset, validateProject } from '../schema/validate';
import {
  INDEX_BY_PROJECT,
  STORE_ASSETS,
  STORE_BLOBS,
  STORE_PROJECTS,
  STORE_SNAPSHOTS,
  STORE_TRASH,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';
import { deleteSnapshotsForAssetInTx } from './snapshotStore';

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

/** ごみ箱（trash ストア）の 1 レコード。id は元の project.id をそのまま使う。 */
interface TrashRecord {
  id: string;
  deletedAt: string;
  project: Project;
  assets: Asset[];
}

/** ごみ箱に保持するプロジェクト数の上限（2D-1B-STORAGE §B）。 */
export const TRASH_LIMIT = 5;

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

export interface ProjectBundleBlobInput {
  key: string;
  blob: Blob;
}

/**
 * project + assets[] + blobs[] をまとめて原子的に保存する（2D-1B-STORAGE §A）。
 * Blob → ArrayBuffer の変換はトランザクション開始前に済ませ、
 * projects / assets / blobs への put は単一の readwrite トランザクションで行う。
 * 途中で失敗した場合は runTransaction が abort するため、一部だけが保存されることはない。
 *
 * .casproj の読み込み（HomeScreen）と、アセットの複製（EditorScreen の左右反転コピー）で使う。
 */
export async function saveProjectBundle(
  project: Project,
  assets: Asset[],
  blobs: ProjectBundleBlobInput[],
): Promise<void> {
  const projectResult = validateProject(project);
  if (!projectResult.valid) {
    throw new StorageError(formatValidationErrors('project', projectResult.errors));
  }
  for (const asset of assets) {
    const assetResult = validateAsset(asset);
    if (!assetResult.valid) {
      throw new StorageError(formatValidationErrors('asset', assetResult.errors));
    }
  }

  // IndexedDB リクエスト以外の非同期処理（Blob→ArrayBuffer 変換）はトランザクション開始前に
  // 済ませる（トランザクション内で待つと、ブラウザがアイドルと判断して自動コミットし得るため）。
  const updatedAt = new Date().toISOString();
  const blobRecords: StoredBlobRecord[] = await Promise.all(
    blobs.map(async ({ key, blob }) => ({
      key,
      projectId: project.id,
      mimeType: blob.type,
      bytes: await blob.arrayBuffer(),
      updatedAt,
    })),
  );

  await runTransaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readwrite', (tx) => {
    tx.objectStore(STORE_PROJECTS).put(project);
    for (const asset of assets) {
      const record: StoredAssetRecord = { id: asset.id, projectId: project.id, data: asset };
      tx.objectStore(STORE_ASSETS).put(record);
    }
    for (const record of blobRecords) {
      tx.objectStore(STORE_BLOBS).put(record);
    }
  });
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

/**
 * 完全削除（ごみ箱からの purge）で trash レコード・画像 Blob・復旧点をまとめて消す。
 * 呼び出し元のトランザクション（STORE_TRASH / STORE_BLOBS / STORE_SNAPSHOTS を含む）へ相乗りする。
 */
async function purgeTrashRecordInTx(tx: IDBTransaction, record: TrashRecord): Promise<void> {
  await requestToPromise(tx.objectStore(STORE_TRASH).delete(record.id));
  const blobKeys = await requestToPromise(
    tx.objectStore(STORE_BLOBS).index(INDEX_BY_PROJECT).getAllKeys(record.project.id),
  );
  for (const key of blobKeys) {
    await requestToPromise(tx.objectStore(STORE_BLOBS).delete(key));
  }
  for (const asset of record.assets) {
    await deleteSnapshotsForAssetInTx(tx, asset.id);
  }
}

/** ごみ箱が上限を超えていたら、最も古いものから完全削除する（同一 tx 内）。 */
async function enforceTrashLimitInTx(tx: IDBTransaction): Promise<void> {
  const allTrash = await requestToPromise(
    tx.objectStore(STORE_TRASH).getAll() as IDBRequest<TrashRecord[]>,
  );
  if (allTrash.length <= TRASH_LIMIT) {
    return;
  }
  const sorted = [...allTrash].sort((a, b) => (a.deletedAt < b.deletedAt ? -1 : 1));
  const overflow = sorted.slice(0, sorted.length - TRASH_LIMIT);
  for (const record of overflow) {
    await purgeTrashRecordInTx(tx, record);
  }
}

/**
 * プロジェクトをごみ箱へ移動する（2D-1B-STORAGE §B）。
 * project / assets は正本ストアから削除するが、画像 Blob は削除しない
 * （trash が参照を保持しており、復元できるようにするため）。
 * ごみ箱が上限（TRASH_LIMIT）を超えたら、同一トランザクション内で最も古いプロジェクトを
 * 完全削除する（Blob・復旧点も含めて消す）。
 */
export async function deleteProject(id: string): Promise<void> {
  await runTransaction(
    [STORE_PROJECTS, STORE_ASSETS, STORE_TRASH, STORE_BLOBS, STORE_SNAPSHOTS],
    'readwrite',
    async (tx) => {
      const project = await requestToPromise(
        tx.objectStore(STORE_PROJECTS).get(id) as IDBRequest<Project | undefined>,
      );
      if (!project) {
        // 既に存在しない（多重操作など）場合は何もしない
        return;
      }

      const assetRecords = await requestToPromise(
        tx.objectStore(STORE_ASSETS).index(INDEX_BY_PROJECT).getAll(id) as IDBRequest<
          StoredAssetRecord[]
        >,
      );
      const assets = assetRecords.map((record) => record.data);

      const trashRecord: TrashRecord = {
        id,
        deletedAt: new Date().toISOString(),
        project,
        assets,
      };
      await requestToPromise(tx.objectStore(STORE_TRASH).put(trashRecord));
      await requestToPromise(tx.objectStore(STORE_PROJECTS).delete(id));
      for (const record of assetRecords) {
        await requestToPromise(tx.objectStore(STORE_ASSETS).delete(record.id));
      }

      await enforceTrashLimitInTx(tx);
    },
  );
}

export interface TrashSummary {
  id: string;
  name: string;
  deletedAt: string;
  assetCount: number;
}

/** ごみ箱の一覧。削除が新しい順。 */
export async function listTrash(): Promise<TrashSummary[]> {
  const rows = await runTransaction([STORE_TRASH], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_TRASH).getAll() as IDBRequest<TrashRecord[]>),
  );
  return rows
    .map((record) => ({
      id: record.id,
      name: record.project.name,
      deletedAt: record.deletedAt,
      assetCount: record.assets.length,
    }))
    .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

/** ごみ箱からプロジェクトを復元する。project / assets を正本ストアへ書き戻し、trash レコードを消す。 */
export async function restoreProject(trashId: string): Promise<void> {
  await runTransaction([STORE_TRASH, STORE_PROJECTS, STORE_ASSETS], 'readwrite', async (tx) => {
    const record = await requestToPromise(
      tx.objectStore(STORE_TRASH).get(trashId) as IDBRequest<TrashRecord | undefined>,
    );
    if (!record) {
      throw new StorageError(`ごみ箱にプロジェクト（id: ${trashId}）が見つかりません`);
    }
    await requestToPromise(tx.objectStore(STORE_PROJECTS).put(record.project));
    for (const asset of record.assets) {
      const assetRecord: StoredAssetRecord = {
        id: asset.id,
        projectId: record.project.id,
        data: asset,
      };
      await requestToPromise(tx.objectStore(STORE_ASSETS).put(assetRecord));
    }
    await requestToPromise(tx.objectStore(STORE_TRASH).delete(trashId));
  });
}

/** ごみ箱から 1 件を完全に削除する（画像 Blob・復旧点も含めて消す）。 */
export async function purgeTrash(trashId: string): Promise<void> {
  await runTransaction([STORE_TRASH, STORE_BLOBS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
    const record = await requestToPromise(
      tx.objectStore(STORE_TRASH).get(trashId) as IDBRequest<TrashRecord | undefined>,
    );
    if (!record) {
      return;
    }
    await purgeTrashRecordInTx(tx, record);
  });
}

/** ごみ箱を空にする（全件完全削除）。 */
export async function purgeAllTrash(): Promise<void> {
  await runTransaction([STORE_TRASH, STORE_BLOBS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
    const rows = await requestToPromise(
      tx.objectStore(STORE_TRASH).getAll() as IDBRequest<TrashRecord[]>,
    );
    for (const record of rows) {
      await purgeTrashRecordInTx(tx, record);
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

/**
 * アセットと、そのアセットが所有する画像 Blob（`${assetId}/` prefix のキー）・復旧点を削除する。
 * 以前は assets ストアのみ削除しており、Blob が孤児として残るバグがあった。
 * 復旧点（snapshots）も削除しないと、存在しないアセットを指す孤児レコードとして残ってしまう。
 */
export async function deleteAsset(id: string): Promise<void> {
  await runTransaction([STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
    const assetRecord = await requestToPromise(
      tx.objectStore(STORE_ASSETS).get(id) as IDBRequest<StoredAssetRecord | undefined>,
    );
    await requestToPromise(tx.objectStore(STORE_ASSETS).delete(id));
    await deleteSnapshotsForAssetInTx(tx, id);
    if (!assetRecord) {
      return;
    }
    const prefix = `${id}/`;
    const blobKeys = await requestToPromise(
      tx.objectStore(STORE_BLOBS).index(INDEX_BY_PROJECT).getAllKeys(assetRecord.projectId),
    );
    for (const key of blobKeys) {
      if (typeof key === 'string' && key.startsWith(prefix)) {
        await requestToPromise(tx.objectStore(STORE_BLOBS).delete(key));
      }
    }
  });
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
