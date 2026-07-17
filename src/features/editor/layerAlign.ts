/**
 * 複数 Layer の整列（align）/ 等間隔配置（distribute）の純関数（2D-2-LAYER-ALIGN）。
 * 正本: docs/future/2D_2_LAYER_ALIGN_PLAN.md（accepted 契約 S1+R2+W1+D1+H1）。
 *
 * すべて非破壊。Asset を直接受け取らず、対象 layer の { id, transform, textureSize } と
 * 基準矩形（または基準種別と材料）だけを入力にする。呼び出し側（EditorScreen /
 * AlignPanel）が Asset から対象を組み立て、結果の position 変更を既存の
 * commitAssetChange 経路（1 操作 = 1 History entry）へ渡す。
 *
 * W1: 各 layer の bounds は base の Layer.transform（position / scale / rotation。
 * 負 scale = flip 込み）を適用したテクスチャ 4 隅の AABB とする。座標規約
 * （position はテクスチャ左上、scale / rotation はテクスチャ中心基準）は
 * `src/renderers/canvas2d/view.ts` の `layerWorldPoint` が正本であり、本モジュールは
 * その関数を再利用することで規約を独自に再実装せず一致させる（PR #109 の
 * `layerExtendsOutsideCanvas`＝`EditorScreen.tsx` と同型の 4 隅計算）。
 */
import type { LayerTransform } from '../../core/model/layer';
import type { Size, Vec2 } from '../../core/model/common';
import type { Layer } from '../../core/model/layer';
import { layerWorldPoint } from '../../renderers/canvas2d/view';

/** align / distribute の対象になる layer の最小情報。 */
export interface AlignTarget {
  id: string;
  transform: LayerTransform;
  textureSize: Size;
}

/** world 座標での軸並行境界矩形（AABB）。 */
export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type AlignDirection = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

export type DistributeAxis = 'horizontal' | 'vertical';

/** 整列基準（R2）。canvas＝Asset canvas 矩形、selection＝選択群の合成 bounds（既定）、active＝active layer の bounds。 */
export type AlignBasis = 'canvas' | 'selection' | 'active';

export interface LayerPositionChange {
  layerId: string;
  newPosition: Vec2;
}

export interface AlignOutcome {
  changes: LayerPositionChange[];
  /** no-op になった理由。実行できた場合は undefined。 */
  reason?: string;
}

export type DistributeOutcome = AlignOutcome;

/** selection / canvas 基準の align は、複数選択として対象 2 枚以上が必要。 */
export const MIN_ALIGN_TARGETS = 2;
/** active 基準では active 自身を固定するため、移動対象は 1 枚以上でよい（R2）。 */
export const MIN_ACTIVE_ALIGN_TARGETS = 1;
/** distribute（等間隔配置）は対象 3 枚以上が必要（D1）。 */
export const MIN_DISTRIBUTE_TARGETS = 3;

export const ALIGN_NO_TARGETS_REASON = '整列する対象レイヤーがありません。';
export const DISTRIBUTE_MIN_TARGETS_REASON = `等間隔配置には対象レイヤーが${MIN_DISTRIBUTE_TARGETS}件以上必要です。`;

/**
 * layerWorldPoint は Layer 全体を受け取るが、bounds 計算に必要なのは transform だけなので、
 * 他フィールドはダミー値の stub を作って渡す。これにより計算式を独自実装せず view.ts の
 * 座標規約（layerWorldPoint 本体）へ完全に委譲できる。
 */
function stubLayer(transform: LayerTransform): Layer {
  return {
    id: '__align_stub__',
    name: '',
    layerType: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform,
  };
}

/** base transform（position / scale / rotation）を適用したテクスチャ 4 隅の world AABB（W1）。 */
export function layerWorldBounds(transform: LayerTransform, textureSize: Size): AABB {
  const layer = stubLayer(transform);
  const halfW = textureSize.width / 2;
  const halfH = textureSize.height / 2;
  const localCorners: Vec2[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  const worldCorners = localCorners.map((corner) => layerWorldPoint(layer, textureSize, corner));
  const xs = worldCorners.map((corner) => corner.x);
  const ys = worldCorners.map((corner) => corner.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** 複数 AABB を包含する合成 bounds。空配列なら null。 */
export function unionBounds(bounds: AABB[]): AABB | null {
  if (bounds.length === 0) {
    return null;
  }
  return bounds.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  }));
}

export interface ResolveReferenceBoundsOptions {
  basis: AlignBasis;
  canvasSize: Size;
  /** basis === 'selection' のときに使う、選択中の全対象（active 除外前）。 */
  selectionTargets: AlignTarget[];
  /** basis === 'active' のときに使う active layer。存在しない／texture 不明なら null。 */
  activeTarget: AlignTarget | null;
}

/** R2 の 3 基準（canvas / selection / active）から整列基準の AABB を解決する。 */
export function resolveReferenceBounds(options: ResolveReferenceBoundsOptions): AABB | null {
  if (options.basis === 'canvas') {
    return {
      minX: 0,
      minY: 0,
      maxX: options.canvasSize.width,
      maxY: options.canvasSize.height,
    };
  }
  if (options.basis === 'active') {
    return options.activeTarget
      ? layerWorldBounds(options.activeTarget.transform, options.activeTarget.textureSize)
      : null;
  }
  return unionBounds(
    options.selectionTargets.map((target) =>
      layerWorldBounds(target.transform, target.textureSize),
    ),
  );
}

/** active 基準のときは active layer 自身を移動対象から除外する（R2）。 */
export function excludeActiveTarget(
  targets: AlignTarget[],
  basis: AlignBasis,
  activeLayerId: string | null,
): AlignTarget[] {
  if (basis !== 'active' || !activeLayerId) {
    return targets;
  }
  return targets.filter((target) => target.id !== activeLayerId);
}

/**
 * 6 方向 align（左 / 水平中央 / 右 / 上 / 垂直中央 / 下）。
 * 各対象の bounds を基準矩形（referenceBounds）に合わせて平行移動する position のみを返す。
 * 対象が 0 件、または referenceBounds が無ければ no-op（reason 付き）。
 * selection / canvas 基準の「2 件以上」は UI 側で検査する。active 基準では active 自身を
 * referenceBounds として固定し、残る 1 件だけを移動できるため、純関数は 1 件を許可する。
 */
export function alignLayers(
  targets: AlignTarget[],
  referenceBounds: AABB | null,
  direction: AlignDirection,
): AlignOutcome {
  if (targets.length === 0) {
    return { changes: [], reason: ALIGN_NO_TARGETS_REASON };
  }
  if (!referenceBounds) {
    return { changes: [], reason: '整列基準の bounds を計算できません。' };
  }
  const changes = targets.map((target) => {
    const bounds = layerWorldBounds(target.transform, target.textureSize);
    let deltaX = 0;
    let deltaY = 0;
    switch (direction) {
      case 'left':
        deltaX = referenceBounds.minX - bounds.minX;
        break;
      case 'centerX':
        deltaX =
          (referenceBounds.minX + referenceBounds.maxX) / 2 - (bounds.minX + bounds.maxX) / 2;
        break;
      case 'right':
        deltaX = referenceBounds.maxX - bounds.maxX;
        break;
      case 'top':
        deltaY = referenceBounds.minY - bounds.minY;
        break;
      case 'centerY':
        deltaY =
          (referenceBounds.minY + referenceBounds.maxY) / 2 - (bounds.minY + bounds.maxY) / 2;
        break;
      case 'bottom':
        deltaY = referenceBounds.maxY - bounds.maxY;
        break;
    }
    return {
      layerId: target.id,
      newPosition: {
        x: target.transform.position.x + deltaX,
        y: target.transform.position.y + deltaY,
      },
    };
  });
  return { changes };
}

/**
 * 水平 / 垂直 distribute（等間隔配置）。D1: 対象の AABB 中心座標（軸方向）でソートし、
 * 同値のときは targets 配列順（呼び出し側が Asset.layers 配列順＝描画順で渡す前提）を
 * 第 2 キーとする決定的順序にする。両端の 2 layer は固定し、中心を等間隔配置する。
 * 対象が MIN_DISTRIBUTE_TARGETS 未満なら no-op（reason 付き）。
 *
 * 呼び出し側は targets を Asset.layers の配列順（描画順）のまま渡すこと。
 * 同率 tiebreak はこの配列内での位置（index）を使う。
 */
export function distributeLayers(targets: AlignTarget[], axis: DistributeAxis): DistributeOutcome {
  if (targets.length < MIN_DISTRIBUTE_TARGETS) {
    return { changes: [], reason: DISTRIBUTE_MIN_TARGETS_REASON };
  }
  const centerOf = (bounds: AABB): number =>
    axis === 'horizontal' ? (bounds.minX + bounds.maxX) / 2 : (bounds.minY + bounds.maxY) / 2;

  const withBounds = targets.map((target, index) => ({
    target,
    index,
    bounds: layerWorldBounds(target.transform, target.textureSize),
  }));

  const sorted = [...withBounds].sort((a, b) => {
    const diff = centerOf(a.bounds) - centerOf(b.bounds);
    if (diff !== 0) {
      return diff;
    }
    return a.index - b.index;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstCenter = centerOf(first.bounds);
  const lastCenter = centerOf(last.bounds);
  const step = (lastCenter - firstCenter) / (sorted.length - 1);

  const changes: LayerPositionChange[] = sorted.map((entry, position) => {
    const currentPosition = entry.target.transform.position;
    if (position === 0 || position === sorted.length - 1) {
      return { layerId: entry.target.id, newPosition: { ...currentPosition } };
    }
    const desiredCenter = firstCenter + step * position;
    const currentCenter = centerOf(entry.bounds);
    const delta = desiredCenter - currentCenter;
    return {
      layerId: entry.target.id,
      newPosition:
        axis === 'horizontal'
          ? { x: currentPosition.x + delta, y: currentPosition.y }
          : { x: currentPosition.x, y: currentPosition.y + delta },
    };
  });

  return { changes };
}
