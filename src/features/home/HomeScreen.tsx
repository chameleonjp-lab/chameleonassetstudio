import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { blobKeyFor } from '../../core/images/importImage';
import { createEmptyProject, generateId } from '../../core/model';
import {
  CasprojError,
  TRASH_LIMIT,
  deleteProject,
  deleteQuarantineEntry,
  formatBytes,
  getStorageUsage,
  importCasproj,
  listProjects,
  listQuarantine,
  listTrash,
  purgeAllTrash,
  purgeTrash,
  restoreProject,
  saveProject,
  saveProjectBundle,
  saveQuarantineEntry,
  type ProjectSummary,
  type QuarantineSummary,
  type StorageUsage,
  type TrashSummary,
} from '../../core/storage';
import './home.css';

interface HomeScreenProps {
  onOpenProject: (projectId: string) => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [trash, setTrash] = useState<TrashSummary[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineSummary[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [newName, setNewName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`プロジェクト一覧を読み込めませんでした: ${toErrorMessage(error)}`);
    }
    try {
      setTrash(await listTrash());
    } catch {
      // ごみ箱一覧の取得失敗はプロジェクト一覧の表示を止めない
    }
    try {
      setQuarantine(await listQuarantine());
    } catch {
      // 隔離一覧の取得失敗もプロジェクト一覧の表示を止めない
    }
    setUsage(await getStorageUsage());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const project = createEmptyProject(newName.trim() || '新しいプロジェクト');
      await saveProject(project);
      onOpenProject(project.id);
    } catch (error) {
      setErrorMessage(`プロジェクトを作成できませんでした: ${toErrorMessage(error)}`);
      setCreating(false);
    }
  };

  const handleImportCasproj = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    const file = files[0];
    if (!file) {
      return;
    }
    setImporting(true);
    setErrorMessage(null);
    setImportWarnings([]);
    try {
      const { bundle, warnings } = await importCasproj(file);
      // 既存プロジェクトや Blob キーとの ID 衝突を避けるため、常に ID を再採番する
      const assetIdMap = new Map(bundle.assets.map((asset) => [asset.id, generateId('asset')]));
      const project = {
        ...bundle.project,
        // asset 本体（assets/*/asset.json）が無い entry は dangling になるため除外する
        id: generateId('project'),
        assets: bundle.project.assets
          .filter((entry) => assetIdMap.has(entry.id))
          .map((entry) => ({
            ...entry,
            id: assetIdMap.get(entry.id)!,
          })),
      };
      const renamedAssets = bundle.assets.map((asset) => ({
        ...asset,
        id: assetIdMap.get(asset.id)!,
      }));
      const blobs = bundle.files.flatMap((entry) => {
        const match = /^assets\/([^/]+)\/(.+)$/.exec(entry.path);
        if (!match) {
          return [];
        }
        const newAssetId = assetIdMap.get(match[1]);
        if (!newAssetId) {
          return [];
        }
        const mimeType = bundle.assets
          .find((asset) => asset.id === match[1])
          ?.textures.find((texture) => texture.path === match[2])?.mimeType;
        return [
          {
            key: blobKeyFor(newAssetId, match[2]),
            blob: new Blob(
              [entry.bytes.slice().buffer as ArrayBuffer],
              mimeType ? { type: mimeType } : {},
            ),
          },
        ];
      });
      // project + assets + blobs を単一トランザクションで保存する（2D-1B-STORAGE §A）。
      // 途中で失敗しても一部だけ保存された不整合な状態が残らない。
      await saveProjectBundle(project, renamedAssets, blobs);
      await reload();
      setImportWarnings(warnings);
    } catch (error) {
      setErrorMessage(`.casproj を読み込めませんでした: ${toErrorMessage(error)}`);
      // 壊れた・不正な .casproj は正本ストアへ一切書き込まず、隔離領域へ退避する（2D-1B-STORAGE §E）。
      if (error instanceof CasprojError) {
        try {
          await saveQuarantineEntry({
            fileName: file.name,
            errorMessage: toErrorMessage(error),
            bytes: await file.arrayBuffer(),
          });
          await reload();
        } catch {
          // 隔離領域への保存に失敗しても、元のエラー表示は変えない
        }
      }
    }
    setImporting(false);
  };

  const handleDelete = async (summary: ProjectSummary) => {
    const ok = window.confirm(
      `プロジェクト「${summary.name}」をごみ箱へ移動します。ごみ箱から復元できます。`,
    );
    if (!ok) {
      return;
    }
    try {
      await deleteProject(summary.id);
      await reload();
    } catch (error) {
      setErrorMessage(`プロジェクトを削除できませんでした: ${toErrorMessage(error)}`);
    }
  };

  const handleRestoreTrash = async (entry: TrashSummary) => {
    try {
      await restoreProject(entry.id);
      await reload();
    } catch (error) {
      setErrorMessage(`プロジェクトを復元できませんでした: ${toErrorMessage(error)}`);
    }
  };

  const handlePurgeTrash = async (entry: TrashSummary) => {
    const ok = window.confirm(
      `プロジェクト「${entry.name}」を完全に削除します。この操作は取り消せません。よろしいですか？`,
    );
    if (!ok) {
      return;
    }
    try {
      await purgeTrash(entry.id);
      await reload();
    } catch (error) {
      setErrorMessage(`完全に削除できませんでした: ${toErrorMessage(error)}`);
    }
  };

  const handlePurgeAllTrash = async () => {
    const ok = window.confirm('ごみ箱を空にします。この操作は取り消せません。よろしいですか？');
    if (!ok) {
      return;
    }
    try {
      await purgeAllTrash();
      await reload();
    } catch (error) {
      setErrorMessage(`ごみ箱を空にできませんでした: ${toErrorMessage(error)}`);
    }
  };

  const handleDeleteQuarantineEntry = async (entry: QuarantineSummary) => {
    try {
      await deleteQuarantineEntry(entry.id);
      await reload();
    } catch (error) {
      setErrorMessage(`削除できませんでした: ${toErrorMessage(error)}`);
    }
  };

  return (
    <main className="home">
      <header className="home-header">
        <h1>Chameleon Asset Studio</h1>
        <p>ブラウザゲーム用 2D アセット制作ツール</p>
      </header>

      {errorMessage && (
        <p className="home-error" role="alert">
          {errorMessage}
        </p>
      )}

      <section className="home-section" aria-label="新規プロジェクト">
        <h2>新規プロジェクト</h2>
        <div className="home-create">
          <label>
            プロジェクト名
            <input
              type="text"
              value={newName}
              placeholder="新しいプロジェクト"
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <button type="button" onClick={handleCreate} disabled={creating}>
            作成
          </button>
        </div>
      </section>

      <section className="home-section" aria-label="プロジェクトの読み込み">
        <h2>プロジェクトの読み込み</h2>
        <div className="home-import">
          <label className="home-import-button">
            .casproj を読み込む
            <input
              type="file"
              accept=".casproj,application/zip"
              className="visually-hidden-input"
              disabled={importing}
              onChange={(event) => void handleImportCasproj(event)}
            />
          </label>
          {importing && <p className="home-import-status">読み込み中…</p>}
        </div>
        {importWarnings.length > 0 && (
          <div className="home-import-warnings" role="status">
            {importWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </section>

      <section className="home-section" aria-label="プロジェクト一覧">
        <h2>プロジェクト一覧</h2>
        {projects === null && <p>読み込み中…</p>}
        {projects !== null && projects.length === 0 && <p>保存済みのプロジェクトはありません。</p>}
        {projects !== null && projects.length > 0 && (
          <ul className="home-list">
            {projects.map((summary) => (
              <li key={summary.id} className="home-list-item">
                <div className="home-item-main">
                  <span className="home-item-name">{summary.name}</span>
                  <span className="home-item-meta">
                    アセット {summary.assetCount} 件 / 更新{' '}
                    {new Date(summary.updatedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <div className="home-item-actions">
                  <button
                    type="button"
                    onClick={() => onOpenProject(summary.id)}
                    aria-label={`「${summary.name}」を開く`}
                  >
                    開く
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(summary)}
                    aria-label={`「${summary.name}」を削除`}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trash.length > 0 && (
        <section className="home-section" aria-label="ごみ箱">
          <div className="home-section-header">
            <h2>ごみ箱</h2>
            <button type="button" onClick={() => void handlePurgeAllTrash()}>
              ごみ箱を空にする
            </button>
          </div>
          <p className="editor-note">
            削除したプロジェクトは最大 {TRASH_LIMIT} 件までごみ箱に残り、復元できます。
          </p>
          <ul className="home-list">
            {trash.map((entry) => (
              <li key={entry.id} className="home-list-item">
                <div className="home-item-main">
                  <span className="home-item-name">{entry.name}</span>
                  <span className="home-item-meta">
                    アセット {entry.assetCount} 件 / 削除{' '}
                    {new Date(entry.deletedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <div className="home-item-actions">
                  <button
                    type="button"
                    onClick={() => void handleRestoreTrash(entry)}
                    aria-label={`ごみ箱の「${entry.name}」を復元`}
                  >
                    復元
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePurgeTrash(entry)}
                    aria-label={`ごみ箱の「${entry.name}」を完全に削除`}
                  >
                    完全に削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {quarantine.length > 0 && (
        <section className="home-section" aria-label="読み込みに失敗したファイル">
          <h2>読み込みに失敗したファイル</h2>
          <ul className="home-list">
            {quarantine.map((entry) => (
              <li key={entry.id} className="home-list-item">
                <div className="home-item-main">
                  <span className="home-item-name">{entry.fileName}</span>
                  <span className="home-item-meta">
                    {new Date(entry.importedAt).toLocaleString('ja-JP')} / {entry.errorMessage}
                  </span>
                </div>
                <div className="home-item-actions">
                  <button
                    type="button"
                    onClick={() => void handleDeleteQuarantineEntry(entry)}
                    aria-label={`「${entry.fileName}」を削除`}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="home-storage">
        {usage?.supported && usage.usageBytes !== null ? (
          <p>
            ストレージ使用量: {formatBytes(usage.usageBytes)}
            {usage.quotaBytes !== null ? ` / ${formatBytes(usage.quotaBytes)}` : ''}
          </p>
        ) : (
          <p>ストレージ使用量: この環境では取得できません</p>
        )}
      </footer>
    </main>
  );
}
