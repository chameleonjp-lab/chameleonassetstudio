import { useState } from 'react';
import {
  PART_TYPES,
  createPart,
  removePart,
  setPartBindPose,
  setPartParent,
  setPartRotationLimit,
  updatePart,
  type Asset,
  type PartType,
} from '../../core/model';

interface PartPanelProps {
  asset: Asset;
  checkedLayerIds: string[];
  onClearChecked: () => void;
  /** 履歴に積む変更（ボタン操作）。 */
  onCommit: (label: string, next: Asset) => void;
  /** 数値・文字入力の途中変更（履歴はフォーカス確定側で積む）。 */
  onLiveChange: (next: Asset) => void;
  onBeginFieldEdit: () => void;
  onCommitFieldEdit: () => void;
}

const PART_TYPE_LABELS: Record<PartType, string> = {
  head: '頭',
  body: '胴体',
  arm_left: '左腕',
  arm_right: '右腕',
  leg_left: '左脚',
  leg_right: '右脚',
  weapon: '武器',
  eye: '目',
  mouth: '口',
  shadow: '影',
  accessory: '飾り',
  other: 'その他',
};

/** パーツパネル（Phase 7）。レイヤーは表示の単位、パーツはゲーム内の意味を持つ単位。 */
export function PartPanel({
  asset,
  checkedLayerIds,
  onClearChecked,
  onCommit,
  onLiveChange,
  onBeginFieldEdit,
  onCommitFieldEdit,
}: PartPanelProps) {
  const [newPartName, setNewPartName] = useState('');
  const [newPartType, setNewPartType] = useState<PartType>('body');

  const handleCreate = () => {
    const name = newPartName.trim() || PART_TYPE_LABELS[newPartType];
    onCommit(
      'パーツ作成',
      createPart(asset, { name, partType: newPartType, layerIds: checkedLayerIds }),
    );
    setNewPartName('');
    onClearChecked();
  };

  const handleDelete = (partId: string, name: string) => {
    const ok = window.confirm(`パーツ「${name}」を削除します。よろしいですか？`);
    if (!ok) {
      return;
    }
    onCommit('パーツ削除', removePart(asset, partId));
  };

  return (
    <div className="part-panel">
      {asset.parts.length === 0 ? (
        <p className="editor-note">
          レイヤーのチェックを付けて「パーツを作成」を押すと、意味を持つ部位としてまとめられます。
        </p>
      ) : (
        <ul className="part-list" aria-label="パーツ一覧">
          {asset.parts.map((part) => (
            <li key={part.id} className="part-row">
              <div className="part-row-header">
                <label className="editor-field">
                  パーツ名
                  <input
                    type="text"
                    value={part.name}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(updatePart(asset, part.id, { name: event.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`パーツ「${part.name}」を削除`}
                  onClick={() => handleDelete(part.id, part.name)}
                >
                  削除
                </button>
              </div>
              <label className="editor-field">
                種別
                <select
                  value={part.partType}
                  onChange={(event) =>
                    onCommit(
                      'パーツ種別変更',
                      updatePart(asset, part.id, { partType: event.target.value as PartType }),
                    )
                  }
                >
                  {PART_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}（{PART_TYPE_LABELS[type]}）
                    </option>
                  ))}
                </select>
              </label>
              <div className="part-pivot-fields">
                <label className="editor-field">
                  pivot X
                  <input
                    type="number"
                    value={part.pivot?.x ?? 0}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        updatePart(asset, part.id, {
                          pivot: {
                            x: Number(event.target.value) || 0,
                            y: part.pivot?.y ?? 0,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <label className="editor-field">
                  pivot Y
                  <input
                    type="number"
                    value={part.pivot?.y ?? 0}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        updatePart(asset, part.id, {
                          pivot: {
                            x: part.pivot?.x ?? 0,
                            y: Number(event.target.value) || 0,
                          },
                        }),
                      )
                    }
                  />
                </label>
              </div>
              <label className="editor-field">
                親パーツ
                <select
                  aria-label={`「${part.name}」の親パーツ`}
                  value={part.parentId ?? ''}
                  onChange={(event) =>
                    onCommit(
                      '親パーツ変更',
                      setPartParent(asset, part.id, event.target.value || undefined),
                    )
                  }
                >
                  <option value="">なし</option>
                  {asset.parts
                    .filter((candidate) => candidate.id !== part.id)
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="gamedata-inline-fields">
                <label className="editor-field">
                  ポーズ X
                  <input
                    type="number"
                    value={part.bindPose?.localPosition?.x ?? 0}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        setPartBindPose(asset, part.id, {
                          ...part.bindPose,
                          localPosition: {
                            x: Number(event.target.value) || 0,
                            y: part.bindPose?.localPosition?.y ?? 0,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <label className="editor-field">
                  ポーズ Y
                  <input
                    type="number"
                    value={part.bindPose?.localPosition?.y ?? 0}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        setPartBindPose(asset, part.id, {
                          ...part.bindPose,
                          localPosition: {
                            x: part.bindPose?.localPosition?.x ?? 0,
                            y: Number(event.target.value) || 0,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <label className="editor-field">
                  ポーズ回転
                  <input
                    type="number"
                    value={part.bindPose?.localRotation ?? 0}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        setPartBindPose(asset, part.id, {
                          ...part.bindPose,
                          localRotation: Number(event.target.value) || 0,
                        }),
                      )
                    }
                  />
                </label>
              </div>
              {part.rotationLimit ? (
                <div className="gamedata-inline-fields">
                  <label className="editor-field">
                    可動域 min
                    <input
                      type="number"
                      value={part.rotationLimit.min}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          setPartRotationLimit(asset, part.id, {
                            min: Number(event.target.value) || 0,
                            max: part.rotationLimit?.max ?? 180,
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    可動域 max
                    <input
                      type="number"
                      value={part.rotationLimit.max}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          setPartRotationLimit(asset, part.id, {
                            min: part.rotationLimit?.min ?? -180,
                            max: Number(event.target.value) || 0,
                          }),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`「${part.name}」の可動域を解除`}
                    onClick={() =>
                      onCommit('可動域解除', setPartRotationLimit(asset, part.id, undefined))
                    }
                  >
                    解除
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`「${part.name}」に可動域を追加`}
                  onClick={() =>
                    onCommit(
                      '可動域追加',
                      setPartRotationLimit(asset, part.id, { min: -180, max: 180 }),
                    )
                  }
                >
                  可動域を追加
                </button>
              )}
              <p className="part-row-meta">レイヤー {part.layerIds.length} 件</p>
            </li>
          ))}
        </ul>
      )}

      <div className="part-create">
        <label className="editor-field">
          新しいパーツ名
          <input
            type="text"
            value={newPartName}
            placeholder={PART_TYPE_LABELS[newPartType]}
            onChange={(event) => setNewPartName(event.target.value)}
          />
        </label>
        <label className="editor-field">
          パーツ種別
          <select
            value={newPartType}
            onChange={(event) => setNewPartType(event.target.value as PartType)}
          >
            {PART_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}（{PART_TYPE_LABELS[type]}）
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={checkedLayerIds.length === 0} onClick={handleCreate}>
          パーツを作成（選択レイヤー {checkedLayerIds.length} 件）
        </button>
      </div>
    </div>
  );
}
