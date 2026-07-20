import type { History, HistoryEntry } from '../../core/history/history';

export const PERSISTENT_MUTATION_BUSY_MESSAGE =
  '元に戻す／やり直す処理中です。完了後に操作してください。';
export const PERSISTENT_MUTATION_IN_PROGRESS_MESSAGE =
  '保存データの変更処理中です。完了後に操作してください。';
export const PERSISTENT_MUTATION_PREVIEW_MESSAGE =
  '取り込みpreviewを確認中です。確定または取消してから操作してください。';

export interface PersistentMutationGuardOptions {
  history: Pick<History, 'getState'>;
  mutationBusy: boolean;
  previewPending?: boolean;
  onReject?: (message: string) => void;
}

export function canStartPersistentMutation({
  history,
  mutationBusy,
  previewPending = false,
  onReject,
}: PersistentMutationGuardOptions): boolean {
  if (history.getState().isBusy) {
    onReject?.(PERSISTENT_MUTATION_BUSY_MESSAGE);
    return false;
  }
  if (mutationBusy) {
    onReject?.(PERSISTENT_MUTATION_IN_PROGRESS_MESSAGE);
    return false;
  }
  if (previewPending) {
    onReject?.(PERSISTENT_MUTATION_PREVIEW_MESSAGE);
    return false;
  }
  return true;
}

export async function commitPersistentMutationWithHistory(options: {
  apply: () => Promise<void>;
  history: Pick<History, 'push'>;
  entry: HistoryEntry;
}): Promise<void> {
  await options.apply();
  if (!options.history.push(options.entry)) {
    throw new Error('履歴を登録できませんでした。');
  }
}
