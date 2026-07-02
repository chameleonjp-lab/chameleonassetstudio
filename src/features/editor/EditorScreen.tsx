import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { History } from '../../core/history/history';
import { importImageFile } from '../../core/images/importImage';
import type { Asset, Project } from '../../core/model';
import {
  AutosaveQueue,
  listProjectAssets,
  loadProject,
  saveAsset,
  saveBlob,
  saveProject,
  type SaveState,
} from '../../core/storage';
import { CanvasEditor, type CanvasTool } from './CanvasEditor';
import './editor.css';

type MobileView = 'canvas' | 'properties' | 'timeline' | 'export';

interface EditorScreenProps {
  projectId: string;
  onBackToHome: () => void;
}

function useSaveState(queue: AutosaveQueue): SaveState {
  const subscribe = useCallback((onChange: () => void) => queue.subscribe(onChange), [queue]);
  return useSyncExternalStore(subscribe, () => queue.getState());
}

function saveStatusText(state: SaveState): string {
  switch (state.status) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return '保存済み';
    case 'error':
      return `保存失敗: ${state.errorMessage ?? '不明なエラー'}`;
    default:
      return '';
  }
}

function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

const IMPORT_ACCEPT = 'image/png,image/jpeg,image/webp';

export function EditorScreen({ projectId, onBackToHome }: EditorScreenProps) {
  const autosaveRef = useRef<AutosaveQueue | null>(null);
  autosaveRef.current ??= new AutosaveQueue();
  const autosave = autosaveRef.current;
  const saveState = useSaveState(autosave);

  const historyRef = useRef<History | null>(null);
  historyRef.current ??= new History();
  const history = historyRef.current;
  const subscribeHistory = useCallback(
    (onChange: () => void) => history.subscribe(onChange),
    [history],
  );
  const historyState = useSyncExternalStore(subscribeHistory, () => history.getState());

  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const layerEditBeforeRef = useRef<Asset | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProject(projectId), listProjectAssets(projectId)])
      .then(([{ project: loaded }, loadedAssets]) => {
        if (cancelled) {
          return;
        }
        setProject(loaded);
        setAssets(loadedAssets);
        setSelectedAssetId(loadedAssets[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const selectedLayer = selectedAsset?.layers.find((layer) => layer.id === selectedLayerId) ?? null;

  /** アセットのスナップショットを適用して自動保存する（Undo / Redo からも使う）。 */
  const applyAssetSnapshot = useCallback(
    (snapshot: Asset) => {
      setAssets((prev) => prev.map((asset) => (asset.id === snapshot.id ? snapshot : asset)));
      autosave.schedule(() => saveAsset(projectId, snapshot));
    },
    [autosave, projectId],
  );

  /** 変更を適用し、履歴へ積む。 */
  const commitAssetChange = useCallback(
    (label: string, before: Asset, next: Asset) => {
      applyAssetSnapshot(next);
      history.push({
        label,
        undo: () => applyAssetSnapshot(before),
        redo: () => applyAssetSnapshot(next),
      });
    },
    [applyAssetSnapshot, history],
  );

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y で Undo / Redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        history.undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history]);

  const handleFiles = async (files: Iterable<File>) => {
    if (!project) {
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      let currentProject = project;
      for (const file of Array.from(files)) {
        const result = await importImageFile(file);
        for (const { key, blob } of result.blobs) {
          await saveBlob(currentProject.id, key, blob);
        }
        await saveAsset(currentProject.id, result.asset);
        currentProject = {
          ...currentProject,
          assets: [
            ...currentProject.assets,
            {
              id: result.asset.id,
              name: result.asset.name,
              displayName: result.asset.displayName,
              assetType: result.asset.assetType,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
        await saveProject(currentProject);
        setAssets((prev) => [...prev, result.asset]);
        setSelectedAssetId(result.asset.id);
        setSelectedLayerId(null);
      }
      setProject(currentProject);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
    // 同じファイルをもう一度選べるようにする
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) {
      void handleFiles(event.dataTransfer.files);
    }
  };

  const handleRename = (name: string) => {
    if (!project) {
      return;
    }
    const next: Project = { ...project, name, updatedAt: new Date().toISOString() };
    setProject(next);
    autosave.schedule(() => saveProject(next));
  };

  /** 数値入力によるレイヤー変形の更新（フォーカス中は履歴に積まず、blur で確定する）。 */
  const handleLayerTransformChange = (
    field: 'x' | 'y' | 'scale' | 'rotation',
    rawValue: string,
  ) => {
    if (!selectedAsset || !selectedLayer) {
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return;
    }
    const next: Asset = {
      ...selectedAsset,
      updatedAt: new Date().toISOString(),
      layers: selectedAsset.layers.map((layer) => {
        if (layer.id !== selectedLayer.id) {
          return layer;
        }
        const transform = { ...layer.transform };
        if (field === 'x') {
          transform.position = { ...transform.position, x: value };
        } else if (field === 'y') {
          transform.position = { ...transform.position, y: value };
        } else if (field === 'scale') {
          const scale = Math.max(0.01, value / 100);
          transform.scale = { x: scale, y: scale };
        } else {
          transform.rotation = value;
        }
        return { ...layer, transform };
      }),
    };
    applyAssetSnapshot(next);
  };

  const beginLayerEdit = () => {
    layerEditBeforeRef.current = selectedAsset;
  };

  const commitLayerEdit = () => {
    const before = layerEditBeforeRef.current;
    layerEditBeforeRef.current = null;
    const current = assets.find((asset) => asset.id === before?.id);
    if (!before || !current || before === current) {
      return;
    }
    if (JSON.stringify(before.layers) === JSON.stringify(current.layers)) {
      return;
    }
    history.push({
      label: '数値編集',
      undo: () => applyAssetSnapshot(before),
      redo: () => applyAssetSnapshot(current),
    });
  };

  const handleBack = async () => {
    await autosave.flush();
    onBackToHome();
  };

  if (loadError) {
    return (
      <main className="editor-load-error">
        <h1>プロジェクトを開けませんでした</h1>
        <p role="alert">{loadError}</p>
        <button type="button" onClick={onBackToHome}>
          ホームへ戻る
        </button>
      </main>
    );
  }

  const mobileNavItems: Array<{ view: MobileView; label: string }> = [
    { view: 'canvas', label: '編集' },
    { view: 'properties', label: 'プロパティ' },
    { view: 'timeline', label: 'タイムライン' },
    { view: 'export', label: '書き出し' },
  ];

  return (
    <div className="editor">
      <header className="editor-topbar">
        <button type="button" onClick={handleBack}>
          ← ホーム
        </button>
        <h1 className="editor-title">{project?.name ?? '読み込み中…'}</h1>
        <div className="editor-history-buttons">
          <button
            type="button"
            disabled={!historyState.canUndo}
            onClick={() => history.undo()}
            title={historyState.undoLabel ?? undefined}
          >
            元に戻す
          </button>
          <button
            type="button"
            disabled={!historyState.canRedo}
            onClick={() => history.redo()}
            title={historyState.redoLabel ?? undefined}
          >
            やり直す
          </button>
        </div>
        <p className="editor-save-status" role="status">
          {saveStatusText(saveState)}
        </p>
        <div className="editor-panel-toggles">
          <button type="button" aria-pressed={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
            ツール
          </button>
          <button type="button" aria-pressed={rightOpen} onClick={() => setRightOpen((v) => !v)}>
            プロパティ
          </button>
        </div>
      </header>

      <div className="editor-body">
        <nav
          className={`editor-toolbar editor-side${leftOpen ? '' : ' collapsed'}`}
          aria-label="ツール"
        >
          <button type="button" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
            選択
          </button>
          <button type="button" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>
            パン
          </button>
          <button type="button" disabled>
            トリミング
          </button>
          <button type="button" disabled>
            消しゴム
          </button>
          <p className="editor-note">編集ツールは Phase 6 以降で実装します。</p>
        </nav>

        <section
          className={`editor-canvas-area${mobileView === 'canvas' ? ' mobile-active' : ''}`}
          aria-label="キャンバス"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {selectedAsset ? (
            <div className={`canvas-editor-frame${dragOver ? ' drag-over' : ''}`}>
              <CanvasEditor
                asset={selectedAsset}
                tool={tool}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onCommitAsset={commitAssetChange}
              />
              {importing && <p className="import-status">取り込み中…</p>}
              {importError && (
                <p className="import-error" role="alert">
                  {importError}
                </p>
              )}
            </div>
          ) : (
            <div className={`canvas-placeholder${dragOver ? ' drag-over' : ''}`}>
              <div className="import-zone">
                <p>画像をここへドラッグ&ドロップ</p>
                <label className="import-button">
                  画像を選ぶ
                  <input
                    type="file"
                    accept={IMPORT_ACCEPT}
                    multiple
                    onChange={handleFileInput}
                    className="visually-hidden-input"
                  />
                </label>
                <p className="editor-note">
                  PNG / JPG / WebP に対応。1 枚あたり 25MB、4096 x 4096 までです。
                </p>
              </div>
              {importing && <p className="import-status">取り込み中…</p>}
              {importError && (
                <p className="import-error" role="alert">
                  {importError}
                </p>
              )}
            </div>
          )}
        </section>

        <aside
          className={`editor-properties editor-side${rightOpen ? '' : ' collapsed'}${
            mobileView === 'properties' ? ' mobile-active' : ''
          }`}
          aria-label="プロパティ"
        >
          <h2>プロパティ</h2>
          <label className="editor-field">
            プロジェクト名
            <input
              type="text"
              value={project?.name ?? ''}
              disabled={!project}
              onChange={(event) => handleRename(event.target.value)}
            />
          </label>

          <h3 className="editor-subheading">選択中レイヤー</h3>
          {selectedLayer ? (
            <div className="layer-fields">
              <p className="layer-name">{selectedLayer.name}</p>
              <label className="editor-field">
                X
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.position.x)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('x', event.target.value)}
                />
              </label>
              <label className="editor-field">
                Y
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.position.y)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('y', event.target.value)}
                />
              </label>
              <label className="editor-field">
                拡大率（%）
                <input
                  type="number"
                  min={1}
                  value={roundValue(selectedLayer.transform.scale.x * 100)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('scale', event.target.value)}
                />
              </label>
              <label className="editor-field">
                回転（度）
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.rotation)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('rotation', event.target.value)}
                />
              </label>
            </div>
          ) : (
            <p className="editor-note">キャンバス上のレイヤーをクリックすると選択できます。</p>
          )}

          <h3 className="editor-subheading">アセット</h3>
          {assets.length === 0 ? (
            <p className="editor-note">画像を取り込むとアセットとして追加されます。</p>
          ) : (
            <ul className="asset-list">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    aria-pressed={asset.id === selectedAsset?.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setSelectedLayerId(null);
                    }}
                  >
                    {asset.displayName}
                  </button>
                  <span className="asset-meta">
                    {asset.canvasSize.width} x {asset.canvasSize.height}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className="import-button">
            画像を追加
            <input
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              onChange={handleFileInput}
              className="visually-hidden-input"
            />
          </label>
        </aside>
      </div>

      <footer
        className={`editor-timeline${mobileView === 'timeline' ? ' mobile-active' : ''}`}
        aria-label="タイムライン"
      >
        <h2>タイムライン</h2>
        <button type="button" disabled>
          フレーム追加
        </button>
        <p className="editor-note">フレームとアニメーションは Phase 9 で実装します。</p>
      </footer>

      <section
        className={`editor-export${mobileView === 'export' ? ' mobile-active' : ''}`}
        aria-label="書き出し"
      >
        <h2>書き出し</h2>
        <p className="editor-note">書き出しは Phase 10 で実装します。</p>
      </section>

      <nav className="editor-mobile-nav" aria-label="画面切り替え">
        <button type="button" onClick={handleBack}>
          ホーム
        </button>
        {mobileNavItems.map((item) => (
          <button
            key={item.view}
            type="button"
            aria-pressed={mobileView === item.view}
            onClick={() => setMobileView(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
