import { useEffect, useRef, useState } from 'react';
import type { Asset, Project } from '../../core/model';
import {
  DEFAULT_RICH_DISTRIBUTION_SETTINGS,
  readRichDistributionSettings,
  withRichDistributionSettings,
  type RichDistributionSettings,
} from '../../core/model/exportPreset';
import { downloadBlob } from '../../core/export/exportAsset';
import {
  exportRichDistributionZip,
  RICH_DISTRIBUTION_MAX_ASSETS,
  inspectRichDistributionPreflight,
} from '../../core/export/exportRichDistribution';
import {
  AutosaveQueue,
  loadProjectExportPresets,
  saveProjectExportPresets,
} from '../../core/storage';

interface Props {
  asset: Asset;
  project: Project;
  projectAssets: Asset[];
}

/** Remount on project/current-asset navigation so selection and asynchronous work stay scoped. */
export function RichDistributionExportPanel(props: Props) {
  return <RichDistributionControls key={`${props.project.id}/${props.asset.id}`} {...props} />;
}

function RichDistributionControls({ asset, project, projectAssets }: Props) {
  const [settings, setSettings] = useState<RichDistributionSettings>({
    ...DEFAULT_RICH_DISTRIBUTION_SETTINGS,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([asset.id]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  // Current edited asset takes precedence over a project-list snapshot.
  const available = [...new Map([...projectAssets, asset].map((item) => [item.id, item])).values()];
  const selected = available.filter((item) => selectedIds.includes(item.id));
  const checks = selected.map((item) => ({
    asset: item,
    result: inspectRichDistributionPreflight(item, settings),
  }));
  const valid =
    selected.length > 0 &&
    selected.length <= RICH_DISTRIBUTION_MAX_ASSETS &&
    selected.length === selectedIds.length &&
    checks.every((check) => check.result.valid);

  useEffect(() => {
    active.current = true;
    let current = true;
    void loadProjectExportPresets(project.id)
      .then((file) => {
        if (current) setSettings(readRichDistributionSettings(file));
      })
      .catch((cause: unknown) => {
        if (current) setError(`出力設定を読み込めませんでした: ${message(cause)}`);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      active.current = false;
      operation.current?.abort();
    };
  }, [project.id]);

  // Editing or replacing the source while output is pending invalidates that output.
  useEffect(() => {
    return () => {
      operation.current?.abort();
    };
  }, [asset, projectAssets]);

  const cancel = () => {
    operation.current?.abort();
    setStatus('出力を取り消しました。ダウンロードは開始しません。');
  };
  const changeSelection = (id: string, checked: boolean) => {
    operation.current?.abort();
    setSelectedIds((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
    setStatus(null);
    setError(null);
  };
  const changeSettings = (patch: Partial<RichDistributionSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
    setStatus(null);
    setError(null);
  };
  const save = async () => {
    if (saveLock.current || loading || operation.current) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      // Read at explicit save time rather than overwriting from an old initial snapshot.
      const file = await loadProjectExportPresets(project.id);
      if (!active.current) return;
      await saveProjectExportPresets(project.id, withRichDistributionSettings(file, settings));
      if (active.current) setStatus('出力設定を保存しました。.casprojにも含まれます。');
    } catch (cause) {
      if (active.current) setError(`出力設定を保存できませんでした: ${message(cause)}`);
    } finally {
      saveLock.current = false;
      if (active.current) setSaving(false);
    }
  };
  const run = async () => {
    if (operation.current || saveLock.current || loading || !valid) return;
    const controller = new AbortController();
    operation.current = controller; // Synchronous lock also covers repeated clicks before React renders.
    setBusy(true);
    setError(null);
    setStatus('新版配布用ZIPを準備中…');
    try {
      await AutosaveQueue.flushAll();
      if (controller.signal.aborted || !active.current) return;
      const blob = await exportRichDistributionZip(selected, {
        ...settings,
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (active.current && !controller.signal.aborted) {
            setStatus(`新版配布用ZIPを準備中… ${completed}/${total}`);
          }
        },
      });
      if (controller.signal.aborted || !active.current) return;
      downloadBlob(blob, 'chameleon-distribution-0.2.zip');
      setStatus('「chameleon-distribution-0.2.zip」のダウンロードを開始しました。');
    } catch (cause) {
      if (active.current && !controller.signal.aborted) {
        setError(`新版配布用ZIPを作れませんでした: ${message(cause)}`);
        setStatus(null);
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (active.current) {
        setBusy(false);
        if (controller.signal.aborted)
          setStatus('出力を取り消しました。ダウンロードは開始しません。');
      }
    }
  };

  return (
    <section className="export-option" aria-label="新版配布用ZIP">
      <h3>ゲーム情報付き配布用ZIP（0.2）</h3>
      <p>
        コマごとの表示時間・イベント・当たり判定を保持します。複数素材はID別のフォルダーにまとめます。
      </p>
      <fieldset className="editor-fieldset" disabled={loading || saving}>
        <legend>出力する素材</legend>
        {available.map((item) => (
          <label key={item.id} className="editor-field">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={(event) => changeSelection(item.id, event.target.checked)}
            />
            {item.name}（{item.id}）
          </label>
        ))}
      </fieldset>
      <fieldset className="editor-fieldset" disabled={busy || loading || saving}>
        <legend>新版の出力設定</legend>
        <label className="editor-field">
          利用先
          <select
            aria-label="新版配布の利用先"
            value={settings.target}
            onChange={(event) =>
              changeSettings({ target: event.target.value as RichDistributionSettings['target'] })
            }
          >
            <option value="canvas2d">通常Web（Canvas）</option>
            <option value="pixijs">PixiJS</option>
            <option value="phaser">Phaser</option>
          </select>
        </label>
        <label className="editor-field">
          画像の配置
          <select
            aria-label="新版配布画像の配置"
            value={settings.profile}
            onChange={(event) =>
              changeSettings({ profile: event.target.value as RichDistributionSettings['profile'] })
            }
          >
            <option value="fixed-grid">固定の格子</option>
            <option value="packed">透明な余白を除いて配置</option>
          </select>
        </label>
        <label className="editor-field">
          出力倍率
          <select
            aria-label="新版配布画像の倍率"
            value={settings.scale}
            onChange={(event) => changeSettings({ scale: Number(event.target.value) })}
          >
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {value}倍
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          画像間の余白（px）
          <input
            aria-label="新版配布画像間の余白"
            type="number"
            min={0}
            max={64}
            step={1}
            value={settings.padding}
            onChange={(event) => changeSettings({ padding: Number(event.target.value) })}
          />
        </label>
        <button type="button" onClick={() => void save()}>
          出力設定を保存
        </button>
      </fieldset>
      <p>選択中: {selected.length}素材。設定は「出力設定を保存」でこのプロジェクトに保存します。</p>
      {checks.some((check) => check.result.issues.length > 0) && (
        <ul aria-label="新版配布前の確認">
          {checks.flatMap((check) =>
            check.result.issues.map((issue, index) => (
              <li key={`${check.asset.id}/${index}`}>
                {check.asset.name}（{check.asset.id}）:{' '}
                {issue.severity === 'block' ? '出力できません: ' : '注意: '}
                {issue.message}
              </li>
            )),
          )}
        </ul>
      )}
      {selected.length > RICH_DISTRIBUTION_MAX_ASSETS && (
        <p role="alert">素材は{RICH_DISTRIBUTION_MAX_ASSETS}件以内で選んでください。</p>
      )}
      {selected.length === 0 && <p>出力する素材を1つ以上選んでください。</p>}
      <button
        type="button"
        disabled={busy || loading || saving || !valid}
        onClick={() => void run()}
      >
        新版配布用ZIPをダウンロード
      </button>
      {busy && (
        <button type="button" onClick={cancel}>
          新版配布出力を取り消す
        </button>
      )}
      {loading && <p role="status">出力設定を読み込み中…</p>}
      {saving && <p role="status">出力設定を保存中…</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
