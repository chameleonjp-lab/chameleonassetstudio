import { useState } from 'react';
import {
  ANIMATION_NAME_SUGGESTIONS,
  addAnimation,
  captureFrame,
  duplicateFrame,
  moveFrameOrder,
  removeAnimation,
  removeFrame,
  renameFrame,
  updateAnimation,
  type Asset,
} from '../../core/model';

interface TimelinePanelProps {
  asset: Asset;
  /** 再生中 or プレビュー選択中のフレーム id（ハイライト用）。 */
  playingFrameId: string | null;
  isPlaying: boolean;
  selectedAnimationId: string | null;
  onSelectAnimation: (id: string | null) => void;
  /** クリックでそのフレームをプレビューする。 */
  onSelectFrame: (frameId: string) => void;
  onPlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  /** 履歴に積む変更（ボタン操作）。 */
  onCommit: (label: string, next: Asset) => void;
  /** 数値・文字入力の途中変更（履歴はフォーカス確定側で積む）。 */
  onLiveChange: (next: Asset) => void;
  onBeginFieldEdit: () => void;
  onCommitFieldEdit: () => void;
}

/** タイムラインパネル（Phase 9）。フレームの取り込みとアニメーションの再生を扱う。 */
export function TimelinePanel({
  asset,
  playingFrameId,
  isPlaying,
  selectedAnimationId,
  onSelectAnimation,
  onSelectFrame,
  onPlay,
  onStop,
  onRewind,
  onCommit,
  onLiveChange,
  onBeginFieldEdit,
  onCommitFieldEdit,
}: TimelinePanelProps) {
  const [newAnimationName, setNewAnimationName] = useState('');
  const frames = asset.frames ?? [];
  const selectedAnimation =
    asset.animations.find((animation) => animation.id === selectedAnimationId) ?? null;

  const handleDeleteFrame = (frameId: string, name: string) => {
    const ok = window.confirm(`フレーム「${name}」を削除します。よろしいですか？`);
    if (!ok) {
      return;
    }
    onCommit('フレーム削除', removeFrame(asset, frameId));
  };

  const handleCreateAnimation = () => {
    const name = newAnimationName.trim();
    if (!name) {
      return;
    }
    const next = addAnimation(asset, {
      name,
      frameIds: frames.map((frame) => frame.id),
    });
    onCommit('アニメーション作成', next);
    onSelectAnimation(next.animations.at(-1)!.id);
    setNewAnimationName('');
  };

  const handleDeleteAnimation = (animationId: string, name: string) => {
    const ok = window.confirm(`アニメーション「${name}」を削除します。よろしいですか？`);
    if (!ok) {
      return;
    }
    if (selectedAnimationId === animationId) {
      onSelectAnimation(null);
    }
    onCommit('アニメーション削除', removeAnimation(asset, animationId));
  };

  const canPlay = !!selectedAnimation && selectedAnimation.frameIds.length > 0;

  return (
    <div className="timeline-panel">
      <div className="timeline-frames">
        <ul className="timeline-frame-list" aria-label="フレーム一覧">
          {frames.map((frame) => (
            <li key={frame.id} className="timeline-frame-row">
              <button
                type="button"
                className="timeline-frame-button"
                aria-pressed={frame.id === playingFrameId}
                onClick={() => onSelectFrame(frame.id)}
              >
                {frame.name}
              </button>
              <label className="editor-field timeline-frame-name-field">
                フレーム名
                <input
                  type="text"
                  value={frame.name}
                  onFocus={onBeginFieldEdit}
                  onBlur={onCommitFieldEdit}
                  onChange={(event) =>
                    onLiveChange(renameFrame(asset, frame.id, event.target.value))
                  }
                />
              </label>
              <div className="timeline-frame-actions">
                <button
                  type="button"
                  aria-label={`フレーム「${frame.name}」を前へ`}
                  onClick={() =>
                    onCommit('フレーム並べ替え', moveFrameOrder(asset, frame.id, 'backward'))
                  }
                >
                  前へ
                </button>
                <button
                  type="button"
                  aria-label={`フレーム「${frame.name}」を後ろへ`}
                  onClick={() =>
                    onCommit('フレーム並べ替え', moveFrameOrder(asset, frame.id, 'forward'))
                  }
                >
                  後ろへ
                </button>
                <button
                  type="button"
                  aria-label={`フレーム「${frame.name}」を複製`}
                  onClick={() => onCommit('フレーム複製', duplicateFrame(asset, frame.id))}
                >
                  複製
                </button>
                <button
                  type="button"
                  aria-label={`フレーム「${frame.name}」を削除`}
                  onClick={() => handleDeleteFrame(frame.id, frame.name)}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => onCommit('フレーム追加', captureFrame(asset))}>
          フレーム追加
        </button>
      </div>

      <div className="timeline-animation">
        <label className="editor-field">
          アニメーション選択
          <select
            aria-label="アニメーション選択"
            value={selectedAnimationId ?? ''}
            onChange={(event) => onSelectAnimation(event.target.value || null)}
          >
            <option value="">（未選択）</option>
            {asset.animations.map((animation) => (
              <option key={animation.id} value={animation.id}>
                {animation.name}
              </option>
            ))}
          </select>
        </label>

        <div className="timeline-animation-create">
          <label className="editor-field">
            新しいアニメーション名
            <input
              type="text"
              list="animation-name-suggestions"
              value={newAnimationName}
              onChange={(event) => setNewAnimationName(event.target.value)}
            />
            <datalist id="animation-name-suggestions">
              {ANIMATION_NAME_SUGGESTIONS.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <button type="button" disabled={!newAnimationName.trim()} onClick={handleCreateAnimation}>
            作成
          </button>
        </div>

        {selectedAnimation && (
          <div className="timeline-animation-fields">
            <div className="timeline-animation-inline-fields">
              <label className="editor-field">
                fps
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={selectedAnimation.fps}
                  onFocus={onBeginFieldEdit}
                  onBlur={onCommitFieldEdit}
                  onChange={(event) =>
                    onLiveChange(
                      updateAnimation(asset, selectedAnimation.id, {
                        fps: Number(event.target.value) || 1,
                      }),
                    )
                  }
                />
              </label>
              <label className="editor-field timeline-loop-field">
                ループ
                <input
                  type="checkbox"
                  checked={selectedAnimation.loop}
                  onChange={(event) =>
                    onCommit(
                      'ループ切り替え',
                      updateAnimation(asset, selectedAnimation.id, { loop: event.target.checked }),
                    )
                  }
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!playingFrameId}
              onClick={() => {
                if (!playingFrameId) {
                  return;
                }
                onCommit(
                  'フレームを追加',
                  updateAnimation(asset, selectedAnimation.id, {
                    frameIds: [...selectedAnimation.frameIds, playingFrameId],
                  }),
                );
              }}
            >
              このフレームを追加
            </button>
            <button
              type="button"
              onClick={() => handleDeleteAnimation(selectedAnimation.id, selectedAnimation.name)}
            >
              アニメーション削除
            </button>
            <p className="editor-note">フレーム {selectedAnimation.frameIds.length} 枚</p>
          </div>
        )}
      </div>

      <div className="timeline-playback">
        <button type="button" disabled={!canPlay || isPlaying} onClick={onPlay}>
          再生
        </button>
        <button type="button" disabled={!isPlaying} onClick={onStop}>
          停止
        </button>
        <button type="button" onClick={onRewind}>
          先頭へ
        </button>
      </div>
    </div>
  );
}
