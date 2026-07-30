import { useRef, useState } from 'react';
import {
  ANIMATION_NAME_SUGGESTIONS,
  addAnimation,
  addAnimationEvent,
  animationEventFrameCandidates,
  calculateAnimationDurationMs,
  captureFrame,
  duplicateFrame,
  moveFrameOrder,
  removeAnimation,
  removeAnimationEvent,
  removeFrame,
  renameFrame,
  updateAnimation,
  changeAnimationEventFrame,
  renameAnimationEvent,
  updateFrameDuration,
  type AnimationEvent,
  type Asset,
} from '../../core/model';
import { FrameAlignmentPanel, type FrameAlignmentDraft } from './FrameAlignmentPanel';
import { ONION_SKIN_NEXT_COLOR, ONION_SKIN_OPACITY, ONION_SKIN_PREVIOUS_COLOR } from './onionSkin';

interface TimelinePanelProps {
  asset: Asset;
  /** 再生中 or プレビュー選択中のフレーム id（ハイライト用）。 */
  playingFrameId: string | null;
  /** 再生中のAnimation内の一時的な出現index。保存・export・Historyへ入れない。 */
  playingOccurrenceIndex: number | null;
  /** 再生中の現在Frameで発火した、保存データ上の不活性なイベント。 */
  firedAnimationEvents: readonly AnimationEvent[];
  isPlaying: boolean;
  selectedAnimationId: string | null;
  onSelectAnimation: (id: string | null) => void;
  /** クリックでそのフレームをプレビューする。 */
  onSelectFrame: (frameId: string) => void;
  /** 選択中Animationの出現位置を、Frame IDと分けてプレビューする。 */
  onSelectOccurrence: (occurrenceIndex: number) => void;
  showPreviousOnionSkin: boolean;
  showNextOnionSkin: boolean;
  onShowPreviousOnionSkinChange: (show: boolean) => void;
  onShowNextOnionSkinChange: (show: boolean) => void;
  onPlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  /** 履歴に積む変更（ボタン操作）。 */
  onCommit: (label: string, next: Asset) => void;
  /** 数値・文字入力の途中変更（履歴はフォーカス確定側で積む）。 */
  onLiveChange: (next: Asset) => void;
  onBeginFieldEdit: () => void;
  onCommitFieldEdit: () => void;
  frameAlignmentDraft: FrameAlignmentDraft | null;
  frameAlignmentPreviewError: string | null;
  onStartFrameAlignment: (referenceFrameId: string, targetFrameId: string) => void;
  onFrameAlignmentDeltaInput: (axis: 'x' | 'y', value: string) => void;
  onNudgeFrameAlignment: (x: number, y: number) => void;
  onConfirmFrameAlignment: () => void;
  onCancelFrameAlignment: () => void;
}

function EventNameEditor({
  event,
  onCommit,
}: {
  event: AnimationEvent;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(event.name);
  const committed = useRef(false);
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    if (draft.trim() && draft !== event.name) onCommit(draft);
  };
  return (
    <input
      type="text"
      aria-label={`イベント「${event.name}」の名前`}
      value={draft}
      onFocus={() => {
        committed.current = false;
      }}
      onChange={(change) => setDraft(change.target.value)}
      onKeyDown={(key) => {
        if (key.key === 'Enter') {
          commit();
          key.currentTarget.blur();
        } else if (key.key === 'Escape') {
          committed.current = true;
          setDraft(event.name);
          key.currentTarget.blur();
        }
      }}
      onBlur={commit}
    />
  );
}

/** タイムラインパネル（Phase 9）。フレームの取り込みとアニメーションの再生を扱う。 */
export function TimelinePanel({
  asset,
  playingFrameId,
  playingOccurrenceIndex,
  firedAnimationEvents,
  isPlaying,
  selectedAnimationId,
  onSelectAnimation,
  onSelectFrame,
  onSelectOccurrence,
  showPreviousOnionSkin,
  showNextOnionSkin,
  onShowPreviousOnionSkinChange,
  onShowNextOnionSkinChange,
  onPlay,
  onStop,
  onRewind,
  onCommit,
  onLiveChange,
  onBeginFieldEdit,
  onCommitFieldEdit,
  frameAlignmentDraft,
  frameAlignmentPreviewError,
  onStartFrameAlignment,
  onFrameAlignmentDeltaInput,
  onNudgeFrameAlignment,
  onConfirmFrameAlignment,
  onCancelFrameAlignment,
}: TimelinePanelProps) {
  const [newAnimationName, setNewAnimationName] = useState('');
  const [newEventName, setNewEventName] = useState('');
  const [newEventFrameId, setNewEventFrameId] = useState('');
  const frames = asset.frames ?? [];
  const selectedAnimation =
    asset.animations.find((animation) => animation.id === selectedAnimationId) ?? null;
  const selectedAnimationDuration = selectedAnimation
    ? calculateAnimationDurationMs(selectedAnimation, frames)
    : null;
  const frameNameById = new Map(frames.map((frame) => [frame.id, frame.name]));
  const playbackOccurrence =
    selectedAnimation &&
    playingFrameId &&
    playingOccurrenceIndex !== null &&
    selectedAnimation.frameIds[playingOccurrenceIndex] === playingFrameId
      ? {
          position: playingOccurrenceIndex + 1,
          total: selectedAnimation.frameIds.length,
        }
      : null;
  const onionSkinOpacityPercent = Math.round(ONION_SKIN_OPACITY * 100);
  const eventFrameCandidates = selectedAnimation
    ? animationEventFrameCandidates(asset, selectedAnimation.id)
    : [];

  const commitEventChange = (label: string, result: ReturnType<typeof addAnimationEvent>) => {
    if (result.ok && result.changed) onCommit(label, result.asset);
  };

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
      {asset.animations.length > 0 && (
        <FrameAlignmentPanel
          asset={asset}
          animationId={selectedAnimationId}
          isPlaying={isPlaying}
          draft={frameAlignmentDraft}
          previewError={frameAlignmentPreviewError}
          onStart={onStartFrameAlignment}
          onDeltaInput={onFrameAlignmentDeltaInput}
          onNudge={onNudgeFrameAlignment}
          onConfirm={onConfirmFrameAlignment}
          onCancel={onCancelFrameAlignment}
        />
      )}
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
            <div className="timeline-occurrences">
              <strong>再生順の出現位置</strong>
              <ol className="timeline-occurrence-list" aria-label="アニメーションの再生順">
                {selectedAnimation.frameIds.map((frameId, occurrenceIndex) => {
                  const frameName = frameNameById.get(frameId) ?? `参照切れ: ${frameId}`;
                  const selected =
                    playingOccurrenceIndex === occurrenceIndex && playingFrameId === frameId;
                  return (
                    <li key={`${frameId}-${occurrenceIndex}`}>
                      <button
                        type="button"
                        aria-label={`出現 ${occurrenceIndex + 1}: ${frameName}`}
                        aria-pressed={selected}
                        disabled={isPlaying || !frameNameById.has(frameId)}
                        onClick={() => onSelectOccurrence(occurrenceIndex)}
                      >
                        {occurrenceIndex + 1}. {frameName}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <fieldset className="timeline-onion-skin" aria-label="前後のフレーム表示">
              <legend>前後のフレーム表示（オニオンスキン）</legend>
              <div className="timeline-onion-skin-controls">
                <label className="timeline-onion-skin-toggle">
                  <input
                    type="checkbox"
                    aria-label={`前のフレームを表示（赤・${onionSkinOpacityPercent}%）`}
                    checked={showPreviousOnionSkin}
                    disabled={isPlaying}
                    onChange={(event) => onShowPreviousOnionSkinChange(event.target.checked)}
                  />
                  <span
                    className="timeline-onion-skin-swatch"
                    style={{ backgroundColor: ONION_SKIN_PREVIOUS_COLOR }}
                    aria-hidden="true"
                  />
                  前（赤・{onionSkinOpacityPercent}%）
                </label>
                <label className="timeline-onion-skin-toggle">
                  <input
                    type="checkbox"
                    aria-label={`次のフレームを表示（青・${onionSkinOpacityPercent}%）`}
                    checked={showNextOnionSkin}
                    disabled={isPlaying}
                    onChange={(event) => onShowNextOnionSkinChange(event.target.checked)}
                  />
                  <span
                    className="timeline-onion-skin-swatch"
                    style={{ backgroundColor: ONION_SKIN_NEXT_COLOR }}
                    aria-hidden="true"
                  />
                  次（青・{onionSkinOpacityPercent}%）
                </label>
              </div>
              <p className="editor-note" aria-label="前後のフレーム表示状態">
                {isPlaying
                  ? '再生中は一時的に隠します。終了後に同じ切替状態へ戻ります。'
                  : playingOccurrenceIndex === null
                    ? '再生順の出現位置を選ぶと、前後のフレームを重ねて確認できます。'
                    : '前後表示は確認専用です。保存データには入りません。'}
              </p>
            </fieldset>

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
            {playbackOccurrence && (
              <p className="editor-note" role="status" aria-label="アニメーション再生位置">
                出現位置: {playbackOccurrence.position} / {playbackOccurrence.total}
              </p>
            )}
            <p className="editor-note" aria-label="アニメーション再生時間">
              再生時間:{' '}
              {selectedAnimationDuration === null
                ? '計算できません'
                : `${Math.round(selectedAnimationDuration * 100) / 100}ms`}
            </p>
            <div className="timeline-event-summary" aria-label="アニメーションイベント">
              <strong>イベント {selectedAnimation.events?.length ?? 0} 件</strong>
              <div className="timeline-event-create">
                <label className="editor-field">
                  新しいイベント名
                  <input
                    type="text"
                    value={newEventName}
                    onChange={(event) => setNewEventName(event.target.value)}
                  />
                </label>
                <label className="editor-field">
                  参照フレーム
                  <select
                    aria-label="新しいイベントの参照フレーム"
                    value={newEventFrameId}
                    onChange={(event) => setNewEventFrameId(event.target.value)}
                  >
                    <option value="">選択してください</option>
                    {eventFrameCandidates.map((frameId) => (
                      <option key={frameId} value={frameId}>
                        {frameNameById.get(frameId)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!newEventName.trim() || !newEventFrameId}
                  onClick={() => {
                    const result = addAnimationEvent(
                      asset,
                      selectedAnimation.id,
                      newEventName,
                      newEventFrameId,
                    );
                    commitEventChange('イベント追加', result);
                    if (result.ok && result.changed) {
                      setNewEventName('');
                      setNewEventFrameId('');
                    }
                  }}
                >
                  イベント追加
                </button>
              </div>
              {(selectedAnimation.events?.length ?? 0) > 0 ? (
                <ul className="timeline-event-list">
                  {selectedAnimation.events?.map((event, index) => (
                    <li
                      key={`${event.id}-${index}`}
                      className={
                        firedAnimationEvents.some((fired) => fired.id === event.id)
                          ? 'timeline-event-fired'
                          : undefined
                      }
                    >
                      <EventNameEditor
                        key={`${event.id}-${event.name}`}
                        event={event}
                        onCommit={(name) =>
                          commitEventChange(
                            'イベント名変更',
                            renameAnimationEvent(asset, selectedAnimation.id, event.id, name),
                          )
                        }
                      />
                      <select
                        aria-label={`イベント「${event.name}」の参照フレーム`}
                        className={
                          !eventFrameCandidates.includes(event.frameId) ? 'is-invalid' : ''
                        }
                        value={event.frameId}
                        onChange={(change) =>
                          commitEventChange(
                            'イベント参照変更',
                            changeAnimationEventFrame(
                              asset,
                              selectedAnimation.id,
                              event.id,
                              change.target.value,
                            ),
                          )
                        }
                      >
                        {!eventFrameCandidates.includes(event.frameId) && (
                          <option value={event.frameId}>参照無効: {event.frameId}</option>
                        )}
                        {eventFrameCandidates.map((frameId) => (
                          <option key={frameId} value={frameId}>
                            {frameNameById.get(frameId)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label={`イベント「${event.name}」を削除`}
                        onClick={() => {
                          if (!window.confirm(`イベント「${event.name}」を削除しますか？`)) return;
                          commitEventChange(
                            'イベント削除',
                            removeAnimationEvent(asset, selectedAnimation.id, event.id),
                          );
                        }}
                      >
                        削除
                      </button>
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
        <button
          type="button"
          disabled={!canPlay || isPlaying || !!frameAlignmentDraft}
          onClick={onPlay}
        >
          再生
        </button>
        <button type="button" disabled={!isPlaying && !playingFrameId} onClick={onStop}>
          停止
        </button>
        <button type="button" onClick={onRewind}>
          先頭へ
        </button>
      </div>
    </div>
  );
}
