import { AutosaveQueue } from './autosave';
import { StorageError } from './db';
import {
  saveAssetRevision as saveAssetRevisionBase,
  type AssetRevisionInput,
} from './projectStore';
import {
  applySnapshotRestore,
  restoreSnapshot as inspectSnapshot,
  type RestoredSnapshot,
} from './snapshotStore';

const pendingRestores = new Map<string, RestoredSnapshot>();

function sameAsset(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasSourceTransitions(input: AssetRevisionInput): boolean {
  return (
    (input.sourceBlobTransitions?.createKeys?.length ?? 0) > 0 ||
    (input.sourceBlobTransitions?.deleteKeys?.length ?? 0) > 0
  );
}

/**
 * 保留中の autosave を先に確定し、その時点の正本と復旧点を対で読み出す。
 * 続く saveAssetRevision は、この読み出し結果を使った復元だけを原子的に確定する。
 */
export async function restoreSnapshot(id: string): Promise<RestoredSnapshot> {
  await AutosaveQueue.flushAll();
  const restored = await inspectSnapshot(id);
  pendingRestores.set(restored.asset.id, restored);
  return restored;
}

/**
 * 通常改訂は projectStore の実装へ委譲する。
 * 復旧点の読み出し直後だけ、準備時の正本が変わっていないことを検証してから
 * snapshot Asset と edit Blob を同一 transaction で確定する。
 */
export async function saveAssetRevision(input: AssetRevisionInput): Promise<void> {
  const pending = pendingRestores.get(input.asset.id);
  if (!pending) {
    await saveAssetRevisionBase(input);
    return;
  }

  pendingRestores.delete(input.asset.id);

  const putBlobs = input.putBlobs ?? [];
  const deleteBlobKeys = input.deleteBlobKeys ?? [];
  if (
    input.projectId !== pending.projectId ||
    !sameAsset(input.asset, pending.asset) ||
    putBlobs.length !== 1 ||
    putBlobs[0].key !== pending.blobKey ||
    deleteBlobKeys.length > 0 ||
    hasSourceTransitions(input)
  ) {
    throw new StorageError(
      '復旧点の準備後に別の保存操作が指定されたため、復元を中止しました',
    );
  }

  const targetBytes = new Uint8Array(await pending.blob.arrayBuffer());
  const requestedBytes = new Uint8Array(await putBlobs[0].blob.arrayBuffer());
  if (
    targetBytes.length !== requestedBytes.length ||
    !targetBytes.every((value, index) => value === requestedBytes[index])
  ) {
    throw new StorageError('復旧点と異なる編集画像が指定されたため、復元を中止しました');
  }

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
