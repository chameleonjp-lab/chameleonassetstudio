import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { openProjectRepository, type ProjectRepository } from '../../core3d/storage/repository';
import { BACKUP_LIMITS, ProjectSession, UnsavedProjectError } from './projectSession';
import './editor3d.css';
import type { NativeViewportFactory } from './NativeViewportPanel';

const NativeViewportPanel = lazy(() =>
  import('./NativeViewportPanel').then((module) => ({ default: module.NativeViewportPanel })),
);
const createNativeViewport: NativeViewportFactory = async (host, onStatus) => {
  const { NativeViewport } = await import('../../adapters3d/three/renderer');
  return new NativeViewport(host, { onStatus });
};

class ViewportLoadBoundary extends Component<
  { children: ReactNode; onReload: () => Promise<void> },
  { failed: boolean; busy: boolean; error: string }
> {
  state = { failed: false, busy: false, error: '' };
  private reloading = false;
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div>
        <p role="alert">
          3D表示を読み込めませんでした。現在の編集内容は保持しています。通信が戻ったら、保存してページを再読み込みしてください。先にバックアップを取得することもできます。
        </p>
        <button
          type="button"
          disabled={this.state.busy}
          onClick={() => {
            if (this.reloading) return;
            this.reloading = true;
            this.setState({ busy: true, error: '' });
            void this.props.onReload().catch((error: unknown) => {
              this.reloading = false;
              this.setState({ busy: false, error: describeError(error) });
            });
          }}
        >
          保存してページを再読み込み
        </button>
        {this.state.error && <p role="alert">{this.state.error}</p>}
      </div>
    ) : (
      this.props.children
    );
  }
}

type ProjectEntry = { id: string; name: string; revision: number };

function describeError(error: unknown) {
  if (error instanceof UnsavedProjectError) return error.message;
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return 'ブラウザーの保存容量が不足しています。現在の変更はこのタブに保持しています。バックアップを取得してから容量を確保し、保存を再試行してください。';
  return `操作を完了できませんでした。現在の内容を保持しています。${error instanceof Error ? error.message : String(error)}`;
}

function saveLabel(session: ProjectSession) {
  const state = session.state;
  if (state.readOnly && state.dirty) return '競合・未保存の変更をこのタブに保持中';
  if (state.readOnly) return `読み取り専用 · 保存済み revision ${state.persistedRevision}`;
  if (state.status === 'error') return '保存に失敗 · 未保存の変更をこのタブに保持中';
  if (state.status === 'saving') return '保存中';
  if (state.dirty) return '未保存の変更あり · 自動保存待ち';
  return `保存済み · revision ${state.persistedRevision}`;
}

export function Editor3DShell() {
  // Outside the fallible editor subtree: a render error keeps the same resident rescue bytes.
  const sessionRef = useRef<ProjectSession | null>(null);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionRef.current?.state.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  return (
    <Editor3DBoundary sessionRef={sessionRef}>
      <Editor3DContent sessionRef={sessionRef} />
    </Editor3DBoundary>
  );
}

class Editor3DBoundary extends Component<
  { children: ReactNode; sessionRef: RefObject<ProjectSession | null> },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Editor3DRescue sessionRef={this.props.sessionRef} />
    ) : (
      this.props.children
    );
  }
}

function Editor3DRescue({ sessionRef }: { sessionRef: RefObject<ProjectSession | null> }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="editor3d">
      <main className="editor3d-main">
        <h1>3D画面の表示を続けられませんでした</h1>
        <p role="alert">このタブを閉じずに、現在の内容をバックアップしてください。</p>
        {sessionRef.current ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const current = sessionRef.current;
              if (!current || busy) return;
              setBusy(true);
              void downloadSessionBackup(current)
                .then(() =>
                  setMessage(
                    'バックアップのダウンロードを開始しました。端末でファイルを確認してください。',
                  ),
                )
                .catch((cause: unknown) => setMessage(describeError(cause)))
                .finally(() => setBusy(false));
            }}
          >
            現在の内容をバックアップ
          </button>
        ) : (
          <p>開いているプロジェクトはありません。保存済みのデータは削除していません。</p>
        )}
        {message && <p role="status">{message}</p>}
        <p>
          <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer">
            トップを別タブで開く
          </a>
        </p>
        <p>
          開発版・{__APP_REVISION__.slice(0, 8)}
          {__APP_DIRTY__ ? '（ローカル変更あり）' : ''}
        </p>
      </main>
    </div>
  );
}

async function downloadSessionBackup(session: ProjectSession) {
  const project = session.project;
  const bytes = await session.backup();
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(project.name || '3d-project').replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').slice(0, 100)}.cas3dproj`;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function Editor3DContent({ sessionRef }: { sessionRef: RefObject<ProjectSession | null> }) {
  const [repository, setRepository] = useState<ProjectRepository | null>(null);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState('新しい3Dプロジェクト');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const busyRef = useRef(false);
  const ownerId = useRef(crypto.randomUUID());
  const mounted = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let opened: ProjectRepository | null = null;
    void openProjectRepository()
      .then(async (value) => {
        opened = value;
        const entries = await value.listProjects();
        if (cancelled) {
          value.close();
          return;
        }
        setRepository(value);
        setProjects(entries);
        setError('');
      })
      .catch((cause: unknown) => {
        opened?.close();
        if (!cancelled) setError(describeError(cause));
      });
    return () => {
      mounted.current = false;
      cancelled = true;
      const current = sessionRef.current;
      if (current) {
        // This is only a best-effort unmount flush. The unload guard is the warning path.
        void current
          .close()
          .then(() => opened?.close())
          .catch(() => undefined);
      } else {
        opened?.close();
      }
    };
  }, [connectionAttempt, sessionRef]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      void sessionRef.current?.save().catch((cause: unknown) => {
        if (mounted.current) setError(describeError(cause));
      });
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [sessionRef]);

  useEffect(() => {
    if (!session || !repository) return;
    let cancelled = false;
    let previous = JSON.stringify(session.state);
    // Autosave owns its timers; observe only changed status, without scheduling more saves.
    const poll = () => {
      const state = session.state;
      const next = JSON.stringify(state);
      if (next === previous) return;
      previous = next;
      redraw();
      if (!state.dirty)
        void repository
          .listProjects()
          .then((entries) => {
            if (!cancelled) setProjects(entries);
          })
          .catch((cause: unknown) => {
            if (!cancelled) setError(describeError(cause));
          });
    };
    let timer: number | undefined;
    const observeVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === 'hidden') return;
      poll();
      timer = window.setInterval(poll, 150);
    };
    observeVisibility();
    document.addEventListener('visibilitychange', observeVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', observeVisibility);
    };
  }, [session, repository]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [session]);

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        redraw();
      }
    }
  }

  async function replaceSession(next: ProjectSession) {
    const previous = sessionRef.current;
    try {
      await previous?.close();
    } catch (cause) {
      // The caller keeps the previous tab content visible when it could not be closed.
      await next.close().catch(() => undefined);
      throw cause;
    }
    sessionRef.current = next;
    setSession(next);
    if (repository) setProjects(await repository.listProjects());
  }

  async function openProject(id: string) {
    if (!repository || session?.project.id === id) return;
    await sessionRef.current?.save();
    await replaceSession(await ProjectSession.open(repository, ownerId.current, id));
  }

  function edit(operation: () => void) {
    if (busyRef.current) return;
    try {
      operation();
      setError('');
      setNotice('');
    } catch (cause) {
      setError(describeError(cause));
    }
    redraw();
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    const href = event.currentTarget.href;
    void run(async () => {
      await sessionRef.current?.close();
      window.location.assign(href);
    });
  }

  async function downloadBackup() {
    if (!session) return;
    await downloadSessionBackup(session);
    setNotice(
      'バックアップのダウンロードを開始しました。端末でファイルを確認してください。ブラウザー内の保存状態は変わりません。',
    );
  }

  const state = session?.state;
  const project = session?.project;

  return (
    <div className="editor3d">
      <a className="editor3d-skip" href="#editor3d-main">
        本文へ移動
      </a>
      <header className="editor3d-header">
        <div>
          <p className="editor3d-eyebrow">CHAMELEON ASSET STUDIO</p>
          <h1>3Dプロジェクト</h1>
        </div>
        <nav aria-label="制作画面の移動">
          <a href={import.meta.env.BASE_URL} onClick={navigate}>
            トップへ
          </a>
          <a href={`${import.meta.env.BASE_URL}2d/`} onClick={navigate}>
            2D制作へ
          </a>
        </nav>
      </header>
      <main id="editor3d-main" className="editor3d-main">
        <section className="editor3d-intro" aria-labelledby="editor3d-preparation">
          <span className="editor3d-badge">3D制作は準備中</span>
          <h2 id="editor3d-preparation">まずは、プロジェクトの保存と再開から</h2>
          <p>
            箱の追加、3D表示とカメラ操作、PNG画像の保存、自動保存、バックアップとコピー復元を利用できます。頂点・材質の編集、リグ・アニメーション編集、GLBの入出力は準備中です。
          </p>
          <p>
            作品はこのブラウザー内に保存します。大切な内容は .cas3dproj
            ファイルでも保管してください。
          </p>
        </section>

        {error && (
          <p role="alert" className="editor3d-alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="editor3d-notice">
            {notice}
          </p>
        )}
        {!repository ? (
          <section className="editor3d-card" aria-label="保存領域の接続">
            <p>{error ? '3Dの保存領域を開けませんでした。' : '3Dの保存領域を開いています…'}</p>
            {error && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setConnectionAttempt((value) => value + 1);
                }}
              >
                保存領域を再接続
              </button>
            )}
          </section>
        ) : (
          <div className="editor3d-layout">
            <aside className="editor3d-library" aria-label="3Dプロジェクト一覧と復元">
              <section className="editor3d-card" aria-labelledby="editor3d-create-heading">
                <h2 id="editor3d-create-heading">新しく作る</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      await sessionRef.current?.save();
                      const next = await ProjectSession.create(
                        repository,
                        ownerId.current,
                        newName.trim() || '新しい3Dプロジェクト',
                      );
                      await replaceSession(next);
                      // Show the new session even if its first durable save fails.
                      await next.save();
                      setProjects(await repository.listProjects());
                    });
                  }}
                >
                  <label htmlFor="editor3d-new-name">新しいプロジェクト名</label>
                  <input
                    id="editor3d-new-name"
                    value={newName}
                    maxLength={4096}
                    disabled={busy}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <button type="submit" disabled={busy}>
                    新しい3Dプロジェクトを作成
                  </button>
                </form>
              </section>
              <section className="editor3d-card" aria-labelledby="editor3d-projects-heading">
                <div className="editor3d-section-heading">
                  <h2 id="editor3d-projects-heading">保存したプロジェクト</h2>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => setProjects(await repository.listProjects()))
                    }
                  >
                    一覧を更新
                  </button>
                </div>
                {projects.length === 0 ? (
                  <p>保存したプロジェクトはまだありません。</p>
                ) : (
                  <ul className="editor3d-project-list">
                    {projects.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          disabled={busy || entry.id === project?.id}
                          aria-current={entry.id === project?.id ? 'true' : undefined}
                          onClick={() => void run(() => openProject(entry.id))}
                        >
                          <span>{entry.name || '名称未設定'}</span>
                          <small>
                            revision {entry.revision}
                            {entry.id === project?.id ? ' · 開いています' : ''}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="editor3d-card" aria-labelledby="editor3d-restore-heading">
                <h2 id="editor3d-restore-heading">バックアップから再開</h2>
                <p>元のプロジェクトを上書きせず、新しいIDのコピーとして復元します。</p>
                <label htmlFor="editor3d-restore">.cas3dproj を選んでコピー復元</label>
                <input
                  id="editor3d-restore"
                  type="file"
                  accept=".cas3dproj"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void run(async () => {
                      if (!file.name.toLowerCase().endsWith('.cas3dproj'))
                        throw new Error('.cas3dproj ファイルを選んでください。');
                      if (file.size > BACKUP_LIMITS.archiveBytes)
                        throw new Error('この版では64 MiBまでのバックアップに対応しています。');
                      await sessionRef.current?.save();
                      const next = await ProjectSession.restore(
                        repository,
                        ownerId.current,
                        new Uint8Array(await file.arrayBuffer()),
                      );
                      await replaceSession(next);
                      setNotice(
                        '新しいプロジェクトとして復元しました。元のプロジェクトは上書きしていません。',
                      );
                    });
                  }}
                />
              </section>
            </aside>

            <section
              className="editor3d-workspace editor3d-card"
              aria-labelledby="editor3d-project-heading"
              aria-busy={busy}
            >
              <h2 id="editor3d-project-heading" ref={titleRef} tabIndex={-1}>
                {project ? project.name || '名称未設定' : 'プロジェクトを選んでください'}
              </h2>
              {!session || !project || !state ? (
                <p>新しく作るか、保存済みプロジェクトを開いて再開できます。</p>
              ) : (
                <>
                  <p
                    role="status"
                    aria-live="polite"
                    className={`editor3d-save-status${state.dirty ? ' is-dirty' : ''}`}
                  >
                    {saveLabel(session)}
                  </p>
                  <p className="editor3d-revision">
                    編集中 revision {state.revision} / 保存済み revision{' '}
                    {state.persistedRevision ?? 'なし'}
                  </p>
                  {state.readOnly && (
                    <div className="editor3d-conflict" role="alert">
                      <p>
                        別のタブが編集権を持っているか、編集権が切り替わりました。このタブでは内容を保持し、読み取り専用にしています。
                      </p>
                      {state.dirty ? (
                        <p>
                          未保存の内容はバックアップするか「コピーとして保存」で残してください。現在の内容を保存せずに読み替えることはできません。
                        </p>
                      ) : (
                        <>
                          <p>
                            引き継ぐと、保存済みの最新内容を読み直します。ほかのタブは保存できなくなるため、そちらの未保存内容は別途バックアップしてください。
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => replaceSession(await session.takeOver()))
                            }
                          >
                            このタブで編集を引き継ぐ
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {state.status === 'error' && !state.readOnly && (
                    <p role="alert" className="editor3d-alert">
                      保存に失敗しました。タブを閉じずに再試行するか、現在の内容をバックアップしてください。
                      {state.errorMessage}
                    </p>
                  )}
                  <label htmlFor="editor3d-project-name">プロジェクト名</label>
                  <input
                    id="editor3d-project-name"
                    value={project.name}
                    maxLength={4096}
                    readOnly={state.readOnly}
                    disabled={busy}
                    onChange={(event) => edit(() => session.rename(event.target.value))}
                  />
                  <div className="editor3d-actions" aria-label="編集履歴と保存">
                    <button
                      type="button"
                      disabled={busy || state.readOnly || !state.canUndo}
                      onClick={() => edit(() => session.undo())}
                    >
                      元に戻す
                    </button>
                    <button
                      type="button"
                      disabled={busy || state.readOnly || !state.canRedo}
                      onClick={() => edit(() => session.redo())}
                    >
                      やり直す
                    </button>
                    <button
                      type="button"
                      disabled={busy || state.readOnly}
                      onClick={() => void run(() => session.save())}
                    >
                      {state.status === 'error' ? '保存を再試行' : '今すぐ保存'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await session.close();
                          sessionRef.current = null;
                          setSession(null);
                          setProjects(await repository.listProjects());
                        })
                      }
                    >
                      プロジェクトを閉じる
                    </button>
                  </div>
                  <div className="editor3d-actions" aria-label="3Dの形と表示">
                    <button
                      type="button"
                      disabled={busy || state.readOnly}
                      onClick={() =>
                        edit(() => {
                          session.addBox();
                          setPreviewProjectId(project.id);
                        })
                      }
                    >
                      箱を追加
                    </button>
                    <button
                      type="button"
                      disabled={busy || previewProjectId === project.id}
                      onClick={() => setPreviewProjectId(project.id)}
                    >
                      3D表示を開く
                    </button>
                  </div>
                  {previewProjectId === project.id && (
                    <ViewportLoadBoundary
                      key={project.id}
                      onReload={async () => {
                        if (busyRef.current)
                          throw new Error('別の操作が完了するまで待ってください。');
                        busyRef.current = true;
                        setBusy(true);
                        try {
                          await session.save();
                          if (session.state.dirty) throw new UnsavedProjectError();
                          await session.close();
                          window.location.reload();
                        } catch (error) {
                          busyRef.current = false;
                          setBusy(false);
                          throw error;
                        }
                      }}
                    >
                      <Suspense
                        fallback={
                          <p role="status">
                            3D表示を読み込み中… 保存・バックアップは引き続き利用できます。
                          </p>
                        }
                      >
                        <NativeViewportPanel
                          project={project}
                          factory={createNativeViewport}
                          onSave={() => session.save()}
                          getSuspensionContract={() => ({
                            persistedRevision: session.state.persistedRevision,
                            currentRevision: session.state.revision,
                            sourcesComplete: session.sourcesComplete,
                          })}
                        />
                      </Suspense>
                    </ViewportLoadBoundary>
                  )}
                  <div className="editor3d-backup">
                    <h3>現在の内容を残す</h3>
                    <p>
                      未保存の変更と、プロジェクトに含まれる素材を .cas3dproj
                      に含めます。Undo履歴は含みません。ゲーム用の配布ファイルではありません。
                    </p>
                    <div className="editor3d-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(downloadBackup)}
                      >
                        現在の内容をバックアップ
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await replaceSession(await session.saveCopy());
                            setNotice(
                              '現在の内容を別のプロジェクトとして保存し、そのコピーを開きました。',
                            );
                          })
                        }
                      >
                        コピーとして保存
                      </button>
                    </div>
                  </div>
                  <details className="editor3d-details">
                    <summary>プロジェクトの内容</summary>
                    <dl>
                      <dt>プロジェクトID</dt>
                      <dd>{project.id}</dd>
                      <dt>形式</dt>
                      <dd>
                        {project.format} / {project.schemaVersion}
                      </dd>
                      <dt>ノード / メッシュ / 材質</dt>
                      <dd>
                        {project.nodes.length} / {project.meshes.length} /{' '}
                        {project.materials.length}
                      </dd>
                      <dt>スキン / クリップ / 素材</dt>
                      <dd>
                        {project.skins.length} / {project.clips.length} / {project.sources.length}
                      </dd>
                    </dl>
                  </details>
                  <div className="editor3d-placeholder">
                    <p>
                      現在の3D表示は三角形メッシュの静止表示です。テクスチャ・リグ・アニメーションを含む作品は保存・バックアップできますが、表示は準備中です。
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
      <footer className="editor3d-footer">
        <p>
          <a
            href={`${import.meta.env.BASE_URL}licenses/three-MIT.txt`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Three.js ライセンス
          </a>
        </p>
        <p>
          開発版・{__APP_REVISION__.slice(0, 8)}
          {__APP_DIRTY__ ? '（ローカル変更あり）' : ''}
        </p>
        3Dプロジェクトの保存・復元と基本表示を検証する開発版です。端末やOSによる中断からの復旧は、まだ実機検証を完了していません。
      </footer>
    </div>
  );
}
