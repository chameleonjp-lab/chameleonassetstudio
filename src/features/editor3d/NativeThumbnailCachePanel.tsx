import { formatNativeEditingFailure } from './editingFailure';
import { useEffect, useRef, useState } from 'react';
import type {
  ThumbnailCache,
  ThumbnailMetadata,
  ThumbnailSummary,
} from '../../core3d/storage/thumbnailCache';
import { createThumbnailPreviewOwner, type ThumbnailPreview } from './thumbnailPreview';
import { isNativeCompositionKey } from './keyboardSafety';
import './nativeThumbnailCache.css';

function Thumbnail({
  entry,
  cache,
  name,
}: {
  entry: ThumbnailMetadata;
  cache: ThumbnailCache;
  name: string;
}) {
  const [preview, setPreview] = useState<ThumbnailPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const active = useRef<ReturnType<typeof createThumbnailPreviewOwner> | null>(null);
  useEffect(() => {
    let current = true;
    setPreview(null);
    setFailed(false);
    const owner = createThumbnailPreviewOwner(entry, (id) => cache.read(id));
    active.current = owner;
    void owner.settled
      .then((result) => {
        if (current) {
          setPreview(result);
          if (!result) setFailed(true);
        }
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
      active.current = null;
      owner.dispose();
    };
  }, [cache, entry]);
  if (failed) return <p>画像を表示できません。元の作品は変更していません。</p>;
  if (!preview) return <p>画像を準備中です。</p>;
  return (
    <img
      src={preview.url}
      width={preview.width}
      height={preview.height}
      alt={`${name}の保存済みrest表示、revision ${preview.revision}`}
      onLoad={(event) => {
        if (
          event.currentTarget.naturalWidth !== preview.width ||
          event.currentTarget.naturalHeight !== preview.height
        ) {
          event.currentTarget.removeAttribute('src');
          active.current?.dispose();
          setPreview(null);
          setFailed(true);
        }
      }}
      onError={(event) => {
        event.currentTarget.removeAttribute('src');
        active.current?.dispose();
        setPreview(null);
        setFailed(true);
      }}
    />
  );
}
interface CacheView {
  summary: ThumbnailSummary;
  entries: ThumbnailMetadata[];
}
export function NativeThumbnailCachePanel({
  projects,
  refreshGeneration,
}: {
  projects: readonly { id: string; name: string; revision: number }[];
  refreshGeneration: number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CacheView | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const summaryElement = useRef<HTMLElement>(null);
  const cache = useRef<ThumbnailCache | null>(null);
  const epoch = useRef(0);
  const running = useRef(false);
  const acknowledged = useRef<number | null>(null);
  const opened = useRef(false);
  const observedGeneration = useRef(refreshGeneration);
  function close() {
    opened.current = false;
    epoch.current++;
    running.current = false;
    acknowledged.current = null;
    cache.current?.close();
    cache.current = null;
    setOpen(false);
    setView(null);
    setPage(0);
    setBusy(false);
    setConfirmed(false);
  }
  useEffect(
    () => () => {
      epoch.current++;
      opened.current = false;
      cache.current?.close();
      cache.current = null;
    },
    [],
  );
  useEffect(() => {
    if (observedGeneration.current === refreshGeneration) return;
    observedGeneration.current = refreshGeneration;
    acknowledged.current = null;
    setConfirmed(false);
    if (opened.current) setMessage('サムネイルが更新されました。一覧を読み直してください。');
  }, [refreshGeneration]);
  async function load() {
    if (running.current || !opened.current) return;
    const token = ++epoch.current;
    running.current = true;
    acknowledged.current = null;
    setBusy(true);
    setConfirmed(false);
    setError('');
    setMessage('派生サムネイルの一覧を読んでいます。');
    setView(null);
    setPage(0);
    cache.current?.close();
    cache.current = null;
    let connection: ThumbnailCache | undefined;
    try {
      const { openThumbnailCache } = await import('../../core3d/storage/thumbnailCache');
      if (token !== epoch.current || !opened.current) return;
      connection = await openThumbnailCache();
      const before = await connection.summary();
      const entries = await connection.listMetadata();
      const after = await connection.summary();
      if (before.generation !== after.generation)
        throw new Error('別の操作でcacheが更新されました。もう一度読み直してください。');
      if (token !== epoch.current || !opened.current) return;
      cache.current = connection;
      connection = undefined;
      setView({ summary: after, entries });
      setMessage('派生cacheだけを読みました。元の作品・素材・保持版は変更していません。');
    } catch (cause) {
      if (token === epoch.current) {
        setError(formatNativeEditingFailure(cause, 'thumbnail'));
        setMessage('元の作品を保持したまま再試行できます。');
      }
    } finally {
      connection?.close();
      if (token === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  async function clear() {
    const expected = view?.summary.generation,
      connection = cache.current;
    if (
      running.current ||
      expected === undefined ||
      !connection ||
      acknowledged.current !== expected ||
      !opened.current
    )
      return;
    const token = epoch.current;
    const canCommit = () =>
      token === epoch.current &&
      opened.current &&
      acknowledged.current === expected &&
      cache.current === connection;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await connection.clearDerived(expected, canCommit);
      if (token !== epoch.current) return;
      acknowledged.current = null;
      setConfirmed(false);
      setView(null);
      setMessage('確認した派生サムネイルだけを整理しました。元の作品を開いて再作成できます。');
    } catch (cause) {
      if (token === epoch.current) {
        setError(formatNativeEditingFailure(cause, 'thumbnail'));
        acknowledged.current = null;
        setConfirmed(false);
      }
    } finally {
      if (token === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  const pages = Math.max(1, Math.ceil((view?.entries.length ?? 0) / 10));
  const index = Math.min(page, pages - 1);
  return (
    <details
      className="native-thumbnail-cache editor3d-card"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          opened.current = true;
          setOpen(true);
        } else close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isNativeCompositionKey(event.nativeEvent, false)) {
          event.preventDefault();
          event.stopPropagation();
          close();
          summaryElement.current?.focus();
        }
      }}
    >
      <summary ref={summaryElement}>サムネイルと派生cache</summary>
      <p>
        保存済みの作品から作る縮小画像です。原本・編集用バックアップ・保持版とは別です。画像は一度に10件まで表示します。
      </p>
      <button type="button" disabled={busy} onClick={() => void load()}>
        派生サムネイルの一覧を読む
      </button>
      {busy && (
        <button
          type="button"
          onClick={() => {
            close();
            summaryElement.current?.focus();
          }}
        >
          cache操作を閉じる
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error} 元の作品の保存領域は整理しません。</p>}
      {open && view && (
        <>
          <p>
            {view.summary.count}件 · {view.summary.byteTotal} bytes · cache generation{' '}
            {view.summary.generation}
          </p>
          <ul className="native-thumbnail-cache-grid">
            {view.entries.slice(index * 10, index * 10 + 10).map((entry) => {
              const project = projects.find((value) => value.id === entry.projectId);
              const name = project?.name || '保存一覧外の作品';
              return (
                <li key={`${entry.projectId}:${entry.token}`}>
                  <p>
                    {name} · revision {entry.revision}
                  </p>
                  <p>
                    {!project
                      ? '保存一覧に元作品がありません。サムネイルから編集データを復元することはできません。'
                      : project.revision !== entry.revision
                        ? `一覧の保存版はrevision ${project.revision}です。この画像は別の保存版です。`
                        : '一覧の保存版と同じrevisionのrest画像です。'}
                  </p>
                  {cache.current && <Thumbnail entry={entry} cache={cache.current} name={name} />}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div>
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => setPage(index - 1)}
              >
                前のサムネイル
              </button>
              <span>
                {index + 1} / {pages}
              </span>
              <button
                type="button"
                disabled={busy || index + 1 >= pages}
                onClick={() => setPage(index + 1)}
              >
                次のサムネイル
              </button>
            </div>
          )}
          {view.summary.count > 0 && (
            <section aria-label="派生cache整理の確認">
              <h3>派生サムネイルだけを整理</h3>
              <p>
                上のcache全{view.summary.count}件（{view.summary.byteTotal}{' '}
                bytes）を削除します。表示中の10件だけではありません。元作品、原本素材、Undo履歴、保持版、2D作品は削除しません。元作品を開いて「保存してサムネイルを作成」で作り直せます。元作品が失われている場合は作り直せません。
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => {
                    acknowledged.current = event.target.checked ? view.summary.generation : null;
                    setConfirmed(event.target.checked);
                  }}
                />
                件数と再作成方法を確認し、派生cacheだけを整理する
              </label>
              <button type="button" disabled={busy || !confirmed} onClick={() => void clear()}>
                確認した派生cacheを整理
              </button>
            </section>
          )}
        </>
      )}
    </details>
  );
}
