import { describe, expect, it, vi } from 'vitest';
import { History } from '../../core/history/history';
import {
  canStartPersistentMutation,
  PERSISTENT_MUTATION_BUSY_MESSAGE,
  PERSISTENT_MUTATION_IN_PROGRESS_MESSAGE,
} from './editorMutationGuard';

describe('canStartPersistentMutation', () => {
  it('idle時は編集開始を許可する', () => {
    const history = new History();
    const onReject = vi.fn();

    expect(canStartPersistentMutation({ history, mutationBusy: false, onReject })).toBe(true);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('history busy時は拒否し、Assetとautosaveを変更しない', async () => {
    const history = new History();
    const gate = new Promise<void>(() => undefined);
    history.push({ label: 'async', undo: () => gate, redo: vi.fn() });
    void history.undo();
    const onReject = vi.fn();
    const assetMutator = vi.fn();
    const autosave = vi.fn();

    if (canStartPersistentMutation({ history, mutationBusy: false, onReject })) {
      assetMutator();
      autosave();
    }

    expect(onReject).toHaveBeenCalledWith(PERSISTENT_MUTATION_BUSY_MESSAGE);
    expect(assetMutator).not.toHaveBeenCalled();
    expect(autosave).not.toHaveBeenCalled();
  });

  it('mutation busy時は拒否し、Assetとautosaveを変更しない', () => {
    const history = new History();
    const onReject = vi.fn();
    const assetMutator = vi.fn();
    const autosave = vi.fn();

    if (canStartPersistentMutation({ history, mutationBusy: true, onReject })) {
      assetMutator();
      autosave();
    }

    expect(onReject).toHaveBeenCalledWith(PERSISTENT_MUTATION_IN_PROGRESS_MESSAGE);
    expect(assetMutator).not.toHaveBeenCalled();
    expect(autosave).not.toHaveBeenCalled();
  });
});
