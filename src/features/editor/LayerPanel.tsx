import type { ChangeEvent } from 'react';
import {
  moveLayerOrder,
  removeLayer,
  setLayerLocked,
  setLayerVisibility,
  type Asset,
} from '../../core/model';

interface LayerPanelProps {
  asset: Asset;
  selectedLayerId: string | null;
  checkedLayerIds: string[];
  importAccept: string;
  onSelectLayer: (layerId: string | null) => void;
  onToggleChecked: (layerId: string) => void;
  /** 履歴に積む変更（ボタン操作）。 */
  onCommit: (label: string, next: Asset) => void;
  /** 画像レイヤーの追加（ファイル選択）。 */
  onAddImageLayer: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddGuideLayer: () => void;
}

/** レイヤーパネル（Phase 7）。配列の末尾が最前面なので、逆順（前面が上）に表示する。 */
export function LayerPanel({
  asset,
  selectedLayerId,
  checkedLayerIds,
  importAccept,
  onSelectLayer,
  onToggleChecked,
  onCommit,
  onAddImageLayer,
  onAddGuideLayer,
}: LayerPanelProps) {
  const layersFrontFirst = [...asset.layers].reverse();

  const handleDelete = (layerId: string, name: string) => {
    const ok = window.confirm(`レイヤー「${name}」を削除します。よろしいですか？`);
    if (!ok) {
      return;
    }
    if (selectedLayerId === layerId) {
      onSelectLayer(null);
    }
    onCommit('レイヤー削除', removeLayer(asset, layerId));
  };

  return (
    <div className="layer-panel">
      <ul className="layer-list" aria-label="レイヤー一覧">
        {layersFrontFirst.map((layer) => (
          <li
            key={layer.id}
            className={`layer-row${layer.id === selectedLayerId ? ' selected' : ''}`}
          >
            <input
              type="checkbox"
              aria-label={`「${layer.name}」を複数レイヤー操作の対象にする`}
              checked={checkedLayerIds.includes(layer.id)}
              onChange={() => onToggleChecked(layer.id)}
            />
            <button
              type="button"
              className="layer-row-name"
              aria-pressed={layer.id === selectedLayerId}
              onClick={() => onSelectLayer(layer.id)}
            >
              {layer.name}
              {layer.layerType !== 'image' && (
                <span className="layer-row-type">
                  （{layer.layerType === 'guide' ? 'ガイド' : '図形'}）
                </span>
              )}
            </button>
            <div className="layer-row-actions">
              <button
                type="button"
                aria-label={`「${layer.name}」の表示を切り替え`}
                aria-pressed={layer.visible}
                onClick={() =>
                  onCommit(
                    layer.visible ? 'レイヤー非表示' : 'レイヤー表示',
                    setLayerVisibility(asset, layer.id, !layer.visible),
                  )
                }
              >
                {layer.visible ? '表示' : '非表示'}
              </button>
              <button
                type="button"
                aria-label={`「${layer.name}」のロックを切り替え`}
                aria-pressed={layer.locked}
                onClick={() =>
                  onCommit(
                    layer.locked ? 'ロック解除' : 'ロック',
                    setLayerLocked(asset, layer.id, !layer.locked),
                  )
                }
              >
                {layer.locked ? '解除' : 'ロック'}
              </button>
              <button
                type="button"
                aria-label={`「${layer.name}」を前面へ`}
                onClick={() =>
                  onCommit('レイヤー並べ替え', moveLayerOrder(asset, layer.id, 'forward'))
                }
              >
                前面へ
              </button>
              <button
                type="button"
                aria-label={`「${layer.name}」を背面へ`}
                onClick={() =>
                  onCommit('レイヤー並べ替え', moveLayerOrder(asset, layer.id, 'backward'))
                }
              >
                背面へ
              </button>
              <button
                type="button"
                aria-label={`「${layer.name}」を削除`}
                onClick={() => handleDelete(layer.id, layer.name)}
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="layer-add-buttons">
        <label className="import-button">
          画像レイヤーを追加
          <input
            type="file"
            accept={importAccept}
            multiple
            onChange={onAddImageLayer}
            className="visually-hidden-input"
          />
        </label>
        <button type="button" onClick={onAddGuideLayer}>
          ガイドレイヤーを追加
        </button>
      </div>
    </div>
  );
}
