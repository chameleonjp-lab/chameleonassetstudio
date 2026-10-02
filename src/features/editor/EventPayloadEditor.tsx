import { useRef, useState } from 'react';
import type { AnimationEvent, AnimationEventChangeResult } from '../../core/model';

/** Draft JSON is UI-only. Only explicit Save/Remove invokes the existing History path. */
export function EventPayloadEditor({
  event,
  disabled,
  onApply,
}: {
  event: AnimationEvent;
  disabled: boolean;
  onApply: (text: string | null) => AnimationEventChangeResult;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  const close = () => {
    setOpen(false);
    setDraft('');
    setError(null);
  };
  const apply = (text: string | null) => {
    if (disabled || submitted.current) return;
    submitted.current = true;
    const result = onApply(text);
    if (!result.ok) {
      submitted.current = false;
      setError(result.reason);
      return;
    }
    close();
  };
  return (
    <div className="event-payload-editor">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={`イベント「${event.name}」の追加データを編集`}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          submitted.current = false;
          setDraft(event.payload === undefined ? '{}' : JSON.stringify(event.payload, null, 2));
          setOpen(true);
        }}
      >
        追加データ{event.payload === undefined ? '（なし）' : '（設定済み）'}
      </button>
      {open && (
        <div role="group" aria-label={`イベント「${event.name}」の追加データ編集`}>
          <p className="editor-note">
            ゲームへ渡す値をJSONで入力します。例: {`{"sound":"footstep","volume":0.8}`}
            。入れ子は使えません。文字列・数値・true/false・nullも使えます。16
            KiBまで。コードやURLは実行しません。秘密の値は入れないでください。
          </p>
          <textarea
            aria-label={`イベント「${event.name}」の追加データJSON`}
            rows={5}
            value={draft}
            disabled={disabled}
            spellCheck={false}
            onChange={(change) => {
              setDraft(change.target.value);
              setError(null);
            }}
            onKeyDown={(key) => {
              if (key.key === 'Escape') {
                key.stopPropagation();
                close();
              }
            }}
          />
          {error && <p role="alert">{error}</p>}
          <button type="button" disabled={disabled} onClick={() => apply(draft)}>
            追加データを保存
          </button>
          <button type="button" onClick={close}>
            追加データの編集を取消
          </button>
          {event.payload !== undefined && (
            <button type="button" disabled={disabled} onClick={() => apply(null)}>
              追加データを削除
            </button>
          )}
          <p className="editor-note">
            空欄は保存できません。nullは値として保存されます。「削除」で追加データなしに戻せます。変更は元に戻せます。
          </p>
        </div>
      )}
    </div>
  );
}
