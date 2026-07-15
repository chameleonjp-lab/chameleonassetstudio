export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  /** 保存失敗時の理由。UI に文章として表示する。 */
  errorMessage?: string;
  lastSavedAt?: string;
}

export type SaveTask = () => Promise<void>;

/**
 * 自動保存キュー。
 * 連続する操作は最後のタスクにまとめ（デバウンス）、保存は常に直列で走らせる。
 * flush / flushAll は保存失敗を呼び出し元へ伝え、後続の破壊的操作を止める。
 */
export class AutosaveQueue {
  private static readonly activeQueues = new Set<AutosaveQueue>();

  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingTask: SaveTask | null = null;
  private currentRun: Promise<void> | null = null;
  private lastError: unknown = null;
  private state: SaveState = { status: 'idle' };
  private readonly listeners = new Set<(state: SaveState) => void>();

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 800;
  }

  static async flushAll(): Promise<void> {
    while (AutosaveQueue.activeQueues.size > 0) {
      const queues = [...AutosaveQueue.activeQueues];
      await Promise.all(queues.map((queue) => queue.flush()));
    }
  }

  /**
   * 保存失敗後にUIを保存前状態へ戻した場合、rollbackが予約した重複autosaveだけを破棄する。
   * 実行中taskは中断せず、待機中taskとtimerのみを取り除く。
   */
  static cancelAllPending(): void {
    for (const queue of AutosaveQueue.activeQueues) {
      queue.cancelPending();
    }
  }

  getState(): SaveState {
    return this.state;
  }

  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  schedule(task: SaveTask): void {
    AutosaveQueue.activeQueues.add(this);
    this.lastError = null;
    this.pendingTask = task;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startRun().catch(() => {
        // 失敗はstateとlastErrorへ保持し、次のflush / flushAllで呼び出し元へ返す。
      });
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.currentRun || this.pendingTask) {
      await (this.currentRun ?? this.startRun());
    }
    if (this.lastError !== null) {
      throw this.lastError;
    }
    AutosaveQueue.activeQueues.delete(this);
  }

  private cancelPending(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingTask = null;
    if (!this.currentRun) {
      AutosaveQueue.activeQueues.delete(this);
    }
  }

  private startRun(): Promise<void> {
    if (this.currentRun) {
      return this.currentRun;
    }
    const task = this.pendingTask;
    if (!task) {
      if (this.lastError === null) {
        AutosaveQueue.activeQueues.delete(this);
      }
      return this.lastError === null ? Promise.resolve() : Promise.reject(this.lastError);
    }
    this.pendingTask = null;

    const run = (async () => {
      this.setState({ status: 'saving' });
      try {
        await task();
        this.lastError = null;
        this.setState({ status: 'saved', lastSavedAt: new Date().toISOString() });
      } catch (error) {
        this.lastError = error;
        this.setState({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    })();

    this.currentRun = run.finally(() => {
      this.currentRun = null;
      if (this.pendingTask && !this.timer) {
        void this.startRun().catch(() => {
          // 次のflushで失敗を伝える。
        });
      } else if (!this.pendingTask && this.lastError === null) {
        AutosaveQueue.activeQueues.delete(this);
      }
    });
    return this.currentRun;
  }

  private setState(state: SaveState): void {
    this.state = { ...this.state, ...state };
    if (state.status !== 'error') {
      delete this.state.errorMessage;
    }
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
