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

/** アセットあたりに保持する復旧点（snapshot）の最大数（2D-1B-STORAGE §C）。 */
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

/** snapshots ストアの 1 レコード。破壊的画像編集の直前状態をまとめて保持する。 */
export interface AssetSnapshotRecord {
  id: string;
  projectId: string;
  assetId: string;
  createdAt: string;
  /** 操作ラベル（例: 「消しゴム」「輪郭線」）。復元 UI とコミット履歴に使う。 */
  label: string;
  /** 操作前の Asset（layers / textures のサイズなど）。 */
  asset: Asset;
  /** 操作前の編集用画像 Blob。 */
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
  /** 上書き前の Asset（そのまま保存する）。 */
  asset: Asset;
  /** 上書き対象の edit Blob キー（asset.json の textures[].path と対応）。 */
  blobKey: string;
  /** 上書き前の edit Blob。 */
  blob: Blob;
}

function blobKeyForTexture(assetId: string, texture: TextureRef): string {
  return `${assetId}/${texture.path}`;
}

function findEditTexture(asset: Asset, blobKey: string): TextureRef | undefined {
  return asset.textures.find(
    (texture) => texture.kind === 'edit' && blobKeyForTexture(asset.id, texture) === blobKey,
  );
}

function assertValidSnapshotAsset(asset: Asset, assetId: string, blobKey: string): TextureRef {
  if (asset.id !== assetId) {
    throw new StorageError(
      `復旧点の Asset ID（${asset.id}）が対象アセット（${assetId}）と一致しません`,
    );
  }
  const result = validateAsset(asset);
  if (!result.valid) {
    throw new StorageError(`復旧点の Asset 内容が不正です: ${result.errors.join(' / ')}`);
  }
  const texture = findEditTexture(asset, blobKey);
  if (!texture) {
    throw new StorageError(`復旧点の Blob key は対象アセットの edit TextureRef に対応しません: ${blobKey}`);
  }
  return texture;
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

function assertSourceTexturesUnchanged(current: Asset, snapshot: Asset): void {
  const currentSources = current.textures.filter((texture) => texture.kind === 'source');
  const snapshotSources = snapshot.textures.filter((texture) => texture.kind === 'source');
  if (currentSources.length !== snapshotSources.length) {
    throw new StorageError('復旧点で source TextureRef の追加・削除はできません');
  }
  const snapshotById = new Map(snapshotSources.map((texture) => [texture.id, texture]));
  for (const currentSource of currentSources) {
    const snapshotSource = snapshotById.get(currentSource.id);
    if (!snapshotSource || !sameTextureRef(currentSource, snapshotSource)) {
      throw new StorageError(`復旧点で source TextureRef は変更できません: ${currentSource.id}`);
    }
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

function assertStoredAssetOwnership(
  stored: StoredAssetRecord | undefined,
  projectId: string,
  assetId: string,
): asserts stored is StoredAssetRecord {
  if (!stored) {
    throw new StorageError(`復旧対象アセット（id: ${assetId}）が見つかりません`);
  }
  if (stored.projectId !== projectId) {
    throw new StorageError(
      `復旧対象アセット（id: ${assetId}）は Project（id: ${projectId}）に属していません`,
    );
  }
}

/**
 * スナップショット（Project + Asset 単位で最大 SNAPSHOT_LIMIT_PER_ASSET 件）を保存する。
 * 保存前に、対象 Asset の所有境界、source 不変性、edit TextureRef と Blob の対応を検証する。
 */
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

  await runTransaction(
    [STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS],
    'readwrite',
    async (tx) => {
      const storedAsset = await loadStoredAssetInTx(tx, input.assetId);
      assertStoredAssetOwnership(storedAsset, input.projectId, input.assetId);
      assertSourceTexturesUnchanged(storedAsset.data, input.asset);

      const currentEditTexture = findEditTexture(storedAsset.data, input.blobKey);
      if (!currentEditTexture || currentEditTexture.id !== snapshotEditTexture.id) {
        throw new StorageError(
          `復旧点の edit TextureRef が保存中アセットと一致しません: ${input.blobKey}`,
        );
      }
      const currentBlob = await loadStoredBlobInTx(tx, input.blobKey);
      if (!currentBlob || currentBlob.projectId !== input.projectId) {
        throw new StorageError(`復旧点の対象 edit Blob が見つかりません: ${input.blobKey}`);
      }

      await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).put(record));
      await enforceSnapshotLimitInTx(tx, input.projectId, input.assetId);
    },
  );
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

/** アセット単位の復旧点一覧。現在保存されている Asset の Project に属するものだけを新しい順で返す。 */
export async function listSnapshots(assetId: string): Promise<AssetSnapshotSummary[]> {
  const rows = await runTransaction([STORE_ASSETS, STORE_SNAPSHOTS], 'readonly', async (tx) => {
    const storedAsset = await loadStoredAssetInTx(tx, assetId);
    if (!storedAsset) {
      return [];
    }
    const snapshots = await requestToPromise(
      tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
        AssetSnapshotRecord[]
      >,
    );
    return snapshots.filter((row) => row.projectId === storedAsset.projectId);
  });
  return rows
    .map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RestoredSnapshot {
  asset: Asset;
  blobKey: string;
  blob: Blob;
  /** 復元直前の正本。UI の Undo 登録に利用できる。 */
  beforeAsset: Asset;
  /** 復元直前の edit Blob。欠落している場合は復元自体を拒否する。 */
  beforeBlob: Blob;
}

/**
 * 復旧点を読み出す。
 * 現在の正本 Asset と snapshot の Project / Asset 所有境界、source 不変性、edit Blob の存在を
 * 同一 readonly transaction で確認する。書き戻しは呼び出し側が saveAssetRevision で行う。
 */
export async function restoreSnapshot(id: string): Promise<RestoredSnapshot> {
  return runTransaction(
    [STORE_SNAPSHOTS, STORE_ASSETS, STORE_BLOBS],
    'readonly',
    async (tx) => {
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
        asset: record.asset,
        blobKey: record.blob.key,
        blob: new Blob([record.blob.bytes], { type: record.blob.mimeType }),
        beforeAsset: storedAsset.data,
        beforeBlob: new Blob([currentBlob.bytes], { type: currentBlob.mimeType }),
      };
    },
  );
}

/**
 * 既存トランザクションへ相乗りしてアセットの全復旧点を削除する。
 * Project ID を指定した場合は、その所有範囲だけを削除する。
 */
export async function deleteSnapshotsForAssetInTx(
  tx: IDBTransaction,
  assetId: string,
  projectId?: string,
): Promise<void> {
  const records = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
      AssetSnapshotRecord[]
    >,
  );
  for (const record of records) {
    if (projectId === undefined || record.projectId === projectId) {
      await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).delete(record.id));
    }
  }
}

/** 単独のトランザクションでアセットの全復旧点を削除する。 */
export async function deleteSnapshotsForAsset(assetId: string): Promise<void> {
  await runTransaction([STORE_SNAPSHOTS], 'readwrite', (tx) =>
    deleteSnapshotsForAssetInTx(tx, assetId),
  );
}
