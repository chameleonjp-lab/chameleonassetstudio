import { useState } from 'react';
import {
  ITEM_ATTRIBUTE_KEYS,
  removeGameAttribute,
  setGameAttribute,
  type Asset,
} from '../../core/model';
import { CommittedInput } from './CommittedInput';
import {
  formatReadonlyGameAttribute,
  gameAttributeTypeLabel,
  isEditableGameAttribute,
} from './gameDataSafety';
import { InspectionPanel } from './InspectionPanel';

interface GameAttributesPanelProps {
  asset: Asset;
  onCommit: (label: string, next: Asset) => void;
}

/**
 * 数値文字列であれば number に変換し、それ以外は文字列のまま返す。
 * Infinity は JSON 化で null になりデータが失われるため文字列のまま保持する。
 */
function parseAttributeValue(raw: string): unknown {
  if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return raw;
}

/** ゲーム属性（gameAttributes）の一覧編集パネル（Phase 14）。 */
export function GameAttributesPanel({ asset, onCommit }: GameAttributesPanelProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const entries = Object.entries(asset.gameAttributes);
  const trimmedNewKey = newKey.trim();
  const duplicateKey =
    trimmedNewKey !== '' &&
    Object.prototype.hasOwnProperty.call(asset.gameAttributes, trimmedNewKey);

  const handleAdd = () => {
    if (!trimmedNewKey || duplicateKey) {
      return;
    }
    onCommit('属性を追加', setGameAttribute(asset, trimmedNewKey, parseAttributeValue(newValue)));
    setNewKey('');
    setNewValue('');
  };

  return (
    <div className="gamedata-panel">
      <InspectionPanel asset={asset} />

      <h4 className="gamedata-heading">属性一覧</h4>
      {entries.length > 0 && (
        <ul className="gamedata-list" aria-label="ゲーム属性一覧">
          {entries.map(([key, value]) => (
            <li key={key} className="gamedata-row">
              <div className="gamedata-row-header">
                <span className="gamedata-shape">{key}</span>
                {isEditableGameAttribute(value) ? (
                  <label className="editor-field">
                    値
                    <CommittedInput
                      type="text"
                      aria-label={`属性「${key}」の値`}
                      value={String(value)}
                      normalize={
                        typeof value === 'number'
                          ? (nextValue) => String(parseAttributeValue(nextValue))
                          : undefined
                      }
                      onCommit={(nextValue) =>
                        onCommit(
                          '属性値変更',
                          setGameAttribute(asset, key, parseAttributeValue(nextValue)),
                        )
                      }
                    />
                  </label>
                ) : (
                  <div className="gamedata-readonly-value">
                    <span className="gamedata-readonly-label">
                      読み取り専用（{gameAttributeTypeLabel(value)}）
                    </span>
                    <pre>{formatReadonlyGameAttribute(value)}</pre>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`属性「${key}」を削除`}
                  onClick={() => onCommit('属性を削除', removeGameAttribute(asset, key))}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="gamedata-inline-fields">
        <label className="editor-field">
          属性名
          <input
            type="text"
            aria-label="新しい属性名"
            list="game-attribute-key-suggestions"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
          />
        </label>
        <label className="editor-field">
          属性値
          <input
            type="text"
            aria-label="新しい属性値"
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
          />
        </label>
        <button type="button" onClick={handleAdd} disabled={!trimmedNewKey || duplicateKey}>
          属性を追加
        </button>
      </div>
      {duplicateKey && (
        <p className="gamedata-warning" role="alert">
          同じ属性名があります。既存の値を守るため、別の属性名を入力してください。
        </p>
      )}
      <datalist id="game-attribute-key-suggestions">
        {ITEM_ATTRIBUTE_KEYS.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
    </div>
  );
}
