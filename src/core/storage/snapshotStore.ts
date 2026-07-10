import { generateId, type Asset } from '../model';
import {
  INDEX_BY_ASSET,
  STORE_SNAPSHOTS,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

/** アセットあたりに保持する復旧点（snapshot）の最大数（2D-1B-STORAGE §C）。 */
export const SNAPSHOT_LIMIT_PER_ASSET = 3;

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
  /** 操作前の画像 Blob。 */
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
  /** 上書き対象の Blob キー（asset.json の textures[].path と対応）。 */
  blobKey: string;
  /** 上書き前の Blob。 */
  blob: Blob;
}

/**
 * スナップショット（アセットあたり最大 SNAPSHOT_LIMIT_PER_ASSET 件、超過分は最古を同一 tx で削除する）を保存する。
 * @internal（tx 直渡し版）は deleteProject 等、既存トランザクションへ相乗りしたい呼び出し元向け。
 */
export async function saveSnapshot(input: SaveSnapshotInput): Promise<void> {
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
  await runTransaction([STORE_SNAPSHOTS], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).put(record));
    await enforceSnapshotLimitInTx(tx, input.assetId);
  });
}

async function enforceSnapshotLimitInTx(tx: IDBTransaction, assetId: string): Promise<void> {
  const existing = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
      AssetSnapshotRecord[]
    >,
  );
  if (existing.length <= SNAPSHOT_LIMIT_PER_ASSET) {
    return;
  }
  const sorted = [...existing].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
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

/** アセット単位の復旧点一覧。作成が新しい順。 */
export async function listSnapshots(assetId: string): Promise<AssetSnapshotSummary[]> {
  const rows = await runTransaction([STORE_SNAPSHOTS], 'readonly', (tx) =>
    requestToPromise(
      tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(assetId) as IDBRequest<
        AssetSnapshotRecord[]
      >,
    ),
  );
  return rows
    .map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface RestoredSnapshot {
  asset: Asset;
  blobKey: string;
  blob: Blob;
}

/** 復旧点を読み出す。書き戻しと asset の commit は呼び出し側（EditorScreen）が行う。 */
export async function restoreSnapshot(id: string): Promise<RestoredSnapshot> {
  const record = await runTransaction([STORE_SNAPSHOTS], 'readonly', (tx) =>
    requestToPromise(
      tx.objectStore(STORE_SNAPSHOTS).get(id) as IDBRequest<AssetSnapshotRecord | undefined>,
    ),
  );
  if (!record) {
    throw new StorageError(`復旧点（id: ${id}）が見つかりません`);
  }
  return {
    asset: record.asset,
    blobKey: record.blob.key,
    blob: new Blob([record.blob.bytes], { type: record.blob.mimeType }),
  };
}

/**
 * 既存トランザクションへ相乗りしてアセットの全復旧点を削除する。
 * プロジェクトのごみ箱化・完全削除で、当該プロジェクトの store 一覧に
 * STORE_SNAPSHOTS を含めた上で呼び出すことを想定する。
 */
export async function deleteSnapshotsForAssetInTx(
  tx: IDBTransaction,
  assetId: string,
): Promise<void> {
  const keys = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAllKeys(assetId),
  );
  for (const key of keys) {
    await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).delete(key));
  }
}

/** 単独のトランザクションでアセットの全復旧点を削除する。 */
export async function deleteSnapshotsForAsset(assetId: string): Promise<void> {
  await runTransaction([STORE_SNAPSHOTS], 'readwrite', (tx) =>
    deleteSnapshotsForAssetInTx(tx, assetId),
  );
}
