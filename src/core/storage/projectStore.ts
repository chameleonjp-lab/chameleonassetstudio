import type { Asset, Project, TextureRef } from '../model';
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

function blobKeyForAssetPath(assetId: string, path: string): string {
  return `${assetId}/${path}`;
}

interface TextureIndex {
  byId: Map<string, TextureRef>;
  byKey: Map<string, TextureRef>;
}

function buildTextureIndex(asset: Asset, label: string): TextureIndex {
  const byId = new Map<string, TextureRef>();
  const byKey = new Map<string, TextureRef>();
  for (const texture of asset.textures) {
    if (byId.has(texture.id)) {
      throw new StorageError(`${label} に同じ TextureRef ID が複数存在します: ${texture.id}`);
    }
    const key = blobKeyForAssetPath(asset.id, texture.path);
    if (byKey.has(key)) {
      throw new StorageError(`${label} で同じ Blob key を複数 TextureRef が参照しています: ${key}`);
    }
    byId.set(texture.id, texture);
    byKey.set(key, texture);
  }
  return { byId, byKey };
}

function sameTextureRef(left: TextureRef, right: TextureRef): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.name === right.name &&
    left.mimeType === right.mimeType &&
    left.path === right.path &&
    left.size.width === right.size.width &&
    left.size.height === right.size.height
  );
}

function assertTextureRefsUnchanged(previousAsset: Asset, nextAsset: Asset): void {
  const previous = buildTextureIndex(previousAsset, '保存前 Asset');
  const next = buildTextureIndex(nextAsset, '保存後 Asset');
  if (previous.byId.size !== next.byId.size) {
    throw new StorageError('TextureRef を変更する保存には saveAssetRevision を使用してください');
  }
  for (const [id, previousTexture] of previous.byId) {
    const nextTexture = next.byId.get(id);
    if (!nextTexture || !sameTextureRef(previousTexture, nextTexture)) {
      throw new StorageError('TextureRef を変更する保存には saveAssetRevision を使用してください');
    }
  }
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

interface PreparedBlobRecordInput {
  key: string;
  projectId: string;
  blob: Blob;
}

function assertDistinctBlobOperations(
  putBlobs: Array<{ key: string }>,
  deleteBlobKeys: string[],
): void {
  const putKeys = new Set<string>();
  for (const { key } of putBlobs) {
    if (!key) {
      throw new StorageError('Blob key が空です');
    }
    if (putKeys.has(key)) {
      throw new StorageError(`同じ Blob key が複数回保存対象に指定されています: ${key}`);
    }
    putKeys.add(key);
  }

  const deleteKeys = new Set<string>();
  for (const key of deleteBlobKeys) {
    if (!key) {
      throw new StorageError('削除する Blob key が空です');
    }
    if (deleteKeys.has(key)) {
      throw new StorageError(`同じ Blob key が複数回削除対象に指定されています: ${key}`);
    }
    if (putKeys.has(key)) {
      throw new StorageError(`同じ Blob key を保存と削除へ同時に指定できません: ${key}`);
    }
    deleteKeys.add(key);
  }
}

function assertBlobOperationsBelongToAsset(
  assetId: string,
  putBlobs: Array<{ key: string }>,
  deleteBlobKeys: string[],
): void {
  const prefix = `${assetId}/`;
  for (const { key } of putBlobs) {
    if (!key.startsWith(prefix)) {
      throw new StorageError(
        `Blob key は対象アセットの prefix（${prefix}）配下である必要があります: ${key}`,
      );
    }
  }
  for (const key of deleteBlobKeys) {
    if (!key.startsWith(prefix)) {
      throw new StorageError(
        `削除する Blob key は対象アセットの prefix（${prefix}）配下である必要があります: ${key}`,
      );
    }
  }
}

async function prepareBlobRecords(blobs: PreparedBlobRecordInput[]): Promise<StoredBlobRecord[]> {
  const updatedAt = new Date().toISOString();
  return Promise.all(
    blobs.map(async ({ key, projectId, blob }) => ({
      key,
      projectId,
      mimeType: blob.type,
      bytes: await blob.arrayBuffer(),
      updatedAt,
    })),
  );
}

/**
 * project + assets[] + blobs[] をまとめて原子的に保存する（2D-1B-STORAGE §A）。
 * 新規 Asset 作成、.casproj 読み込み、複製で使う。既存 Asset の改訂には
 * saveAssetRevision を使う。
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
    buildTextureIndex(asset, `Asset（id: ${asset.id}）`);
  }

  assertDistinctBlobOperations(blobs, []);
  const blobRecords = await prepareBlobRecords(
    blobs.map(({ key, blob }) => ({ key, projectId: project.id, blob })),
  );

  await runTransaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readwrite', (tx) => {
    tx.objectStore(STORE_PROJECTS).put(project);
    for (const asset of assets) {
      const record: StoredAssetRecord = {
        id: asset.id,
        projectId: project.id,
        data: asset,
      };
      tx.objectStore(STORE_ASSETS).put(record);
    }
    for (const record of blobRecords) {
      tx.objectStore(STORE_BLOBS).put(record);
    }
  });
}

export interface SourceBlobTransitions {
  createKeys?: string[];
  deleteKeys?: string[];
}

function assertUniqueTransitionKeys(label: string, keys: string[]): Set<string> {
  const result = new Set<string>();
  for (const key of keys) {
    if (!key) {
      throw new StorageError(`${label} に空の source Blob key は指定できません`);
    }
    if (result.has(key)) {
      throw new StorageError(`${label} に同じ source Blob key が複数指定されています: ${key}`);
    }
    result.add(key);
  }
  return result;
}

function assertExactKeySet(label: string, actual: Set<string>, expected: Set<string>): void {
  for (const key of actual) {
    if (!expected.has(key)) {
      throw new StorageError(`${label}が実際の source 遷移と一致しません: ${key}`);
    }
  }
  for (const key of expected) {
    if (!actual.has(key)) {
      throw new StorageError(`${label}が必要です: ${key}`);
    }
  }
}

function assertExistingSourceUnchanged(previous: TextureRef, next: TextureRef): void {
  if (!sameTextureRef(previous, next)) {
    throw new StorageError(`既存 source TextureRef は通常改訂で変更できません: ${previous.id}`);
  }
}

function assertTextureBlobTransitions({
  previousAsset,
  nextAsset,
  putBlobKeys,
  deleteBlobKeys,
  transitions,
}: {
  previousAsset: Asset;
  nextAsset: Asset;
  putBlobKeys: Set<string>;
  deleteBlobKeys: Set<string>;
  transitions: SourceBlobTransitions;
}): void {
  const previous = buildTextureIndex(previousAsset, '保存前 Asset');
  const next = buildTextureIndex(nextAsset, '保存後 Asset');
  const createKeys = assertUniqueTransitionKeys('source create 許可', transitions.createKeys ?? []);
  const deleteKeys = assertUniqueTransitionKeys('source delete 許可', transitions.deleteKeys ?? []);

  for (const key of putBlobKeys) {
    if (!next.byKey.has(key)) {
      throw new StorageError(`保存対象 Blob に対応する TextureRef がありません: ${key}`);
    }
  }
  for (const key of deleteBlobKeys) {
    if (!previous.byKey.has(key)) {
      throw new StorageError(`削除対象 Blob に対応する保存前 TextureRef がありません: ${key}`);
    }
    if (next.byKey.has(key)) {
      throw new StorageError(`保存後 Asset が参照する Blob は削除できません: ${key}`);
    }
  }

  for (const [key, previousTexture] of previous.byKey) {
    const nextTexture = next.byKey.get(key);
    if (nextTexture && previousTexture.id !== nextTexture.id) {
      throw new StorageError(`既存 Blob key を別の TextureRef へ再割り当てできません: ${key}`);
    }
  }

  const addedSourceKeys = new Set<string>();
  const removedSourceKeys = new Set<string>();

  for (const [id, previousTexture] of previous.byId) {
    const nextTexture = next.byId.get(id);
    const previousKey = blobKeyForAssetPath(previousAsset.id, previousTexture.path);
    if (!nextTexture) {
      if (!deleteBlobKeys.has(previousKey)) {
        throw new StorageError(
          `削除された TextureRef に対応する Blob が削除対象にありません: ${previousKey}`,
        );
      }
      if (previousTexture.kind === 'source') {
        removedSourceKeys.add(previousKey);
      }
      continue;
    }

    const nextKey = blobKeyForAssetPath(nextAsset.id, nextTexture.path);
    if (previousTexture.kind === 'source') {
      assertExistingSourceUnchanged(previousTexture, nextTexture);
      if (putBlobKeys.has(previousKey)) {
        throw new StorageError(`既存 source Blob は上書きできません: ${previousKey}`);
      }
      if (deleteBlobKeys.has(previousKey)) {
        throw new StorageError(`既存 source Blob は削除できません: ${previousKey}`);
      }
    } else if (nextTexture.kind === 'source') {
      throw new StorageError(`既存 TextureRef を source へ変更できません: ${id}`);
    }

    if (previousKey !== nextKey) {
      if (!deleteBlobKeys.has(previousKey)) {
        throw new StorageError(`変更前 TextureRef の Blob が削除対象にありません: ${previousKey}`);
      }
      if (!putBlobKeys.has(nextKey)) {
        throw new StorageError(`変更後 TextureRef の Blob が保存対象にありません: ${nextKey}`);
      }
    }
  }

  for (const [id, nextTexture] of next.byId) {
    if (previous.byId.has(id)) {
      continue;
    }
    const nextKey = blobKeyForAssetPath(nextAsset.id, nextTexture.path);
    if (!putBlobKeys.has(nextKey)) {
      throw new StorageError(
        `新しい TextureRef に対応する Blob が保存対象にありません: ${nextKey}`,
      );
    }
    if (nextTexture.kind === 'source') {
      addedSourceKeys.add(nextKey);
    }
  }

  assertExactKeySet('source create 許可', createKeys, addedSourceKeys);
  assertExactKeySet('source delete 許可', deleteKeys, removedSourceKeys);
}

export interface AssetRevisionInput {
  projectId: string;
  asset: Asset;
  putBlobs?: ProjectBundleBlobInput[];
  deleteBlobKeys?: string[];
  sourceBlobTransitions?: SourceBlobTransitions;
}

/**
 * Asset と、その Asset 改訂に対応する Blob 追加・上書き・削除を単一 transaction で確定する。
 * Blob→ArrayBuffer の変換と Asset 検証は transaction 開始前に済ませる。
 */
export async function saveAssetRevision({
  projectId,
  asset,
  putBlobs = [],
  deleteBlobKeys = [],
  sourceBlobTransitions = {},
}: AssetRevisionInput): Promise<void> {
  const result = validateAsset(asset);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('asset', result.errors));
  }
  buildTextureIndex(asset, '保存後 Asset');
  assertDistinctBlobOperations(putBlobs, deleteBlobKeys);
  assertBlobOperationsBelongToAsset(asset.id, putBlobs, deleteBlobKeys);
  const blobRecords = await prepareBlobRecords(
    putBlobs.map(({ key, blob }) => ({ key, projectId, blob })),
  );
  const assetRecord: StoredAssetRecord = {
    id: asset.id,
    projectId,
    data: asset,
  };

  await runTransaction([STORE_ASSETS, STORE_BLOBS], 'readwrite', async (tx) => {
    const previousRecord = await requestToPromise(
      tx.objectStore(STORE_ASSETS).get(asset.id) as IDBRequest<StoredAssetRecord | undefined>,
    );
    if (!previousRecord) {
      throw new StorageError('改訂対象アセットが保存されていません');
    }
    if (previousRecord.projectId !== projectId) {
      throw new StorageError('改訂対象アセットは指定 Project に属していません');
    }
    assertTextureBlobTransitions({
      previousAsset: previousRecord.data,
      nextAsset: asset,
      putBlobKeys: new Set(putBlobs.map(({ key }) => key)),
      deleteBlobKeys: new Set(deleteBlobKeys),
      transitions: sourceBlobTransitions,
    });
    await requestToPromise(tx.objectStore(STORE_ASSETS).put(assetRecord));
    for (const record of blobRecords) {
      await requestToPromise(tx.objectStore(STORE_BLOBS).put(record));
    }
    for (const key of deleteBlobKeys) {
      await requestToPromise(tx.objectStore(STORE_BLOBS).delete(key));
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

export async function deleteProject(id: string): Promise<void> {
  await runTransaction(
    [STORE_PROJECTS, STORE_ASSETS, STORE_TRASH, STORE_BLOBS, STORE_SNAPSHOTS],
    'readwrite',
    async (tx) => {
      const project = await requestToPromise(
        tx.objectStore(STORE_PROJECTS).get(id) as IDBRequest<Project | undefined>,
      );
      if (!project) {
        return;
      }
      const assetRecords = await requestToPromise(
        tx.objectStore(STORE_ASSETS).index(INDEX_BY_PROJECT).getAll(id) as IDBRequest<
          StoredAssetRecord[]
        >,
      );
      const trashRecord: TrashRecord = {
        id,
        deletedAt: new Date().toISOString(),
        project,
        assets: assetRecords.map((record) => record.data),
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

/**
 * Asset JSON 単体の保存。新規 Asset の互換用初期保存と、既存 Asset の metadata-only
 * autosave に使う。既存 Asset の TextureRef 変更は saveAssetRevision へ寄せる。
 */
export async function saveAsset(projectId: string, asset: Asset): Promise<void> {
  const result = validateAsset(asset);
  if (!result.valid) {
    throw new StorageError(formatValidationErrors('asset', result.errors));
  }
  buildTextureIndex(asset, '保存対象 Asset');
  const record: StoredAssetRecord = { id: asset.id, projectId, data: asset };
  await runTransaction([STORE_ASSETS], 'readwrite', async (tx) => {
    const previousRecord = await requestToPromise(
      tx.objectStore(STORE_ASSETS).get(asset.id) as IDBRequest<StoredAssetRecord | undefined>,
    );
    if (previousRecord) {
      if (previousRecord.projectId !== projectId) {
        throw new StorageError('保存対象アセットは指定 Project に属していません');
      }
      assertTextureRefsUnchanged(previousRecord.data, asset);
    }
    await requestToPromise(tx.objectStore(STORE_ASSETS).put(record));
  });
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

export interface DeleteAssetBundleInput {
  project: Project;
  assetId: string;
}

export async function deleteAssetBundle({
  project,
  assetId,
}: DeleteAssetBundleInput): Promise<void> {
  const projectResult = validateProject(project);
  if (!projectResult.valid) {
    throw new StorageError(formatValidationErrors('project', projectResult.errors));
  }
  if (project.assets.some((entry) => entry.id === assetId)) {
    throw new StorageError(`削除対象アセット（id: ${assetId}）が Project に残っています`);
  }

  await runTransaction(
    [STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS],
    'readwrite',
    async (tx) => {
      const assetRecord = await requestToPromise(
        tx.objectStore(STORE_ASSETS).get(assetId) as IDBRequest<StoredAssetRecord | undefined>,
      );
      if (assetRecord && assetRecord.projectId !== project.id) {
        throw new StorageError(
          `削除対象アセット（id: ${assetId}）は Project（id: ${project.id}）に属していません`,
        );
      }
      await requestToPromise(tx.objectStore(STORE_PROJECTS).put(project));
      await requestToPromise(tx.objectStore(STORE_ASSETS).delete(assetId));
      await deleteSnapshotsForAssetInTx(tx, assetId);
      if (!assetRecord) {
        return;
      }
      const prefix = `${assetId}/`;
      const blobKeys = await requestToPromise(
        tx.objectStore(STORE_BLOBS).index(INDEX_BY_PROJECT).getAllKeys(assetRecord.projectId),
      );
      for (const key of blobKeys) {
        if (typeof key === 'string' && key.startsWith(prefix)) {
          await requestToPromise(tx.objectStore(STORE_BLOBS).delete(key));
        }
      }
    },
  );
}

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
