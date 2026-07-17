import { useEffect, useMemo, useState } from 'react';
import { applyLayerPositions, type Asset } from '../../core/model';
import {
  alignLayers,
  distributeLayers,
  excludeActiveTarget,
  resolveReferenceBounds,
  MIN_ACTIVE_ALIGN_TARGETS,
  MIN_ALIGN_TARGETS,
  MIN_DISTRIBUTE_TARGETS,
  type AlignBasis,
  type AlignDirection,
  type AlignTarget,
  type DistributeAxis,
} from './layerAlign';

interface AlignPanelProps {
  asset: Asset;
  /** LayerPanel の checkbox で「複数レイヤー操作の対象」にしたレイヤー id（一時 UI 状態）。 */
  checkedLayerIds: string[];
  /** active layer（`selectedLayerId`）。active 基準のときの除外対象・基準 bounds に使う。 */
  selectedLayerId: string | null;
  /** 履歴に積む変更（既存 commitAssetChange 経路。契約 H1）。 */
  onCommit: (label: string, next: Asset) => void;
}

const ALIGN_BUTTONS: Array<{ direction: AlignDirection; label: string }> = [
  { direction: 'left', label: '左揃え' },
  { direction: 'centerX', label: '水平中央揃え' },
  { direction: 'right', label: '右揃え' },
  { direction: 'top', label: '上揃え' },
  { direction: 'centerY', label: '垂直中央揃え' },
  { direction: 'bottom', label: '下揃え' },
];

const DISTRIBUTE_BUTTONS: Array<{ axis: DistributeAxis; label: string }> = [
  { axis: 'horizontal', label: '水平方向に等間隔配置' },
  { axis: 'vertical', label: '垂直方向に等間隔配置' },
];

const BASIS_LABELS: Record<AlignBasis, string> = {
  selection: '選択範囲（合成bounds）',
  canvas: 'Asset canvas',
  active: 'アクティブレイヤー',
};

const BASIS_OPTIONS = Object.keys(BASIS_LABELS) as AlignBasis[];

/** チェック済みレイヤーのうち、image textureを持つものだけを対象にする（W1）。 */
function buildTargets(asset: Asset, layerIds: string[]): AlignTarget[] {
  if (layerIds.length === 0) {
    return [];
  }
  const idSet = new Set(layerIds);
  const targets: AlignTarget[] = [];
  for (const layer of asset.layers) {
    if (!idSet.has(layer.id)) {
      continue;
    }
    const textureSize = asset.textures.find((texture) => texture.id === layer.textureId)?.size;
    if (!textureSize) {
      continue;
    }
    targets.push({ id: layer.id, transform: layer.transform, textureSize });
  }
  return targets;
}

/**
 * 複数 Layer の align（整列）/ distribute（等間隔配置）パネル（2D-2-LAYER-ALIGN。
 * accepted 契約 S1+R2+W1+D1+H1、正本 docs/future/2D_2_LAYER_ALIGN_PLAN.md）。
 * LayerPanel の checkbox で「複数レイヤー操作の対象」にしたレイヤーへ position 変更を
 * 適用する。整列基準・選択状態は保存しない一時 UI 状態。position のみの変更として
 * 既存の commitAssetChange 経路（1 操作 = 1 History entry）へ乗せる。
 */
export function AlignPanel({ asset, checkedLayerIds, selectedLayerId, onCommit }: AlignPanelProps) {
  const [basis, setBasis] = useState<AlignBasis>('selection');
  const [notice, setNotice] = useState<string | null>(null);
  const checkedLayerIdsKey = checkedLayerIds.join(',');

  useEffect(() => {
    setNotice(null);
  }, [asset.id, checkedLayerIdsKey, selectedLayerId, basis]);

  const checkedTargets = useMemo(
    () => buildTargets(asset, checkedLayerIds),
    [asset, checkedLayerIds],
  );
  const activeTarget = useMemo(
    () => (selectedLayerId ? (buildTargets(asset, [selectedLayerId])[0] ?? null) : null),
    [asset, selectedLayerId],
  );

  const alignMoveTargets = excludeActiveTarget(checkedTargets, basis, selectedLayerId);
  const alignReferenceBounds = resolveReferenceBounds({
    basis,
    canvasSize: asset.canvasSize,
    selectionTargets: checkedTargets,
    activeTarget,
  });
  const minimumAlignTargets = basis === 'active' ? MIN_ACTIVE_ALIGN_TARGETS : MIN_ALIGN_TARGETS;
  const canAlign = alignMoveTargets.length >= minimumAlignTargets && alignReferenceBounds !== null;
  const alignDisabledReason =
    basis === 'active' && !activeTarget
      ? 'アクティブレイヤーがありません。レイヤー一覧で選択してください。'
      : `整列には対象レイヤーが${minimumAlignTargets}件以上必要です（現在${alignMoveTargets.length}件）。`;

  const canDistribute = checkedTargets.length >= MIN_DISTRIBUTE_TARGETS;
  const distributeDisabledReason = `等間隔配置には対象レイヤーが${MIN_DISTRIBUTE_TARGETS}件以上必要です（現在${checkedTargets.length}件）。`;

  if (checkedLayerIds.length === 0) {
    return (
      <p className="editor-note">
        レイヤーのチェックを付けると、複数レイヤーの整列・等間隔配置ができます。
      </p>
    );
  }

  const handleAlign = (direction: AlignDirection) => {
    const outcome = alignLayers(alignMoveTargets, alignReferenceBounds, direction);
    if (outcome.changes.length === 0) {
      setNotice(outcome.reason ?? '整列できませんでした。');
      return;
    }
    setNotice(null);
    onCommit('レイヤー整列', applyLayerPositions(asset, outcome.changes));
  };

  const handleDistribute = (axis: DistributeAxis) => {
    const outcome = distributeLayers(checkedTargets, axis);
    if (outcome.changes.length === 0) {
      setNotice(outcome.reason ?? '等間隔配置できませんでした。');
      return;
    }
    setNotice(null);
    onCommit(
      axis === 'horizontal' ? 'レイヤーを水平方向に等間隔配置' : 'レイヤーを垂直方向に等間隔配置',
      applyLayerPositions(asset, outcome.changes),
    );
  };

  return (
    <div className="align-panel">
      <label className="editor-field">
        整列基準
        <select value={basis} onChange={(event) => setBasis(event.target.value as AlignBasis)}>
          {BASIS_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {BASIS_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <div className="align-button-row" role="group" aria-label="整列">
        {ALIGN_BUTTONS.map(({ direction, label }) => (
          <button
            key={direction}
            type="button"
            disabled={!canAlign}
            title={canAlign ? undefined : alignDisabledReason}
            onClick={() => handleAlign(direction)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="align-button-row" role="group" aria-label="等間隔配置">
        {DISTRIBUTE_BUTTONS.map(({ axis, label }) => (
          <button
            key={axis}
            type="button"
            disabled={!canDistribute}
            title={canDistribute ? undefined : distributeDisabledReason}
            onClick={() => handleDistribute(axis)}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="editor-note">
          {notice}
        </p>
      )}
    </div>
  );
}
