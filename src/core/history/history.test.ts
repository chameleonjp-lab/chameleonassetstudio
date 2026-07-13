import { describe, expect, it, vi } from 'vitest';
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

describe('History', () => {
  it('undo / redo で操作を巻き戻し・やり直しできる', async () => {
    const history = new History();
    const state = { value: 0 };

    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    state.value += 10;
    history.push(makeCounterEntry('+10', state, 10));
    expect(state.value).toBe(11);

    await expect(history.undo()).resolves.toBe(true);
    expect(state.value).toBe(1);
    await expect(history.undo()).resolves.toBe(true);
    expect(state.value).toBe(0);
    await expect(history.undo()).resolves.toBe(false);

    await expect(history.redo()).resolves.toBe(true);
    expect(state.value).toBe(1);
    await expect(history.redo()).resolves.toBe(true);
    expect(state.value).toBe(11);
    await expect(history.redo()).resolves.toBe(false);
  });

  it('新しい操作を積むと Redo 履歴が消える', async () => {
    const history = new History();
    const state = { value: 0 };

    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    await history.undo();
    expect(history.getState().canRedo).toBe(true);

    state.value += 5;
    history.push(makeCounterEntry('+5', state, 5));
    expect(history.getState().canRedo).toBe(false);
    expect(state.value).toBe(5);
  });

  it('上限を超えた古い履歴は捨てられる', async () => {
    const history = new History({ limit: 2 });
    const state = { value: 0 };
    for (const delta of [1, 2, 4]) {
      state.value += delta;
      history.push(makeCounterEntry(`+${delta}`, state, delta));
    }
    expect(state.value).toBe(7);
    await history.undo();
    await history.undo();
    await expect(history.undo()).resolves.toBe(false);
    expect(state.value).toBe(1);
  });

  it('状態変更が購読者へ通知され、ラベルが取れる', async () => {
    const history = new History();
    const states: HistoryState[] = [];
    history.subscribe((state) => states.push(state));

    const state = { value: 0 };
    state.value += 1;
    history.push(makeCounterEntry('レイヤー移動', state, 1));

    expect(history.getState().canUndo).toBe(true);
    expect(history.getState().undoLabel).toBe('レイヤー移動');
    await history.undo();
    expect(history.getState().redoLabel).toBe('レイヤー移動');
    expect(states.length).toBeGreaterThanOrEqual(2);
  });

  it('clear で履歴が空になる', async () => {
    const history = new History();
    const state = { value: 0 };
    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    history.clear();
    expect(history.getState().canUndo).toBe(false);
    await expect(history.undo()).resolves.toBe(false);
  });

  it('非同期 Undo は完了前に履歴スタックを確定移動せず、完了後に Redo 可能になる', async () => {
    const history = new History();
    const gate = deferred();
    const undo = vi.fn(() => gate.promise);
    history.push({ label: 'async', undo, redo: vi.fn() });

    const running = history.undo();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(history.getState()).toMatchObject({ isBusy: true, canUndo: false, canRedo: false });
    gate.resolve();
    await expect(running).resolves.toBe(true);
    expect(history.getState()).toMatchObject({ isBusy: false, canUndo: false, canRedo: true });
  });

  it('非同期 Redo は完了後に Undo 可能になり、同期履歴も従来どおり動く', async () => {
    const history = new History();
    const state = { value: 0 };
    state.value += 1;
    history.push(makeCounterEntry('sync', state, 1));
    await history.undo();
    expect(state.value).toBe(0);

    history.clear();
    state.value = 1;
    const gate = deferred();
    const redo = vi.fn(() =>
      gate.promise.then(() => {
        state.value += 1;
      }),
    );
    history.push({
      label: 'async',
      undo: () => {
        state.value -= 1;
      },
      redo,
    });
    await history.undo();
    const running = history.redo();
    expect(history.getState().isBusy).toBe(true);
    gate.resolve();
    await running;
    expect(state.value).toBe(1);
    expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false, isBusy: false });
  });

  it('Undo が reject した場合は undo 可能な状態を維持し redoStack へ移動しない', async () => {
    const history = new History();
    history.push({ label: 'fail', undo: () => Promise.reject(new Error('boom')), redo: vi.fn() });

    await expect(history.undo()).rejects.toThrow('boom');
    expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false, isBusy: false });
  });

  it('Redo が reject した場合も元の redo 可能状態を維持する', async () => {
    const history = new History();
    history.push({
      label: 'fail-redo',
      undo: vi.fn(),
      redo: () => Promise.reject(new Error('redo boom')),
    });
    await history.undo();

    await expect(history.redo()).rejects.toThrow('redo boom');
    expect(history.getState()).toMatchObject({ canUndo: false, canRedo: true, isBusy: false });
  });

  it('Undo 処理中の Undo / Redo は二重実行せず、操作順を逆転させない', async () => {
    const history = new History();
    const gate = deferred();
    const undo = vi.fn(() => gate.promise);
    const redo = vi.fn();
    history.push({ label: 'async', undo, redo });

    const running = history.undo();
    await expect(history.undo()).resolves.toBe(false);
    await expect(history.redo()).resolves.toBe(false);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
    gate.resolve();
    await running;
    await expect(history.redo()).resolves.toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);
  });
});
