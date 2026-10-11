import { assertLocksPreserved } from '../model/editability';
import { cloneProject, validateProject, type Project3D } from '../model/project';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';
import { createResourceOwner, type ResourceOwner } from '../profile/resourceLedger';

export class HistoryBudgetError extends Error {
  constructor() {
    super(
      'Undo予算（履歴を含む編集データの受入上限）を超えるため、この操作は適用していません。現在の内容とUndo/Redo履歴は保持しています。現在の内容をバックアップしてください。バックアップにUndo/Redo履歴は含まれません。',
    );
    this.name = 'HistoryBudgetError';
  }
}
interface OwnedProject {
  project: Project3D;
  bytes: number;
}

/** Session-only diagnostics; these two byte values use different accounting rules. */
export interface ProjectHistoryMetadata {
  readonly undoCount: number;
  readonly redoCount: number;
  readonly hasPreview: boolean;
  /** UTF-8 serialized undo + current + candidate limit checked when committing. */
  readonly serializedCommitBudgetBytes: number;
  /** Retained structural snapshot estimate, not measured heap or serialized usage. */
  readonly ownershipEstimateBytes: number | null;
}

/**
 * Session-local history, independent of the 2D save queue. Tracked owners charge
 * each current/undo/redo/preview structural snapshot once, plus candidate overlap.
 * Moving a private snapshot between stacks transfers ownership without cloning.
 * Caller-returned reads, callback allocations and serializer/GC overhead are not
 * measured heap usage; binary sources and other consumers have separate owners.
 */
export class ProjectHistory {
  private current: OwnedProject | null = null;
  private undoStack: OwnedProject[] = [];
  private redoStack: OwnedProject[] = [];
  private previewState: OwnedProject | null = null;
  private persistedRevision: number | null;
  private currentRevision: number;
  private readonly projectId: string;
  private readonly owner: ResourceOwner | null;
  private editing = false;
  constructor(
    project: Project3D,
    private readonly budgetBytes = 32 * 1024 * 1024,
    persisted = false,
    options: { trackResources?: boolean } = {},
  ) {
    validateProject(project);
    this.projectId = project.id;
    this.currentRevision = project.revision;
    this.persistedRevision = persisted ? project.revision : null;
    const bytes = options.trackResources ? estimateCanonicalBytes(project) : 0;
    this.owner = options.trackResources ? createResourceOwner('history', bytes) : null;
    try {
      this.current = { project: cloneProject(project), bytes };
    } catch (error) {
      this.owner?.release();
      throw error;
    }
  }
  private get active(): OwnedProject {
    if (!this.current) throw new Error('Project history is closed');
    return this.current;
  }
  get project() {
    return cloneProject(this.active.project);
  }
  get preview() {
    return cloneProject((this.previewState ?? this.active).project);
  }
  get dirty() {
    return this.persistedRevision !== this.currentRevision;
  }
  get revision() {
    return this.currentRevision;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  /** Reads stored counts/estimates only; never serializes, clones or traverses model data. */
  get metadata(): ProjectHistoryMetadata {
    return Object.freeze({
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      hasPreview: this.previewState !== null,
      serializedCommitBudgetBytes: this.budgetBytes,
      // The owner's ticket may temporarily include candidates during an edit callback.
      ownershipEstimateBytes: this.owner ? this.retainedBytes() : null,
    });
  }
  get retainedBlobIds() {
    return [
      ...new Set(
        [...this.undoStack, ...(this.current ? [this.current] : []), ...this.redoStack].flatMap(
          (p) => p.project.blobIds,
        ),
      ),
    ];
  }
  get historyBlobIds() {
    return {
      revision: this.currentRevision,
      undoBlobIds: [...new Set(this.undoStack.flatMap((p) => p.project.blobIds))],
      redoBlobIds: [...new Set(this.redoStack.flatMap((p) => p.project.blobIds))],
    };
  }
  acknowledgeSaved(projectId: string, revision: number) {
    if (
      projectId !== this.projectId ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision > this.currentRevision
    )
      throw new Error('Invalid save acknowledgement');
    if (this.persistedRevision === null || revision > this.persistedRevision)
      this.persistedRevision = revision;
  }
  previewCommand(edit: (candidate: Project3D) => void) {
    this.withCandidate(edit, (candidate) => {
      this.previewState = candidate;
    });
  }
  cancelPreview() {
    this.assertMutable();
    this.previewState = null;
    this.reconcileOwnership();
  }
  commitPreview() {
    this.assertMutable();
    if (this.previewState) {
      this.commit(this.previewState);
      this.reconcileOwnership();
    }
  }
  execute(edit: (candidate: Project3D) => void) {
    this.withCandidate(edit, (candidate) => this.commit(candidate));
  }
  undo() {
    this.assertMutable();
    const previous = this.undoStack.at(-1);
    if (!previous) return false;
    const revision = this.nextRevision();
    this.redoStack.push(this.active);
    this.undoStack.pop();
    this.current = previous;
    previous.project.revision = this.currentRevision = revision;
    this.previewState = null;
    this.reconcileOwnership();
    return true;
  }
  redo() {
    this.assertMutable();
    const next = this.redoStack.at(-1);
    if (!next) return false;
    const revision = this.nextRevision();
    this.undoStack.push(this.active);
    this.redoStack.pop();
    this.current = next;
    next.project.revision = this.currentRevision = revision;
    this.previewState = null;
    this.reconcileOwnership();
    return true;
  }
  /** Explicit user-approved history cleanup only; never discards current edits or sources. */
  clearHistory() {
    this.assertMutable();
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
    this.active.project.revision = this.currentRevision = this.nextRevision();
    this.previewState = null;
    this.undoStack = [];
    this.redoStack = [];
    this.reconcileOwnership();
  }
  /** Only a successfully closed/rescued session may discard its in-memory snapshots. */
  dispose() {
    if (this.editing) throw new Error('History operation is already in progress');
    this.current = null;
    this.previewState = null;
    this.undoStack = [];
    this.redoStack = [];
    this.owner?.release();
  }
  private assertMutable() {
    if (this.editing) throw new Error('History operation is already in progress');
    void this.active;
  }
  private retainedBytes() {
    return (
      (this.current?.bytes ?? 0) +
      (this.previewState?.bytes ?? 0) +
      this.undoStack.reduce((sum, snapshot) => sum + snapshot.bytes, 0) +
      this.redoStack.reduce((sum, snapshot) => sum + snapshot.bytes, 0)
    );
  }
  private reconcileOwnership() {
    this.owner?.resize(this.retainedBytes());
  }
  private withCandidate(
    edit: (candidate: Project3D) => void,
    accept: (candidate: OwnedProject) => void,
  ) {
    this.assertMutable();
    const current = this.active;
    const retained = this.retainedBytes();
    // Keep every old snapshot (including redo and preview) admitted until success.
    this.owner?.resize(retained + current.bytes);
    this.editing = true;
    try {
      const candidate = cloneProject(current.project);
      edit(candidate);
      if (candidate.id !== this.projectId || candidate.revision !== this.currentRevision)
        throw new Error('Command cannot change identity or revision');
      for (const source of current.project.sources) {
        const next = candidate.sources.find((s) => s.id === source.id);
        if (next && next.blobId !== source.blobId)
          throw new Error('Source bytes are immutable; create a derived source');
      }
      // Callback growth cannot be known before it runs. Admit its resulting size
      // before validating/adopting it and before creating the detached owned clone.
      const bytes = this.owner ? estimateCanonicalBytes(candidate) : 0;
      this.owner?.resize(retained + bytes);
      validateProject(candidate);
      assertLocksPreserved(current.project, candidate);
      this.owner?.resize(retained + bytes * 2);
      accept({ project: cloneProject(candidate), bytes });
    } finally {
      this.editing = false;
      this.reconcileOwnership();
    }
  }
  private nextRevision() {
    if (this.currentRevision === Number.MAX_SAFE_INTEGER) throw new Error('Revision exhausted');
    return this.currentRevision + 1;
  }
  private commit(candidate: OwnedProject) {
    const revision = this.nextRevision();
    // The shallow view aliases private data solely for the unchanged serialized
    // history check. Failure must leave even an existing preview's revision intact.
    const next = { ...candidate.project, revision };
    const retained = [...this.undoStack.map((p) => p.project), this.active.project, next];
    if (new TextEncoder().encode(JSON.stringify(retained)).byteLength > this.budgetBytes)
      throw new HistoryBudgetError();
    this.undoStack.push(this.active);
    this.redoStack = [];
    candidate.project.revision = this.currentRevision = revision;
    this.current = candidate;
    this.previewState = null;
  }
}
