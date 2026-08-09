import type { LinkedVariantInspection } from '../../core/model';

export interface VariantInspectionView {
  state: 'checking' | 'ready' | 'error';
  inspection?: LinkedVariantInspection;
  error?: string;
}

export function variantInspectionLabel(view: VariantInspectionView | undefined): string {
  if (!view || view.state === 'checking') {
    return '状態を確認中';
  }
  if (view.state === 'error' || !view.inspection) {
    return '状態を確認できません';
  }
  switch (view.inspection.status) {
    case 'up-to-date':
      return '同期済み';
    case 'ready':
      return '更新候補（stale）';
    case 'manual-adjusted':
      return view.inspection.stale ? '手動調整あり（baseにも更新候補）' : '手動調整あり';
    case 'ineligible':
      return '更新不可';
  }
}
