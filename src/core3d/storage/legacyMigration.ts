import { BACKUP_LIMITS, exportBackup } from '../backup/backup';
import {
  upgradeLegacyProject,
  validateStoredProject,
  type LegacyProject3D,
  type PreviousProject3D,
} from '../model/project';
import { LEGACY_PROJECT_3D_DB_NAME, PREVIOUS_PROJECT_3D_DB_NAME, requestResult } from './db';
import { hashProject, StorageIntegrityError, type ProjectRepository } from './repository';

/** Existing DB only: aborting the upgrade also avoids creating an empty legacy database. */
async function openLegacy(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    let absent = false;
    let blocked = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction!.abort();
    };
    request.onerror = () => (absent ? resolve(null) : reject(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('旧保存領域が別タブで使用中です。元の作品は変更していません。'));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
interface LegacyRoot {
  id: string;
  name?: string;
  revision: number;
  snapshotId: string;
  trashed: boolean;
}
export type LegacyProjectEntry = { id: string; name: string; revision: number; namespace: string };
export interface LegacyOptions {
  indexedDB?: IDBFactory;
  name?: string;
  signal?: AbortSignal;
}
async function readLegacy<T>(
  options: LegacyOptions,
  read: (db: IDBDatabase) => Promise<T>,
  empty: T,
): Promise<T> {
  options.signal?.throwIfAborted();
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error('IndexedDB is unavailable');
  const db = await openLegacy(factory, options.name ?? LEGACY_PROJECT_3D_DB_NAME);
  if (!db) return empty;
  try {
    if (db.version !== 1) throw new StorageIntegrityError('Unsupported legacy database version');
    return await read(db);
  } finally {
    db.close();
  }
}
export async function listLegacyProjects(
  options: LegacyOptions = {},
): Promise<LegacyProjectEntry[]> {
  if (!options.name)
    return [
      ...(await listLegacyProjects({ ...options, name: LEGACY_PROJECT_3D_DB_NAME })),
      ...(await listLegacyProjects({ ...options, name: PREVIOUS_PROJECT_3D_DB_NAME })),
    ];
  return readLegacy(
    options,
    async (db) => {
      const tx = db.transaction(['roots'], 'readonly');
      const roots = (await requestResult(tx.objectStore('roots').getAll())) as LegacyRoot[];
      return roots
        .filter((root) => !root.trashed)
        .map((root) => ({
          id: root.id,
          name: root.name ?? `旧作品 (${root.id})`,
          revision: root.revision,
          namespace: options.name!,
        }));
    },
    [],
  );
}
/** A single readonly transaction captures the root, snapshot and every source. No pin/lease writes. */
export async function readLegacyProject(projectId: string, options: LegacyOptions = {}) {
  const captured = await readLegacy(
    options,
    async (db) => {
      const tx = db.transaction(['roots', 'snapshots', 'blobs'], 'readonly');
      const root = (await requestResult(tx.objectStore('roots').get(projectId))) as
        LegacyRoot | undefined;
      if (!root || root.trashed) throw new StorageIntegrityError('旧作品が見つかりません。');
      const snapshot = (await requestResult(tx.objectStore('snapshots').get(root.snapshotId))) as
        | { id: string; project: LegacyProject3D | PreviousProject3D; contentHash: string }
        | undefined;
      if (
        !snapshot ||
        snapshot.project.id !== root.id ||
        snapshot.project.revision !== root.revision
      )
        throw new StorageIntegrityError('旧作品のsnapshotが一致しません。');
      validateStoredProject(snapshot.project);
      if (snapshot.project.schemaVersion !== '0.1.0' && snapshot.project.schemaVersion !== '0.2.0')
        throw new StorageIntegrityError('Unsupported legacy project version');
      const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot.project)).byteLength;
      if (
        jsonBytes > BACKUP_LIMITS.jsonBytes ||
        snapshot.project.blobIds.length + 2 > BACKUP_LIMITS.entries
      )
        throw new StorageIntegrityError('Legacy backup exceeds the supported profile');
      let payloadBytes = jsonBytes;
      const blobs = new Map<string, Uint8Array>();
      for (const id of snapshot.project.blobIds) {
        const blob = (await requestResult(tx.objectStore('blobs').get(id))) as
          { id: string; bytes: Uint8Array } | undefined;
        if (!blob || blob.id !== id)
          throw new StorageIntegrityError('旧作品の原本が不足しています。');
        payloadBytes += blob.bytes.byteLength;
        if (!Number.isSafeInteger(payloadBytes) || payloadBytes > BACKUP_LIMITS.archiveBytes)
          throw new StorageIntegrityError('Legacy backup exceeds the supported profile');
        blobs.set(id, new Uint8Array(blob.bytes));
      }
      return { snapshot, blobs };
    },
    null,
  );
  if (!captured) throw new StorageIntegrityError('旧保存領域が見つかりません。');
  options.signal?.throwIfAborted();
  if ((await hashProject(captured.snapshot.project)) !== captured.snapshot.contentHash)
    throw new StorageIntegrityError('旧作品のsnapshot hashが一致しません。');
  // The encoder validates every source hash before any destination transaction is opened.
  const backup = await exportBackup(captured.snapshot.project, captured.blobs);
  options.signal?.throwIfAborted();
  return { project: captured.snapshot.project, blobs: captured.blobs, backup };
}
export async function copyLegacyProject(
  repository: ProjectRepository,
  projectId: string,
  ownerId: string,
  options: LegacyOptions & { newProjectId?: string } = {},
) {
  const original = await readLegacyProject(projectId, options);
  const project = upgradeLegacyProject(original.project);
  const id = options.newProjectId ?? crypto.randomUUID();
  return repository.restoreCopy(project, original.blobs, id, ownerId, {
    legacyBackup: original.backup,
    signal: options.signal,
  });
}
