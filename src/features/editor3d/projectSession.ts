// Keep the complete rescue encoder in the shell graph before any edit is accepted.
import { exportBackup, importBackup, BACKUP_LIMITS } from '../../core3d/backup/backup';
import { ProjectAutosave } from '../../core3d/commands/autosave';
import { ProjectHistory } from '../../core3d/commands/history';
import { addBox } from '../../core3d/commands/box';
import {
  assertFiniteAuthoringCoordinates,
  setNodeTransform,
} from '../../core3d/commands/objectEditing';
import { cloneProject, createProject, type Project3D } from '../../core3d/model/project';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { inspectNativeImage } from '../../core3d/model/nativeImageMetadata';
import { reserveNativeTextureBytes } from '../../core3d/model/textureResources';
import {
  hashBlob,
  StorageConflictError,
  type ProjectRepository,
  type SnapshotRead,
  type WriterLease,
} from '../../core3d/storage/repository';
import { SaveQueue } from '../../core3d/storage/saveQueue';
import type { NativeEditBinding } from '../../core3d/ports/editPort';
import { TransformTransaction } from './transformTransaction';

export { BACKUP_LIMITS };

export interface BinaryAuthoringContext {
  readonly id: string;
  readonly revision: number;
  readonly generation: number;
  readonly editEpoch: number;
}

export class UnsavedProjectError extends Error {
  constructor() {
    super('未保存の変更を保持しています。保存を再試行するか、別のコピーとして保存してください。');
    this.name = 'UnsavedProjectError';
  }
}

/** One open project owns its writer, history, immutable bytes, and rescue path. */
export class ProjectSession {
  private readonly history: ProjectHistory;
  private readonly transforms: TransformTransaction;
  private readonly autosave: ProjectAutosave | null;
  private readonly projectId: string;
  private conflict = false;
  private closed = false;
  private preservedRevision: number | null = null;
  /** Invalidates async binary preparation even when a boundary keeps the same revision. */
  private binaryGeneration = 0;
  private binaryPreparationBytes = 0;
  private binaryStorageHighWater = 0;
  private readonly binaryStorageReleases: (() => void)[] = [];

  private constructor(
    private readonly repository: ProjectRepository,
    private readonly ownerId: string,
    project: Project3D,
    private readonly blobs: Map<string, Uint8Array>,
    private readonly lease: WriterLease | null,
    private readonly snapshot: SnapshotRead | null,
    persisted: boolean,
  ) {
    this.projectId = project.id;
    this.history = new ProjectHistory(project, undefined, persisted);
    this.transforms = new TransformTransaction({
      getProject: () => this.history.project,
      getIdentity: () => ({ id: this.projectId, revision: this.history.revision }),
      isReadOnly: () => !this.lease || this.conflict || this.closed,
      commit: (updates, expected) =>
        this.executeAuthoring((candidate) => {
          for (const { id, transform } of updates) setNodeTransform(candidate, id, transform);
        }, expected),
    });
    this.autosave = lease
      ? new ProjectAutosave(
          new SaveQueue(
            {
              importStaged: (...args) => repository.importStaged(...args),
              discardStaged: (...args) => repository.discardStaged(...args),
              commit: async (...args) => {
                try {
                  return await repository.commit(...args);
                } catch (error) {
                  if (error instanceof StorageConflictError) {
                    this.conflict = true;
                    // Notify synchronously as soon as durable fencing establishes ownership loss.
                    this.transforms.reconcile('writer ownership lost');
                  }
                  throw error;
                }
              },
            },
            lease,
            persisted ? project.revision : null,
            project.revision,
          ),
        )
      : null;
    if (!persisted) this.schedule();
  }

  static async create(repository: ProjectRepository, ownerId: string, name: string) {
    const project = createProject(crypto.randomUUID(), name);
    const lease = await repository.acquireWriter(project.id, ownerId);
    return new ProjectSession(repository, ownerId, project, new Map(), lease, null, false);
  }

  static async open(repository: ProjectRepository, ownerId: string, projectId: string) {
    let lease: WriterLease | null = null;
    try {
      lease = await repository.acquireWriter(projectId, ownerId);
    } catch (error) {
      if (!(error instanceof StorageConflictError) || error.reason !== 'writer') throw error;
    }
    return this.read(repository, ownerId, projectId, lease);
  }

  private static async read(
    repository: ProjectRepository,
    ownerId: string,
    projectId: string,
    lease: WriterLease | null,
  ) {
    try {
      // Read after acquiring ownership so a takeover never writes an earlier reader snapshot.
      const snapshot = await repository.readSnapshot(projectId);
      return new ProjectSession(
        repository,
        ownerId,
        snapshot.project,
        snapshot.blobs,
        lease,
        snapshot,
        true,
      );
    } catch (error) {
      if (lease) await repository.releaseWriter(lease).catch(() => undefined);
      throw error;
    }
  }

  static async restore(repository: ProjectRepository, ownerId: string, bytes: Uint8Array) {
    const backup = await importBackup(bytes);
    const id = crypto.randomUUID();
    await repository.restoreCopy(backup.project, backup.blobs, id, ownerId, {
      legacyBackup: backup.legacyBackup,
    });
    return this.open(repository, ownerId, id);
  }

  get edit(): NativeEditBinding {
    return this.transforms;
  }

  get project() {
    return this.history.project;
  }

  get state() {
    const save = this.autosave?.state;
    const persistedRevision =
      save?.persistedRevision ?? (this.lease ? null : this.history.revision);
    if (persistedRevision !== null)
      this.history.acknowledgeSaved(this.projectId, persistedRevision);
    return {
      dirty: this.history.dirty,
      readOnly: !this.lease || this.conflict || this.closed,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      revision: this.history.revision,
      persistedRevision,
      status: save?.status ?? 'saved',
      errorMessage: save?.errorMessage ?? null,
    };
  }

  rename(name: string) {
    this.binaryGeneration++;
    this.transforms.cancel('rename');
    this.assertEditable();
    if (name === this.history.project.name) return;
    this.history.execute((project) => {
      project.name = name;
    });
    this.schedule();
  }

  addBox() {
    this.binaryGeneration++;
    this.transforms.cancel('add object');
    this.assertEditable();
    this.history.execute((project) => addBox(project, crypto.randomUUID()));
    this.schedule();
  }

  /** One native authoring transaction; candidates and failed edits never reach storage. */
  executeAuthoring(
    operation: (candidate: Project3D) => void,
    expected?: Pick<Project3D, 'id' | 'revision'>,
  ) {
    this.binaryGeneration++;
    this.transforms.cancel('authoring command');
    this.assertEditable();
    this.history.execute((candidate) => {
      if (expected && (candidate.id !== expected.id || candidate.revision !== expected.revision))
        throw new Error('作品が変わりました。現在の対象と値を確認して再操作してください。');
      operation(candidate);
      assertFiniteAuthoringCoordinates(candidate);
    });
    this.schedule();
  }

  /** Detached bytes: neither image decoders nor callers may mutate session-owned sources. */
  readBlob(id: string, maxBytes = NATIVE_TEXTURE_PROFILE.maxFileBytes): Uint8Array {
    const bytes = this.blobs.get(id);
    if (!bytes) throw new Error('画像の原本が見つかりません。バックアップを確認してください。');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
      throw new Error('画像読取のbyte上限が不正です。');
    if (bytes.byteLength > maxBytes)
      throw new Error('画像の容量が読取上限を超えます。元データはバックアップに保持しています。');
    this.reserveRetainedBinaryStorage();
    return new Uint8Array(bytes);
  }

  private reserveRetainedBinaryStorage() {
    const retained = [...this.blobs.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
    if (
      !Number.isSafeInteger(retained) ||
      retained > NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes
    )
      throw new Error(
        '原本・派生画像・Undoを含む画像容量の上限を超えます。元データは保持しています。',
      );
    const estimate = retained * 7;
    if (estimate > this.binaryStorageHighWater) {
      this.binaryStorageReleases.push(
        reserveNativeTextureBytes(
          'native session and save pipeline',
          estimate - this.binaryStorageHighWater,
        ),
      );
      this.binaryStorageHighWater = estimate;
    }
  }

  /** Capture before file reading/decoding, so save/cancel boundaries also invalidate that work. */
  captureBinaryContext(): BinaryAuthoringContext {
    this.binaryGeneration++;
    this.transforms.cancel('prepare binary authoring');
    this.assertEditable();
    // UI captures this before file reading/decoding, including when no material currently
    // displays a retained original and readBlob has never acquired the session ticket.
    this.reserveRetainedBinaryStorage();
    return Object.freeze({
      id: this.projectId,
      revision: this.history.revision,
      generation: this.binaryGeneration,
      editEpoch: this.transforms.state.epoch,
    });
  }

  /** Hash outside history/storage; publish the complete model and bytes in one synchronous step. */
  async executeBinaryAuthoring(
    operation: (candidate: Project3D) => void,
    incoming: ReadonlyMap<string, Uint8Array>,
    expected: Pick<Project3D, 'id' | 'revision'> &
      Partial<Pick<BinaryAuthoringContext, 'generation' | 'editEpoch'>>,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    options.signal?.throwIfAborted();
    this.assertEditable();
    if (
      (expected.generation !== undefined && expected.generation !== this.binaryGeneration) ||
      (expected.editEpoch !== undefined && expected.editEpoch !== this.transforms.state.epoch)
    )
      throw new Error('作品や操作対象が変わりました。現在の画像を確認して再操作してください。');
    const generation = ++this.binaryGeneration;
    this.transforms.cancel('binary authoring command');
    this.assertEditable();
    const identity = { ...expected };
    const epoch = this.transforms.state.epoch;
    const assertCurrent = () => {
      options.signal?.throwIfAborted();
      this.assertEditable();
      if (
        generation !== this.binaryGeneration ||
        epoch !== this.transforms.state.epoch ||
        identity.id !== this.projectId ||
        identity.revision !== this.history.revision
      )
        throw new Error('作品や操作対象が変わりました。現在の画像を確認して再操作してください。');
    };
    assertCurrent();
    // Count originals, derived bytes and all session history before making any new copies.
    let retainedBytes = [...this.blobs.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
    let incomingBytes = 0;
    for (const [id, bytes] of incoming) {
      if (!/^[a-f0-9]{64}$/.test(id) || !(bytes instanceof Uint8Array))
        throw new Error('画像のcontent IDまたはbyte列が不正です。');
      incomingBytes += bytes.byteLength;
      if (!this.blobs.has(id)) retainedBytes += bytes.byteLength;
      if (
        !Number.isSafeInteger(retainedBytes) ||
        retainedBytes > NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes ||
        incomingBytes > NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes ||
        bytes.byteLength > NATIVE_TEXTURE_PROFILE.maxFileBytes
      )
        throw new Error(
          '原本・派生画像・Undoを含む画像容量の上限を超えます。内容は変更していません。',
        );
    }
    if (retainedBytes > NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes)
      throw new Error(
        '原本・派生画像・Undoを含む画像容量の上限を超えます。内容は変更していません。',
      );
    if (
      this.binaryPreparationBytes + incomingBytes >
      NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes
    )
      throw new Error('別の画像処理が終了するまで待ってから再操作してください。');
    this.reserveRetainedBinaryStorage();
    const releasePreparation = reserveNativeTextureBytes(
      'native binary preparation',
      incomingBytes * 3,
    );
    this.binaryPreparationBytes += incomingBytes;
    const growth: { release: (() => void) | null } = { release: null };
    let storageEstimate = this.binaryStorageHighWater;
    try {
      // Copy every input before the first await so later caller mutations cannot race hashing.
      const copies = new Map([...incoming].map(([id, bytes]) => [id, new Uint8Array(bytes)]));
      for (const [id, bytes] of copies) {
        if ((await hashBlob(bytes)) !== id) throw new Error('画像のcontent hashが一致しません。');
        assertCurrent();
      }
      assertCurrent();
      this.history.execute((candidate) => {
        operation(candidate);
        assertCurrent();
        assertFiniteAuthoringCoordinates(candidate);
        if (candidate.blobIds.some((id) => !copies.has(id) && !this.blobs.has(id)))
          throw new Error('画像の原本が不足しています。内容は変更していません。');
        if ([...copies.keys()].some((id) => !candidate.blobIds.includes(id)))
          throw new Error('参照されていない画像は追加できません。');
        let totalPixels = 0;
        const textureHashes = new Set(
          candidate.materials.flatMap((material) =>
            material.textureBlobId === undefined ? [] : [material.textureBlobId],
          ),
        );
        for (const hash of textureHashes) {
          const bytes = copies.get(hash) ?? this.blobs.get(hash);
          if (!bytes) throw new Error('材質画像の原本が不足しています。');
          const info = inspectNativeImage(bytes);
          totalPixels += info.width * info.height;
          if (
            !Number.isSafeInteger(totalPixels) ||
            totalPixels > NATIVE_TEXTURE_PROFILE.maxTotalPixels
          )
            throw new Error('材質画像の合計pixel数が上限を超えます。内容は変更していません。');
        }
        if (
          candidate.blobIds.length + 2 > BACKUP_LIMITS.entries ||
          new TextEncoder().encode(JSON.stringify(candidate)).byteLength > BACKUP_LIMITS.jsonBytes
        )
          throw new Error('完全バックアップの上限を超えます。内容は変更していません。');
        const merged = new Map([...this.blobs, ...copies]);
        storageEstimate =
          [...merged.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) * 7;
        if (storageEstimate > this.binaryStorageHighWater)
          growth.release = reserveNativeTextureBytes(
            'native session and save pipeline',
            storageEstimate - this.binaryStorageHighWater,
          );
      });
      for (const [id, bytes] of copies) if (!this.blobs.has(id)) this.blobs.set(id, bytes);
      if (growth.release) {
        this.binaryStorageReleases.push(growth.release);
        this.binaryStorageHighWater = storageEstimate;
        growth.release = null;
      }
      this.schedule();
    } finally {
      // A superseded/aborted browser hash still owns its copies until the promise settles.
      this.binaryPreparationBytes -= incomingBytes;
      releasePreparation();
      growth.release?.();
    }
  }

  get sourcesComplete() {
    return this.history.project.blobIds.every((id) => this.blobs.has(id));
  }

  undo() {
    this.binaryGeneration++;
    this.transforms.cancel('undo');
    this.assertEditable();
    if (this.history.undo()) this.schedule();
  }

  redo() {
    this.binaryGeneration++;
    this.transforms.cancel('redo');
    this.assertEditable();
    if (this.history.redo()) this.schedule();
  }

  /** Explicit cleanup only; canonical originals/derivatives are never removed here. */
  clearHistory() {
    this.binaryGeneration++;
    this.transforms.cancel('clear history');
    this.assertEditable();
    const revision = this.history.revision;
    this.history.clearHistory();
    if (this.history.revision !== revision) this.schedule();
  }

  private assertEditable() {
    if (this.state.readOnly) throw new Error('このプロジェクトは読み取り専用です。');
  }

  private schedule() {
    const retained = new Set(this.history.retainedBlobIds);
    const bytes = new Map([...this.blobs].filter(([id]) => retained.has(id)));
    // Autosave and queued saves synchronously copy their inputs. Pruning this session map
    // cannot alter pending saves, backup/copy jobs, or durable root/staging/pin references.
    this.autosave!.schedule(this.history.project, bytes, this.history.historyBlobIds);
    for (const id of this.blobs.keys()) if (!retained.has(id)) this.blobs.delete(id);
    this.transforms.reconcile();
  }

  async save() {
    this.binaryGeneration++;
    this.transforms.cancel('explicit save');
    if (this.state.readOnly) {
      if (this.state.dirty) throw new UnsavedProjectError();
      return;
    }
    await this.autosave!.retry();
    // The getter reconciles only a durable acknowledgement, never a download.
    if (this.state.dirty) throw new UnsavedProjectError();
  }

  /** Captures CURRENT edits and all source bytes, even after a failed save or fencing. */
  backup() {
    this.binaryGeneration++;
    this.transforms.cancel('backup');
    return exportBackup(this.history.project, this.blobs);
  }

  async saveCopy() {
    this.binaryGeneration++;
    this.transforms.cancel('save copy');
    if (this.closed) throw new Error('このプロジェクトは閉じられています。');
    const project = cloneProject(this.history.project);
    const id = crypto.randomUUID();
    await this.repository.restoreCopy(project, this.blobs, id, this.ownerId);
    const copy = await ProjectSession.open(this.repository, this.ownerId, id);
    // Newer edits made while the copy was saving must still prevent closing this session.
    this.preservedRevision = project.revision;
    return copy;
  }

  async takeOver() {
    this.binaryGeneration++;
    this.transforms.cancel('take over');
    if (this.state.dirty) throw new UnsavedProjectError();
    const id = this.projectId;
    const lease = await this.repository.acquireWriter(id, this.ownerId, { takeover: true });
    return ProjectSession.read(this.repository, this.ownerId, id, lease);
  }

  async close() {
    this.binaryGeneration++;
    this.transforms.cancel('close');
    if (this.closed) return;
    if (this.state.dirty && this.preservedRevision !== this.history.revision) {
      await this.save();
      if (this.state.dirty) throw new UnsavedProjectError();
    }
    // Drain scheduled work before releasing ownership. A saved copy is the explicit rescue.
    if (this.autosave) {
      try {
        await this.autosave.flush();
      } catch (error) {
        if (this.state.dirty && this.preservedRevision !== this.history.revision) throw error;
      }
    }
    if (this.lease) {
      await this.repository.releaseHistoryReferences(this.lease);
      try {
        await this.repository.releaseWriter(this.lease);
      } catch (error) {
        if (!(error instanceof StorageConflictError)) throw error;
      }
    }
    await this.snapshot?.release();
    this.closed = true;
    this.blobs.clear();
    this.binaryStorageReleases.splice(0).forEach((release) => release());
    this.binaryStorageHighWater = 0;
    this.transforms.reconcile('closed');
  }
}
