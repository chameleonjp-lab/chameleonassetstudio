import { generateId, type Asset, type TextureRef } from '../model';
import { validateAsset } from '../schema/validate';
import {
  INDEX_BY_ASSET,
  STORE_ASSETS,
  STORE_BLOBS,
  STORE_SNAPSHOTS,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

export const SNAPSHOT_LIMIT_PER_ASSET = 3;

interface StoredAssetRecord {
  id: string;
  projectId: string;
  data: Asset;
}

interface StoredBlobRecord {
  key: string;
  projectId: string;
  mimeType: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

interface AssetSnapshotRecord {
  id: string;
  projectId: string;
  assetId: string;
  createdAt: string;
  label: string;
  asset: Asset;
  blob: {
    key: string;
    mimeType: string;
    bytes: ArrayBuffer;
  };
}

export interface SaveSnapshotInput {
  projectId: string;
  assetId: string;
  label: string;
  asset: Asset;
  blobKey: string;
  blob: Blob;
}

function blobKeyForTexture(assetId: string, texture: TextureRef): string {
  return `${assetId}/${texture.path}`;
}

function sourceTextures(asset: Asset): TextureRef[] {
  return asset.textures.filter((texture) => texture.kind === 'source');
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

function assertSourceTexturesUnchanged(previous: Asset, next: Asset): void {
  const previousSources = sourceTextures(previous);
  const nextById = new Map(sourceTextures(next).map((texture) => [texture.id, texture]));
  if (previousSources.length !== nextById.size) {
    throw new StorageError('復旧点では source TextureRef を変更できません');
  }
  for (const texture of previousSources) {
    const nextTexture = nextById.get(texture.id);
    if (!nextTexture || !sameTextureRef(texture, nextTexture)) {
      throw new StorageError(`復旧点では source TextureRef を変更できません: ${texture.id}`);
    }
  }
}

function findEditTexture(asset: Asset, blobKey: string): TextureRef | undefined {
  return asset.textures.find(
    (texture) => texture.kind === 'edit' && blobKeyForTexture(asset.id, texture) === blobKey,
  );
}

function assertValidSnapshotAsset(asset: Asset, assetId: string, blobKey: string): TextureRef {
  const result = validateAsset(asset);
  if (!result.valid) {
    throw new StorageError(`復旧点のAssetが不正です: ${result.errors.join(' / ')}`);
  }
  if (asset.id !== assetId) {
    throw new StorageError(
      `復旧点のAsset IDが一致しません: expected=${assetId}, actual=${asset.id}`,
    );
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const texture of asset.textures) {
    if (ids.has(texture.id)) {
      throw new StorageError(`復旧点のAssetに同じTextureRef IDがあります: ${texture.id}`);
    }
    const key = blobKeyForTexture(asset.id, texture);
    if (keys.has(key)) {
      throw new StorageError(`復旧点のAssetで同じBlob keyが参照されています: ${key}`);
    }
    ids.add(texture.id);
    keys.add(key);
  }
  const editTexture = findEditTexture(asset, blobKey);
  if (!editTexture) {
    throw new StorageError(`復旧点のBlob keyに対応するedit TextureRefがありません: ${blobKey}`);
  }
  return editTexture;
}

function assertStoredAssetOwnership(
  record: StoredAssetRecord | undefined,
  projectId: string,
  assetId: string,
): asserts record is StoredAssetRecord {
  if (!record) {
    throw new StorageError(`復旧対象アセット（id: ${assetId}）が保存されていません`);
  }
  if (record.projectId !== projectId) {
    throw new StorageError(`復旧対象アセットはProject（id: ${projectId}）に属していません`);
  }
}

async function loadStoredAssetInTx(
  tx: IDBTransaction,
  assetId: string,
): Promise<StoredAssetRecord | undefined> {
  return requestToPromise(
    tx.objectStore(STORE_ASSETS).get(assetId) as IDBRequest<StoredAssetRecord | undefined>,
  );
}

async function loadStoredBlobInTx(
  tx: IDBTransaction,
  key: string,
): Promise<StoredBlobRecord | undefined> {
  return requestToPromise(
    tx.objectStore(STORE_BLOBS).get(key) as IDBRequest<StoredBlobRecord | undefined>,
  );
}

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameAsset(left: Asset, right: Asset): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function saveSnapshot(input: SaveSnapshotInput): Promise<void> {
  const snapshotEditTexture = assertValidSnapshotAsset(input.asset, input.assetId, input.blobKey);
  const bytes = await input.blob.arrayBuffer();
  const record: AssetSnapshotRecord = {
    id: generateId('snapshot'),
    projectId: input.projectId,
    assetId: input.assetId,
    createdAt: new Date().toISOString(),
    label: input.label,
    asset: input.asset,
    blob: {
      key: input.blobKey,
      mimeType: input.blob.type,
      bytes,
    },
  };

  await runTransaction([STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS], 'readwrite', async (tx) => {
    const storedAsset = await loadStoredAssetInTx(tx, input.assetId);
    assertStoredAssetOwnership(storedAsset, input.projectId, input.assetId);
    assertSourceTexturesUnchanged(storedAsset.data, input.asset);

    const currentEditTexture = findEditTexture(storedAsset.data, input.blobKey);
    if (!currentEditTexture || currentEditTexture.id !== snapshotEditTexture.id) {
      throw new StorageError(
        `復旧点の edit TextureRef が保存中アセットと一致しません: ${input.blobKey}`,
      );
    }
    const storedBlob = await loadStoredBlobInTx(tx, input.blobKey);
    if (!storedBlob || storedBlob.projectId !== input.projectId) {
      throw new StorageError(`復旧点対象の edit Blob が見つかりません: ${input.blobKey}`);
    }
    if (!sameBytes(storedBlob.bytes, bytes) || storedBlob.mimeType !== input.blob.type) {
      throw new StorageError(
        `復旧点へ渡された edit Blob が現在の保存済みBlobと一致しません: ${input.blobKey}`,
      );
    }

    await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).put(record));
    await enforceSnapshotLimitInTx(tx, input.projectId, input.assetId);
  });
}

async function enforceSnapshotLimitInTx(
  tx: IDBTransaction,
  projectId: string,
  assetId: string,
): Promise<void> {
  const existing = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
      AssetSnapshotRecord[]
    >,
  );
  const owned = existing.filter((record) => record.projectId === projectId);
  if (owned.length <= SNAPSHOT_LIMIT_PER_ASSET) {
    return;
  }
  const sorted = [...owned].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const overflow = sorted.slice(0, sorted.length - SNAPSHOT_LIMIT_PER_ASSET);
  for (const old of overflow) {
    await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).delete(old.id));
  }
}

export interface AssetSnapshotSummary {
  id: string;
  label: string;
  createdAt: string;
}

export async function listSnapshots(assetId: string): Promise<AssetSnapshotSummary[]> {
  const rows = await runTransaction([STORE_ASSETS, STORE_SNAPSHOTS], 'readonly', async (tx) => {
    const storedAsset = await loadStoredAssetInTx(tx, assetId);
    const snapshots = await requestToPromise(
      tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
        AssetSnapshotRecord[]
      >,
    );
    if (!storedAsset) {
      return snapshots;
    }
    return snapshots.filter((row) => row.projectId === storedAsset.projectId);
  });
  return rows
    .map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RestoredSnapshot {
  projectId: string;
  asset: Asset;
  blobKey: string;
  blob: Blob;
  beforeAsset: Asset;
  beforeBlob: Blob;
}

export async function restoreSnapshot(id: string): Promise<RestoredSnapshot> {
  return runTransaction([STORE_SNAPSHOTS, STORE_ASSETS, STORE_BLOBS], 'readonly', async (tx) => {
    const record = await requestToPromise(
      tx.objectStore(STORE_SNAPSHOTS).get(id) as IDBRequest<AssetSnapshotRecord | undefined>,
    );
    if (!record) {
      throw new StorageError(`復旧点（id: ${id}）が見つかりません`);
    }

    const snapshotEditTexture = assertValidSnapshotAsset(
      record.asset,
      record.assetId,
      record.blob.key,
    );
    const storedAsset = await loadStoredAssetInTx(tx, record.assetId);
    assertStoredAssetOwnership(storedAsset, record.projectId, record.assetId);
    assertSourceTexturesUnchanged(storedAsset.data, record.asset);

    const currentEditTexture = findEditTexture(storedAsset.data, record.blob.key);
    if (!currentEditTexture || currentEditTexture.id !== snapshotEditTexture.id) {
      throw new StorageError(
        `復旧点の edit TextureRef が現在のアセットと一致しません: ${record.blob.key}`,
      );
    }
    const currentBlob = await loadStoredBlobInTx(tx, record.blob.key);
    if (!currentBlob || currentBlob.projectId !== record.projectId) {
      throw new StorageError(`復元前の edit Blob が見つかりません: ${record.blob.key}`);
    }

    return {
      projectId: record.projectId,
      asset: record.asset,
      blobKey: record.blob.key,
      blob: new Blob([record.blob.bytes], { type: record.blob.mimeType }),
      beforeAsset: storedAsset.data,
      beforeBlob: new Blob([currentBlob.bytes], { type: currentBlob.mimeType }),
    };
  });
}

export interface ApplySnapshotRestoreInput {
  projectId: string;
  assetId: string;
  blobKey: string;
  beforeAsset: Asset;
  beforeBlob: Blob;
  asset: Asset;
  blob: Blob;
}

export async function applySnapshotRestore(input: ApplySnapshotRestoreInput): Promise<void> {
  const beforeEditTexture = assertValidSnapshotAsset(
    input.beforeAsset,
    input.assetId,
    input.blobKey,
  );
  const nextEditTexture = assertValidSnapshotAsset(input.asset, input.assetId, input.blobKey);
  if (beforeEditTexture.id !== nextEditTexture.id) {
    throw new StorageError(`復旧前後の edit TextureRef が一致しません: ${input.blobKey}`);
  }
  assertSourceTexturesUnchanged(input.beforeAsset, input.asset);

  const beforeBytes = await input.beforeBlob.arrayBuffer();
  const nextBytes = await input.blob.arrayBuffer();

  await runTransaction([STORE_ASSETS, STORE_BLOBS], 'readwrite', async (tx) => {
    const storedAsset = await loadStoredAssetInTx(tx, input.assetId);
    assertStoredAssetOwnership(storedAsset, input.projectId, input.assetId);
    if (!sameAsset(storedAsset.data, input.beforeAsset)) {
      throw new StorageError('復旧点を読み出した後にアセットが変更されたため、復元を中止しました');
    }
    assertSourceTexturesUnchanged(storedAsset.data, input.asset);

    const currentEditTexture = findEditTexture(storedAsset.data, input.blobKey);
    if (!currentEditTexture || currentEditTexture.id !== nextEditTexture.id) {
      throw new StorageError(
        `復旧対象の edit TextureRef が現在のアセットと一致しません: ${input.blobKey}`,
      );
    }

    const storedBlob = await loadStoredBlobInTx(tx, input.blobKey);
    if (!storedBlob || storedBlob.projectId !== input.projectId) {
      throw new StorageError(`復元前の edit Blob が見つかりません: ${input.blobKey}`);
    }
    if (!sameBytes(storedBlob.bytes, beforeBytes)) {
      throw new StorageError('復旧点を読み出した後に編集画像が変更されたため、復元を中止しました');
    }

    const nextAssetRecord: StoredAssetRecord = {
      id: input.assetId,
      projectId: input.projectId,
      data: input.asset,
    };
    const nextBlobRecord: StoredBlobRecord = {
      key: input.blobKey,
      projectId: input.projectId,
      mimeType: input.blob.type,
      bytes: nextBytes,
      updatedAt: new Date().toISOString(),
    };
    await requestToPromise(tx.objectStore(STORE_ASSETS).put(nextAssetRecord));
    await requestToPromise(tx.objectStore(STORE_BLOBS).put(nextBlobRecord));
  });
}

export async function deleteSnapshotsForAssetInTx(
  tx: IDBTransaction,
  projectId: string,
  assetId: string,
): Promise<void> {
  const records = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
      AssetSnapshotRecord[]
    >,
  );
  for (const record of records) {
    if (record.projectId === projectId) {
      await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).delete(record.id));
    }
  }
}

export async function deleteSnapshotsForAsset(projectId: string, assetId: string): Promise<void> {
  await runTransaction([STORE_SNAPSHOTS], 'readwrite', (tx) =>
    deleteSnapshotsForAssetInTx(tx, projectId, assetId),
  );
}
