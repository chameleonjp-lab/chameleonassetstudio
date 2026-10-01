import type { Asset, Project } from '../model';
import { validateProject } from '../schema/validate';
import {
  INDEX_BY_ASSET,
  STORE_PROJECTS,
  STORE_ASSETS,
  STORE_BLOBS,
  STORE_SNAPSHOTS,
  StorageError,
  requestToPromise,
  runTransaction,
} from './db';

interface AssetRecord {
  id: string;
  projectId: string;
  data: Asset;
}
interface BlobRecord {
  key: string;
  projectId: string;
  mimeType: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}
interface SnapshotRecord {
  id: string;
  projectId: string;
  assetId: string;
}

/** セッション内履歴だけに保持する。既存の保存形式は変更しない。 */
export interface StructureState {
  project: Project;
  assetIds: string[];
  assets: AssetRecord[];
  blobs: BlobRecord[];
  snapshots: SnapshotRecord[];
}

export async function captureStructureState(
  projectId: string,
  assetIds: string[] = [],
): Promise<StructureState> {
  return runTransaction(
    [STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS],
    'readonly',
    async (tx) => {
      const project = await requestToPromise(
        tx.objectStore(STORE_PROJECTS).get(projectId) as IDBRequest<Project | undefined>,
      );
      if (!project) throw new StorageError('プロジェクトが見つかりません');
      const assets: AssetRecord[] = [];
      const blobs: BlobRecord[] = [];
      const snapshots: SnapshotRecord[] = [];
      for (const id of assetIds) {
        const record = await requestToPromise(
          tx.objectStore(STORE_ASSETS).get(id) as IDBRequest<AssetRecord | undefined>,
        );
        if (!record) continue;
        if (record.projectId !== projectId)
          throw new StorageError('別プロジェクトの素材は履歴へ含められません');
        assets.push(record);
        for (const texture of record.data.textures) {
          const blob = await requestToPromise(
            tx.objectStore(STORE_BLOBS).get(`${id}/${texture.path}`) as IDBRequest<
              BlobRecord | undefined
            >,
          );
          if (!blob || blob.projectId !== projectId)
            throw new StorageError('素材の画像が不足しています');
          blobs.push(blob);
        }
        const records = await requestToPromise(
          tx.objectStore(STORE_SNAPSHOTS).index(INDEX_BY_ASSET).getAll(id) as IDBRequest<
            SnapshotRecord[]
          >,
        );
        snapshots.push(...records.filter((snapshot) => snapshot.projectId === projectId));
      }
      return { project, assetIds: [...assetIds], assets, blobs, snapshots };
    },
  );
}

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const a = new Uint8Array(left),
    b = new Uint8Array(right);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function sameDocument(left: Project | Asset, right: Project | Asset): boolean {
  // 通常のUndoが日時だけを更新しても、前の構造操作を戻せる。
  const leftContent = { ...left, updatedAt: undefined };
  const rightContent = { ...right, updatedAt: undefined };
  return JSON.stringify(leftContent) === JSON.stringify(rightContent);
}

/** 対象素材の全画像・復旧点とProjectを同一transactionで戻す。他タブの変更は拒否する。 */
export async function applyStructureState(
  expected: StructureState,
  next: StructureState,
): Promise<void> {
  if (
    expected.project.id !== next.project.id ||
    JSON.stringify(expected.assetIds) !== JSON.stringify(next.assetIds)
  ) {
    throw new StorageError('履歴の対象が一致しません');
  }
  if (!validateProject(next.project).valid) throw new StorageError('履歴のプロジェクトが不正です');
  const retained = await runTransaction(
    [STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS, STORE_SNAPSHOTS],
    'readwrite',
    async (tx) => {
      const projects = tx.objectStore(STORE_PROJECTS);
      const assets = tx.objectStore(STORE_ASSETS);
      const blobs = tx.objectStore(STORE_BLOBS);
      const snapshots = tx.objectStore(STORE_SNAPSHOTS);
      const current = await requestToPromise(
        projects.get(expected.project.id) as IDBRequest<Project | undefined>,
      );
      if (!current || !sameDocument(current, expected.project))
        throw new StorageError('別の操作でプロジェクトが変更されたため、取り消しを中止しました');
      for (const id of expected.assetIds) {
        const stored = await requestToPromise(
          assets.get(id) as IDBRequest<AssetRecord | undefined>,
        );
        const previous = expected.assets.find((asset) => asset.id === id);
        if (
          stored?.projectId !== previous?.projectId ||
          (stored && previous && !sameDocument(stored.data, previous.data))
        ) {
          throw new StorageError('別の操作で素材が変更されたため、取り消しを中止しました');
        }
      }
      // 画像編集をUndoしても復旧点は残る。独立した追加・更新を上書きせず、
      // 素材を一時的に除去する場合は次のRedo用の状態へ一緒に退避する。
      const currentSnapshots: SnapshotRecord[] = [];
      for (const id of expected.assetIds) {
        const rows = await requestToPromise(
          snapshots.index(INDEX_BY_ASSET).getAll(id) as IDBRequest<SnapshotRecord[]>,
        );
        if (rows.some((row) => row.projectId !== expected.project.id))
          throw new StorageError('復旧点の所有者が一致しません');
        currentSnapshots.push(...rows);
      }
      const snapshotUnion = new Map(
        next.snapshots
          .filter((row) => !expected.assets.some((asset) => asset.id === row.assetId))
          .map((row) => [row.id, row]),
      );
      for (const row of currentSnapshots) snapshotUnion.set(row.id, row);
      const nextSnapshots = [...snapshotUnion.values()].filter((row) =>
        next.assets.some((asset) => asset.id === row.assetId),
      );
      for (const record of expected.blobs) {
        const stored = await requestToPromise(
          blobs.get(record.key) as IDBRequest<BlobRecord | undefined>,
        );
        if (
          !stored ||
          stored.projectId !== record.projectId ||
          stored.mimeType !== record.mimeType ||
          stored.bytes.byteLength !== record.bytes.byteLength ||
          !sameBytes(stored.bytes, record.bytes)
        ) {
          throw new StorageError('別の操作で画像が変更されたため、取り消しを中止しました');
        }
      }
      for (const record of expected.blobs) await requestToPromise(blobs.delete(record.key));
      for (const id of expected.assetIds) {
        await requestToPromise(assets.delete(id));
        const rows = await requestToPromise(
          snapshots.index(INDEX_BY_ASSET).getAll(id) as IDBRequest<SnapshotRecord[]>,
        );
        for (const row of rows) {
          if (row.projectId !== expected.project.id)
            throw new StorageError('復旧点の所有者が一致しません');
          await requestToPromise(snapshots.delete(row.id));
        }
      }
      for (const record of next.assets) await requestToPromise(assets.put(record));
      for (const record of next.blobs) {
        const stored = await requestToPromise(
          blobs.get(record.key) as IDBRequest<BlobRecord | undefined>,
        );
        if (stored) throw new StorageError('画像の保存先が他の操作で使用されています');
        await requestToPromise(blobs.put(record));
      }
      for (const record of nextSnapshots) await requestToPromise(snapshots.put(record));
      await requestToPromise(projects.put(next.project));
      return { currentSnapshots, nextSnapshots };
    },
  );
  expected.snapshots = retained.currentSnapshots;
  next.snapshots = retained.nextSnapshots;
}
