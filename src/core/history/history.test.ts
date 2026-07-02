import { describe, expect, it } from 'vitest';
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

describe('History', () => {
  it('undo / redo で操作を巻き戻し・やり直しできる', () => {
    const history = new History();
    const state = { value: 0 };

    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    state.value += 10;
    history.push(makeCounterEntry('+10', state, 10));
    expect(state.value).toBe(11);

    expect(history.undo()).toBe(true);
    expect(state.value).toBe(1);
    expect(history.undo()).toBe(true);
    expect(state.value).toBe(0);
    expect(history.undo()).toBe(false);

    expect(history.redo()).toBe(true);
    expect(state.value).toBe(1);
    expect(history.redo()).toBe(true);
    expect(state.value).toBe(11);
    expect(history.redo()).toBe(false);
  });

  it('新しい操作を積むと Redo 履歴が消える', () => {
    const history = new History();
    const state = { value: 0 };

    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    history.undo();
    expect(history.getState().canRedo).toBe(true);

    state.value += 5;
    history.push(makeCounterEntry('+5', state, 5));
    expect(history.getState().canRedo).toBe(false);
    expect(state.value).toBe(5);
  });

  it('上限を超えた古い履歴は捨てられる', () => {
    const history = new History({ limit: 2 });
    const state = { value: 0 };
    for (const delta of [1, 2, 4]) {
      state.value += delta;
      history.push(makeCounterEntry(`+${delta}`, state, delta));
    }
    expect(state.value).toBe(7);
    history.undo();
    history.undo();
    expect(history.undo()).toBe(false);
    // 最初の +1 は履歴から消えているため戻らない
    expect(state.value).toBe(1);
  });

  it('状態変更が購読者へ通知され、ラベルが取れる', () => {
    const history = new History();
    const states: HistoryState[] = [];
    history.subscribe((state) => states.push(state));

    const state = { value: 0 };
    state.value += 1;
    history.push(makeCounterEntry('レイヤー移動', state, 1));

    expect(history.getState().canUndo).toBe(true);
    expect(history.getState().undoLabel).toBe('レイヤー移動');
    history.undo();
    expect(history.getState().redoLabel).toBe('レイヤー移動');
    expect(states.length).toBeGreaterThanOrEqual(2);
  });

  it('clear で履歴が空になる', () => {
    const history = new History();
    const state = { value: 0 };
    state.value += 1;
    history.push(makeCounterEntry('+1', state, 1));
    history.clear();
    expect(history.getState().canUndo).toBe(false);
    expect(history.undo()).toBe(false);
  });
});
