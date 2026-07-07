import { snapToGrid } from '../../renderers/canvas2d/view';

/** UI 操作中の座標だけを必要に応じてグリッドへ丸める。保存形式の px 単位は変えない。 */
export function applyEditSnap(value: number, snapEnabled: boolean, gridSize: number): number {
  return snapEnabled ? snapToGrid(value, gridSize) : value;
}

/** 既存データ読み込み時に呼ばないことを明確にするため、配列を変更せずそのまま返す。 */
export function keepExistingCoordinate<T>(coordinate: T): T {
  return coordinate;
}
