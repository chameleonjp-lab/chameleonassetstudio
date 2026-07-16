import { useState } from 'react';
import {
  ITEM_ATTRIBUTE_KEYS,
  removeGameAttribute,
  setGameAttribute,
  type Asset,
} from '../../core/model';
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

function displayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

/** ゲーム属性（gameAttributes）の一覧編集パネル（Phase 14）。 */
export function GameAttributesPanel({ asset, onCommit }: GameAttributesPanelProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const entries = Object.entries(asset.gameAttributes);

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) {
      return;
    }
    onCommit('属性を追加', setGameAttribute(asset, key, parseAttributeValue(newValue)));
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
                <label className="editor-field">
                  値
                  <input
                    type="text"
                    aria-label={`属性「${key}」の値`}
                    value={displayValue(value)}
                    onChange={(event) =>
                      onCommit(
                        '属性値変更',
                        setGameAttribute(asset, key, parseAttributeValue(event.target.value)),
                      )
                    }
                  />
                </label>
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
            list="game-attribute-key-suggestions"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
          />
        </label>
        <label className="editor-field">
          属性値
          <input
            type="text"
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
          />
        </label>
        <button type="button" onClick={handleAdd}>
          属性を追加
        </button>
      </div>
      <datalist id="game-attribute-key-suggestions">
        {ITEM_ATTRIBUTE_KEYS.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
    </div>
  );
}
