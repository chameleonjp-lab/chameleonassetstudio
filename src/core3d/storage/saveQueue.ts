import { cloneProject, type Project3D } from '../model/project';
import type {
  BlobBytes,
  CommitResult,
  HistoryReferences,
  ProjectRepository,
  WriterLease,
} from './repository';

/** One queue per project/writer. The database still arbitrates between queues and tabs. */
export class SaveQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastSave: Promise<CommitResult> | undefined;
  private editorRevision: number;
  private durableRevision: number | null;
  private readonly lease: WriterLease;

  constructor(
    private readonly repository: Pick<
      ProjectRepository,
      'importStaged' | 'commit' | 'discardStaged'
    >,
    lease: WriterLease,
    persistedRevision: number | null,
    initialEditorRevision = persistedRevision ?? 0,
  ) {
    this.lease = { ...lease };
    this.durableRevision = persistedRevision;
    this.editorRevision = initialEditorRevision;
  }

  get persistedRevision(): number | null {
    return this.durableRevision;
  }

  get dirty(): boolean {
    return this.editorRevision !== this.durableRevision;
  }

  noteEdited(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < this.editorRevision) {
      throw new Error('Editor revisions must be monotonic, including Undo/Redo');
    }
    this.editorRevision = revision;
  }

  save(project: Project3D, blobs: BlobBytes, history?: HistoryReferences): Promise<CommitResult> {
    const snapshot = cloneProject(project);
    if (snapshot.id !== this.lease.projectId)
      throw new Error('Save queue belongs to a different project');
    // Capture data at request time, before a preceding save or hash computation can yield.
    const bytes = new Map([...blobs].map(([id, data]) => [id, new Uint8Array(data)]));
    const refs = history && {
      revision: history.revision,
      undoBlobIds: [...history.undoBlobIds],
      redoBlobIds: [...history.redoBlobIds],
    };
    this.noteEdited(Math.max(snapshot.revision, this.editorRevision));
    const save = this.tail.then(async () => {
      const stage = await this.repository.importStaged(snapshot, bytes);
      try {
        const result = await this.repository.commit(stage, {
          expectedRevision: this.durableRevision,
          lease: this.lease,
          history: refs,
        });
        this.durableRevision = result.revision;
        return result;
      } catch (error) {
        await this.repository.discardStaged(stage);
        throw error;
      }
    });
    this.lastSave = save;
    // Failure leaves the revision unchanged but does not poison the local queue.
    this.tail = save.then(
      () => undefined,
      () => undefined,
    );
    return save;
  }

  async flush(): Promise<void> {
    await this.lastSave;
  }
}
