/**
 * アセット種別の表示名（2D-2-CREATE-01）。
 * AssetTypePanel の種別 select と、EditorScreen の新規作成フォームで共通利用する。
 * コンポーネントを含まない定数だけのファイルに分けているのは、react-refresh の
 * 「1 ファイル = コンポーネントのみ export」ルールに沿わせるため。
 */
import type { AssetType } from '../../core/model';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  character: 'キャラクター',
  item: 'アイテム',
  background: '背景',
  tile: 'タイル',
  gimmick: 'ギミック',
  effect: 'エフェクト',
};
