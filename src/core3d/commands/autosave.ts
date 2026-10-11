import { reserveResourceBytes } from '../profile/resourceLedger';
import { estimateCanonicalBytes, estimateBinaryCopyBytes } from '../profile/resourceEstimates';
import { cloneProject, type Project3D } from '../model/project';
import type { BlobBytes, HistoryReferences } from '../storage/repository';
import { SaveQueue } from '../storage/saveQueue';
interface PendingSave {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  history?: HistoryReferences;
  release: () => void;
}
/** Project-local debounce. An error keeps the last candidate available for retry or backup. */
export class ProjectAutosave {
  private pending: PendingSave | null = null;
  private failed: PendingSave | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private error: unknown = null;
  private latestScheduledRevision: number | null = null;
  private needsReschedule = false;
  private readonly delayMs: number;
  private readonly maxWaitMs: number;
  constructor(
    private readonly queue: SaveQueue,
    options: { delayMs?: number; maxWaitMs?: number } = {},
  ) {
    this.delayMs = options.delayMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 5000;
    if (
      !Number.isFinite(this.delayMs) ||
      this.delayMs < 0 ||
      !Number.isFinite(this.maxWaitMs) ||
      this.maxWaitMs < this.delayMs
    )
      throw new Error('Invalid autosave interval');
  }
  get state() {
    return {
      status: this.running
        ? 'saving'
        : this.error
          ? 'error'
          : this.pending
            ? 'pending'
            : this.queue.dirty
              ? 'unsaved'
              : 'saved',
      dirty: this.queue.dirty,
      needsReschedule: this.needsReschedule,
      persistedRevision: this.queue.persistedRevision,
      errorMessage:
        this.error instanceof Error ? this.error.message : this.error ? String(this.error) : null,
    } as const;
  }
  schedule(project: Project3D, blobs: BlobBytes, history?: HistoryReferences) {
    this.queue.noteEdited(project.revision);
    this.latestScheduledRevision = project.revision;
    let release: (() => void) | null = null;
    let next: PendingSave;
    try {
      release = reserveResourceBytes(
        'storage',
        estimateCanonicalBytes(project) +
          estimateBinaryCopyBytes(blobs, 1) +
          (history ? estimateCanonicalBytes(history) : 0),
      );
      next = {
        project: cloneProject(project),
        blobs: new Map([...blobs].map(([id, bytes]) => [id, bytes.slice()])),
        history: history ? structuredClone(history) : undefined,
        release,
      };
    } catch (error) {
      release?.();
      this.error = error;
      this.needsReschedule = true;
      throw error;
    }
    if (this.pending && this.pending !== this.failed) this.pending.release();
    this.pending = next;
    this.needsReschedule = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delayMs);
    if (!this.deadline)
      this.deadline = setTimeout(() => {
        void this.flush().catch(() => {});
      }, this.maxWaitMs);
  }
  async flush(): Promise<void> {
    this.clearTimers();
    if (this.running) {
      try {
        await this.running;
      } catch (error) {
        if (!this.pending) throw error;
      }
      if (this.pending) await this.flush();
      return;
    }
    this.running = Promise.resolve()
      .then(async () => {
        while (this.pending) {
          const candidate = this.pending;
          this.pending = null;
          try {
            await this.queue.save(candidate.project, candidate.blobs, candidate.history);
            if (!this.failed || this.failed.project.revision <= candidate.project.revision) {
              this.failed?.release();
              this.failed = null;
              this.error = null;
            }
            candidate.release();
          } catch (error) {
            if (this.failed !== candidate) this.failed?.release();
            this.failed = candidate;
            this.error = error;
          }
        }
        if (this.error) throw this.error;
      })
      .finally(() => {
        this.running = null;
        if (!this.pending) this.clearTimers();
      });
    try {
      await this.running;
    } catch (error) {
      if (!this.pending) throw error;
    }
    if (this.pending) await this.flush();
  }
  async retry(): Promise<void> {
    if (this.running) return this.flush();
    if (!this.pending && this.failed) this.pending = this.failed;
    return this.flush();
  }
  /** Only a completed durable save or an exact explicitly preserved copy can release failed clones. */
  releaseAfterClose(preservedRevision: number | null): void {
    if (
      this.running ||
      (this.queue.dirty &&
        (preservedRevision === null || preservedRevision !== this.latestScheduledRevision))
    )
      throw new Error('Autosave resources still contain unpreserved changes');
    this.clearTimers();
    this.pending?.release();
    this.failed?.release();
    this.pending = null;
    this.failed = null;
  }
  /** No timer cancellation silently discards dirty state. Close callers must await save or rescue. */
  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.deadline) clearTimeout(this.deadline);
    this.timer = null;
    this.deadline = null;
  }
}
