import { useEffect, useMemo, useState } from 'react';
import type { Asset, Size } from '../../core/model';
import { validateBlankCanvasSize } from './blankAsset';
import {
  canvasResizeOffset,
  inspectCanvasResizeOverflow,
  resizeAssetCanvas,
  type CanvasResizeAnchor,
  type CanvasResizeOverflowCounts,
} from './canvasResize';

interface CanvasResizePanelProps {
  asset: Asset;
  onCommit: (label: string, next: Asset) => void;
}

const ANCHOR_OPTIONS: Array<{
  value: CanvasResizeAnchor;
  label: string;
  symbol: string;
}> = [
  { value: 'top-left', label: '左上', symbol: '↖' },
  { value: 'top', label: '上', symbol: '↑' },
  { value: 'top-right', label: '右上', symbol: '↗' },
  { value: 'left', label: '左', symbol: '←' },
  { value: 'center', label: '中央', symbol: '●' },
  { value: 'right', label: '右', symbol: '→' },
  { value: 'bottom-left', label: '左下', symbol: '↙' },
  { value: 'bottom', label: '下', symbol: '↓' },
  { value: 'bottom-right', label: '右下', symbol: '↘' },
];

const WARNING_LABELS: Array<{
  key: Exclude<keyof CanvasResizeOverflowCounts, 'total'>;
  label: string;
}> = [
  { key: 'layers', label: 'レイヤー' },
  { key: 'frameStates', label: 'フレーム状態' },
  { key: 'origin', label: '原点' },
  { key: 'anchors', label: 'アンカー' },
  { key: 'colliders', label: '当たり判定' },
  { key: 'partPivots', label: 'Part pivot' },
];

function confirmationMessage(
  oldSize: Size,
  nextSize: Size,
  warnings: CanvasResizeOverflowCounts,
): string {
  const details = WARNING_LABELS.filter(({ key }) => warnings[key] > 0)
    .map(({ key, label }) => `${label}: ${warnings[key]}件`)
    .join('、');
  return [
    `Asset canvasを${oldSize.width} x ${oldSize.height}から${nextSize.width} x ${nextSize.height}へ変更します。`,
    `変更後にcanvas外へ出るデータがあります（合計${warnings.total}件: ${details}）。`,
    '座標のclamp、レイヤー画像のcrop、game dataの削除や縮小は行いません。続けますか？',
  ].join('\n');
}

/** B1+P1+G1+O1+V1+H1に従うAsset canvas resize UI。 */
export function CanvasResizePanel({ asset, onCommit }: CanvasResizePanelProps) {
  const [widthText, setWidthText] = useState(String(asset.canvasSize.width));
  const [heightText, setHeightText] = useState(String(asset.canvasSize.height));
  const [anchor, setAnchor] = useState<CanvasResizeAnchor>('center');

  useEffect(() => {
    setWidthText(String(asset.canvasSize.width));
    setHeightText(String(asset.canvasSize.height));
  }, [asset.id, asset.canvasSize.width, asset.canvasSize.height]);

  useEffect(() => {
    setAnchor('center');
  }, [asset.id]);

  const nextSize = useMemo(
    () => ({ width: Number(widthText), height: Number(heightText) }),
    [heightText, widthText],
  );
  const validationError = validateBlankCanvasSize(nextSize);
  const changed =
    validationError === null &&
    (nextSize.width !== asset.canvasSize.width || nextSize.height !== asset.canvasSize.height);
  const offset = canvasResizeOffset(asset.canvasSize, nextSize, anchor);

  const previewAsset = useMemo(
    () => (changed ? resizeAssetCanvas(asset, nextSize, anchor, new Date(asset.updatedAt)) : null),
    [anchor, asset, changed, nextSize],
  );
  const warnings = previewAsset ? inspectCanvasResizeOverflow(previewAsset) : null;

  const previewGeometry = useMemo(() => {
    if (!changed) {
      return null;
    }
    const minX = Math.min(0, offset.x);
    const minY = Math.min(0, offset.y);
    const maxX = Math.max(nextSize.width, offset.x + asset.canvasSize.width);
    const maxY = Math.max(nextSize.height, offset.y + asset.canvasSize.height);
    const padding = Math.max(maxX - minX, maxY - minY) * 0.08 || 1;
    return {
      viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
    };
  }, [asset.canvasSize.height, asset.canvasSize.width, changed, nextSize, offset.x, offset.y]);

  const handleApply = () => {
    if (!changed || validationError || !warnings) {
      return;
    }
    if (
      warnings.total > 0 &&
      !window.confirm(confirmationMessage(asset.canvasSize, nextSize, warnings))
    ) {
      return;
    }
    onCommit('Asset canvasサイズ変更', resizeAssetCanvas(asset, nextSize, anchor));
  };

  return (
    <div className="canvas-resize-panel">
      <p className="editor-note">
        textureやpixelは拡大縮小せず、canvas境界とcanvas座標のデータをまとめて移動します。
      </p>

      <div className="canvas-resize-size-fields">
        <label className="editor-field">
          Asset canvas幅
          <input
            type="number"
            min={1}
            max={4096}
            step={1}
            inputMode="numeric"
            value={widthText}
            onChange={(event) => setWidthText(event.target.value)}
          />
        </label>
        <label className="editor-field">
          Asset canvas高さ
          <input
            type="number"
            min={1}
            max={4096}
            step={1}
            inputMode="numeric"
            value={heightText}
            onChange={(event) => setHeightText(event.target.value)}
          />
        </label>
      </div>

      <fieldset className="canvas-resize-anchor-fieldset">
        <legend>旧canvasの基準位置</legend>
        <div
          className="canvas-resize-anchor-grid"
          role="radiogroup"
          aria-label="旧canvasの基準位置"
        >
          {ANCHOR_OPTIONS.map((option) => (
            <label key={option.value} title={option.label} className="canvas-resize-anchor-option">
              <input
                type="radio"
                name={`canvas-resize-anchor-${asset.id}`}
                value={option.value}
                checked={anchor === option.value}
                aria-label={`基準位置 ${option.label}`}
                onChange={() => setAnchor(option.value)}
              />
              <span aria-hidden="true">{option.symbol}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {validationError ? (
        <p className="import-error" role="alert">
          {validationError}
        </p>
      ) : changed && previewGeometry ? (
        <div className="canvas-resize-preview">
          <p className="canvas-resize-summary">
            {asset.canvasSize.width} x {asset.canvasSize.height} → {nextSize.width} x{' '}
            {nextSize.height}（移動量 X {offset.x >= 0 ? '+' : ''}
            {offset.x} / Y {offset.y >= 0 ? '+' : ''}
            {offset.y}）
          </p>
          <svg
            role="img"
            aria-label={`canvas変更前後preview。変更前${asset.canvasSize.width} x ${asset.canvasSize.height}、変更後${nextSize.width} x ${nextSize.height}`}
            viewBox={previewGeometry.viewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              className="canvas-resize-preview-next"
              x={0}
              y={0}
              width={nextSize.width}
              height={nextSize.height}
            />
            <rect
              className="canvas-resize-preview-old"
              x={offset.x}
              y={offset.y}
              width={asset.canvasSize.width}
              height={asset.canvasSize.height}
            />
          </svg>
          <div className="canvas-resize-preview-legend" aria-hidden="true">
            <span className="canvas-resize-preview-next-swatch" />
            変更後
            <span className="canvas-resize-preview-old-swatch" />
            変更前
          </div>
        </div>
      ) : (
        <p className="editor-note">現在と同じサイズです。変更は保存されません。</p>
      )}

      {warnings && (
        <div
          className={warnings.total > 0 ? 'canvas-resize-warning' : 'canvas-resize-safe'}
          role="status"
          aria-label="canvas外データ件数"
        >
          <p>
            変更後にcanvas外へ出るデータ: <strong>合計 {warnings.total}件</strong>
          </p>
          <ul>
            {WARNING_LABELS.map(({ key, label }) => (
              <li key={key}>
                {label}: {warnings[key]}件
              </li>
            ))}
          </ul>
          {warnings.total > 0 && <p>適用時に確認します。座標のclamp、crop、削除は行いません。</p>}
        </div>
      )}

      <button type="button" disabled={!changed || validationError !== null} onClick={handleApply}>
        Asset canvasサイズを適用
      </button>
    </div>
  );
}
