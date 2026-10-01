import { describe, expect, it, vi } from 'vitest';
import { AutosaveQueue } from '../storage/autosave';
import { History, type HistoryState } from './history';

function makeCounterEntry(label: string, state: { value: number }, delta: number) {
  return {
    label,
    undo: () => {
      state.value -= delta;
    },
    redo: () => {
      state.value += delta;
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function pushAndWait(history: History, entry: Parameters<History['push']>[0]) {
  expect(history.push(entry)).toBe(true);
  await history.waitForPending();
}

describe('History', () => {
  it('読み取り専用snapshotでstack labelとpendingを関数本体なしに比較できる', async () => {
    const history = new History();
    const state = { value: 1 };

    history.push(makeCounterEntry('+1', state, 1));
    expect(history.getSnapshot()).toMatchObject({
      undoLabels: [],
      redoLabels: [],
      pendingPush: true,
    });
    await history.waitForPending();
    expect(history.getSnapshot()).toMatchObject({
      undoLabels: ['+1'],
      redoLabels: [],
      pendingPush: false,
    });
  });

  it('pushは保存確認中をbusyにし、確定後だけUndo可能にする', async () => {
    const history = new History();
    const state = { value: 1 };
    expect(history.push(makeCounterEntry('+1', state, 1))).toBe(true);
    expect(history.getState()).toMatchObject({ isBusy: true, canUndo: false });
    await history.waitForPending();
    expect(history.getState()).toMatchObject({ isBusy: false, canUndo: true, undoLabel: '+1' });
  });

  it('undo / redoで操作を巻き戻し・やり直しできる', async () => {
    const history = new History();
    const state = { value: 0 };
    state.value += 1;
    await pushAndWait(history, makeCounterEntry('+1', state, 1));
    state.value += 10;
    await pushAndWait(history, makeCounterEntry('+10', state, 10));
    expect(state.value).toBe(11);
    await expect(history.undo()).resolves.toBe(true);
    expect(state.value).toBe(1);
    await expect(history.undo()).resolves.toBe(true);
    expect(state.value).toBe(0);
    await expect(history.redo()).resolves.toBe(true);
    expect(state.value).toBe(1);
    await expect(history.redo()).resolves.toBe(true);
    expect(state.value).toBe(11);
  });

  it('新しい操作を確定するとRedo履歴が消える', async () => {
    const history = new History();
    const state = { value: 1 };
    await pushAndWait(history, makeCounterEntry('+1', state, 1));
    await history.undo();
    expect(history.getState().canRedo).toBe(true);
    state.value += 5;
    await pushAndWait(history, makeCounterEntry('+5', state, 5));
    expect(history.getState().canRedo).toBe(false);
  });

  it('上限を超えた古い履歴を捨てる', async () => {
    const history = new History({ limit: 2 });
    const state = { value: 0 };
    for (const delta of [1, 2, 4]) {
      state.value += delta;
      await pushAndWait(history, makeCounterEntry(`+${delta}`, state, delta));
    }
    await history.undo();
    await history.undo();
    await expect(history.undo()).resolves.toBe(false);
    expect(state.value).toBe(1);
  });

  it('状態変更を購読者へ通知する', async () => {
    const history = new History();
    const states: HistoryState[] = [];
    history.subscribe((state) => states.push(state));
    const state = { value: 1 };
    await pushAndWait(history, makeCounterEntry('レイヤー移動', state, 1));
    expect(history.getState().undoLabel).toBe('レイヤー移動');
    await history.undo();
    expect(history.getState().redoLabel).toBe('レイヤー移動');
    expect(states.length).toBeGreaterThanOrEqual(4);
  });

  it('clearで履歴を空にする', async () => {
    const history = new History();
    const state = { value: 1 };
    await pushAndWait(history, makeCounterEntry('+1', state, 1));
    history.clear();
    expect(history.getState().canUndo).toBe(false);
  });

  it('autosave成功後だけentryを確定する', async () => {
    const history = new History();
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    const state = { value: 1 };
    history.push(makeCounterEntry('persisted', state, 1));
    let saved = false;
    queue.schedule(async () => {
      saved = true;
    });
    await history.waitForPending();
    expect(saved).toBe(true);
    expect(history.getState()).toMatchObject({ canUndo: true, undoLabel: 'persisted' });
  });

  it('autosave失敗時はUI状態を戻しentryを登録しない', async () => {
    const history = new History();
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    const state = { value: 1 };
    history.push({
      label: 'failed metadata',
      undo: () => {
        state.value = 0;
        queue.schedule(async () => {});
      },
      redo: () => {
        state.value = 1;
      },
    });
    queue.schedule(async () => {
      throw new Error('metadata save failed');
    });
    await history.waitForPending();
    expect(state.value).toBe(0);
    expect(queue.getState()).toMatchObject({
      status: 'error',
      errorMessage: 'metadata save failed',
    });
    expect(history.getState()).toMatchObject({ canUndo: false, canRedo: false, isBusy: false });
    expect(queue.retryLastFailure()).toBe(true);
    await queue.flush();
  });

  it.each([true, false])(
    '失敗の巻き戻しと再試行は画面と保存内容を一致させる: ownFailure=%s',
    async (ownFailure) => {
      const history = new History();
      const queue = new AutosaveQueue({ delayMs: 60_000 });
      let ui = 'new';
      let stored = 'old';
      let failing = true;
      history.push({
        label: 'rename',
        undo: () => {
          ui = 'old';
          queue.schedule(async () => {
            stored = 'old';
          }, 'project');
        },
        redo: () => {},
      });
      queue.schedule(async () => {
        if (ownFailure && failing) throw new Error('save failed');
        stored = 'new';
      }, 'project');
      if (!ownFailure)
        queue.schedule(async () => {
          if (failing) throw new Error('save failed');
        }, 'asset');
      await history.waitForPending();
      expect(ui).toBe('old');
      expect(stored).toBe('old');
      expect(history.getState().canUndo).toBe(false);
      await expect(AutosaveQueue.flushAll()).rejects.toThrow('save failed');
      failing = false;
      expect(queue.retryLastFailure()).toBe(true);
      await queue.flush();
      expect(ui).toBe(stored);
      expect(stored).toBe('old');
    },
  );

  it.each(['undo', 'redo'] as const)(
    '%sの保存失敗後も画面・正本・履歴位置を揃え、安全に再試行できる',
    async (direction) => {
      const history = new History();
      const queue = new AutosaveQueue({ delayMs: 60_000 });
      let ui = 'new';
      let stored = 'new';
      let fail = false;
      const apply = (value: string) => {
        ui = value;
        queue.schedule(async () => {
          if (fail) throw new Error('save failed');
          stored = value;
        }, 'project');
      };
      await pushAndWait(history, {
        label: 'rename',
        undo: () => apply('old'),
        redo: () => apply('new'),
      });
      if (direction === 'redo') await history.undo();
      const previous = ui;
      fail = true;
      await expect(history[direction]()).rejects.toThrow('save failed');
      expect(ui).toBe(previous);
      expect(stored).toBe(previous);
      expect(history.getState()[direction === 'undo' ? 'canUndo' : 'canRedo']).toBe(true);
      fail = false;
      expect(queue.retryLastFailure()).toBe(true);
      await queue.flush();
      expect(ui).toBe(stored);
      expect(await history[direction]()).toBe(true);
      expect(ui).toBe(direction === 'undo' ? 'old' : 'new');
      expect(ui).toBe(stored);
      expect(history.getState()[direction === 'undo' ? 'canRedo' : 'canUndo']).toBe(true);
    },
  );

  it('非同期Undoは完了前にstackを移動しない', async () => {
    const history = new History();
    const gate = deferred();
    const undo = vi.fn(() => gate.promise);
    await pushAndWait(history, { label: 'async', undo, redo: vi.fn() });
    const running = history.undo();
    expect(history.getState()).toMatchObject({ isBusy: true, canUndo: false, canRedo: false });
    gate.resolve();
    await expect(running).resolves.toBe(true);
    expect(history.getState()).toMatchObject({ isBusy: false, canUndo: false, canRedo: true });
  });

  it('Undo / Redoがrejectした場合は元のstackを維持する', async () => {
    const history = new History();
    await pushAndWait(history, {
      label: 'fail',
      undo: () => Promise.reject(new Error('boom')),
      redo: vi.fn(),
    });
    await expect(history.undo()).rejects.toThrow('boom');
    expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false, isBusy: false });

    const second = new History();
    await pushAndWait(second, {
      label: 'fail redo',
      undo: vi.fn(),
      redo: () => Promise.reject(new Error('redo boom')),
    });
    await second.undo();
    await expect(second.redo()).rejects.toThrow('redo boom');
    expect(second.getState()).toMatchObject({ canUndo: false, canRedo: true, isBusy: false });
  });

  it('busy中のpush / undo / redoを二重実行しない', async () => {
    const history = new History();
    const gate = deferred();
    await pushAndWait(history, { label: 'async', undo: () => gate.promise, redo: vi.fn() });
    const running = history.undo();
    expect(history.push({ label: 'blocked', undo: vi.fn(), redo: vi.fn() })).toBe(false);
    await expect(history.undo()).resolves.toBe(false);
    await expect(history.redo()).resolves.toBe(false);
    gate.resolve();
    await running;
  });
});
