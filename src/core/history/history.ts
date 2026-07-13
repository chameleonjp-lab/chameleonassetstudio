export interface HistoryEntry {
  /** UI 表示用の操作名（例: レイヤー移動）。 */
  label: string;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  isBusy: boolean;
}

const DEFAULT_LIMIT = 100;

/**
 * Undo / Redo の入口（要件 13）。
 * 操作の適用は呼び出し側で済ませ、undo / redo の手順だけを積む。
 */
export class History {
  private readonly limit: number;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private state: HistoryState = {
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    isBusy: false,
  };
  private readonly listeners = new Set<(state: HistoryState) => void>();

  constructor(options?: { limit?: number }) {
    this.limit = options?.limit ?? DEFAULT_LIMIT;
  }

  getState(): HistoryState {
    return this.state;
  }

  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 実行済みの操作を記録する。新しい操作で Redo 履歴は消える。 */
  push(entry: HistoryEntry): void {
    if (this.state.isBusy) {
      return;
    }
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notify();
  }

  async undo(): Promise<boolean> {
    if (this.state.isBusy) {
      return false;
    }
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return false;
    }
    this.setBusy(true);
    try {
      await entry.undo();
      this.undoStack.pop();
      this.redoStack.push(entry);
      this.notify();
      return true;
    } catch (error) {
      this.notify();
      throw error;
    } finally {
      this.setBusy(false);
    }
  }

  async redo(): Promise<boolean> {
    if (this.state.isBusy) {
      return false;
    }
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return false;
    }
    this.setBusy(true);
    try {
      await entry.redo();
      this.redoStack.pop();
      this.undoStack.push(entry);
      this.notify();
      return true;
    } catch (error) {
      this.notify();
      throw error;
    } finally {
      this.setBusy(false);
    }
  }

  clear(): void {
    if (this.state.isBusy) {
      return;
    }
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  private setBusy(isBusy: boolean): void {
    this.state = { ...this.state, isBusy };
    this.notify();
  }

  private notify(): void {
    this.state = {
      canUndo: this.undoStack.length > 0 && !this.state.isBusy,
      canRedo: this.redoStack.length > 0 && !this.state.isBusy,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
      isBusy: this.state.isBusy,
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
