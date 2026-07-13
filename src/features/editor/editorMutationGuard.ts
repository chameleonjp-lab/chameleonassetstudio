import type { History } from '../../core/history/history';

export const PERSISTENT_MUTATION_BUSY_MESSAGE =
  '元に戻す／やり直す処理中です。完了後に操作してください。';
export const PERSISTENT_MUTATION_IN_PROGRESS_MESSAGE =
  '保存データの変更処理中です。完了後に操作してください。';

export interface PersistentMutationGuardOptions {
  history: Pick<History, 'getState'>;
  mutationBusy: boolean;
  onReject?: (message: string) => void;
}

export function canStartPersistentMutation({
  history,
  mutationBusy,
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
  return true;
}
