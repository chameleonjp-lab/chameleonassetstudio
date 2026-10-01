import { AutosaveQueue } from '../storage/autosave';

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

export interface HistorySnapshot {
  state: HistoryState;
  undoLabels: string[];
  redoLabels: string[];
  pendingPush: boolean;
}

const DEFAULT_LIMIT = 100;

/**
 * Undo / Redo の入口。
 * entry追加は同じtickで予約されたautosaveが成功してから確定し、失敗時はUIを元へ戻す。
 */
export class History {
  private readonly limit: number;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pendingPush: Promise<void> | null = null;
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

  /** 読み取り専用境界の検証用。undo/redo関数自体は公開しない。 */
  getSnapshot(): HistorySnapshot {
    return {
      state: { ...this.state },
      undoLabels: this.undoStack.map((entry) => entry.label),
      redoLabels: this.redoStack.map((entry) => entry.label),
      pendingPush: this.pendingPush !== null,
    };
  }

  subscribe(listener: (state: HistoryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** テストと複合操作用。保留中entryの保存確認と確定を待つ。 */
  async waitForPending(): Promise<void> {
    await this.pendingPush;
  }

  /**
   * 実行済み操作を保存成功後に記録する。
   * 呼び出し元がこの直後にautosaveをscheduleするため、microtaskでflushを開始する。
   */
  push(entry: HistoryEntry): boolean {
    if (this.state.isBusy) {
      this.notify();
      return false;
    }

    this.setBusy(true);
    const pending = Promise.resolve().then(async () => {
      try {
        await AutosaveQueue.flushAll();
        this.undoStack.push(entry);
        if (this.undoStack.length > this.limit) {
          this.undoStack.shift();
        }
        this.redoStack = [];
      } catch {
        // 対象別保存では一部だけ成功し得るため、巻き戻しも正本へ保存する。
        // 再試行は巻き戻し後の内容を使い、失敗理由は利用者へ残す。
        try {
          await entry.undo();
          await AutosaveQueue.flushRollback();
        } catch {
          // 元の保存失敗はAutosaveQueueのerror stateで利用者へ表示される。
        }
      } finally {
        this.pendingPush = null;
        this.setBusy(false);
      }
    });
    this.pendingPush = pending;
    return true;
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
    let applied = false;
    try {
      await entry.undo();
      applied = true;
      await AutosaveQueue.flushAll();
      this.undoStack.pop();
      this.redoStack.push(entry);
      this.notify();
      return true;
    } catch (error) {
      if (applied) {
        try {
          await entry.redo();
          await AutosaveQueue.flushRollback();
        } catch {
          // 失敗理由と巻き戻し内容は保存キューに残し、履歴位置を変えない。
        }
      }
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
    let applied = false;
    try {
      await entry.redo();
      applied = true;
      await AutosaveQueue.flushAll();
      this.redoStack.pop();
      this.undoStack.push(entry);
      this.notify();
      return true;
    } catch (error) {
      if (applied) {
        try {
          await entry.undo();
          await AutosaveQueue.flushRollback();
        } catch {
          // 失敗理由と巻き戻し内容は保存キューに残し、履歴位置を変えない。
        }
      }
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
