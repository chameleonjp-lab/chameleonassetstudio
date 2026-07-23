import { useState } from 'react';
import {
  ANIMATION_NAME_SUGGESTIONS,
  addAnimation,
  calculateAnimationDurationMs,
  captureFrame,
  duplicateFrame,
  moveFrameOrder,
  removeAnimation,
  removeFrame,
  renameFrame,
  updateAnimation,
  updateFrameDuration,
  type AnimationEvent,
  type Asset,
} from '../../core/model';

interface TimelinePanelProps {
  asset: Asset;
  /** 再生中 or プレビュー選択中のフレーム id（ハイライト用）。 */
  playingFrameId: string | null;
  /** 再生中の現在Frameで発火した、保存データ上の不活性なイベント。 */
  firedAnimationEvents: readonly AnimationEvent[];
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
  firedAnimationEvents,
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
  const selectedAnimationDuration = selectedAnimation
    ? calculateAnimationDurationMs(selectedAnimation, frames)
    : null;
  const frameNameById = new Map(frames.map((frame) => [frame.id, frame.name]));

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
              <label className="editor-field timeline-frame-duration-field">
                表示時間（ms）
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  inputMode="decimal"
                  aria-label={`フレーム「${frame.name}」の表示時間（ミリ秒）`}
                  value={frame.durationMs ?? ''}
                  placeholder="fps"
                  onFocus={onBeginFieldEdit}
                  onBlur={onCommitFieldEdit}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === '') {
                      onLiveChange(updateFrameDuration(asset, frame.id, undefined));
                      return;
                    }
                    const durationMs = Number(raw);
                    if (Number.isFinite(durationMs) && durationMs > 0) {
                      onLiveChange(updateFrameDuration(asset, frame.id, durationMs));
                    }
                  }}
                />
                <span className="timeline-frame-duration-note">
                  {frame.durationMs === undefined
                    ? '空欄：参照先アニメーションのfps'
                    : `${frame.durationMs}msで固定`}
                </span>
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
            <p className="editor-note" aria-label="アニメーション再生時間">
              再生時間:{' '}
              {selectedAnimationDuration === null
                ? '計算できません'
                : `${Math.round(selectedAnimationDuration * 100) / 100}ms`}
            </p>
            <div className="timeline-event-summary" aria-label="アニメーションイベント">
              <strong>イベント {selectedAnimation.events?.length ?? 0} 件</strong>
              {(selectedAnimation.events?.length ?? 0) > 0 ? (
                <ul>
                  {selectedAnimation.events?.map((event, index) => (
                    <li
                      key={`${event.id}-${index}`}
                      className={
                        firedAnimationEvents.some((fired) => fired.id === event.id)
                          ? 'timeline-event-fired'
                          : undefined
                      }
                    >
                      {event.name} —{' '}
                      {frameNameById.get(event.frameId) ?? `参照切れ: ${event.frameId}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="editor-note">このアニメーションに保存イベントはありません。</p>
              )}
              {firedAnimationEvents.length > 0 && (
                <p className="timeline-event-status" role="status">
                  発火: {firedAnimationEvents.map((event) => event.name).join('、')}
                </p>
              )}
              <p className="editor-note">
                イベント名とpayloadは実行せず、表示開始時の通知データとして扱います。
              </p>
            </div>
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
