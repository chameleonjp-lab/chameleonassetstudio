import { describe, expect, it, vi } from 'vitest';
import { History } from '../../core/history/history';
import {
  canStartPersistentMutation,
  commitPersistentMutationWithHistory,
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
    history.push({ label: 'pending', undo: vi.fn(), redo: vi.fn() });
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
    await history.waitForPending();
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

describe('commitPersistentMutationWithHistory', () => {
  it('apply成功と保存確認後だけ履歴が追加される', async () => {
    const history = new History();
    const apply = vi.fn().mockResolvedValue(undefined);
    await expect(
      commitPersistentMutationWithHistory({
        apply,
        history,
        entry: { label: '保存成功', undo: vi.fn(), redo: vi.fn() },
      }),
    ).resolves.toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(history.getState()).toMatchObject({ isBusy: true, canUndo: false });
    await history.waitForPending();
    expect(history.getState()).toMatchObject({ canUndo: true, undoLabel: '保存成功' });
  });

  it('apply失敗時は履歴が追加されず、失敗理由が上位へ伝播する', async () => {
    const history = new History();
    const apply = vi.fn().mockRejectedValue(new Error('atomic save failed'));
    await expect(
      commitPersistentMutationWithHistory({
        apply,
        history,
        entry: { label: '未実行', undo: vi.fn(), redo: vi.fn() },
      }),
    ).rejects.toThrow('atomic save failed');
    expect(history.getState()).toMatchObject({ canUndo: false, canRedo: false });
  });
});
