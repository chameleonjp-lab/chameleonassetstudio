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
 * 保存中、保存済み、保存失敗の状態を購読者へ返す。
 */
export class AutosaveQueue {
  private readonly delayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingTask: SaveTask | null = null;
  private currentRun: Promise<void> | null = null;
  private state: SaveState = { status: 'idle' };
  private readonly listeners = new Set<(state: SaveState) => void>();

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 800;
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

  /** 保存タスクを予約する。デバウンス中に再度呼ばれたら最新のタスクだけ残す。 */
  schedule(task: SaveTask): void {
    this.pendingTask = task;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startRun();
    }, this.delayMs);
  }

  /** 待機中・実行中の保存をすべて完了させる。画面遷移前などに使う。 */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.currentRun || this.pendingTask) {
      await (this.currentRun ?? this.startRun());
    }
  }

  private startRun(): Promise<void> {
    if (this.currentRun) {
      return this.currentRun;
    }
    const task = this.pendingTask;
    if (!task) {
      return Promise.resolve();
    }
    this.pendingTask = null;

    const run = (async () => {
      this.setState({ status: 'saving' });
      try {
        await task();
        this.setState({ status: 'saved', lastSavedAt: new Date().toISOString() });
      } catch (error) {
        this.setState({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    this.currentRun = run.finally(() => {
      this.currentRun = null;
      // 保存中に新しい操作が来ていたら続けて保存する
      if (this.pendingTask && !this.timer) {
        void this.startRun();
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
