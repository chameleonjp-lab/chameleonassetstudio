import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, LinkedAssetFamilyVariant, Project } from '../../core/model';
import { formatBytes, MAX_ASSET_BATCH_REVISION_TARGETS } from '../../core/storage';
import type { CanvasResizeAnchor } from './canvasResize';
import {
  AssetBatchCancelledError,
  defaultAssetBatchTargetIds,
  isAssetBatchTargetSelectable,
  projectBatchStorage,
  type AssetBatchConfig,
  type AssetBatchPreview,
  type AssetBatchProgress,
  type AssetBatchTargetStatus,
} from './assetBatch';

interface AssetBatchPanelProps {
  project: Project;
  assets: Asset[];
  selectedAsset: Asset | null;
  busy: boolean;
  onPrepare: (
    config: AssetBatchConfig,
    signal: AbortSignal,
    onProgress: (progress: AssetBatchProgress) => void,
  ) => Promise<AssetBatchPreview>;
  onExecute: (preview: AssetBatchPreview, includedTargetIds: ReadonlySet<string>) => Promise<void>;
  onOpenBackup: () => void;
}

type BatchOperation = AssetBatchConfig['type'];

const ANCHOR_OPTIONS: Array<{ value: CanvasResizeAnchor; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top', label: '上' },
  { value: 'top-right', label: '右上' },
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'right', label: '右' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom', label: '下' },
  { value: 'bottom-right', label: '右下' },
];

const STATUS_LABELS: Record<AssetBatchTargetStatus, string> = {
  ready: '実行可能',
  warning: 'warning',
  'manual-adjusted': '手動調整あり',
  ineligible: '対象外',
  'up-to-date': '変更なし',
};

function linkedCandidates(project: Project, assets: Asset[]) {
  return (project.families ?? []).flatMap((family) =>
    family.variants
      .filter((variant): variant is LinkedAssetFamilyVariant => variant.kind !== 'manual')
      .map((variant) => ({
        assetId: variant.assetId,
        label: `${family.name} / ${assets.find((asset) => asset.id === variant.assetId)?.displayName ?? variant.assetId}`,
      })),
  );
}

function editableImageLayers(asset: Asset) {
  return asset.layers.filter((layer) => {
    const texture = asset.textures.find((candidate) => candidate.id === layer.textureId);
    return layer.layerType === 'image' && texture?.kind === 'edit';
  });
}

function initialTargetIds(
  operation: BatchOperation,
  selectedAsset: Asset | null,
  project: Project,
): string[] {
  if (!selectedAsset) {
    return [];
  }
  if (operation === 'palette' && editableImageLayers(selectedAsset).length === 0) {
    return [];
  }
  if (operation !== 'linked-refresh') {
    return [selectedAsset.id];
  }
  const linked = (project.families ?? []).some((family) =>
    family.variants.some(
      (variant) => variant.assetId === selectedAsset.id && variant.kind !== 'manual',
    ),
  );
  return linked ? [selectedAsset.id] : [];
}

function storageWarningText(level: ReturnType<typeof projectBatchStorage>['warningLevel']) {
  switch (level) {
    case 'critical':
      return '推定使用率が90%以上です。保存容量不足に備えて先に.casprojを退避してください。';
    case 'warning':
      return '推定使用率が80%以上です。.casproj退避を推奨します。';
    case 'notice':
      return '推定使用率が60%以上です。空き容量を確認してください。';
    case 'unavailable':
      return 'ブラウザから保存容量を取得できません。空き容量は推測しません。';
    case 'normal':
      return null;
  }
}

/** B1+O1+H1+L1の明示target・preview・原子commit UI。 */
export function AssetBatchPanel({
  project,
  assets,
  selectedAsset,
  busy,
  onPrepare,
  onExecute,
  onOpenBackup,
}: AssetBatchPanelProps) {
  const [operation, setOperation] = useState<BatchOperation>('linked-refresh');
  const [targetAssetIds, setTargetAssetIds] = useState<string[]>(() =>
    initialTargetIds('linked-refresh', selectedAsset, project),
  );
  const [paletteLayers, setPaletteLayers] = useState<Record<string, string>>({});
  const [paletteFrom, setPaletteFrom] = useState('#ffffff');
  const [paletteTo, setPaletteTo] = useState('#ff0000');
  const [paletteTolerance, setPaletteTolerance] = useState('20');
  const [canvasWidth, setCanvasWidth] = useState(String(selectedAsset?.canvasSize.width ?? 512));
  const [canvasHeight, setCanvasHeight] = useState(String(selectedAsset?.canvasSize.height ?? 512));
  const [canvasAnchor, setCanvasAnchor] = useState<CanvasResizeAnchor>('center');
  const [preview, setPreview] = useState<AssetBatchPreview | null>(null);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const [progress, setProgress] = useState<AssetBatchProgress | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const linked = useMemo(() => linkedCandidates(project, assets), [assets, project]);
  const paletteCandidates = useMemo(
    () =>
      assets
        .map((asset) => ({ asset, layers: editableImageLayers(asset) }))
        .filter(({ layers }) => layers.length > 0),
    [assets],
  );

  useEffect(() => {
    const candidates = new Map(
      assets.map((asset) => [asset.id, editableImageLayers(asset)[0]?.id]),
    );
    setPaletteLayers((current) => {
      const next = { ...current };
      for (const [assetId, layerId] of candidates) {
        if (layerId && !next[assetId]) {
          next[assetId] = layerId;
        }
      }
      return next;
    });
  }, [assets]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const invalidatePreview = () => {
    setPreview(null);
    setIncludedIds(new Set());
    setWarningsConfirmed(false);
    setMessage(null);
    setError(null);
  };

  const changeOperation = (next: BatchOperation) => {
    abortRef.current?.abort();
    setOperation(next);
    setTargetAssetIds(initialTargetIds(next, selectedAsset, project));
    if (selectedAsset) {
      setCanvasWidth(String(selectedAsset.canvasSize.width));
      setCanvasHeight(String(selectedAsset.canvasSize.height));
    }
    invalidatePreview();
  };

  const toggleTarget = (assetId: string, checked: boolean) => {
    if (
      checked &&
      !targetAssetIds.includes(assetId) &&
      targetAssetIds.length >= MAX_ASSET_BATCH_REVISION_TARGETS
    ) {
      setError(`一括処理は最大${MAX_ASSET_BATCH_REVISION_TARGETS}件です。`);
      return;
    }
    setTargetAssetIds((current) =>
      checked
        ? current.includes(assetId)
          ? current
          : [...current, assetId]
        : current.filter((id) => id !== assetId),
    );
    invalidatePreview();
  };

  const config = (): AssetBatchConfig => {
    switch (operation) {
      case 'linked-refresh':
        return { type: operation, targetAssetIds };
      case 'palette':
        return {
          type: operation,
          targets: targetAssetIds.map((assetId) => ({
            assetId,
            layerId: paletteLayers[assetId] ?? '',
          })),
          replacements: [{ from: paletteFrom, to: paletteTo }],
          tolerance: Number(paletteTolerance),
        };
      case 'canvas-resize':
        return {
          type: operation,
          targetAssetIds,
          size: { width: Number(canvasWidth), height: Number(canvasHeight) },
          anchor: canvasAnchor,
        };
    }
  };

  const handlePrepare = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setCancelRequested(false);
    setProgress(null);
    setPreview(null);
    setIncludedIds(new Set());
    setWarningsConfirmed(false);
    setMessage(null);
    setError(null);
    try {
      const next = await onPrepare(config(), controller.signal, setProgress);
      setPreview(next);
      setIncludedIds(new Set(defaultAssetBatchTargetIds(next)));
      setMessage('previewを準備しました。対象、warning、変更内容を確認してください。');
    } catch (cause) {
      if (cause instanceof AssetBatchCancelledError || controller.signal.aborted) {
        setMessage('preview準備を取り消しました。正本は変更されていません。');
      } else {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setPreparing(false);
    }
  };

  const handleCancel = () => {
    setCancelRequested(true);
    abortRef.current?.abort();
  };

  const togglePreparedTarget = (id: string, checked: boolean) => {
    setIncludedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    setWarningsConfirmed(false);
    setMessage(null);
  };

  const selectedTargets = preview?.targets.filter((target) => includedIds.has(target.id)) ?? [];
  const hasIncludedWarning = selectedTargets.some((target) => target.status === 'warning');
  const storage = preview ? projectBatchStorage(preview, includedIds) : null;
  const storageMessage = storage ? storageWarningText(storage.warningLevel) : null;

  const handleExecute = async () => {
    if (!preview) {
      return;
    }
    setExecuting(true);
    setError(null);
    setMessage(null);
    try {
      await onExecute(preview, includedIds);
      setPreview(null);
      setIncludedIds(new Set());
      setWarningsConfirmed(false);
      setMessage('選択した素材をまとめて保存しました。取り消しも一回で戻せます。');
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : String(cause)} 正本は部分更新されていません。previewを作り直してください。`,
      );
    } finally {
      setExecuting(false);
    }
  };

  return (
    <section className="asset-batch-panel" aria-label="Asset一括変更">
      <h3>素材をまとめて変更</h3>
      <p className="editor-note">
        最大16件の素材を選び、変更内容を確認してからまとめて保存します。取り消しも一回で戻せます。
      </p>

      <label className="editor-field">
        一括操作
        <select
          aria-label="一括操作"
          value={operation}
          disabled={preparing || executing || busy}
          onChange={(event) => changeOperation(event.target.value as BatchOperation)}
        >
          <option value="linked-refresh">関連するコピーを更新</option>
          <option value="palette">画像の色を置き換える</option>
          <option value="canvas-resize">キャンバスの大きさを変更</option>
        </select>
      </label>

      <fieldset className="asset-batch-target-picker" disabled={preparing || executing || busy}>
        <legend>
          変更する素材（{targetAssetIds.length}/{MAX_ASSET_BATCH_REVISION_TARGETS}）
        </legend>
        {operation === 'linked-refresh' ? (
          linked.length > 0 ? (
            linked.map((candidate) => (
              <label key={candidate.assetId}>
                <input
                  type="checkbox"
                  checked={targetAssetIds.includes(candidate.assetId)}
                  onChange={(event) => toggleTarget(candidate.assetId, event.target.checked)}
                />
                <span>{candidate.label}</span>
              </label>
            ))
          ) : (
            <p className="editor-note">関連するコピーがありません。</p>
          )
        ) : operation === 'palette' ? (
          paletteCandidates.length > 0 ? (
            paletteCandidates.map(({ asset, layers }) => (
              <div className="asset-batch-palette-target" key={asset.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={targetAssetIds.includes(asset.id)}
                    onChange={(event) => toggleTarget(asset.id, event.target.checked)}
                  />
                  <span>{asset.displayName}</span>
                </label>
                <select
                  aria-label={`${asset.displayName}のpalette対象layer`}
                  value={paletteLayers[asset.id] ?? layers[0]?.id ?? ''}
                  disabled={!targetAssetIds.includes(asset.id)}
                  onChange={(event) => {
                    setPaletteLayers((current) => ({
                      ...current,
                      [asset.id]: event.target.value,
                    }));
                    invalidatePreview();
                  }}
                >
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </div>
            ))
          ) : (
            <p className="editor-note">編集できる画像レイヤーがありません。</p>
          )
        ) : (
          assets.map((asset) => (
            <label key={asset.id}>
              <input
                type="checkbox"
                checked={targetAssetIds.includes(asset.id)}
                onChange={(event) => toggleTarget(asset.id, event.target.checked)}
              />
              <span>{asset.displayName}</span>
            </label>
          ))
        )}
      </fieldset>

      {operation === 'palette' && (
        <div className="asset-batch-config-grid">
          <label className="editor-field">
            置換元色
            <input
              aria-label="一括palette置換元色"
              type="color"
              value={paletteFrom}
              onChange={(event) => {
                setPaletteFrom(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="editor-field">
            置換先色
            <input
              aria-label="一括palette置換先色"
              type="color"
              value={paletteTo}
              onChange={(event) => {
                setPaletteTo(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="editor-field">
            色の許容差（0〜255）
            <input
              aria-label="一括palette tolerance"
              type="number"
              min={0}
              max={255}
              step={1}
              value={paletteTolerance}
              onChange={(event) => {
                setPaletteTolerance(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
        </div>
      )}

      {operation === 'canvas-resize' && (
        <div className="asset-batch-config-grid">
          <label className="editor-field">
            一括キャンバス幅
            <input
              type="number"
              min={1}
              max={4096}
              step={1}
              value={canvasWidth}
              onChange={(event) => {
                setCanvasWidth(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="editor-field">
            一括キャンバス高さ
            <input
              type="number"
              min={1}
              max={4096}
              step={1}
              value={canvasHeight}
              onChange={(event) => {
                setCanvasHeight(event.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label className="editor-field">
            元のキャンバスの基準位置
            <select
              aria-label="一括canvas基準位置"
              value={canvasAnchor}
              onChange={(event) => {
                setCanvasAnchor(event.target.value as CanvasResizeAnchor);
                invalidatePreview();
              }}
            >
              {ANCHOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="asset-batch-actions">
        <button
          type="button"
          disabled={preparing || executing || busy || targetAssetIds.length === 0}
          onClick={() => void handlePrepare()}
        >
          変更内容を確認
        </button>
        {preparing && (
          <button type="button" disabled={cancelRequested} onClick={handleCancel}>
            {cancelRequested ? '取消要求済み' : '準備を取消'}
          </button>
        )}
      </div>

      {preparing && progress && (
        <div className="asset-batch-progress" role="status" aria-label="一括処理の進捗">
          <progress max={100} value={progress.percent} />
          <span>
            {progress.currentLabel}: {progress.completed}/{progress.total}件（
            {Math.round(progress.percent)}%）
          </span>
          {cancelRequested && (
            <small>
              準備中の素材の処理が終わってから停止します。保存済みの内容は変わりません。
            </small>
          )}
        </div>
      )}

      {preview && (
        <div className="asset-batch-preview" role="region" aria-label="一括変更preview">
          <h4>素材ごとの変更内容</h4>
          <ul>
            {preview.targets.map((target) => {
              const selectable = isAssetBatchTargetSelectable(target);
              const checked = includedIds.has(target.id);
              return (
                <li key={target.id} data-status={target.status}>
                  <label
                    className={
                      target.status === 'manual-adjusted'
                        ? 'asset-batch-confirm-overwrite'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectable || executing}
                      onChange={(event) => togglePreparedTarget(target.id, event.target.checked)}
                    />
                    <span>
                      <strong>{target.label}</strong>
                      {target.status === 'manual-adjusted' ? ' — 手動調整を明示的に上書きする' : ''}
                    </span>
                  </label>
                  <span className={`asset-batch-status ${target.status}`}>
                    {STATUS_LABELS[target.status]}
                  </span>
                  {target.changes.length > 0 && (
                    <ul className="asset-batch-changes">
                      {target.changes.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  )}
                  {target.reasons.map((reason) => (
                    <p className="asset-batch-reason" key={reason}>
                      {reason.replace('canvas外へ出るデータ', 'キャンバスからはみ出すデータ')}
                    </p>
                  ))}
                  <small>推定変更量: {formatBytes(target.estimatedChangeBytes)}</small>
                </li>
              );
            })}
          </ul>

          {storage && (
            <div className={`asset-batch-storage ${storage.warningLevel}`}>
              <p>
                選択した素材 {includedIds.size}件 / 推定変更量{' '}
                {formatBytes(storage.estimatedChangeBytes)}
                {storage.projectedUsageBytes !== null && (
                  <> / 推定保存使用量 {formatBytes(storage.projectedUsageBytes)}</>
                )}
                {storage.projectedUsageRatio !== null && (
                  <>（{Math.round(storage.projectedUsageRatio * 100)}%）</>
                )}
              </p>
              {storageMessage && <p>{storageMessage}</p>}
              <button type="button" onClick={onOpenBackup}>
                .casproj退避を開く
              </button>
            </div>
          )}

          {hasIncludedWarning && (
            <label className="asset-batch-warning-confirm">
              <input
                type="checkbox"
                checked={warningsConfirmed}
                onChange={(event) => setWarningsConfirmed(event.target.checked)}
              />
              注意が必要な素材を確認しました。はみ出した部分を切り取らずに保存します。
            </label>
          )}

          <button
            type="button"
            className="asset-batch-execute"
            disabled={
              executing ||
              busy ||
              includedIds.size === 0 ||
              (hasIncludedWarning && !warningsConfirmed)
            }
            onClick={() => void handleExecute()}
          >
            {executing ? 'まとめて保存中…' : '選択した素材を一括実行'}
          </button>
          <p className="editor-note">
            保存中は取り消せません。失敗した場合は、すべての素材を保存前の状態に戻します。
          </p>
        </div>
      )}

      {message && (
        <p className="asset-batch-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
