import { assertLocksPreserved } from '../model/editability';
import { cloneProject, validateProject, type Project3D } from '../model/project';
export class HistoryBudgetError extends Error {
  constructor() {
    super(
      'Undo予算を超えます。内容は変更していません。履歴を明示的に整理してから再操作してください。',
    );
    this.name = 'HistoryBudgetError';
  }
}
/** Session-local history. Does not register with the 2D global save queue. */
export class ProjectHistory {
  private current: Project3D;
  private undoStack: Project3D[] = [];
  private redoStack: Project3D[] = [];
  private previewState: Project3D | null = null;
  private persistedRevision: number | null;
  constructor(
    project: Project3D,
    private readonly budgetBytes = 32 * 1024 * 1024,
    persisted = false,
  ) {
    validateProject(project);
    this.current = cloneProject(project);
    this.persistedRevision = persisted ? project.revision : null;
  }
  get project() {
    return cloneProject(this.current);
  }
  get preview() {
    return cloneProject(this.previewState ?? this.current);
  }
  get dirty() {
    return this.persistedRevision !== this.current.revision;
  }
  get revision() {
    return this.current.revision;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get retainedBlobIds() {
    return [
      ...new Set([...this.undoStack, this.current, ...this.redoStack].flatMap((p) => p.blobIds)),
    ];
  }
  get historyBlobIds() {
    return {
      revision: this.current.revision,
      undoBlobIds: [...new Set(this.undoStack.flatMap((p) => p.blobIds))],
      redoBlobIds: [...new Set(this.redoStack.flatMap((p) => p.blobIds))],
    };
  }
  acknowledgeSaved(projectId: string, revision: number) {
    if (
      projectId !== this.current.id ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision > this.current.revision
    )
      throw new Error('Invalid save acknowledgement');
    if (this.persistedRevision === null || revision > this.persistedRevision)
      this.persistedRevision = revision;
  }
  previewCommand(edit: (candidate: Project3D) => void) {
    this.previewState = this.candidate(edit);
  }
  cancelPreview() {
    this.previewState = null;
  }
  commitPreview() {
    if (this.previewState) this.commit(this.previewState);
  }
  execute(edit: (candidate: Project3D) => void) {
    this.commit(this.candidate(edit));
  }
  undo() {
    const previous = this.undoStack.at(-1);
    if (!previous) return false;
    const restored = this.nextRevision(previous);
    this.redoStack.push(this.current);
    this.undoStack.pop();
    this.current = restored;
    this.previewState = null;
    return true;
  }
  redo() {
    const next = this.redoStack.at(-1);
    if (!next) return false;
    const restored = this.nextRevision(next);
    this.undoStack.push(this.current);
    this.redoStack.pop();
    this.current = restored;
    this.previewState = null;
    return true;
  }
  /** Explicit user-approved history cleanup only; never discards current edits or sources. */
  clearHistory() {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
    this.current = this.nextRevision(this.current);
    this.previewState = null;
    this.undoStack = [];
    this.redoStack = [];
  }
  private candidate(edit: (candidate: Project3D) => void) {
    const candidate = cloneProject(this.current);
    edit(candidate);
    if (candidate.id !== this.current.id || candidate.revision !== this.current.revision)
      throw new Error('Command cannot change identity or revision');
    for (const source of this.current.sources) {
      const next = candidate.sources.find((s) => s.id === source.id);
      if (next && next.blobId !== source.blobId)
        throw new Error('Source bytes are immutable; create a derived source');
    }
    validateProject(candidate);
    assertLocksPreserved(this.current, candidate);
    return cloneProject(candidate);
  }
  private nextRevision(project: Project3D) {
    if (this.current.revision === Number.MAX_SAFE_INTEGER) throw new Error('Revision exhausted');
    const next = cloneProject(project);
    next.revision = this.current.revision + 1;
    return next;
  }
  private commit(candidate: Project3D) {
    validateProject(candidate);
    const next = this.nextRevision(candidate);
    const retained = [...this.undoStack, this.current, next];
    if (new TextEncoder().encode(JSON.stringify(retained)).byteLength > this.budgetBytes)
      throw new HistoryBudgetError();
    this.undoStack.push(this.current);
    this.redoStack = [];
    this.current = next;
    this.previewState = null;
  }
}
