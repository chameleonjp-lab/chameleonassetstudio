import { useEffect, useMemo, useState } from 'react';
import {
  ANCHOR_ROLES,
  COLLIDER_PURPOSES,
  addCircleCollider,
  addRectCollider,
  removeAnchor,
  removeCollider,
  findFrameColliderOverride,
  frameColliderReferenceReason,
  resetFrameColliderGeometry,
  resetFrameColliderOverride,
  resolveFrameColliders,
  setFrameColliderGeometry,
  setFrameColliderVisible,
  resetOriginToBottomCenter,
  setOrigin,
  updateAnchor,
  updateCollider,
  type AnchorRole,
  type Asset,
  type ColliderPurpose,
  type Frame,
  type FrameColliderOverrideMutationResult,
} from '../../core/model';
import { CommittedInput } from './CommittedInput';
import { colliderPurposeColor, isSelectedCollider } from './colliderDisplay';
import { applyEditSnap } from './snap';

/** 判定用途に対応するキャンバス表示色を返す（カラースワッチ・凡例で共用）。 */
function purposeColor(purpose: ColliderPurpose): string {
  return colliderPurposeColor(purpose);
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
  selectedColliderId: string | null;
  onSelectCollider: (colliderId: string) => void;
  /** タイムラインで明示選択した停止中Frame。 */
  selectedFrame: Frame | null;
  isPlaying: boolean;
  /** Frame collider override専用のcanonical commit経路。 */
  onFrameCommit: (label: string, next: Asset) => void;
  onFrameError: (message: string | null) => void;
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
  selectedColliderId,
  onSelectCollider,
  selectedFrame,
  isPlaying,
  onFrameCommit,
  onFrameError,
}: GameDataPanelProps) {
  const [colliderScope, setColliderScope] = useState<'asset' | 'frame'>('asset');

  useEffect(() => {
    setColliderScope('asset');
  }, [asset.id]);

  useEffect(() => {
    if (!selectedFrame || isPlaying) setColliderScope('asset');
  }, [isPlaying, selectedFrame]);

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
      <label className="editor-field gamedata-collider-scope">
        当たり判定の編集範囲
        <select
          aria-label="当たり判定の編集範囲"
          value={colliderScope}
          onChange={(event) => setColliderScope(event.target.value as 'asset' | 'frame')}
        >
          <option value="asset">Asset共通</option>
          <option value="frame" disabled={!selectedFrame || isPlaying}>
            選択Frame{selectedFrame ? `「${selectedFrame.name}」` : '（タイムラインで選択）'}
          </option>
        </select>
      </label>
      <p className="editor-note">
        {colliderScope === 'frame' && selectedFrame
          ? `Frame別編集中: 「${selectedFrame.name}」。省略した値はAsset共通値を使います。`
          : isPlaying
            ? 'Animation再生中はFrame別編集へ切り替えられません。停止してFrameを選択してください。'
            : 'Asset共通を編集中です。Frame別編集はタイムラインで停止中のFrameを選択して切り替えます。'}
      </p>
      <div className="gamedata-buttons">
        <button type="button" aria-pressed={showColliders} onClick={onToggleShowColliders}>
          判定を表示
        </button>
        {colliderScope === 'asset' && (
          <>
            <button
              type="button"
              onClick={() => onCommit('矩形判定を追加', addRectCollider(asset))}
            >
              矩形判定を追加
            </button>
            <button
              type="button"
              onClick={() => onCommit('円判定を追加', addCircleCollider(asset))}
            >
              円判定を追加
            </button>
          </>
        )}
      </div>
      <ul className="gamedata-legend" aria-label="判定用途の色凡例">
        {COLLIDER_PURPOSES.map((purpose) => (
          <li key={purpose}>
            <span
              className={`gamedata-collider-swatch${purpose === 'sensor' ? ' sensor' : ''}`}
              style={{ backgroundColor: purposeColor(purpose) }}
              aria-hidden="true"
            />
            {purpose}（{PURPOSE_LABELS[purpose]}
            {purpose === 'sensor' ? '・破線' : ''}）
          </li>
        ))}
      </ul>
      {colliderScope === 'asset' && asset.colliders.length > 0 && (
        <ul className="gamedata-list" aria-label="当たり判定一覧">
          {asset.colliders.map((collider) => {
            const selected = isSelectedCollider(collider.id, selectedColliderId);
            return (
              <li key={collider.id} className={`gamedata-row${selected ? ' selected' : ''}`}>
                <div className="gamedata-row-header">
                  <span
                    className={`gamedata-collider-swatch${collider.purpose === 'sensor' ? ' sensor' : ''}`}
                    style={{ backgroundColor: purposeColor(collider.purpose) }}
                    title={`${collider.purpose} の色`}
                  />
                  <span className="gamedata-shape">
                    {collider.shape === 'rect' ? '矩形' : '円'}
                  </span>
                  <button
                    type="button"
                    className="gamedata-select-button"
                    aria-label={`判定「${collider.name}」を選択`}
                    aria-pressed={selected}
                    onClick={() => onSelectCollider(collider.id)}
                  >
                    選択
                  </button>
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
                    onClick={() => {
                      const reason = frameColliderReferenceReason(asset, collider.id);
                      if (reason) {
                        onFrameError(reason);
                        return;
                      }
                      onCommit('判定削除', removeCollider(asset, collider.id));
                    }}
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
            );
          })}
        </ul>
      )}
      {colliderScope === 'frame' && selectedFrame && !isPlaying && (
        <FrameColliderOverridePanel
          asset={asset}
          frame={selectedFrame}
          snapEnabled={snapEnabled}
          gridSize={gridSize}
          selectedColliderId={selectedColliderId}
          onSelectCollider={onSelectCollider}
          onCommit={onFrameCommit}
          onError={onFrameError}
        />
      )}
    </div>
  );
}

interface FrameColliderOverridePanelProps {
  asset: Asset;
  frame: Frame;
  snapEnabled: boolean;
  gridSize: number;
  selectedColliderId: string | null;
  onSelectCollider: (colliderId: string) => void;
  onCommit: (label: string, next: Asset) => void;
  onError: (message: string | null) => void;
}

const OVERRIDE_KNOWN_KEYS = new Set(['colliderId', 'rect', 'circle', 'visible']);
const RECT_KNOWN_KEYS = new Set(['x', 'y', 'width', 'height']);
const CIRCLE_KNOWN_KEYS = new Set(['x', 'y', 'radius']);

function unknownOverridePaths(override: NonNullable<Frame['colliderOverrides']>[number]): string[] {
  const paths = Object.keys(override).filter((key) => !OVERRIDE_KNOWN_KEYS.has(key));
  if (override.rect) {
    paths.push(
      ...Object.keys(override.rect)
        .filter((key) => !RECT_KNOWN_KEYS.has(key))
        .map((key) => `rect.${key}`),
    );
  }
  if (override.circle) {
    paths.push(
      ...Object.keys(override.circle)
        .filter((key) => !CIRCLE_KNOWN_KEYS.has(key))
        .map((key) => `circle.${key}`),
    );
  }
  return paths;
}

function FrameColliderOverridePanel({
  asset,
  frame,
  snapEnabled,
  gridSize,
  selectedColliderId,
  onSelectCollider,
  onCommit,
  onError,
}: FrameColliderOverridePanelProps) {
  const effectiveColliders = useMemo(
    () => resolveFrameColliders(asset, frame.id),
    [asset, frame.id],
  );
  const commitResult = (label: string, result: FrameColliderOverrideMutationResult) => {
    if (!result.ok) {
      onError(result.message);
      return false;
    }
    if (result.changed) {
      onCommit(label, result.asset);
    } else {
      onError(null);
    }
    return true;
  };
  const normalizeNumber = (raw: string, positive: boolean): string => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return raw;
    const snapped = positive ? parsed : applyEditSnap(parsed, snapEnabled, gridSize);
    return String(snapped);
  };

  if (asset.colliders.length === 0) {
    return <p className="editor-note">先にAsset共通の当たり判定を追加してください。</p>;
  }

  return (
    <ul className="gamedata-list" aria-label={`Frame「${frame.name}」の当たり判定上書き`}>
      {asset.colliders.map((collider, index) => {
        const effective = effectiveColliders[index];
        const override = findFrameColliderOverride(frame, collider.id);
        const unknownPaths = override ? unknownOverridePaths(override) : [];
        const unknownGeometryPaths = unknownPaths.filter(
          (path) => path.startsWith('rect.') || path.startsWith('circle.'),
        );
        const selected = isSelectedCollider(collider.id, selectedColliderId);
        const commitGeometryField = (field: string, raw: string) => {
          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) {
            onError(
              `Frame「${frame.name}」の判定「${collider.name}」${field}は有限な数値で入力してください。`,
            );
            return false;
          }
          if ((field === 'width' || field === 'height' || field === 'radius') && parsed <= 0) {
            onError(
              `Frame「${frame.name}」の判定「${collider.name}」${field}は0より大きい値を入力してください。`,
            );
            return false;
          }
          if (effective.shape === 'rect') {
            const value = Number(normalizeNumber(raw, field === 'width' || field === 'height'));
            return commitResult(
              'Frame別当たり判定 geometry変更',
              setFrameColliderGeometry(asset, frame.id, collider.id, {
                ...structuredClone(effective.rect),
                [field]: value,
              }),
            );
          } else {
            const value = Number(normalizeNumber(raw, field === 'radius'));
            return commitResult(
              'Frame別当たり判定 geometry変更',
              setFrameColliderGeometry(asset, frame.id, collider.id, {
                ...structuredClone(effective.circle),
                [field]: value,
              }),
            );
          }
        };
        const fields =
          effective.shape === 'rect'
            ? ([
                ['x', 'X'],
                ['y', 'Y'],
                ['width', '幅'],
                ['height', '高さ'],
              ] as const)
            : ([
                ['x', 'X'],
                ['y', 'Y'],
                ['radius', '半径'],
              ] as const);
        const geometry = effective.shape === 'rect' ? effective.rect : effective.circle;

        return (
          <li key={collider.id} className={`gamedata-row${selected ? ' selected' : ''}`}>
            <div className="gamedata-row-header">
              <span
                className={`gamedata-collider-swatch${collider.purpose === 'sensor' ? ' sensor' : ''}`}
                style={{ backgroundColor: purposeColor(collider.purpose) }}
                aria-hidden="true"
              />
              <strong>{collider.name}</strong>
              <span className="gamedata-shape">{collider.shape === 'rect' ? '矩形' : '円'}</span>
              <button
                type="button"
                aria-label={`Frame「${frame.name}」の判定「${collider.name}」を選択`}
                aria-pressed={selected}
                onClick={() => onSelectCollider(collider.id)}
              >
                選択
              </button>
            </div>
            <p className="editor-note">
              位置・サイズ: {override?.rect || override?.circle ? 'Frame値' : 'Asset共通値'} / 表示:{' '}
              {override?.visible === undefined
                ? `Asset共通（${collider.visible ? '表示' : '非表示'}）`
                : override.visible
                  ? 'Frameで表示'
                  : 'Frameで非表示'}
            </p>
            <div className="gamedata-inline-fields">
              {fields.map(([field, label]) => {
                const current = geometry[field as keyof typeof geometry] as number;
                return (
                  <label key={field} className="editor-field">
                    {label}
                    <CommittedInput
                      type="number"
                      inputMode="decimal"
                      min={
                        field === 'width' || field === 'height' || field === 'radius'
                          ? 1
                          : undefined
                      }
                      aria-label={`Frame「${frame.name}」判定「${collider.name}」${label}`}
                      value={String(current)}
                      normalize={(raw) =>
                        normalizeNumber(
                          raw,
                          field === 'width' || field === 'height' || field === 'radius',
                        )
                      }
                      onCommit={(raw) => commitGeometryField(field, raw)}
                    />
                  </label>
                );
              })}
            </div>
            <label className="editor-field">
              Frame別の表示
              <select
                aria-label={`Frame「${frame.name}」判定「${collider.name}」の表示`}
                value={
                  override?.visible === undefined ? 'inherit' : override.visible ? 'show' : 'hide'
                }
                onChange={(event) => {
                  const value = event.target.value;
                  commitResult(
                    'Frame別当たり判定 表示変更',
                    setFrameColliderVisible(
                      asset,
                      frame.id,
                      collider.id,
                      value === 'inherit' ? undefined : value === 'show',
                    ),
                  );
                }}
              >
                <option value="inherit">Asset共通値を使う</option>
                <option value="show">表示</option>
                <option value="hide">非表示</option>
              </select>
            </label>
            <div className="gamedata-buttons gamedata-override-actions">
              <button
                type="button"
                disabled={!override?.rect && !override?.circle}
                onClick={() => {
                  if (
                    unknownGeometryPaths.length > 0 &&
                    !window.confirm(
                      `未知field（${unknownGeometryPaths.join('、')}）を含む位置・サイズの上書きを削除します。よろしいですか？`,
                    )
                  ) {
                    return;
                  }
                  commitResult(
                    'Frame別当たり判定 geometry解除',
                    resetFrameColliderGeometry(asset, frame.id, collider.id),
                  );
                }}
              >
                位置・サイズを共通へ戻す
              </button>
              <button
                type="button"
                disabled={!override}
                onClick={() => {
                  const message =
                    unknownPaths.length > 0
                      ? `未知field（${unknownPaths.join('、')}）を含む、このFrameの上書き全体を削除します。よろしいですか？`
                      : 'このFrameの位置・サイズと表示の上書きをすべて解除します。よろしいですか？';
                  if (!window.confirm(message)) {
                    return;
                  }
                  commitResult(
                    'Frame別当たり判定 上書き全解除',
                    resetFrameColliderOverride(asset, frame.id, collider.id),
                  );
                }}
              >
                このFrameの上書きをすべて解除
              </button>
            </div>
            {unknownPaths.length > 0 && (
              <p className="export-warning">
                未知field（{unknownPaths.join('、')}
                ）を保持中です。field単位の解除で未知fieldだけが残る場合は拒否します。
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
