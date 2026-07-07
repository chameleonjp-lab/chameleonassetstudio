import {
  ANCHOR_ROLES,
  COLLIDER_PURPOSES,
  addCircleCollider,
  addRectCollider,
  removeAnchor,
  removeCollider,
  resetOriginToBottomCenter,
  setOrigin,
  updateAnchor,
  updateCollider,
  type AnchorRole,
  type Asset,
  type ColliderPurpose,
} from '../../core/model';
import { COLLIDER_COLORS } from '../../renderers/canvas2d/render';
import { applyEditSnap } from './snap';

/** 判定用途に対応するキャンバス表示色を返す（カラースワッチ・凡例で共用）。 */
function purposeColor(purpose: ColliderPurpose): string {
  return COLLIDER_COLORS[purpose] ?? COLLIDER_COLORS.custom;
}

interface GameDataPanelProps {
  asset: Asset;
  showColliders: boolean;
  newAnchorRole: AnchorRole;
  onNewAnchorRoleChange: (role: AnchorRole) => void;
  onToggleShowColliders: () => void;
  /** スナップは UI 操作補助で、保存座標の px 単位の意味は変えない。 */
  snapEnabled: boolean;
  gridSize: number;
  /** 履歴に積む変更（ボタン・セレクト操作）。 */
  onCommit: (label: string, next: Asset) => void;
  /** 数値・文字入力の途中変更（履歴はフォーカス確定側で積む）。 */
  onLiveChange: (next: Asset) => void;
  onBeginFieldEdit: () => void;
  onCommitFieldEdit: () => void;
}

const PURPOSE_LABELS: Record<ColliderPurpose, string> = {
  body: '本体',
  attack: '攻撃',
  pickup: '取得',
  sensor: 'センサー',
  custom: 'カスタム',
};

/** 原点・アンカー・当たり判定のパネル（Phase 8）。 */
export function GameDataPanel({
  asset,
  showColliders,
  newAnchorRole,
  onNewAnchorRoleChange,
  onToggleShowColliders,
  snapEnabled,
  gridSize,
  onCommit,
  onLiveChange,
  onBeginFieldEdit,
  onCommitFieldEdit,
}: GameDataPanelProps) {
  const numberValue = (raw: string): number => Number(raw) || 0;
  const snappedNumberValue = (raw: string): number => {
    const value = numberValue(raw);
    return applyEditSnap(value, snapEnabled, gridSize);
  };

  return (
    <div className="gamedata-panel">
      <h4 className="gamedata-heading">原点</h4>
      <div className="gamedata-inline-fields">
        <label className="editor-field">
          原点 X
          <input
            type="number"
            value={asset.origin.x}
            onFocus={onBeginFieldEdit}
            onBlur={onCommitFieldEdit}
            onChange={(event) =>
              onLiveChange(
                setOrigin(asset, { x: snappedNumberValue(event.target.value), y: asset.origin.y }),
              )
            }
          />
        </label>
        <label className="editor-field">
          原点 Y
          <input
            type="number"
            value={asset.origin.y}
            onFocus={onBeginFieldEdit}
            onBlur={onCommitFieldEdit}
            onChange={(event) =>
              onLiveChange(
                setOrigin(asset, { x: asset.origin.x, y: snappedNumberValue(event.target.value) }),
              )
            }
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => onCommit('原点を下中央へ', resetOriginToBottomCenter(asset))}
      >
        下中央へ戻す
      </button>
      <p className="editor-note">原点ツールでキャンバスをクリック / ドラッグしても設定できます。</p>

      <h4 className="gamedata-heading">アンカー</h4>
      <label className="editor-field">
        追加するアンカーの用途
        <select
          value={newAnchorRole}
          onChange={(event) => onNewAnchorRoleChange(event.target.value as AnchorRole)}
        >
          {ANCHOR_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      <p className="editor-note">
        アンカーツールでキャンバスをクリックすると追加、マーカーをドラッグすると移動します。
      </p>
      {asset.anchors.length > 0 && (
        <ul className="gamedata-list" aria-label="アンカー一覧">
          {asset.anchors.map((anchor) => (
            <li key={anchor.id} className="gamedata-row">
              <div className="gamedata-row-header">
                <label className="editor-field">
                  名前
                  <input
                    type="text"
                    value={anchor.name}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(updateAnchor(asset, anchor.id, { name: event.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`アンカー「${anchor.name}」を削除`}
                  onClick={() => onCommit('アンカー削除', removeAnchor(asset, anchor.id))}
                >
                  削除
                </button>
              </div>
              <label className="editor-field">
                用途
                <select
                  value={anchor.role}
                  onChange={(event) =>
                    onCommit(
                      'アンカー用途変更',
                      updateAnchor(asset, anchor.id, { role: event.target.value as AnchorRole }),
                    )
                  }
                >
                  {ANCHOR_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="gamedata-inline-fields">
                <label className="editor-field">
                  X
                  <input
                    type="number"
                    value={anchor.position.x}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        updateAnchor(asset, anchor.id, {
                          position: {
                            x: snappedNumberValue(event.target.value),
                            y: anchor.position.y,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <label className="editor-field">
                  Y
                  <input
                    type="number"
                    value={anchor.position.y}
                    onFocus={onBeginFieldEdit}
                    onBlur={onCommitFieldEdit}
                    onChange={(event) =>
                      onLiveChange(
                        updateAnchor(asset, anchor.id, {
                          position: {
                            x: anchor.position.x,
                            y: snappedNumberValue(event.target.value),
                          },
                        }),
                      )
                    }
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="gamedata-heading">当たり判定</h4>
      <div className="gamedata-buttons">
        <button type="button" aria-pressed={showColliders} onClick={onToggleShowColliders}>
          判定を表示
        </button>
        <button type="button" onClick={() => onCommit('矩形判定を追加', addRectCollider(asset))}>
          矩形判定を追加
        </button>
        <button type="button" onClick={() => onCommit('円判定を追加', addCircleCollider(asset))}>
          円判定を追加
        </button>
      </div>
      <ul className="gamedata-legend" aria-label="判定用途の色凡例">
        {COLLIDER_PURPOSES.map((purpose) => (
          <li key={purpose}>
            <span
              className="gamedata-collider-swatch"
              style={{ backgroundColor: purposeColor(purpose) }}
              aria-hidden="true"
            />
            {PURPOSE_LABELS[purpose]}
          </li>
        ))}
      </ul>
      {asset.colliders.length > 0 && (
        <ul className="gamedata-list" aria-label="当たり判定一覧">
          {asset.colliders.map((collider) => (
            <li key={collider.id} className="gamedata-row">
              <div className="gamedata-row-header">
                <span
                  className="gamedata-collider-swatch"
                  style={{ backgroundColor: purposeColor(collider.purpose) }}
                  title={`${collider.purpose} の色`}
                />
                <span className="gamedata-shape">{collider.shape === 'rect' ? '矩形' : '円'}</span>
                <button
                  type="button"
                  aria-label={`判定「${collider.name}」の表示を切り替え`}
                  aria-pressed={collider.visible}
                  onClick={() =>
                    onCommit(
                      collider.visible ? '判定を非表示' : '判定を表示',
                      updateCollider(asset, collider.id, { visible: !collider.visible }),
                    )
                  }
                >
                  {collider.visible ? '表示' : '非表示'}
                </button>
                <button
                  type="button"
                  aria-label={`判定「${collider.name}」を削除`}
                  onClick={() => onCommit('判定削除', removeCollider(asset, collider.id))}
                >
                  削除
                </button>
              </div>
              <label className="editor-field">
                用途
                <select
                  value={collider.purpose}
                  onChange={(event) =>
                    onCommit(
                      '判定用途変更',
                      updateCollider(asset, collider.id, {
                        purpose: event.target.value as ColliderPurpose,
                        name: event.target.value,
                      }),
                    )
                  }
                >
                  {COLLIDER_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}（{PURPOSE_LABELS[purpose]}）
                    </option>
                  ))}
                </select>
              </label>
              {collider.shape === 'rect' ? (
                <div className="gamedata-inline-fields">
                  <label className="editor-field">
                    X
                    <input
                      type="number"
                      value={collider.rect.x}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            rect: { x: snappedNumberValue(event.target.value) },
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    Y
                    <input
                      type="number"
                      value={collider.rect.y}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            rect: { y: snappedNumberValue(event.target.value) },
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    幅
                    <input
                      type="number"
                      min={1}
                      value={collider.rect.width}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            rect: { width: Math.max(1, numberValue(event.target.value)) },
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    高さ
                    <input
                      type="number"
                      min={1}
                      value={collider.rect.height}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            rect: { height: Math.max(1, numberValue(event.target.value)) },
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="gamedata-inline-fields">
                  <label className="editor-field">
                    X
                    <input
                      type="number"
                      value={collider.circle.x}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            circle: { x: snappedNumberValue(event.target.value) },
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    Y
                    <input
                      type="number"
                      value={collider.circle.y}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            circle: { y: snappedNumberValue(event.target.value) },
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="editor-field">
                    半径
                    <input
                      type="number"
                      min={1}
                      value={collider.circle.radius}
                      onFocus={onBeginFieldEdit}
                      onBlur={onCommitFieldEdit}
                      onChange={(event) =>
                        onLiveChange(
                          updateCollider(asset, collider.id, {
                            circle: { radius: Math.max(1, numberValue(event.target.value)) },
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
