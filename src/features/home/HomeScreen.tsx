import { useCallback, useEffect, useState } from 'react';
import { createEmptyProject } from '../../core/model';
import {
  deleteProject,
  formatBytes,
  getStorageUsage,
  listProjects,
  saveProject,
  type ProjectSummary,
  type StorageUsage,
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
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [newName, setNewName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProjects(await listProjects());
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(`プロジェクト一覧を読み込めませんでした: ${toErrorMessage(error)}`);
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

  const handleDelete = async (summary: ProjectSummary) => {
    const ok = window.confirm(
      `プロジェクト「${summary.name}」を削除します。この操作は取り消せません。よろしいですか？`,
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
