import { useEffect, useMemo, useRef, useState } from 'react';
import type { Vec3 } from '../../core3d/model/project';
import type {
  NativeEditBinding,
  NativeEditOptions,
  NativeEditToken,
} from '../../core3d/ports/editPort';
import { useNativeEditState } from './useNativeEditState';
import './nativeTransformControls.css';

type NumberDraft = [string, string, string];
const neutral = (mode: NativeEditOptions['mode']): NumberDraft =>
  mode === 'scale' ? ['1', '1', '1'] : ['0', '0', '0'];
function describeError(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause);
  if (/shear/i.test(text))
    return 'この変形にはせん断が必要です。向きや倍率、world/localの設定を見直してください。';
  if (/singular|non-finite|finite three/i.test(text))
    return '有限の数値を入力してください。倍率0や極端に小さい値は適用できません。';
  if (/parent and descendant/i.test(text))
    return '親とその子孫を同時に変形できません。選択を見直してください。';
  if (/unique selection|missing selected/i.test(text))
    return '変形する部品とアクティブな部品を選択してください。';
  return text;
}

/** Numeric gestures use exactly the same delta evaluator and token authority as the viewport. */
export function NativeTransformControls({
  edit,
  disabled,
}: {
  edit: NativeEditBinding;
  disabled: boolean;
}) {
  const state = useNativeEditState(edit)!;
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<NumberDraft>(() => neutral(state.context.options.mode));
  const [snapDraft, setSnapDraft] = useState('0');
  const [owner, setOwner] = useState<NativeEditToken | null>(null);
  const owned = useRef<NativeEditToken | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const composing = useRef(false);
  const { mode, space, snap } = state.context.options;
  const activeName = useMemo(() => {
    const project = edit.getProject();
    if (project.id !== state.projectId || project.revision !== state.revision) return '更新中';
    return project.nodes.find((node) => node.id === state.context.activeId)?.name ?? 'なし';
  }, [edit, state.projectId, state.revision, state.context.activeId]);
  const numericActive = owner !== null && owner === state.token && state.active;
  const unavailable = disabled || state.context.readOnly || state.blocked.length > 0;
  const unit = mode === 'translate' ? 'm' : mode === 'rotate' ? '度' : '倍';
  const label = mode === 'translate' ? '移動量' : mode === 'rotate' ? '回転量' : '拡縮率';

  useEffect(() => {
    if (!opened || state.evaluatorReady) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    void import('../../adapters3d/three/transformMath')
      .then(({ nativeTransformEvaluator }) => {
        if (current) {
          edit.setEvaluator(nativeTransformEvaluator);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setLoading(false);
          setError(`変形の準備ができませんでした。${describeError(cause)}`);
        }
      });
    return () => {
      current = false;
    };
  }, [edit, opened, state.evaluatorReady]);

  useEffect(() => {
    setSnapDraft(String(snap === null ? 0 : mode === 'rotate' ? (snap * 180) / Math.PI : snap));
  }, [mode, snap]);

  useEffect(() => {
    if (owner && owner !== state.token) {
      owned.current = null;
      setOwner(null);
      setDraft(neutral(mode));
      setDirty(false);
      setNotice(
        '選択・設定・作品の変更により数値変形を終了しました。現在の対象を確認して開始してください。',
      );
    }
  }, [owner, state.token, mode]);

  useEffect(
    () => () => {
      if (owned.current) edit.cancel('numeric controls closed', owned.current);
    },
    [edit],
  );

  function start() {
    if (unavailable || composing.current || edit.state.active) return;
    const result = edit.begin();
    if (!result.ok) {
      setError(describeError(result.reason));
      return;
    }
    owned.current = result.token;
    setOwner(result.token);
    setDraft(neutral(edit.state.context.options.mode));
    setDirty(false);
    setError('');
    setNotice('数値変形を開始しました。開始時からの差分を入力してください。');
  }

  function currentToken() {
    if (!owner || owner !== edit.state.token || !edit.state.active)
      throw new Error('数値変形の対象が変わりました。現在の対象を確認して開始し直してください。');
    return owner;
  }

  function preview(commit = false) {
    if (unavailable || composing.current) return;
    try {
      const token = currentToken();
      if (draft.some((value) => value.trim() === '' || !Number.isFinite(Number(value)))) {
        edit.preview(token, [NaN, NaN, NaN]);
        throw new Error('空欄を残さず、各軸に有限の数値を入力してください。');
      }
      // Rotation is entered in degrees and converted once at the edit-port boundary.
      const delta = draft.map(
        (value) => Number(value) * (mode === 'rotate' ? Math.PI / 180 : 1),
      ) as Vec3;
      const result = edit.preview(token, delta);
      if (!result.ok) throw new Error(result.reason);
      setDirty(false);
      setError('');
      if (commit) {
        const applied = edit.commit(token);
        if (!applied.ok) throw new Error(applied.reason);
        owned.current = null;
        setOwner(null);
        setNotice(
          applied.changed
            ? '変形を確定しました。元に戻す操作で取り消せます。'
            : '変形量はありません。確定済みの値を保ちました。',
        );
      } else setNotice('プレビュー中です。作品への確定は「数値変形を適用」で行います。');
    } catch (cause) {
      setError(describeError(cause));
      setNotice('確定済みの作品は変更していません。入力値を確認してください。');
    }
  }

  function cancel(closing = false) {
    if ((!closing && composing.current) || !owner) return;
    edit.cancel('numeric cancelled', owner);
    owned.current = null;
    setOwner(null);
    setDraft(neutral(mode));
    setDirty(false);
    setError('');
    setNotice('数値変形を取り消しました。確定済みの値に戻りました。');
  }

  function changeOptions(patch: Partial<NativeEditOptions>) {
    if (unavailable || composing.current) return;
    const result = edit.setOptions({ ...edit.state.context.options, ...patch });
    if (!result.ok) setError(describeError(result.reason));
    else setError('');
  }

  function applySnap() {
    if (unavailable || composing.current) return;
    if (!snapDraft.trim() || !Number.isFinite(Number(snapDraft)) || Number(snapDraft) < 0) {
      setError('スナップ間隔は0以上の有限の数値を入力してください。0で無効になります。');
      return;
    }
    const interval = Number(snapDraft);
    changeOptions({
      snap: interval === 0 ? null : interval * (mode === 'rotate' ? Math.PI / 180 : 1),
    });
  }

  return (
    <section
      className="native-transform"
      aria-label="選択部品の差分変形"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter') event.stopPropagation();
        if (
          event.key === 'Escape' &&
          !composing.current &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229 &&
          numericActive
        ) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <h3>選択部品を変形</h3>
      <p role="status" aria-live="polite">
        選択中 {state.context.selection.length} 個。アクティブ: {activeName}。
        {state.active
          ? numericActive
            ? dirty
              ? '数値を入力中（未プレビュー）'
              : state.hasPreview
                ? '数値変形をプレビュー中（未確定）'
                : '数値変形を開始済み（未確定）'
            : '画面で変形中（未確定）'
          : '確定済みの状態'}
      </p>
      <details
        onToggle={(event) => {
          setOpened(event.currentTarget.open);
          if (!event.currentTarget.open && owner) cancel(true);
        }}
      >
        <summary>数値で差分変形</summary>
        <p>
          選択した全ての部品に、開始時からの移動・回転・拡縮を適用します。回転・拡縮の原点はアクティブな部品です。プレビューは保存されません。
        </p>
        <fieldset disabled={unavailable}>
          <legend>変形の設定</legend>
          <label>
            変形の種類
            <select
              value={mode}
              onChange={(event) =>
                changeOptions({ mode: event.target.value as NativeEditOptions['mode'], snap: null })
              }
            >
              <option value="translate">移動</option>
              <option value="rotate">回転</option>
              <option value="scale">拡縮</option>
            </select>
          </label>
          <label>
            変形の座標
            <select
              value={space}
              onChange={(event) =>
                changeOptions({ space: event.target.value as NativeEditOptions['space'] })
              }
            >
              <option value="world">world（作品の軸）</option>
              <option value="local">local（アクティブな部品の軸）</option>
            </select>
          </label>
          <label>
            スナップ間隔（{unit}）
            <input
              inputMode="decimal"
              value={snapDraft}
              onChange={(event) => setSnapDraft(event.target.value)}
            />
          </label>
          <button type="button" onClick={applySnap}>
            スナップ設定を適用
          </button>
          <p>
            0で無効。移動・回転は0、拡縮は1を基準に、開始時からの差分を指定間隔へ丸めます。設定を変更すると進行中の変形は取り消されます。
          </p>
          <p>
            適用中のスナップ:{' '}
            {snap === null
              ? '無効'
              : `${Number((mode === 'rotate' ? (snap * 180) / Math.PI : snap).toPrecision(8))} ${unit}`}
          </p>
          <button
            type="button"
            disabled={
              loading || !state.evaluatorReady || state.active || !state.context.selection.length
            }
            onClick={start}
          >
            数値変形を開始
          </button>
        </fieldset>
        {loading && <p role="status">数値変形を準備中です。</p>}
        <fieldset disabled={unavailable || !numericActive}>
          <legend>開始時からの差分</legend>
          <p>
            {mode === 'scale'
              ? '倍率は1で変化なし、2で2倍です。0は指定できません。'
              : mode === 'rotate'
                ? '回転量は度で入力します。0で変化なしです。'
                : '移動量はメートルで入力します。0で変化なしです。'}
          </p>
          <div className="native-transform-fields">
            {(['X', 'Y', 'Z'] as const).map((axis, index) => (
              <label key={axis}>
                {label} {axis}（{unit}）
                <input
                  inputMode="decimal"
                  value={draft[index]}
                  onChange={(event) => {
                    // The old preview no longer represents this draft. Keep the gesture, but
                    // invalidate its candidate so a later Apply cannot use the last good value.
                    if (owner && owner === edit.state.token) edit.preview(owner, [NaN, NaN, NaN]);
                    const next: NumberDraft = [...draft];
                    next[index] = event.target.value;
                    setDraft(next);
                    setDirty(true);
                  }}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => preview()}>
            数値変形をプレビュー
          </button>
          <button type="button" onClick={() => preview(true)}>
            数値変形を適用
          </button>
        </fieldset>
        <button type="button" disabled={!numericActive} onClick={() => cancel()}>
          数値変形を取り消す
        </button>
        <p>
          Escキーでも取り消せます。日本語変換中は適用しません。選択・作品・保存や表示状態が変わったときは、開始し直してください。
        </p>
        {unavailable && <p>現在は変形できません。読み取り専用または別の処理中です。</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </details>
    </section>
  );
}
