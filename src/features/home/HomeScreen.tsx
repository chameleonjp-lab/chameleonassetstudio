import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { createEmptyProject } from '../../core/model';
import {
  CasprojError,
  TRASH_LIMIT,
  assertCasprojInputSize,
  commitStagedCasprojImport,
  deleteProject,
  deleteQuarantineEntry,
  canRequestPersistentStorage,
  formatBytes,
  getPersistentStorageState,
  getStorageUsage,
  getStorageWarningLevel,
  listProjects,
  listQuarantine,
  listTrash,
  purgeAllTrash,
  purgeTrash,
  requestPersistentStorage,
  restoreProject,
  saveProject,
  saveQuarantineEntry,
  stageCasprojImport,
  type ProjectSummary,
  type PersistentStorageState,
  type QuarantineSummary,
  type StorageUsage,
  type StorageWarningLevel,
  type TrashSummary,
} from '../../core/storage';
import './home.css';

interface HomeScreenProps {
  onOpenProject: (projectId: string) => void;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const STORAGE_WARNING_MESSAGES: Record<StorageWarningLevel, string> = {
  normal: '現在は予防警告の対象ではありません。定期的な .casproj バックアップは続けてください。',
  notice:
    '保存容量の60%以上を使用しています。早めに必要なプロジェクトを .casproj で退避してください。',
  warning:
    '保存容量の80%以上を使用しています。.casproj で退避してから、不要なデータを手動で整理してください。',
  critical:
    '保存容量の90%以上を使用しています。大きな取り込みや編集の前に .casproj で退避し、不要なデータを整理してください。',
  unavailable:
    '使用率を計算できません。空き容量は推測せず、定期的な .casproj バックアップを案内します。',
};

const PERSISTENT_STORAGE_MESSAGES: Record<PersistentStorageState, string> = {
  granted: 'ブラウザによる保存領域の保護が有効です。',
  'not-granted': '保存領域は保護されていません。通常保存は利用できます。',
  unsupported: 'この環境では保存領域の保護状態を確認または要求できません。',
  error: '保存領域の保護状態を確認できませんでした。通常保存は引き続き利用できます。',
};

function formatUsagePercentage(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [trash, setTrash] = useState<TrashSummary[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineSummary[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [persistentStorage, setPersistentStorage] = useState<PersistentStorageState | null>(null);
  const [storageRefreshing, setStorageRefreshing] = useState(false);
  const [persistRequesting, setPersistRequesting] = useState(false);
  const [storageActionMessage, setStorageActionMessage] = useState<{
    type: 'status' | 'error';
    text: string;
  } | null>(null);
  const [newName, setNewName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importMigrations, setImportMigrations] = useState<string[]>([]);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  const refreshStorage = useCallback(async () => {
    setStorageRefreshing(true);
    try {
      const [nextUsage, nextPersistentStorage] = await Promise.all([
        getStorageUsage(),
        getPersistentStorageState(),
      ]);
      setUsage(nextUsage);
      setPersistentStorage(nextPersistentStorage);
    } finally {
      setStorageRefreshing(false);
    }
  }, []);

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
    await refreshStorage();
  }, [refreshStorage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRequestPersistentStorage = async () => {
    setPersistRequesting(true);
    setStorageActionMessage(null);
    const nextState = await requestPersistentStorage();
    setPersistentStorage(nextState);
    if (nextState === 'granted') {
      setStorageActionMessage({ type: 'status', text: '保存領域の保護が有効になりました。' });
    } else if (nextState === 'not-granted') {
      setStorageActionMessage({
        type: 'status',
        text: '保存領域の保護は許可されませんでした。通常保存は引き続き利用できます。',
      });
    } else if (nextState === 'unsupported') {
      setStorageActionMessage({
        type: 'status',
        text: 'この環境では保存領域の保護を要求できません。',
      });
    } else {
      setStorageActionMessage({
        type: 'error',
        text: '保存領域の保護を要求できませんでした。通常保存は引き続き利用できます。',
      });
    }
    setPersistRequesting(false);
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const warningLevel = usage ? getStorageWarningLevel(usage) : 'unavailable';

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
    setImportMigrations([]);
    setImportSuccessMessage(null);
    let sourceBytes: ArrayBuffer | null = null;
    try {
      assertCasprojInputSize(file.size);
      sourceBytes = await file.arrayBuffer();
      const staged = await stageCasprojImport(sourceBytes);
      await commitStagedCasprojImport(staged);
      await reload();
      setImportWarnings(staged.warnings);
      setImportMigrations(staged.appliedMigrations);
      setImportSuccessMessage(
        `「${staged.project.name}」を新しいcopyとして読み込みました。元の.casprojファイルは変更されていません。`,
      );
    } catch (error) {
      const importErrorMessage = `.casproj を読み込めませんでした: ${toErrorMessage(error)} 既存の保存済みプロジェクトは変更されていません。`;
      // 壊れた・不正な .casproj は正本ストアへ一切書き込まず、隔離領域へ退避する（2D-1B-STORAGE §E）。
      if (error instanceof CasprojError) {
        try {
          await saveQuarantineEntry({
            fileName: file.name,
            errorMessage: toErrorMessage(error),
            ...(sourceBytes ? { bytes: sourceBytes } : { size: file.size }),
          });
          await reload();
        } catch {
          // 隔離領域への保存に失敗しても、元のエラー表示は変えない
        }
      }
      setErrorMessage(importErrorMessage);
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

      <section className="home-section home-storage" aria-label="保存容量">
        <div className="home-section-header">
          <h2>保存容量</h2>
          <button type="button" onClick={() => void refreshStorage()} disabled={storageRefreshing}>
            {storageRefreshing ? '確認中…' : '容量を再確認'}
          </button>
        </div>

        {usage === null ? (
          <p role="status">保存容量を確認しています。</p>
        ) : (
          <div className="home-storage-details">
            {usage.status === 'available' ? (
              <p>
                使用量: {usage.usageBytes !== null ? formatBytes(usage.usageBytes) : '取得不能'} /{' '}
                {usage.quotaBytes !== null ? formatBytes(usage.quotaBytes) : '取得不能'}
                {usage.usageRatio !== null
                  ? `（${formatUsagePercentage(usage.usageRatio)}）`
                  : '（使用率は計算できません）'}
              </p>
            ) : usage.status === 'unsupported' ? (
              <p>この環境は使用量の取得に対応していません。</p>
            ) : (
              <p>使用量の取得中にエラーが発生しました。</p>
            )}
            <p className="home-storage-note">
              この値はブラウザによる推定であり、次の保存成功や実際の空き容量を保証しません。
            </p>
          </div>
        )}

        <div className={`home-storage-warning home-storage-warning--${warningLevel}`} role="status">
          <strong>
            {warningLevel === 'normal'
              ? '通常'
              : warningLevel === 'notice'
                ? 'お知らせ'
                : warningLevel === 'warning'
                  ? '警告'
                  : warningLevel === 'critical'
                    ? '重要な警告'
                    : '使用率不明'}
          </strong>
          <p>{STORAGE_WARNING_MESSAGES[warningLevel]}</p>
        </div>

        <div className="home-persistent-storage">
          <h3>保存領域の保護</h3>
          <p role="status">
            {persistentStorage === null
              ? '保護状態を確認しています。'
              : PERSISTENT_STORAGE_MESSAGES[persistentStorage]}
          </p>
          {persistentStorage === 'not-granted' && canRequestPersistentStorage() && (
            <button
              type="button"
              onClick={() => void handleRequestPersistentStorage()}
              disabled={persistRequesting}
            >
              {persistRequesting ? '要求中…' : '保存領域の保護を要求'}
            </button>
          )}
        </div>

        {storageActionMessage && (
          <p
            className={storageActionMessage.type === 'error' ? 'home-error' : 'home-storage-note'}
            role={storageActionMessage.type === 'error' ? 'alert' : 'status'}
          >
            {storageActionMessage.text}
          </p>
        )}

        <div className="home-storage-guidance">
          <h3>容量を確保する前に</h3>
          <p>
            必要なプロジェクトを開き、編集画面の「.casproj をダウンロード」で退避してください。
            退避を確認してから、ごみ箱や不要なデータを手動で整理します。
          </p>
          <div className="home-storage-actions">
            <button
              type="button"
              onClick={() => scrollToSection('home-projects')}
              disabled={!projects || projects.length === 0}
            >
              バックアップするプロジェクトを選ぶ
            </button>
            {trash.length > 0 && (
              <button type="button" onClick={() => scrollToSection('home-trash')}>
                ごみ箱を確認
              </button>
            )}
            {quarantine.length > 0 && (
              <button type="button" onClick={() => scrollToSection('home-quarantine')}>
                読み込み失敗データを確認
              </button>
            )}
          </div>
        </div>
      </section>

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
            <h3>互換性に関する警告</h3>
            {importWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        {importMigrations.length > 0 && (
          <div className="home-import-warnings" role="status">
            <h3>適用したmigration</h3>
            {importMigrations.map((migration) => (
              <p key={migration}>{migration}</p>
            ))}
          </div>
        )}
        {importSuccessMessage && <p role="status">{importSuccessMessage}</p>}
      </section>

      <section id="home-projects" className="home-section" aria-label="プロジェクト一覧">
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
        <section id="home-trash" className="home-section" aria-label="ごみ箱">
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
        <section
          id="home-quarantine"
          className="home-section"
          aria-label="読み込みに失敗したファイル"
        >
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
    </main>
  );
}
