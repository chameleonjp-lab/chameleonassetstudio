import { formatNativeEditingFailure, formatNativeMotionStatusReason } from './editingFailure';
import { guardNativeCompositionKey } from './keyboardSafety';
import { useEffect, useRef, useState } from 'react';
import type { Project3D } from '../../core3d/model/project';
import {
  createClip,
  duplicateClip,
  updateClip,
  deleteClip,
  addKey,
  editKey,
  duplicateKey,
  deleteKey,
  setTrackInterpolation,
  type AnimationProperty,
  type AnimationInterpolation,
} from '../../core3d/animation/authoring';
import type { ProjectSession } from './projectSession';
import './nativeAnimationPanel.css';
import { watchNativeMotionPreference, type NativeMotionPreference } from './motionPreference';

function number(value: string) {
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error('有限の数値を入力してください。');
  return Number(value);
}
export function NativeAnimationPanel({
  project,
  session,
  disabled,
  onChange,
}: {
  project: Project3D;
  session: ProjectSession;
  disabled: boolean;
  onChange(): void;
}) {
  const [, redraw] = useState(0);
  useEffect(() => session.animation.subscribe(() => redraw((value) => value + 1)), [session]);
  const [motionPreference, setMotionPreference] = useState<NativeMotionPreference>('unavailable');
  useEffect(
    () =>
      watchNativeMotionPreference(
        typeof window === 'undefined' ? undefined : window,
        (preference) => {
          setMotionPreference(preference);
          if (preference === 'reduce') session.animation.pause();
        },
      ),
    [session],
  );
  const state = session.animation.state;
  const [clipId, setClipId] = useState('');
  const clip = project.clips.find((value) => value.id === clipId);
  const [title, setTitle] = useState('Clip');
  const [duration, setDuration] = useState('1');
  const [loop, setLoop] = useState(false);
  const [nodeId, setNodeId] = useState('');
  const node = project.nodes.find((value) => value.id === nodeId);
  const [property, setProperty] = useState<AnimationProperty>('translation');
  const [interpolation, setInterpolation] = useState<AnimationInterpolation>('LINEAR');
  const [keyTime, setKeyTime] = useState('0');
  const [values, setValues] = useState(['0', '0', '0', '1']);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [loaded, setLoaded] = useState('');
  const [jump, setJump] = useState('0');
  const [zoom, setZoom] = useState(1);
  const [start, setStart] = useState(0);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const composing = useRef(false);
  const track = clip?.tracks.find(
    (value) => value.nodeId === nodeId && value.property === property,
  );
  const identity = JSON.stringify([project.id, project.revision, clipId, nodeId, property]);
  const span = (clip?.duration ?? 0) / zoom;
  const windowStart = Math.max(0, Math.min(start, Math.max(0, (clip?.duration ?? 0) - span)));
  const keys = track?.keys ?? [];
  const pageCount = Math.max(1, Math.ceil(keys.length / 50));
  const pageIndex = Math.min(page, pageCount - 1);
  function act(operation: () => void) {
    if (composing.current) return;
    try {
      const current = session.project;
      if (current.id !== project.id || current.revision !== project.revision)
        throw new Error('作品が変わりました。現在値を確認してください。');
      operation();
      setError('');
    } catch (cause) {
      setError(formatNativeEditingFailure(cause, 'animation'));
    } finally {
      onChange();
    }
  }
  function execute(operation: (candidate: Project3D) => void) {
    if (disabled) throw new Error('編集できません。');
    session.executeAuthoring(operation, { id: project.id, revision: project.revision });
  }
  function preview(operation: () => { ok: boolean; reason?: string }) {
    const result = operation();
    if (!result.ok) throw new Error(result.reason);
  }
  function select(id: string) {
    setClipId(id);
    setSelectedTime(null);
    setLoaded('');
    setStart(0);
    setZoom(1);
    setPage(0);
    const value = session.project.clips.find((item) => item.id === id);
    if (value) {
      setTitle(value.name);
      setDuration(String(value.duration));
      setLoop(value.loop);
    }
    session.animation.cancel('clipの編集対象を切り替えました。');
    const result = session.animation.select(id || null);
    if (!result.ok) {
      session.animation.cancel('このclipは再生できません。キーを修正するかバックアップできます。');
      throw new Error(result.reason);
    }
  }
  function readKey(time: number) {
    const key = track?.keys.find((value) => value.time === time);
    if (!key) return;
    setSelectedTime(time);
    setKeyTime(String(time));
    setValues(Array.from({ length: 4 }, (_, i) => String(key.value[i] ?? (i === 3 ? 1 : 0))));
    setInterpolation(track!.interpolation);
    setLoaded(identity);
  }
  const draftValues = () => values.slice(0, property === 'rotation' ? 4 : 3).map(number);
  const selected =
    selectedTime !== null &&
    loaded === identity &&
    !!track?.keys.some((key) => key.time === selectedTime);
  return (
    <section
      className="native-animation"
      aria-label="3Dアニメーション"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        guardNativeCompositionKey(event, composing.current);
      }}
    >
      <h3>キーとclipを作る</h3>
      <p>
        時刻は秒です。自動キー:
        オフ。キーは明示操作だけで保存します。回転値は単位quaternion（X/Y/Z/W）です。
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {state.playing
          ? 'アニメーション再生中'
          : state.active
            ? 'アニメーション停止pose'
            : 'アニメーションrest表示'}{' '}
        · {state.time.toFixed(3)}秒。{formatNativeMotionStatusReason(state.reason, 'animation')}
      </p>
      <label>
        clipを選択
        <select value={clip?.id ?? ''} onChange={(event) => act(() => select(event.target.value))}>
          <option value="">選択してください</option>
          {project.clips.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={disabled}>
        <legend>clipの編集</legend>
        <label>
          clip名
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          clipの長さ（秒）
          <input
            inputMode="decimal"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
          />
          clipをloop再生する
        </label>
        <button
          type="button"
          onClick={() =>
            act(() => {
              const id = crypto.randomUUID();
              execute((p) => createClip(p, id, title, number(duration), loop));
              select(id);
            })
          }
        >
          新しいclipを作成
        </button>
        <button
          type="button"
          disabled={!clip}
          onClick={() =>
            act(() => {
              execute((p) =>
                updateClip(p, clipId, { name: title, duration: number(duration), loop }),
              );
            })
          }
        >
          clip設定を適用
        </button>
        <button
          type="button"
          disabled={!clip}
          onClick={() =>
            act(() => {
              const id = crypto.randomUUID();
              execute((p) => duplicateClip(p, clipId, id, title));
              select(id);
            })
          }
        >
          clipを複製
        </button>
        <button
          type="button"
          disabled={!clip}
          onClick={() =>
            act(() => {
              execute((p) => deleteClip(p, clipId));
              setClipId('');
              setSelectedTime(null);
            })
          }
        >
          clipを削除
        </button>
      </fieldset>
      <fieldset disabled={!clip}>
        <legend>再生確認（保存しない）</legend>
        <p>読むだけの作品も再生できます。背景化・GPU休止後の再開は明示操作です。</p>
        <p data-testid="native-motion-preference">
          {motionPreference === 'reduce'
            ? 'OSの「動きを減らす」設定を検出しました。設定を有効にした時点で再生を停止します。確認のための再生は下のボタンで明示的に開始でき、いつでも停止できます。'
            : motionPreference === 'no-preference'
              ? 'OSの動き低減指定はありません。自動再生はせず、下のボタンで開始・停止します。'
              : 'OSの動き低減設定を読み取れません。自動再生はせず、下のボタンで開始・停止します。'}
        </p>
        <button
          type="button"
          onClick={() =>
            act(() => {
              if (state.clipId !== clipId) preview(() => session.animation.select(clipId));
              preview(() => session.animation.play());
            })
          }
        >
          clipを再生
        </button>
        <button type="button" onClick={() => session.animation.pause()}>
          clipを停止
        </button>
        <button type="button" onClick={() => session.animation.cancel('restへ戻しました。')}>
          アニメーションを解除してrestへ戻す
        </button>
        <button
          type="button"
          onClick={() =>
            act(() => {
              if (state.clipId !== clipId) preview(() => session.animation.select(clipId));
              preview(() => session.animation.seek(0));
            })
          }
        >
          clipの先頭へ
        </button>
        <button
          type="button"
          onClick={() =>
            act(() => {
              if (state.clipId !== clipId) preview(() => session.animation.select(clipId));
              preview(() => session.animation.seek(clip!.duration));
            })
          }
        >
          clipの末尾へ
        </button>
        <label>
          指定時刻（秒）
          <input
            inputMode="decimal"
            value={jump}
            onChange={(event) => setJump(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() =>
            act(() => {
              if (state.clipId !== clipId) preview(() => session.animation.select(clipId));
              preview(() => session.animation.seek(number(jump)));
            })
          }
        >
          指定時刻を表示
        </button>
        <label>
          タイムライン拡大
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {[1, 2, 4, 8, 16, 32, 64].map((value) => (
              <option key={value} value={value}>
                {value}倍
              </option>
            ))}
          </select>
        </label>
        <label>
          タイムライン開始（秒）
          <input
            type="range"
            min="0"
            max={Math.max(0, (clip?.duration ?? 0) - span)}
            step="any"
            value={windowStart}
            onChange={(event) => setStart(Number(event.target.value))}
          />
        </label>
        <p>
          表示範囲: {windowStart.toFixed(3)}〜{(windowStart + span).toFixed(3)}
          秒。対象trackのキーを下の一覧で選択できます。
        </p>
        <label>
          タイムライン時刻（秒）
          <input
            type="range"
            min={windowStart}
            max={windowStart + span}
            step="any"
            value={Math.max(windowStart, Math.min(windowStart + span, state.time))}
            onChange={(event) =>
              act(() => {
                if (state.clipId !== clipId) preview(() => session.animation.select(clipId));
                preview(() => session.animation.seek(Number(event.target.value)));
              })
            }
          />
        </label>
        <div className="native-animation-timeline" aria-label="表示範囲のキーマーカー">
          {keys
            .filter((key) => key.time >= windowStart && key.time <= windowStart + span)
            .slice(0, 200)
            .map((key) => (
              <button
                type="button"
                key={key.time}
                style={{ left: `${span ? ((key.time - windowStart) / span) * 100 : 0}%` }}
                aria-label={`タイムラインのキー ${key.time}秒`}
                onClick={() => act(() => readKey(key.time))}
              >
                ◆
              </button>
            ))}
        </div>
        <p>マーカーは表示範囲の先頭200件まで。全キーは下のページ付き一覧から選択できます。</p>
      </fieldset>
      <fieldset disabled={disabled || !clip}>
        <legend>object / bone のキー</legend>
        <label>
          キー対象
          <select
            value={node?.id ?? ''}
            onChange={(event) => {
              setNodeId(event.target.value);
              setSelectedTime(null);
              setLoaded('');
              setPage(0);
            }}
          >
            <option value="">選択してください</option>
            {project.nodes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} / {item.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          キー属性
          <select
            value={property}
            onChange={(event) => {
              setProperty(event.target.value as AnimationProperty);
              setSelectedTime(null);
              setLoaded('');
              setPage(0);
            }}
          >
            <option value="translation">移動</option>
            <option value="rotation">回転（quaternion）</option>
            <option value="scale">倍率</option>
          </select>
        </label>
        <label>
          キー補間
          <select
            value={interpolation}
            onChange={(event) => setInterpolation(event.target.value as AnimationInterpolation)}
          >
            <option value="LINEAR">LINEAR</option>
            <option value="STEP">STEP</option>
          </select>
        </label>
        <button
          type="button"
          disabled={!track}
          onClick={() =>
            act(() =>
              execute((p) => setTrackInterpolation(p, clipId, nodeId, property, interpolation)),
            )
          }
        >
          trackの補間を適用
        </button>
        <button
          type="button"
          disabled={!node}
          onClick={() =>
            act(() => {
              const transform =
                state.updates.find((item) => item.nodeId === nodeId)?.transform ?? node!.transform;
              setValues(
                Array.from({ length: 4 }, (_, i) =>
                  String(transform[property][i] ?? (i === 3 ? 1 : 0)),
                ),
              );
              setKeyTime(String(state.time));
              setLoaded(identity);
            })
          }
        >
          表示中のTRSを読む
        </button>
        <label>
          キー時刻（秒）
          <input
            inputMode="decimal"
            value={keyTime}
            onChange={(event) => setKeyTime(event.target.value)}
          />
        </label>
        <div className="native-animation-values">
          {['X', 'Y', 'Z', 'W'].slice(0, property === 'rotation' ? 4 : 3).map((axis, i) => (
            <label key={axis}>
              キー値 {axis}
              <input
                inputMode="decimal"
                value={values[i]}
                onChange={(event) =>
                  setValues((current) =>
                    current.map((value, index) => (index === i ? event.target.value : value)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!node}
          onClick={() =>
            act(() => {
              const value = draftValues();
              const time = number(keyTime);
              execute((p) => addKey(p, clipId, nodeId, property, interpolation, time, value));
              setSelectedTime(null);
              setLoaded('');
            })
          }
        >
          キーを追加
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            act(() => {
              const value = draftValues(),
                time = number(keyTime);
              execute((p) => editKey(p, clipId, nodeId, property, selectedTime!, time, value));
              setSelectedTime(null);
              setLoaded('');
            })
          }
        >
          選択キーの時刻と値を適用
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            act(() => {
              const time = number(keyTime);
              execute((p) => duplicateKey(p, clipId, nodeId, property, selectedTime!, time));
              setSelectedTime(null);
              setLoaded('');
            })
          }
        >
          選択キーを指定時刻へ複製
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() =>
            act(() => {
              execute((p) => deleteKey(p, clipId, nodeId, property, selectedTime!));
              setSelectedTime(null);
              setLoaded('');
            })
          }
        >
          選択キーを削除
        </button>
        <p>
          重複時刻と範囲外のキーは拒否します。キーを失う長さ短縮も拒否します。選択した値は編集revisionが変わったら読み直してください。
        </p>
      </fieldset>
      <div role="group" aria-label="キー一覧">
        <p>
          {keys.length}キー · {pageIndex + 1}/{pageCount}ページ
        </p>
        <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>
          前のキー一覧
        </button>
        <button
          type="button"
          disabled={pageIndex + 1 >= pageCount}
          onClick={() => setPage(pageIndex + 1)}
        >
          次のキー一覧
        </button>
        {keys.slice(pageIndex * 50, pageIndex * 50 + 50).map((key) => (
          <button
            type="button"
            key={key.time}
            aria-pressed={selectedTime === key.time && loaded === identity}
            onClick={() => act(() => readKey(key.time))}
          >
            キー {key.time}秒: {key.value.join(', ')}
          </button>
        ))}
      </div>
    </section>
  );
}
