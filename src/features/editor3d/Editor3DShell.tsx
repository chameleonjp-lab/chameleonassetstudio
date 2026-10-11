import { formatNativeEditingFailure } from './editingFailure';
import { guardNativeCompositionKey } from './keyboardSafety';
import { NativeProjectLibraryPanel } from './NativeProjectLibraryPanel';
import { openRecoveryCopy } from './projectLibrary';
import { NativeDiagnosticsPanel } from './NativeDiagnosticsPanel';
import { NativeBuildStatus } from './NativeBuildStatus';
import { exportStoredBackup } from '../../core3d/backup/repositoryBackup';
import {
  adoptEditorSession,
  preserveSessionForRescue,
  releaseEditorResources,
} from './sessionLifetime';
import { NativeQualityPanel } from './NativeQualityPanel';
import { NativeGamePanel } from './NativeGamePanel';
import { NativeAnimationPanel } from './NativeAnimationPanel';
import { NativeRigPanel } from './NativeRigPanel';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  copyLegacyProject,
  listLegacyProjects,
  type LegacyProjectEntry,
} from '../../core3d/storage/legacyMigration';
import { openProjectRepository, type ProjectRepository } from '../../core3d/storage/repository';
import { BACKUP_LIMITS, ProjectSession, UnsavedProjectError } from './projectSession';
import './editor3d.css';
import type { NativeViewportFactory, NativeThumbnailCapture } from './NativeViewportPanel';
import { NativeThumbnailCachePanel } from './NativeThumbnailCachePanel';
import { NativeAuthoringPanel } from './NativeAuthoringPanel';
import { NativeAssemblyControls } from './NativeAssemblyControls';
import { NativeTransformControls } from './NativeTransformControls';
import { NativeTexturePanel } from './NativeTexturePanel';
import type { Project3D } from '../../core3d/model/project';

const NativeAssetIoPanel = lazy(() =>
  import('./NativeAssetIoPanel').then((module) => ({ default: module.NativeAssetIoPanel })),
);
const NativeViewportPanel = lazy(() =>
  import('./NativeViewportPanel').then((module) => ({ default: module.NativeViewportPanel })),
);
const createNativeViewport: NativeViewportFactory = async (host, onStatus) => {
  const { NativeViewport } = await import('../../adapters3d/three/renderer');
  return new NativeViewport(host, { onStatus });
};

class ViewportLoadBoundary extends Component<
  { children: ReactNode; onReload: () => Promise<void> },
  { failed: boolean; busy: boolean; error: string; loadError: string }
> {
  state = { failed: false, busy: false, error: '', loadError: '' };
  private reloading = false;
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, loadError: formatNativeEditingFailure(error, 'viewport') };
  }
  render() {
    return this.state.failed ? (
      <div>
        <p role="alert">
          3D表示を読み込めませんでした。現在の編集内容は保持しています。通信が戻ったら、保存してページを再読み込みしてください。先にバックアップを取得することもできます。
        </p>
        <details>
          <summary>読み込みエラーの詳細</summary>
          <p data-testid="viewport-load-error">{this.state.loadError}</p>
        </details>
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
        <NativeDiagnosticsPanel
          appVersion={__APP_VERSION__}
          sourceRevision={__APP_REVISION__}
          sourceDirty={__APP_DIRTY__}
          schemaVersion="0.3.0"
          errorId="viewport-load-failed"
          feature="viewport"
        />
      </div>
    ) : (
      this.props.children
    );
  }
}

type ProjectEntry = { id: string; name: string; revision: number };

function describeError(error: unknown) {
  return formatNativeEditingFailure(error, 'storage');
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
  const repositoryOwners = useRef(new Set<ProjectRepository>());
  useEffect(() => {
    const ownedRepositories = repositoryOwners.current;
    const releaseOwned = () => releaseEditorResources(sessionRef.current, ownedRepositories);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionRef.current?.state.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      void releaseOwned().catch(() => undefined);
    };
  }, []);
  return (
    <Editor3DBoundary sessionRef={sessionRef}>
      <Editor3DContent sessionRef={sessionRef} repositoryOwners={repositoryOwners} />
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
        <NativeDiagnosticsPanel
          appVersion={__APP_VERSION__}
          sourceRevision={__APP_REVISION__}
          sourceDirty={__APP_DIRTY__}
          schemaVersion="0.3.0"
          errorId="editor-render-failed"
          feature="editor"
        />
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
  downloadArchive(bytes, project.name);
}

function downloadArchive(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(name || '3d-project').replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').slice(0, 100)}.cas3dproj`;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function Editor3DContent({
  sessionRef,
  repositoryOwners,
}: {
  sessionRef: RefObject<ProjectSession | null>;
  repositoryOwners: RefObject<Set<ProjectRepository>>;
}) {
  const [repository, setRepository] = useState<ProjectRepository | null>(null);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [gamePreview, setGamePreview] = useState(false);
  const [assetIoOpen, setAssetIoOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const inspectionRoot = useRef<HTMLDivElement>(null);
  const [inspectionTarget, setInspectionTarget] = useState('');
  const [legacyProjects, setLegacyProjects] = useState<LegacyProjectEntry[] | null>(null);
  const [legacyTarget, setLegacyTarget] = useState<LegacyProjectEntry | null>(null);
  const [hasLegacyBackup, setHasLegacyBackup] = useState(false);
  const migration = useRef<AbortController | null>(null);
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [previewProjectId, setPreviewProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState('新しい3Dプロジェクト');
  const [thumbnailGeneration, setThumbnailGeneration] = useState(0);
  const newNameComposing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const busyRef = useRef(false);
  const ownerId = useRef(crypto.randomUUID());
  const mounted = useRef(false);
  const ownerEpoch = useRef(0);
  const operationEpoch = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const readTextureBlob = useCallback(
    (id: string) => {
      if (!session) throw new Error('画像を読むプロジェクトがありません。');
      return session.readBlob(id);
    },
    [session],
  );

  useEffect(() => {
    mounted.current = true;
    const epoch = ownerEpoch.current + 1;
    ownerEpoch.current = epoch;
    const ownedRepositories = repositoryOwners.current;
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
        ownedRepositories.add(value);
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
      ownerEpoch.current = epoch + 1;
      migration.current?.abort();
      cancelled = true;
      const current = sessionRef.current;
      if (current) {
        // Error-boundary child teardown must leave originals resident for the surviving rescue UI.
        void preserveSessionForRescue(current).catch(() => undefined);
      } else {
        opened?.close();
        if (opened) ownedRepositories.delete(opened);
      }
    };
  }, [connectionAttempt, sessionRef, repositoryOwners]);

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
    let cancelled = false;
    setHasLegacyBackup(false);
    if (repository && session)
      void repository
        .hasLegacyBackup(session.project.id)
        .then((found) => {
          if (!cancelled) setHasLegacyBackup(found);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(describeError(cause));
        });
    return () => {
      cancelled = true;
    };
  }, [repository, session]);

  useLayoutEffect(() => {
    titleRef.current?.focus();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const binding = session.edit;
    let revision = binding.state.revision;
    let readOnly = binding.state.context.readOnly;
    const unsubscribe = binding.subscribe(() => {
      const next = binding.state;
      // Preview samples reach the renderer directly; do not rebuild heavy form lists per sample.
      if (next.revision === revision && next.context.readOnly === readOnly) return;
      revision = next.revision;
      readOnly = next.context.readOnly;
      redraw();
    });
    const visibility = () => binding.setBlocked('document-hidden', document.hidden);
    const freeze = () => binding.setBlocked('document-frozen', true);
    const resume = () => binding.setBlocked('document-frozen', false);
    const pageHide = () => binding.setBlocked('page-hidden', true);
    const pageShow = () => {
      binding.setBlocked('page-hidden', false);
      visibility();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('freeze', freeze);
    document.addEventListener('resume', resume);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('freeze', freeze);
      document.removeEventListener('resume', resume);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      binding.cancel('編集画面が切り替わりました。');
    };
  }, [session]);

  useLayoutEffect(() => {
    session?.edit.setBlocked('shell-operation', busy);
  }, [session, busy]);

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return;
    const editing = sessionRef.current?.edit;
    busyRef.current = true;
    operationEpoch.current = ownerEpoch.current;
    editing?.setBlocked('shell-operation', true);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (cause) {
      if (mounted.current) setError(describeError(cause));
    } finally {
      editing?.setBlocked('shell-operation', false);
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        redraw();
      }
    }
  }

  async function replaceSession(next: ProjectSession) {
    const epoch = operationEpoch.current;
    const adopted = await adoptEditorSession(
      sessionRef,
      next,
      () => mounted.current && epoch === ownerEpoch.current,
    );
    if (!adopted || !mounted.current) return;
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

  function executeAuthoring(operation: (candidate: Project3D) => void) {
    if (!session || !project || busyRef.current)
      throw new Error('別の操作が完了するまで待ってください。');
    session.executeAuthoring(operation, { id: project.id, revision: project.revision });
    const updated = session.project;
    if (updated.nodes.some((node) => node.meshId)) setPreviewProjectId(updated.id);
    setError('');
    setNotice('');
    redraw();
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    const href = event.currentTarget.href;
    void run(async () => {
      const valid = () => mounted.current && operationEpoch.current === ownerEpoch.current;
      if (!valid()) return;
      const current = sessionRef.current;
      if (current) {
        await current.close(valid, () => window.location.assign(href));
      } else if (valid()) {
        window.location.assign(href);
      }
    });
  }

  async function reloadCurrent() {
    if (busyRef.current) throw new Error('別の操作が完了するまで待ってください。');
    const current = sessionRef.current,
      epoch = ownerEpoch.current;
    const valid = () =>
      mounted.current && ownerEpoch.current === epoch && sessionRef.current === current;
    busyRef.current = true;
    operationEpoch.current = epoch;
    current?.edit.setBlocked('shell-operation', true);
    setBusy(true);
    try {
      await current?.save();
      if (current?.state.dirty) throw new UnsavedProjectError();
      if (!valid()) throw new Error('編集画面が切り替わりました。');
      if (current) {
        const closed = await current.close(valid, () => window.location.reload());
        if (!closed) throw new Error('編集画面が切り替わりました。');
      } else window.location.reload();
    } catch (error) {
      current?.edit.setBlocked('shell-operation', false);
      busyRef.current = false;
      if (mounted.current) setBusy(false);
      throw error;
    }
  }

  async function saveThumbnail(request: NativeThumbnailCapture) {
    const sourceRepository = repository;
    if (!sourceRepository) throw new Error('保存領域を確認してから作成してください。');
    const owner = sessionRef.current;
    const current = () =>
      !!owner &&
      sessionRef.current === owner &&
      !owner.state.closed &&
      !owner.state.dirty &&
      owner.project.id === request.projectId &&
      owner.project.revision === request.revision &&
      request.isCurrent();
    if (!current()) throw new Error('サムネイルの保存対象が変わりました。');
    const [{ openThumbnailCache }, { createNativeThumbnail }] = await Promise.all([
      import('../../core3d/storage/thumbnailCache'),
      import('./thumbnailImage'),
    ]);
    if (!current()) throw new Error('サムネイルの保存対象が変わりました。');
    const cache = await openThumbnailCache();
    try {
      const metadata = await cache.listMetadata();
      const expectedToken =
        metadata.find((entry) => entry.projectId === request.projectId)?.token ?? null;
      if (!current()) throw new Error('サムネイルの保存対象が変わりました。');
      const source = await request.capture();
      const image = await createNativeThumbnail(source, { signal: request.signal });
      try {
        if (!current()) throw new Error('サムネイルの保存対象が変わりました。');
        await cache.put(
          {
            projectId: request.projectId,
            revision: request.revision,
            width: image.width,
            height: image.height,
            bytes: image.bytes,
          },
          { expectedToken, latestRevision: owner!.project.revision, canCommit: current },
        );
        // A completed cache write is retained after a late cancellation; never remove a newer entry.
        const savedEntries = await sourceRepository.listProjects();
        if (mounted.current) {
          setProjects(savedEntries);
          setThumbnailGeneration((value) => value + 1);
        }
      } finally {
        image.dispose();
      }
    } finally {
      cache.close();
    }
  }

  async function downloadBackup() {
    if (!session) return;
    await downloadSessionBackup(session);
    setNotice(
      'バックアップのダウンロードを開始しました。端末でファイルを確認してください。ブラウザー内の保存状態は変わりません。',
    );
  }

  const state = session?.state;
  const project = state?.closed ? undefined : session?.project;
  useEffect(() => setInspectionTarget(''), [project?.id, project?.revision]);

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
          <span className="editor3d-badge">3D制作・開発版</span>
          <h2 id="editor3d-preparation">まずは、プロジェクトの保存と再開から</h2>
          <p>
            基本形の作成、部品の選択と移動・回転・拡縮、数値による頂点・面・材質の編集、baseColor画像と色調の編集、3D表示とカメラ操作、PNG画像の保存、自動保存、バックアップとコピー復元を利用できます。骨と重み、アニメーション、ゲーム情報、GLB入出力と品質検査も利用できます。高度なtexture制作と実機での統合受入は未完了です。
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
                  onCompositionStart={() => {
                    newNameComposing.current = true;
                  }}
                  onCompositionEnd={() => {
                    newNameComposing.current = false;
                  }}
                  onKeyDownCapture={(event) => {
                    guardNativeCompositionKey(event, newNameComposing.current, true);
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newNameComposing.current) return;
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
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`保存済みの版をバックアップ: ${entry.name || '名称未設定'}`}
                          onClick={() =>
                            void run(async () => {
                              const bytes = await exportStoredBackup(repository, entry.id);
                              downloadArchive(bytes, `${entry.name || '3d-project'}-saved`);
                              setNotice(
                                '保存済みの版をバックアップしました。未保存の編集は含まれません。保存領域への書込みはしていません。',
                              );
                            })
                          }
                        >
                          保存済みの版をバックアップ
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <NativeThumbnailCachePanel
                projects={projects}
                refreshGeneration={thumbnailGeneration}
              />
              <NativeProjectLibraryPanel
                repository={repository}
                currentProjectId={project?.id}
                disabled={busy}
                run={run}
                onChanged={async () => {
                  const epoch = ownerEpoch.current;
                  const entries = await repository.listProjects();
                  if (mounted.current && ownerEpoch.current === epoch) setProjects(entries);
                }}
                onRecover={async (entry, snapshot) => {
                  const current = sessionRef.current;
                  await current?.save();
                  if (current?.state.dirty) throw new UnsavedProjectError();
                  if (
                    !mounted.current ||
                    operationEpoch.current !== ownerEpoch.current ||
                    sessionRef.current !== current
                  )
                    throw new Error('編集画面が切り替わりました。');
                  try {
                    await replaceSession(
                      await openRecoveryCopy(repository, ownerId.current, entry.id, snapshot),
                    );
                  } finally {
                    const epoch = ownerEpoch.current;
                    const entries = await repository.listProjects();
                    if (mounted.current && ownerEpoch.current === epoch) setProjects(entries);
                  }
                }}
              />
              <section className="editor3d-card" aria-labelledby="editor3d-legacy-heading">
                <h2 id="editor3d-legacy-heading">旧形式の作品（0.1.0 / 0.2.0）</h2>
                <p>
                  旧保存領域の原本を残し、新しい保存領域へコピーして編集します。復元用の控えも保存するため端末の使用容量が増えます。
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => setLegacyProjects(await listLegacyProjects()))
                  }
                >
                  旧作品の一覧を読む
                </button>
                {legacyProjects?.length === 0 && <p>旧保存領域に作品はありません。</p>}
                {legacyProjects && (
                  <ul className="editor3d-project-list">
                    {legacyProjects.map((entry) => (
                      <li key={entry.namespace + entry.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setLegacyTarget(entry)}
                        >
                          {entry.name} をコピーして編集
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {legacyTarget && (
                  <div role="group" aria-label="旧作品のコピー確認">
                    <p>
                      対象: {legacyTarget.name}
                      。旧作品と旧保存領域は変更せず、新しいIDの作品と移行前の復元控えを保存します。
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const controller = new AbortController();
                          migration.current = controller;
                          try {
                            await sessionRef.current?.save();
                            controller.signal.throwIfAborted();
                            const result = await copyLegacyProject(
                              repository,
                              legacyTarget.id,
                              ownerId.current,
                              { signal: controller.signal, name: legacyTarget.namespace },
                            );
                            // Once committed, a late cancel cannot delete the complete saved copy.
                            migration.current = null;
                            await replaceSession(
                              await ProjectSession.open(
                                repository,
                                ownerId.current,
                                result.projectId,
                              ),
                            );
                            setLegacyTarget(null);
                            setNotice(
                              '旧作品を残してコピーを開きました。移行前の復元控えも保存済みです。',
                            );
                          } finally {
                            migration.current = null;
                          }
                        })
                      }
                    >
                      容量増加を確認してコピーを作成
                    </button>
                    <button
                      type="button"
                      disabled={busy && !migration.current}
                      onClick={() => {
                        migration.current?.abort();
                        setLegacyTarget(null);
                      }}
                    >
                      コピーを取り消す
                    </button>
                  </div>
                )}
              </section>
              <section className="editor3d-card" aria-labelledby="editor3d-restore-heading">
                <h2 id="editor3d-restore-heading">バックアップから再開</h2>
                <p>
                  0.1.0 / 0.2.0 /
                  0.3.0に対応し、新しいIDのコピーとして復元します。旧形式は復元控えも保存するため使用容量が増えます。
                </p>
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
                  {hasLegacyBackup && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const bytes = await repository.readLegacyBackup(project.id);
                          if (!bytes) throw new Error('旧形式の復元控えが見つかりません。');
                          downloadArchive(bytes, `${project.name}-original-version`);
                          setNotice(
                            '旧形式の復元控えをダウンロードしました。端末でファイルを確認してください。',
                          );
                        })
                      }
                    >
                      移行前の復元控えを取得
                    </button>
                  )}
                  <details aria-label="このタブのUndo履歴と予算">
                    <summary>Undo履歴と予算を確認</summary>
                    <p>
                      元に戻せる操作: {state.history.undoCount} 件 / やり直せる操作:{' '}
                      {state.history.redoCount} 件。
                      {state.history.hasPreview ? '履歴内に未確定の編集を保持しています。' : ''}
                    </p>
                    <p>
                      編集受入判定の履歴上限:{' '}
                      {state.history.serializedCommitBudgetBytes / (1024 * 1024)} MiB。
                      新しい編集を受け入れる際のUndo・現在・候補のJSON量で判定します。
                      残り操作回数や端末の空き容量ではありません。
                    </p>
                    <p>
                      この作品の履歴所有見積り（現在・Undo・Redo・プレビュー）:{' '}
                      {state.history.ownershipEstimateBytes === null
                        ? '計測対象外'
                        : `${state.history.ownershipEstimateBytes.toLocaleString('ja-JP')} bytes`}
                      。 こちらは構造の所有見積りで、上のJSON上限とは別の値です。
                      表示だけの変形・poseは別管理です。素材の実バイナリやブラウザーの実メモリは含みません。
                    </p>
                    <p>
                      上限で操作できない場合も、現在の作品と履歴は自動で整理しません。
                      「現在の内容をバックアップ」は現在の作品と必要な素材を保存しますが、
                      Undo・Redo履歴は含みません。履歴を残したい間はこのタブの作品を閉じず、
                      必要な各状態を個別にバックアップしてください。
                    </p>
                  </details>
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
                          const epoch = operationEpoch.current;
                          const valid = () =>
                            mounted.current &&
                            epoch === ownerEpoch.current &&
                            sessionRef.current === session;
                          const closed = await session.close(valid, () => {
                            sessionRef.current = null;
                          });
                          if (!closed || !mounted.current) return;
                          setSession(null);
                          const entries = await repository.listProjects();
                          if (mounted.current && epoch === ownerEpoch.current) setProjects(entries);
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
                          const added = session.project.nodes.at(-1);
                          if (added) session.edit.setSelection([added.id], added.id);
                          setPreviewProjectId(project.id);
                        })
                      }
                    >
                      箱を追加
                    </button>
                    <button
                      type="button"
                      disabled={busy || previewProjectId === project.id}
                      onClick={() => {
                        session.edit.cancel('3D表示を開くため、変形プレビューを取り消しました。');
                        setPreviewProjectId(project.id);
                      }}
                    >
                      3D表示を開く
                    </button>
                    <button
                      type="button"
                      disabled={busy || previewProjectId !== project.id}
                      onClick={() => {
                        session.animation.cancel('3D表示を終了しました。');
                        session.rigPose.cancel('3D表示を終了しました。');
                        session.edit.cancel('3D表示を終了しました。');
                        setPreviewProjectId(null);
                      }}
                    >
                      3D表示を閉じる
                    </button>
                  </div>
                  <NativeTransformControls
                    key={`transform-${project.id}`}
                    edit={session.edit}
                    disabled={busy || state.readOnly}
                  />
                  <div ref={inspectionRoot}>
                    <details
                      className="editor3d-details"
                      onToggle={(event) => setQualityOpen(event.currentTarget.open)}
                    >
                      <summary>作品の品質検査を開く</summary>
                      {qualityOpen && (
                        <NativeQualityPanel
                          session={session}
                          onNavigate={(target, revision) => {
                            if (busyRef.current || session.state.revision !== revision) return;
                            const section =
                              target.kind === 'skin'
                                ? 'rig'
                                : target.kind === 'clip'
                                  ? 'animation'
                                  : target.kind === 'game'
                                    ? 'game'
                                    : target.kind === 'material' && target.section === 'texture'
                                      ? 'texture'
                                      : 'authoring';
                            const element = inspectionRoot.current?.querySelector<HTMLElement>(
                              `[data-inspection="${section}"]`,
                            );
                            if (!element) return;
                            let destination: HTMLDetailsElement | null =
                              element instanceof HTMLDetailsElement ? element : null;
                            if (!destination) {
                              const label =
                                section === 'texture'
                                  ? '画像とUVを開く'
                                  : target.kind === 'material'
                                    ? '材質の色・金属・粗さ'
                                    : target.kind === 'mesh'
                                      ? '頂点・辺・面を編集'
                                      : '部品の名前・位置・複製';
                              destination =
                                [...element.querySelectorAll('details')].find(
                                  (details) =>
                                    details.querySelector('summary')?.textContent === label,
                                ) ?? null;
                            }
                            if (!destination) return;
                            destination.open = true;
                            setInspectionTarget(
                              `確認する対象: ${JSON.stringify(target)}。未確定入力は保持しています。編集先の既存コントロールで対象を選択してください。`,
                            );
                            destination.scrollIntoView({ block: 'nearest' });
                            destination
                              .querySelector<HTMLElement>('summary')
                              ?.focus({ preventScroll: true });
                          }}
                        />
                      )}
                    </details>
                    {inspectionTarget && <p role="status">{inspectionTarget}</p>}
                    <div data-inspection="authoring">
                      <NativeAuthoringPanel
                        key={`authoring-${project.id}`}
                        project={project}
                        disabled={busy || state.readOnly}
                        execute={executeAuthoring}
                        edit={session.edit}
                      />
                    </div>
                    <details
                      data-inspection="rig"
                      className="editor3d-details"
                      onToggle={(event) => {
                        if (!event.currentTarget.open)
                          session.rigPose.cancel('骨の編集を閉じたためrestへ戻しました。');
                      }}
                    >
                      <summary>骨と重みの編集を開く</summary>
                      <NativeRigPanel
                        key={`rig-${project.id}`}
                        project={project}
                        session={session}
                        disabled={busy || state.readOnly}
                        onChange={redraw}
                      />
                    </details>
                    <details
                      data-inspection="animation"
                      className="editor3d-details"
                      onToggle={(event) => {
                        if (!event.currentTarget.open)
                          session.animation.cancel('アニメーション編集を閉じました。');
                      }}
                    >
                      <summary>アニメーション編集を開く</summary>
                      <NativeAnimationPanel
                        key={`animation-${project.id}`}
                        project={project}
                        session={session}
                        disabled={busy || state.readOnly}
                        onChange={redraw}
                      />
                    </details>
                    <details data-inspection="game" className="editor3d-details">
                      <summary>ゲーム向け情報を編集</summary>
                      <label>
                        <input
                          type="checkbox"
                          checked={gamePreview}
                          onChange={(event) => setGamePreview(event.target.checked)}
                        />
                        anchor・collider・原点をプレビュー
                      </label>
                      <NativeGamePanel
                        key={'game-' + project.id}
                        session={session}
                        onChange={redraw}
                      />
                    </details>
                    <details
                      className="editor3d-details"
                      onToggle={(event) => setAssetIoOpen(event.currentTarget.open)}
                    >
                      <summary>GLB読込・配布ファイル出力</summary>
                      {assetIoOpen && (
                        <Suspense fallback={<p role="status">GLB入出力を読み込み中…</p>}>
                          <NativeAssetIoPanel
                            key={'io-' + project.id}
                            session={session}
                            onImport={async (result, signal) => {
                              const owner = sessionRef.current;
                              if (owner !== session || owner.state.readOnly)
                                throw new Error('現在の編集作品を確認してください。');
                              const revision = owner.project.revision;
                              await owner.save();
                              signal.throwIfAborted();
                              if (
                                sessionRef.current !== owner ||
                                owner.project.revision !== revision
                              )
                                throw new Error('作品が変わったため取込を中止しました。');
                              const copyId = crypto.randomUUID();
                              await repository.restoreCopy(
                                result.project,
                                result.blobs,
                                copyId,
                                ownerId.current,
                                { signal },
                              );
                              // Commit is atomic. A late cancellation keeps the saved copy, never deletes it.
                              if (
                                signal.aborted ||
                                sessionRef.current !== owner ||
                                owner.project.revision !== revision
                              ) {
                                setNotice(
                                  'GLBコピーは保存済みです。一覧から開けます。現在の画面は切り替えていません。',
                                );
                                return;
                              }
                              const entries = await repository.listProjects();
                              if (
                                signal.aborted ||
                                sessionRef.current !== owner ||
                                owner.project.revision !== revision
                              )
                                return;
                              setProjects(entries);
                              setNotice(
                                'GLBコピーを保存しました。保存したプロジェクトの Imported GLB から開けます。現在の作品は変更していません。',
                              );
                            }}
                          />
                        </Suspense>
                      )}
                    </details>
                    <NativeAssemblyControls
                      key={`assembly-${project.id}`}
                      project={project}
                      disabled={busy || state.readOnly}
                      execute={executeAuthoring}
                      edit={session.edit}
                    />
                    <div data-inspection="texture">
                      <NativeTexturePanel
                        key={`texture-${project.id}`}
                        project={project}
                        session={session}
                        disabled={busy || state.readOnly}
                        onChange={redraw}
                      />
                    </div>
                  </div>
                  {previewProjectId === project.id && (
                    <ViewportLoadBoundary key={`viewport-${project.id}`} onReload={reloadCurrent}>
                      <Suspense
                        fallback={
                          <p role="status">
                            3D表示を読み込み中… 保存・バックアップは引き続き利用できます。
                          </p>
                        }
                      >
                        <NativeViewportPanel
                          project={project}
                          editing={session.edit}
                          rigPose={session.rigPose}
                          animation={session.animation}
                          gamePreview={gamePreview}
                          readBlob={readTextureBlob}
                          factory={createNativeViewport}
                          onSave={() => session.save()}
                          onThumbnail={saveThumbnail}
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
                      現在の3D表示は三角形メッシュと基本のbaseColor画像に対応しています。手動rigとpose確認に対応します。objectと骨のclip制作・再生確認に対応します。GLBの読込・書出しと配布用ZIPに対応する開発版です。外部runtimeと実機の対応状況は、品質検査とガイドで別に確認してください。
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
      <footer className="editor3d-footer">
        <NativeBuildStatus disabled={busy} onReload={reloadCurrent} />
        <NativeDiagnosticsPanel
          appVersion={__APP_VERSION__}
          sourceRevision={__APP_REVISION__}
          sourceDirty={__APP_DIRTY__}
          schemaVersion={project?.schemaVersion ?? '0.3.0'}
          errorId={error ? 'operation-failed' : 'none'}
          feature="editor"
        />
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
