import { AutosaveQueue } from './autosave';
import { generateId } from '../model';
import { StorageError } from './db';
import {
  applySnapshotRestore,
  restoreSnapshot as inspectSnapshot,
  type RestoredSnapshot,
} from './snapshotStore';

export interface PreparedSnapshotRestore extends RestoredSnapshot {
  restoreToken: string;
}

const pendingRestores = new Map<string, RestoredSnapshot>();

/**
 * 保留中の autosave を先に確定し、その時点の正本と復旧点を対で読み出す。
 * 返したtokenのcommitだけが、この読み出し結果を使った復元を原子的に確定する。
 */
export async function prepareSnapshotRestore(id: string): Promise<PreparedSnapshotRestore> {
  await AutosaveQueue.flushAll();
  const restored = await inspectSnapshot(id);
  const restoreToken = generateId('restore');
  pendingRestores.set(restoreToken, restored);
  return { ...restored, restoreToken };
}

/**
 * 準備済みtokenを一度だけ消費し、準備時の正本が変わっていないことを検証してから
 * snapshot Assetとedit Blobを同一transactionで確定する。
 */
export async function commitSnapshotRestore(restoreToken: string): Promise<void> {
  const pending = pendingRestores.get(restoreToken);
  if (!pending) {
    throw new StorageError('復旧点の準備tokenが無効または使用済みのため、復元を中止しました');
  }
  pendingRestores.delete(restoreToken);

  await applySnapshotRestore({
    projectId: pending.projectId,
    assetId: pending.asset.id,
    blobKey: pending.blobKey,
    beforeAsset: pending.beforeAsset,
    beforeBlob: pending.beforeBlob,
    asset: pending.asset,
    blob: pending.blob,
  });
}

/** 準備後に画面処理が中断した場合、未使用tokenを明示的に破棄する。 */
export function cancelSnapshotRestore(restoreToken: string): void {
  pendingRestores.delete(restoreToken);
}
