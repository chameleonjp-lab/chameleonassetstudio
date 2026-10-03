// Keep the complete rescue encoder in the shell graph before any edit is accepted.
import { exportBackup, importBackup, BACKUP_LIMITS } from '../../core3d/backup/backup';
import { ProjectAutosave } from '../../core3d/commands/autosave';
import { ProjectHistory } from '../../core3d/commands/history';
import { cloneProject, createProject, type Project3D } from '../../core3d/model/project';
import {
  StorageConflictError,
  type ProjectRepository,
  type SnapshotRead,
  type WriterLease,
} from '../../core3d/storage/repository';
import { SaveQueue } from '../../core3d/storage/saveQueue';

export { BACKUP_LIMITS };

export class UnsavedProjectError extends Error {
  constructor() {
    super('未保存の変更を保持しています。保存を再試行するか、別のコピーとして保存してください。');
    this.name = 'UnsavedProjectError';
  }
}

/** One open project owns its writer, history, immutable bytes, and rescue path. */
export class ProjectSession {
  private readonly history: ProjectHistory;
  private readonly autosave: ProjectAutosave | null;
  private readonly projectId: string;
  private conflict = false;
  private closed = false;
  private preservedRevision: number | null = null;

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
                  if (error instanceof StorageConflictError) this.conflict = true;
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
    await repository.restoreCopy(backup.project, backup.blobs, id, ownerId);
    return this.open(repository, ownerId, id);
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
    this.assertEditable();
    if (name === this.history.project.name) return;
    this.history.execute((project) => {
      project.name = name;
    });
    this.schedule();
  }

  undo() {
    this.assertEditable();
    if (this.history.undo()) this.schedule();
  }

  redo() {
    this.assertEditable();
    if (this.history.redo()) this.schedule();
  }

  private assertEditable() {
    if (this.state.readOnly) throw new Error('このプロジェクトは読み取り専用です。');
  }

  private schedule() {
    this.autosave!.schedule(this.history.project, this.blobs, this.history.historyBlobIds);
  }

  async save() {
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
    return exportBackup(this.history.project, this.blobs);
  }

  async saveCopy() {
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
    if (this.state.dirty) throw new UnsavedProjectError();
    const id = this.projectId;
    const lease = await this.repository.acquireWriter(id, this.ownerId, { takeover: true });
    return ProjectSession.read(this.repository, this.ownerId, id, lease);
  }

  async close() {
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
  }
}
