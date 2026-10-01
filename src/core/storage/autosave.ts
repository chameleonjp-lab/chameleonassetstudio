export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  /** 保存失敗時の理由。UI に文章として表示する。 */
  errorMessage?: string;
  lastSavedAt?: string;
}

export interface AutosaveSnapshot {
  state: SaveState;
  hasTimer: boolean;
  hasPendingTask: boolean;
  hasFailedTask: boolean;
  isRunning: boolean;
  lastError: string | null;
}

export type SaveTask = () => Promise<void>;

/**
 * 自動保存キュー。
 * 同じ保存対象の操作だけをデバウンスし、異なる対象の保存は直列で走らせる。
 * flush / flushAll は保存失敗を呼び出し元へ伝え、後続の破壊的操作を止める。
 */
export class AutosaveQueue {
  private static readonly activeQueues = new Set<AutosaveQueue>();

  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingTasks = new Map<string, SaveTask>();
  private currentRun: Promise<void> | null = null;
  private lastError: unknown = null;
  private readonly failures = new Map<string, { task: SaveTask; error: unknown }>();
  private state: SaveState = { status: 'idle' };
  private readonly listeners = new Set<(state: SaveState) => void>();

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 800;
  }

  static async flushAll(): Promise<void> {
    while (AutosaveQueue.activeQueues.size > 0) {
      const queues = [...AutosaveQueue.activeQueues];
      const results = await Promise.allSettled(queues.map((queue) => queue.flush()));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    }
  }

  /** 履歴の巻き戻しを永続化し、元の失敗理由と安全な再試行内容を保持する。 */
  static async flushRollback(): Promise<void> {
    const results = await Promise.allSettled(
      [...AutosaveQueue.activeQueues].map((queue) => queue.flush(true)),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  /**
   * 待機中taskとtimerのみを破棄する。実行中taskと失敗の記録は維持する。
   * 履歴の巻き戻しはflushRollbackを使い、保存済みの変更も正本へ戻す。
   */
  static cancelAllPending(): void {
    for (const queue of AutosaveQueue.activeQueues) {
      queue.cancelPending();
    }
  }

  getState(): SaveState {
    return this.state;
  }

  /** 読み取り専用境界の検証用。保存task自体は公開しない。 */
  getSnapshot(): AutosaveSnapshot {
    return {
      state: { ...this.state },
      hasTimer: this.timer !== null,
      hasPendingTask: this.pendingTasks.size > 0,
      hasFailedTask: this.failures.size > 0,
      isRunning: this.currentRun !== null,
      lastError:
        this.lastError === null
          ? null
          : this.lastError instanceof Error
            ? this.lastError.message
            : String(this.lastError),
    };
  }

  /** 失敗した保存対象を、明示的な操作で再試行できるかを返す。 */
  canRetry(): boolean {
    return (
      this.failures.size > 0 &&
      this.currentRun === null &&
      this.pendingTasks.size === 0 &&
      this.timer === null
    );
  }

  /** 保存失敗後に同じ保存を一度だけ再予約する。新しい編集があればそちらを優先する。 */
  retryLastFailure(): boolean {
    if (!this.canRetry()) {
      return false;
    }
    for (const [key, { task }] of [...this.failures]) {
      this.schedule(task, key);
    }
    return true;
  }

  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  schedule(task: SaveTask, key = 'default'): void {
    AutosaveQueue.activeQueues.add(this);
    this.pendingTasks.set(key, task);
    this.setState(
      this.lastError !== null
        ? { status: 'error', errorMessage: this.errorText(this.lastError) }
        : { status: this.currentRun ? 'saving' : 'pending' },
    );
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startRun().catch(() => {
        // 失敗はstateに保持し、flushで呼び出し元へ返す。
      });
    }, this.delayMs);
  }

  async flush(preserveFailures = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.currentRun || this.pendingTasks.size > 0) {
      // 全対象を排出してから失敗を返す。別対象の失敗で保留変更を捨てない。
      await (this.currentRun ?? this.startRun(preserveFailures)).catch(() => {});
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
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
    this.pendingTasks.clear();
    if (!this.currentRun && this.failures.size === 0) {
      AutosaveQueue.activeQueues.delete(this);
    }
  }

  private startRun(preserveFailures = false): Promise<void> {
    if (this.currentRun) {
      return this.currentRun;
    }
    if (this.pendingTasks.size === 0) {
      if (this.lastError === null) {
        AutosaveQueue.activeQueues.delete(this);
      }
      return this.lastError === null ? Promise.resolve() : Promise.reject(this.lastError);
    }
    const tasks = [...this.pendingTasks];
    this.pendingTasks.clear();
    // microtaskで開始し、同期throwや即時scheduleより前にcurrentRunを設定する。
    const run = Promise.resolve().then(async () => {
      this.setState({ status: 'saving' });
      for (const [key, task] of tasks) {
        try {
          await task();
          const failure = this.failures.get(key);
          if (preserveFailures && failure) {
            this.failures.set(key, { task, error: failure.error });
          } else {
            this.failures.delete(key);
          }
        } catch (error) {
          this.failures.set(key, { task, error });
        }
      }
      this.lastError = this.failures.values().next().value?.error ?? null;
      if (this.lastError !== null) {
        this.setState({ status: 'error', errorMessage: this.errorText(this.lastError) });
        throw this.lastError;
      }
      this.setState(
        this.pendingTasks.size > 0
          ? { status: 'pending' }
          : { status: 'saved', lastSavedAt: new Date().toISOString() },
      );
    });

    this.currentRun = run.finally(() => {
      this.currentRun = null;
      if (this.pendingTasks.size > 0 && !this.timer) {
        void this.startRun().catch(() => {});
      } else if (this.pendingTasks.size === 0 && this.lastError === null) {
        AutosaveQueue.activeQueues.delete(this);
      }
    });
    return this.currentRun;
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
