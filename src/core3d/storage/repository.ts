import {
  cloneProject,
  validateProject,
  type Project3D,
  type StoredProject3D,
} from '../model/project';
import { inTransaction, openStorageDatabase, requestResult, STORAGE_STORES } from './db';
import { BACKUP_LIMITS } from '../backup/backup';

export type BlobBytes = ReadonlyMap<string, Uint8Array>;
export type PinKind = 'read' | 'backup' | 'export' | 'undo' | 'redo';
export interface WriterLease {
  projectId: string;
  ownerId: string;
  /** Monotonic database fencing token, never derived from a clock. */
  token: number;
}
export interface HistoryReferences {
  /** Editor revision that produced these references, including unsaved edits. */
  revision: number;
  undoBlobIds: string[];
  redoBlobIds: string[];
}
export interface StagedProject {
  id: string;
  projectId: string;
  revision: number;
}
export interface CommitResult {
  projectId: string;
  revision: number;
  snapshotId: string;
  validation: { valid: true };
}
export interface SnapshotRead extends CommitResult {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  release(): Promise<void>;
}
/** All bytes are detached before the read transaction ends; no database pin is owned. */
export interface DetachedBackupSnapshot extends CommitResult {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
}
export interface ReferencePin {
  id: string;
  release(): Promise<void>;
}
export interface GarbageMark {
  epoch: number;
  blobIds: string[];
  snapshotIds: string[];
}

export interface ProjectLibraryEntry {
  id: string;
  name: string;
  revision: number;
  snapshotId: string;
  trashed: boolean;
  savedAt: number | null;
  trashedAt: number | null;
  recoveryCount: number;
}
export interface RecoverySnapshotSummary {
  snapshotId: string;
  kind: 'latest' | 'recovery';
  available: boolean;
  revision: number | null;
  savedAt: number | null;
  name: string;
  contentHash: string | null;
  counts: Record<'nodes' | 'meshes' | 'materials' | 'skins' | 'clips' | 'sources', number> | null;
  difference: {
    contentChanged: boolean;
    renamed: boolean;
    counts: RecoverySnapshotSummary['counts'];
  } | null;
}
function knownTime(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8640000000000000
    ? value
    : null;
}
function snapshotSummary(
  snapshot: SnapshotRecord | undefined,
  snapshotId: string,
  projectId: string,
  latest: boolean,
): RecoverySnapshotSummary {
  const unavailable: RecoverySnapshotSummary = {
    snapshotId,
    kind: latest ? 'latest' : 'recovery',
    available: false,
    revision: null,
    savedAt: null,
    name: '',
    contentHash: null,
    counts: null,
    difference: null,
  };
  if (
    !snapshot ||
    snapshot.id !== snapshotId ||
    snapshot.project?.id !== projectId ||
    snapshot.project.schemaVersion !== '0.3.0' ||
    !Number.isSafeInteger(snapshot.project.revision) ||
    snapshot.project.revision < 0 ||
    typeof snapshot.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(snapshot.contentHash)
  )
    return unavailable;
  const keys = ['nodes', 'meshes', 'materials', 'skins', 'clips', 'sources'] as const;
  if (keys.some((key) => !Array.isArray(snapshot.project[key]))) return unavailable;
  const counts = Object.fromEntries(
    keys.map((key) => [key, snapshot.project[key].length]),
  ) as NonNullable<RecoverySnapshotSummary['counts']>;
  return {
    ...unavailable,
    available: true,
    revision: snapshot.project.revision,
    savedAt: knownTime(snapshot.savedAt),
    name: typeof snapshot.project.name === 'string' ? snapshot.project.name.slice(0, 4096) : '',
    contentHash: snapshot.contentHash,
    counts,
  };
}

interface RootRecord {
  id: string;
  /** Optional for roots written by the first native-storage foundation. */
  name?: string;
  revision: number;
  snapshotId: string;
  recoverySnapshotIds: string[];
  trashed: boolean;
  savedAt?: number;
  trashedAt?: number;
}
interface SnapshotRecord {
  id: string;
  project: Project3D;
  contentHash: string;
  savedAt?: number;
}
interface StageRecord extends SnapshotRecord {
  /** Also protects newly supplied bytes needed by an uncommitted history entry. */
  blobIds: string[];
}
interface BlobRecord {
  id: string;
  bytes: Uint8Array;
}
interface LeaseRecord extends WriterLease {
  id: string;
  active: boolean;
}
interface PinRecord {
  id: string;
  projectId: string;
  kind: PinKind;
  snapshotIds: string[];
  blobIds: string[];
}
interface HistoryRecord extends HistoryReferences {
  id: string;
  projectId: string;
  ownerId: string;
  token: number;
}
interface EpochRecord {
  id: 'epoch';
  value: number;
}

export class StorageConflictError extends Error {
  constructor(public readonly reason: 'writer' | 'revision' | 'exists' | 'trashed') {
    super(
      `3D storage conflict: ${reason}. Keep the unsaved project for backup or restore as a copy.`,
    );
    this.name = 'StorageConflictError';
  }
}
export class StorageIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageIntegrityError';
  }
}

export async function hashBlob(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function getRecord<T>(transaction: IDBTransaction, store: string, id: string) {
  return (await requestResult(transaction.objectStore(store).get(id))) as T | undefined;
}
async function allRecords<T>(transaction: IDBTransaction, store: string): Promise<T[]> {
  return requestResult(transaction.objectStore(store).getAll()) as Promise<T[]>;
}
async function epoch(transaction: IDBTransaction): Promise<number> {
  return (await getRecord<EpochRecord>(transaction, 'meta', 'epoch'))?.value ?? 0;
}
async function bumpEpoch(transaction: IDBTransaction): Promise<void> {
  await requestResult(
    transaction.objectStore('meta').put({ id: 'epoch', value: (await epoch(transaction)) + 1 }),
  );
}
async function assertLease(transaction: IDBTransaction, lease: WriterLease): Promise<void> {
  const current = await getRecord<LeaseRecord>(transaction, 'leases', lease.projectId);
  if (!current?.active || current.ownerId !== lease.ownerId || current.token !== lease.token) {
    throw new StorageConflictError('writer');
  }
}
async function requireBlobs(
  transaction: IDBTransaction,
  ids: readonly string[],
): Promise<BlobRecord[]> {
  return Promise.all(
    [...new Set(ids)].map(async (id) => {
      const blob = await getRecord<BlobRecord>(transaction, 'blobs', id);
      if (!blob) throw new StorageIntegrityError(`Missing 3D blob: ${id}`);
      return blob;
    }),
  );
}
function copyHistory(history: HistoryReferences): HistoryReferences {
  if (!Number.isSafeInteger(history.revision) || history.revision < 0) {
    throw new Error('History references need their non-negative editor revision');
  }
  return {
    revision: history.revision,
    undoBlobIds: [...new Set(history.undoBlobIds)],
    redoBlobIds: [...new Set(history.redoBlobIds)],
  };
}

export function hashProject(project: StoredProject3D): Promise<string> {
  const json = JSON.stringify(project, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      );
    }
    return value;
  });
  return hashBlob(new TextEncoder().encode(json));
}

function historyId(lease: WriterLease): string {
  return JSON.stringify([lease.projectId, lease.token]);
}

async function writeHistory(
  transaction: IDBTransaction,
  lease: WriterLease,
  refs: HistoryReferences,
): Promise<void> {
  const id = historyId(lease);
  const current = await getRecord<HistoryRecord>(transaction, 'history', id);
  // A delayed save must never remove references installed by newer unsaved edits.
  if (current && current.revision > refs.revision) return;
  const next =
    current?.revision === refs.revision
      ? {
          revision: refs.revision,
          undoBlobIds: [...new Set([...current.undoBlobIds, ...refs.undoBlobIds])],
          redoBlobIds: [...new Set([...current.redoBlobIds, ...refs.redoBlobIds])],
        }
      : refs;
  await requireBlobs(transaction, [...next.undoBlobIds, ...next.redoBlobIds]);
  await requestResult(transaction.objectStore('history').put({ id, ...lease, ...next }));
}

/** All serialization and digest work finishes before opening a write transaction. */
export class ProjectRepository {
  constructor(private readonly db: IDBDatabase) {}

  close(): void {
    this.db.close();
  }

  /** Lists root metadata without loading source bytes or GPU resources. */
  async listProjects(
    options: { includeTrashed?: boolean } = {},
  ): Promise<{ id: string; name: string; revision: number; trashed: boolean }[]> {
    return inTransaction(this.db, ['roots'], 'readonly', async (transaction) => {
      const roots = await allRecords<RootRecord>(transaction, 'roots');
      return roots
        .filter((root) => options.includeTrashed || !root.trashed)
        .map((root) => ({
          id: root.id,
          name: root.name ?? `3Dプロジェクト (${root.id})`,
          revision: root.revision,
          trashed: root.trashed,
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    });
  }

  /** Read-only project metadata; does not load binary sources or create writer leases. */
  async libraryEntries(): Promise<ProjectLibraryEntry[]> {
    return inTransaction(this.db, ['roots'], 'readonly', async (transaction) => {
      const roots = await allRecords<RootRecord>(transaction, 'roots');
      return roots
        .map((root) => ({
          id: root.id,
          name: root.name ?? `3Dプロジェクト (${root.id})`,
          revision: root.revision,
          snapshotId: root.snapshotId,
          trashed: root.trashed,
          savedAt: knownTime(root.savedAt),
          trashedAt: knownTime(root.trashedAt),
          recoveryCount: root.recoverySnapshotIds.length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    });
  }

  /** Pages retained snapshots without copying binary assets. Hash/data validity is rechecked before recovery. */
  async recoveryPage(projectId: string, offset = 0, limit = 10) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 10
    )
      throw new Error('Invalid recovery page');
    return inTransaction(this.db, ['roots', 'snapshots'], 'readonly', async (transaction) => {
      const root = await getRecord<RootRecord>(transaction, 'roots', projectId);
      if (!root) throw new StorageIntegrityError('3D project is not available');
      const latestRecord = await getRecord<SnapshotRecord>(
        transaction,
        'snapshots',
        root.snapshotId,
      );
      const latest = snapshotSummary(latestRecord, root.snapshotId, projectId, true);
      if (latest.revision !== root.revision) latest.available = false;
      const total = root.recoverySnapshotIds.length + 1;
      const entries: RecoverySnapshotSummary[] = [];
      for (let index = offset; index < Math.min(total, offset + limit); index++) {
        const id =
          index === 0
            ? root.snapshotId
            : root.recoverySnapshotIds[root.recoverySnapshotIds.length - index];
        const item =
          index === 0
            ? latest
            : snapshotSummary(
                await getRecord<SnapshotRecord>(transaction, 'snapshots', id),
                id,
                projectId,
                false,
              );
        if (item.available && latest.available && item.counts && latest.counts) {
          item.difference = {
            contentChanged: item.contentHash !== latest.contentHash,
            renamed: item.name !== latest.name,
            counts: Object.fromEntries(
              Object.keys(item.counts).map((key) => [
                key,
                item.counts![key as keyof typeof item.counts] -
                  latest.counts![key as keyof typeof latest.counts],
              ]),
            ) as NonNullable<RecoverySnapshotSummary['counts']>,
          };
        }
        entries.push(item);
      }
      return {
        projectId,
        rootRevision: root.revision,
        rootSnapshotId: root.snapshotId,
        trashed: root.trashed,
        total,
        offset,
        entries,
      };
    });
  }

  /** Atomic library operation for a CLOSED project; active editors must close explicitly first. */
  async changeLibraryTrash(
    expected: Pick<ProjectLibraryEntry, 'id' | 'revision' | 'snapshotId' | 'trashed'>,
    trashed: boolean,
  ): Promise<void> {
    const token = { ...expected };
    if (
      typeof trashed !== 'boolean' ||
      typeof token.trashed !== 'boolean' ||
      !Number.isSafeInteger(token.revision)
    )
      throw new Error('Invalid trash request');
    await inTransaction(this.db, ['roots', 'leases', 'meta'], 'readwrite', async (transaction) => {
      const root = await getRecord<RootRecord>(transaction, 'roots', token.id);
      if (
        !root ||
        root.revision !== token.revision ||
        root.snapshotId !== token.snapshotId ||
        root.trashed !== token.trashed
      )
        throw new StorageConflictError('revision');
      const writer = await getRecord<LeaseRecord>(transaction, 'leases', token.id);
      if (writer?.active) throw new StorageConflictError('writer');
      root.trashed = trashed;
      if (trashed) root.trashedAt = Date.now();
      else delete root.trashedAt;
      await requestResult(transaction.objectStore('roots').put(root));
      await bumpEpoch(transaction);
    });
  }

  async acquireWriter(
    projectId: string,
    ownerId: string,
    options: { takeover?: boolean } = {},
  ): Promise<WriterLease> {
    if (!projectId || !ownerId) throw new Error('Project and writer IDs are required');
    return inTransaction(this.db, ['leases'], 'readwrite', async (transaction) => {
      const old = await getRecord<LeaseRecord>(transaction, 'leases', projectId);
      if (old?.active && old.ownerId === ownerId && !options.takeover) {
        return { projectId, ownerId, token: old.token };
      }
      if (old?.active && !options.takeover) throw new StorageConflictError('writer');
      const token = (old?.token ?? 0) + 1;
      if (!Number.isSafeInteger(token)) throw new Error('Writer token exhausted');
      const lease = { projectId, ownerId, token };
      await requestResult(
        transaction.objectStore('leases').put({ ...lease, id: projectId, active: true }),
      );
      return lease;
    });
  }

  async releaseWriter(lease: WriterLease): Promise<void> {
    const captured = { ...lease };
    await inTransaction(this.db, ['leases'], 'readwrite', async (transaction) => {
      await assertLease(transaction, captured);
      await requestResult(
        transaction
          .objectStore('leases')
          .put({ ...captured, id: captured.projectId, active: false }),
      );
    });
  }

  async importStaged(
    project: Project3D,
    blobs: BlobBytes,
    options: { signal?: AbortSignal } = {},
  ): Promise<StagedProject> {
    const candidate = cloneProject(project);
    validateProject(candidate);
    const copies = [...blobs].map(([id, bytes]) => ({ id, bytes: new Uint8Array(bytes) }));
    options.signal?.throwIfAborted();
    for (const blob of copies) {
      if ((await hashBlob(blob.bytes)) !== blob.id)
        throw new StorageIntegrityError(`3D blob hash mismatch: ${blob.id}`);
    }
    const stage: StageRecord = {
      id: crypto.randomUUID(),
      project: candidate,
      contentHash: await hashProject(candidate),
      blobIds: [...new Set([...candidate.blobIds, ...copies.map((blob) => blob.id)])],
    };
    await inTransaction(
      this.db,
      ['blobs', 'staging', 'meta'],
      'readwrite',
      async (transaction) => {
        for (const blob of copies) {
          const existing = await getRecord<BlobRecord>(transaction, 'blobs', blob.id);
          if (existing) {
            if (
              existing.bytes.length !== blob.bytes.length ||
              existing.bytes.some((value, index) => value !== blob.bytes[index])
            ) {
              throw new StorageIntegrityError(
                `Stored 3D blob does not match its content ID: ${blob.id}`,
              );
            }
          } else {
            await requestResult(transaction.objectStore('blobs').add(blob));
          }
        }
        await requireBlobs(transaction, stage.blobIds);
        await requestResult(transaction.objectStore('staging').add(stage));
        await bumpEpoch(transaction);
      },
      options.signal,
    );
    return { id: stage.id, projectId: candidate.id, revision: candidate.revision };
  }

  async discardStaged(stage: StagedProject): Promise<void> {
    const id = stage.id;
    await inTransaction(this.db, ['staging', 'meta'], 'readwrite', async (transaction) => {
      await requestResult(transaction.objectStore('staging').delete(id));
      await bumpEpoch(transaction);
    });
  }

  async commit(
    stage: StagedProject,
    options: {
      expectedRevision: number | null;
      lease: WriterLease;
      history?: HistoryReferences;
      signal?: AbortSignal;
    },
  ): Promise<CommitResult> {
    const captured = { ...stage };
    const lease = { ...options.lease };
    const expectedRevision = options.expectedRevision;
    const history = options.history && copyHistory(options.history);
    return inTransaction(
      this.db,
      STORAGE_STORES,
      'readwrite',
      async (transaction) => {
        await assertLease(transaction, lease);
        const candidate = await getRecord<StageRecord>(transaction, 'staging', captured.id);
        if (
          !candidate ||
          candidate.project.id !== captured.projectId ||
          candidate.project.revision !== captured.revision
        ) {
          throw new StorageIntegrityError(
            'Staged 3D project is missing or does not match the save',
          );
        }
        if (candidate.project.id !== lease.projectId) throw new StorageConflictError('writer');
        const root = await getRecord<RootRecord>(transaction, 'roots', lease.projectId);
        if (expectedRevision === null && root) throw new StorageConflictError('exists');
        if ((root?.revision ?? null) !== expectedRevision)
          throw new StorageConflictError('revision');
        if (root?.trashed) throw new StorageConflictError('trashed');
        if (root && candidate.project.revision < root.revision)
          throw new StorageConflictError('revision');
        let sameRevision = false;
        if (root && root.revision === candidate.project.revision) {
          const current = await getRecord<SnapshotRecord>(
            transaction,
            'snapshots',
            root.snapshotId,
          );
          if (!current || current.contentHash !== candidate.contentHash)
            throw new StorageConflictError('revision');
          sameRevision = true;
        }
        await requireBlobs(transaction, candidate.project.blobIds);
        if (history) {
          if (history.revision !== candidate.project.revision)
            throw new StorageIntegrityError('Saved history revision does not match its project');
          await writeHistory(transaction, lease, history);
        }
        if (sameRevision && root) {
          root.name = candidate.project.name;
          await requestResult(transaction.objectStore('roots').put(root));
          await requestResult(transaction.objectStore('staging').delete(candidate.id));
          await bumpEpoch(transaction);
          return {
            projectId: root.id,
            revision: root.revision,
            snapshotId: root.snapshotId,
            validation: { valid: true },
          };
        }
        const savedAt = Date.now();
        await requestResult(
          transaction.objectStore('snapshots').add({
            id: candidate.id,
            savedAt,
            project: candidate.project,
            contentHash: candidate.contentHash,
          }),
        );
        const nextRoot: RootRecord = {
          id: candidate.project.id,
          name: candidate.project.name,
          revision: candidate.project.revision,
          snapshotId: candidate.id,
          savedAt,
          recoverySnapshotIds: root ? [...root.recoverySnapshotIds, root.snapshotId] : [],
          trashed: false,
        };
        await requestResult(transaction.objectStore('roots').put(nextRoot));
        await requestResult(transaction.objectStore('staging').delete(candidate.id));
        await bumpEpoch(transaction);
        return {
          projectId: nextRoot.id,
          revision: nextRoot.revision,
          snapshotId: nextRoot.snapshotId,
          validation: { valid: true },
        };
      },
      options.signal,
    );
  }

  async create(project: Project3D, blobs: BlobBytes, ownerId: string): Promise<CommitResult> {
    const stage = await this.importStaged(project, blobs);
    try {
      const lease = await this.acquireWriter(stage.projectId, ownerId);
      return await this.commit(stage, { expectedRevision: null, lease });
    } catch (error) {
      await this.discardStaged(stage);
      throw error;
    }
  }

  /** A copy, its source bytes and an optional original archive publish in ONE transaction. */
  async restoreCopy(
    project: Project3D,
    blobs: BlobBytes,
    newProjectId: string,
    ownerId: string,
    options: { legacyBackup?: Uint8Array; signal?: AbortSignal } = {},
  ): Promise<CommitResult & { writerLease: WriterLease }> {
    if (project.id === newProjectId) throw new StorageConflictError('exists');
    const copy = cloneProject(project);
    copy.id = newProjectId;
    copy.revision = 0;
    validateProject(copy);
    const original = options.legacyBackup && new Uint8Array(options.legacyBackup);
    const bytes = copy.blobIds.map((id) => {
      const source = blobs.get(id);
      if (!source) throw new StorageIntegrityError(`Missing copy blob: ${id}`);
      return { id, bytes: new Uint8Array(source) };
    });
    options.signal?.throwIfAborted();
    for (const blob of bytes)
      if ((await hashBlob(blob.bytes)) !== blob.id)
        throw new StorageIntegrityError(`Copy blob hash mismatch: ${blob.id}`);
    const snapshot = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      project: copy,
      contentHash: await hashProject(copy),
    };
    const recovery = original && {
      id: newProjectId,
      bytes: original,
      hash: await hashBlob(original),
    };
    return inTransaction(
      this.db,
      STORAGE_STORES,
      'readwrite',
      async (transaction) => {
        if (await getRecord(transaction, 'roots', newProjectId))
          throw new StorageConflictError('exists');
        const oldLease = await getRecord<LeaseRecord>(transaction, 'leases', newProjectId);
        if (oldLease?.active) throw new StorageConflictError('writer');
        for (const blob of bytes) {
          const existing = await getRecord<BlobRecord>(transaction, 'blobs', blob.id);
          if (
            existing &&
            (existing.bytes.length !== blob.bytes.length ||
              existing.bytes.some((v, i) => v !== blob.bytes[i]))
          )
            throw new StorageIntegrityError(`Stored copy blob mismatch: ${blob.id}`);
          if (!existing) await requestResult(transaction.objectStore('blobs').add(blob));
        }
        if (recovery) await requestResult(transaction.objectStore('legacyBackups').add(recovery));
        await requestResult(transaction.objectStore('snapshots').add(snapshot));
        await requestResult(
          transaction.objectStore('roots').add({
            id: copy.id,
            name: copy.name,
            revision: 0,
            snapshotId: snapshot.id,
            savedAt: snapshot.savedAt,
            recoverySnapshotIds: [],
            trashed: false,
          }),
        );
        const token = (oldLease?.token ?? 0) + 1;
        if (!Number.isSafeInteger(token)) throw new Error('Writer token exhausted');
        await requestResult(
          transaction.objectStore('leases').put({
            id: copy.id,
            projectId: copy.id,
            ownerId,
            token,
            active: true,
          }),
        );
        await bumpEpoch(transaction);
        return {
          projectId: copy.id,
          writerLease: { projectId: copy.id, ownerId, token },
          revision: 0,
          snapshotId: snapshot.id,
          validation: { valid: true },
        };
      },
      options.signal,
    );
  }

  async hasLegacyBackup(projectId: string): Promise<boolean> {
    return inTransaction(
      this.db,
      ['legacyBackups'],
      'readonly',
      async (transaction) =>
        (await requestResult(transaction.objectStore('legacyBackups').getKey(projectId))) !==
        undefined,
    );
  }

  /** Detached and verified archive; never consumes or prunes the recovery record. */
  async readLegacyBackup(projectId: string): Promise<Uint8Array | null> {
    const record = await inTransaction(this.db, ['legacyBackups'], 'readonly', (transaction) =>
      getRecord<{ id: string; bytes: Uint8Array; hash: string }>(
        transaction,
        'legacyBackups',
        projectId,
      ),
    );
    if (!record) return null;
    if ((await hashBlob(record.bytes)) !== record.hash)
      throw new StorageIntegrityError('Original backup hash mismatch');
    return new Uint8Array(record.bytes);
  }

  /**
   * Backup-only rescue under write quota or denied writes. A single readonly transaction
   * captures the retained root/snapshot and every referenced blob consistently with GC
   * and concurrent writers. Hashing runs only after all bytes are detached and the
   * transaction completes. This is not a substitute for pinned editing/export reads.
   */
  async captureBackupSnapshot(
    projectId: string,
    options: { snapshotId?: string; includeTrashed?: boolean } = {},
  ): Promise<DetachedBackupSnapshot> {
    const requestedId = options.snapshotId;
    const includeTrashed = options.includeTrashed ?? false;
    const result = await inTransaction(
      this.db,
      ['roots', 'snapshots', 'blobs'],
      'readonly',
      async (transaction) => {
        const root = await getRecord<RootRecord>(transaction, 'roots', projectId);
        if (!root || (root.trashed && !includeTrashed))
          throw new StorageIntegrityError('3D project is not available');
        const snapshotId = requestedId ?? root.snapshotId;
        if (snapshotId !== root.snapshotId && !root.recoverySnapshotIds.includes(snapshotId))
          throw new StorageIntegrityError('3D snapshot is not retained by this project');
        const snapshot = await getRecord<SnapshotRecord>(transaction, 'snapshots', snapshotId);
        if (!snapshot || snapshot.id !== snapshotId || snapshot.project.id !== projectId)
          throw new StorageIntegrityError('3D snapshot is missing');
        const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot.project)).byteLength;
        if (jsonBytes > BACKUP_LIMITS.jsonBytes)
          throw new StorageIntegrityError('Project JSON exceeds backup profile');
        validateProject(snapshot.project);
        if (snapshotId === root.snapshotId && snapshot.project.revision !== root.revision)
          throw new StorageIntegrityError('Stored 3D root revision mismatch');
        if (snapshot.project.blobIds.length + 2 > BACKUP_LIMITS.entries)
          throw new StorageIntegrityError('Too many backup entries');
        let payloadBytes = jsonBytes;
        const blobs = new Map<string, Uint8Array>();
        // Read sequentially so a large reference list cannot allocate every blob before
        // the cumulative payload limit is checked. IndexedDB supplies detached values.
        for (const id of snapshot.project.blobIds) {
          const blob = await getRecord<BlobRecord>(transaction, 'blobs', id);
          if (!blob || blob.id !== id || !(blob.bytes instanceof Uint8Array))
            throw new StorageIntegrityError('Missing or invalid 3D blob');
          payloadBytes += blob.bytes.byteLength;
          if (!Number.isSafeInteger(payloadBytes) || payloadBytes > BACKUP_LIMITS.archiveBytes)
            throw new StorageIntegrityError('Backup payload exceeds profile');
          blobs.set(id, blob.bytes);
        }
        return { snapshot, blobs };
      },
    );
    if ((await hashProject(result.snapshot.project)) !== result.snapshot.contentHash)
      throw new StorageIntegrityError('Stored 3D snapshot hash mismatch');
    for (const [id, bytes] of result.blobs)
      if ((await hashBlob(bytes)) !== id)
        throw new StorageIntegrityError('Stored 3D blob hash mismatch');
    return {
      projectId,
      revision: result.snapshot.project.revision,
      snapshotId: result.snapshot.id,
      validation: { valid: true },
      project: result.snapshot.project,
      blobs: result.blobs,
    };
  }

  async readSnapshot(
    projectId: string,
    options: { snapshotId?: string; kind?: PinKind; includeTrashed?: boolean } = {},
  ): Promise<SnapshotRead> {
    const requestedId = options.snapshotId;
    const kind = options.kind ?? 'read';
    const includeTrashed = options.includeTrashed ?? false;
    const pinId = crypto.randomUUID();
    const result = await inTransaction(
      this.db,
      ['roots', 'snapshots', 'blobs', 'pins', 'meta'],
      'readwrite',
      async (transaction) => {
        const root = await getRecord<RootRecord>(transaction, 'roots', projectId);
        if (!root || (root.trashed && !includeTrashed))
          throw new StorageIntegrityError('3D project is not available');
        const snapshotId = requestedId ?? root.snapshotId;
        if (snapshotId !== root.snapshotId && !root.recoverySnapshotIds.includes(snapshotId)) {
          throw new StorageIntegrityError('3D snapshot is not retained by this project');
        }
        const snapshot = await getRecord<SnapshotRecord>(transaction, 'snapshots', snapshotId);
        if (!snapshot || snapshot.project.id !== projectId)
          throw new StorageIntegrityError('3D snapshot is missing');
        const blobs = await requireBlobs(transaction, snapshot.project.blobIds);
        const pin: PinRecord = {
          id: pinId,
          projectId,
          kind,
          snapshotIds: [snapshotId],
          blobIds: [...snapshot.project.blobIds],
        };
        await requestResult(transaction.objectStore('pins').add(pin));
        await bumpEpoch(transaction);
        return { snapshot, blobs };
      },
    );
    try {
      validateProject(result.snapshot.project);
      if ((await hashProject(result.snapshot.project)) !== result.snapshot.contentHash) {
        throw new StorageIntegrityError('Stored 3D snapshot hash mismatch');
      }
      for (const blob of result.blobs) {
        if ((await hashBlob(blob.bytes)) !== blob.id)
          throw new StorageIntegrityError(`Stored 3D blob hash mismatch: ${blob.id}`);
      }
    } catch (error) {
      await this.releasePin(pinId);
      throw error;
    }
    const project = result.snapshot.project;
    return {
      projectId,
      revision: project.revision,
      snapshotId: result.snapshot.id,
      validation: { valid: true },
      project,
      blobs: new Map(result.blobs.map((blob) => [blob.id, blob.bytes])),
      release: () => this.releasePin(pinId),
    };
  }

  /** Pin staged bytes before dropping staging if an unsaved Undo/Redo entry needs them. */
  async pinBlobs(
    lease: WriterLease,
    blobIds: readonly string[],
    kind: PinKind,
  ): Promise<ReferencePin> {
    const captured = { ...lease };
    const ids = [...new Set(blobIds)];
    const id = crypto.randomUUID();
    await inTransaction(
      this.db,
      ['leases', 'blobs', 'pins', 'meta'],
      'readwrite',
      async (transaction) => {
        await assertLease(transaction, captured);
        await requireBlobs(transaction, ids);
        await requestResult(
          transaction
            .objectStore('pins')
            .add({ id, projectId: captured.projectId, kind, snapshotIds: [], blobIds: ids }),
        );
        await bumpEpoch(transaction);
      },
    );
    return { id, release: () => this.releasePin(id) };
  }

  private async releasePin(id: string): Promise<void> {
    await inTransaction(this.db, ['pins', 'meta'], 'readwrite', async (transaction) => {
      await requestResult(transaction.objectStore('pins').delete(id));
      await bumpEpoch(transaction);
    });
  }

  /** References are updated atomically; no time-based expiry is applied to history or pins. */
  async setHistoryReferences(lease: WriterLease, history: HistoryReferences): Promise<void> {
    const captured = { ...lease };
    const refs = copyHistory(history);
    await inTransaction(
      this.db,
      ['leases', 'blobs', 'history', 'meta'],
      'readwrite',
      async (transaction) => {
        await assertLease(transaction, captured);
        const current = await getRecord<HistoryRecord>(transaction, 'history', historyId(captured));
        if (current && current.revision > refs.revision) throw new StorageConflictError('revision');
        await writeHistory(transaction, captured, refs);
        await bumpEpoch(transaction);
      },
    );
  }

  /** Call only after this editing session no longer needs Undo/Redo, including after fencing. */
  async releaseHistoryReferences(lease: WriterLease): Promise<void> {
    const captured = { ...lease };
    await inTransaction(this.db, ['history', 'meta'], 'readwrite', async (transaction) => {
      const id = historyId(captured);
      const current = await getRecord<HistoryRecord>(transaction, 'history', id);
      if (current && current.ownerId !== captured.ownerId) throw new StorageConflictError('writer');
      await requestResult(transaction.objectStore('history').delete(id));
      await bumpEpoch(transaction);
    });
  }

  async recoverySnapshots(projectId: string): Promise<string[]> {
    return inTransaction(this.db, ['roots'], 'readonly', async (transaction) => {
      const root = await getRecord<RootRecord>(transaction, 'roots', projectId);
      return root ? [...root.recoverySnapshotIds] : [];
    });
  }

  async pruneRecovery(lease: WriterLease, keepCount: number): Promise<void> {
    if (!Number.isSafeInteger(keepCount) || keepCount < 0)
      throw new Error('Invalid recovery count');
    const captured = { ...lease };
    await inTransaction(this.db, ['roots', 'leases', 'meta'], 'readwrite', async (transaction) => {
      await assertLease(transaction, captured);
      const root = await getRecord<RootRecord>(transaction, 'roots', captured.projectId);
      if (!root) throw new StorageIntegrityError('3D project is not available');
      root.recoverySnapshotIds = keepCount === 0 ? [] : root.recoverySnapshotIds.slice(-keepCount);
      await requestResult(transaction.objectStore('roots').put(root));
      await bumpEpoch(transaction);
    });
  }

  async setTrashed(lease: WriterLease, expectedRevision: number, trashed: boolean): Promise<void> {
    const captured = { ...lease };
    await inTransaction(this.db, ['roots', 'leases', 'meta'], 'readwrite', async (transaction) => {
      await assertLease(transaction, captured);
      const root = await getRecord<RootRecord>(transaction, 'roots', captured.projectId);
      if (!root || root.revision !== expectedRevision) throw new StorageConflictError('revision');
      root.trashed = trashed;
      await requestResult(transaction.objectStore('roots').put(root));
      await bumpEpoch(transaction);
    });
  }

  async markGarbage(): Promise<GarbageMark> {
    return inTransaction(this.db, STORAGE_STORES, 'readonly', async (transaction) => {
      const live = await liveReferences(transaction);
      const blobs = await allRecords<BlobRecord>(transaction, 'blobs');
      return {
        epoch: await epoch(transaction),
        blobIds: blobs.filter((blob) => !live.blobIds.has(blob.id)).map((blob) => blob.id),
        snapshotIds: live.snapshots
          .filter((snapshot) => !live.snapshotIds.has(snapshot.id))
          .map((snapshot) => snapshot.id),
      };
    });
  }

  async collectGarbage(
    mark: GarbageMark,
  ): Promise<{ stale: boolean; deletedBlobIds: string[]; deletedSnapshotIds: string[] }> {
    const captured = {
      epoch: mark.epoch,
      blobIds: [...mark.blobIds],
      snapshotIds: [...mark.snapshotIds],
    };
    return inTransaction(this.db, STORAGE_STORES, 'readwrite', async (transaction) => {
      if ((await epoch(transaction)) !== captured.epoch)
        return { stale: true, deletedBlobIds: [], deletedSnapshotIds: [] };
      // Recompute references under the same write lock as deletion, even at the same epoch.
      const live = await liveReferences(transaction);
      const deletedBlobIds: string[] = [];
      const deletedSnapshotIds: string[] = [];
      for (const id of new Set(captured.blobIds)) {
        if (!live.blobIds.has(id) && (await getRecord<BlobRecord>(transaction, 'blobs', id))) {
          await requestResult(transaction.objectStore('blobs').delete(id));
          deletedBlobIds.push(id);
        }
      }
      for (const id of new Set(captured.snapshotIds)) {
        if (
          !live.snapshotIds.has(id) &&
          (await getRecord<SnapshotRecord>(transaction, 'snapshots', id))
        ) {
          await requestResult(transaction.objectStore('snapshots').delete(id));
          deletedSnapshotIds.push(id);
        }
      }
      if (deletedBlobIds.length || deletedSnapshotIds.length) await bumpEpoch(transaction);
      return { stale: false, deletedBlobIds, deletedSnapshotIds };
    });
  }
}

async function liveReferences(transaction: IDBTransaction): Promise<{
  snapshotIds: Set<string>;
  blobIds: Set<string>;
  snapshots: SnapshotRecord[];
}> {
  const [roots, snapshots, stages, pins, histories] = await Promise.all([
    allRecords<RootRecord>(transaction, 'roots'),
    allRecords<SnapshotRecord>(transaction, 'snapshots'),
    allRecords<StageRecord>(transaction, 'staging'),
    allRecords<PinRecord>(transaction, 'pins'),
    allRecords<HistoryRecord>(transaction, 'history'),
  ]);
  const snapshotIds = new Set(
    roots.flatMap((root) => [root.snapshotId, ...root.recoverySnapshotIds]),
  );
  const blobIds = new Set(stages.flatMap((stage) => stage.blobIds));
  for (const pin of pins) {
    pin.snapshotIds.forEach((id) => snapshotIds.add(id));
    pin.blobIds.forEach((id) => blobIds.add(id));
  }
  for (const history of histories) {
    [...history.undoBlobIds, ...history.redoBlobIds].forEach((id) => blobIds.add(id));
  }
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.id)) snapshot.project.blobIds.forEach((id) => blobIds.add(id));
  }
  return { snapshotIds, blobIds, snapshots };
}

export async function openProjectRepository(
  options: { indexedDB?: IDBFactory; name?: string } = {},
): Promise<ProjectRepository> {
  return new ProjectRepository(await openStorageDatabase(options));
}
