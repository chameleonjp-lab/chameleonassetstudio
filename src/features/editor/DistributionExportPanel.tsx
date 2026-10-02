import { useState } from 'react';
import type { Asset } from '../../core/model';
import {
  downloadBlob,
  exportDistributionZip,
  getDistributionZipFileName,
} from '../../core/export/exportAsset';
import { inspectDistributionPreflight } from '../../core/export/preflight';
import { AutosaveQueue } from '../../core/storage';

/** Existing distribution format only; richer animation information still requires D3. */
export function DistributionExportPanel({ asset }: { asset: Asset }) {
  const [profile, setProfile] = useState<'fixed-grid' | 'packed'>('fixed-grid');
  const [scale, setScale] = useState(1);
  const [padding, setPadding] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<string | null>(null);
  const preflight = inspectDistributionPreflight(asset, { profile, scale, padding });
  const run = async () => {
    setBusy(true);
    setError(null);
    setComplete(null);
    try {
      await AutosaveQueue.flushAll();
      const blob = await exportDistributionZip(asset, { profile, scale, padding });
      const name = getDistributionZipFileName(asset, scale);
      downloadBlob(blob, name);
      setComplete(name);
    } catch (cause) {
      setError(
        `配布用ZIPを作れませんでした: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="export-option" aria-label="配布用ZIP">
      <h3>ゲーム向けの画像配置</h3>
      <p>
        選択素材の全コマをページへ配置し、座標情報と利用手順をまとめます。通常Webの見本とPixiJS・Phaser向け補助ファイルを含みます。
      </p>
      <fieldset disabled={busy} className="editor-fieldset">
        <label className="editor-field">
          画像の配置
          <select
            aria-label="配布画像の配置"
            value={profile}
            onChange={(event) => setProfile(event.target.value as typeof profile)}
          >
            <option value="fixed-grid">固定の格子</option>
            <option value="packed">透明な余白を除いて配置</option>
          </select>
        </label>
        <label className="editor-field">
          出力倍率
          <select
            aria-label="配布画像の倍率"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
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
            aria-label="配布画像間の余白"
            type="number"
            min={0}
            max={64}
            value={padding}
            onChange={(event) => setPadding(Number(event.target.value))}
          />
        </label>
      </fieldset>
      <p>
        出力予定: {asset.frames?.length || 1}コマ、{scale}
        倍。1ページに収まらない場合は最大4ページへ分割し、上限を超える素材は出力できません。配置設定はこの画面での選択です。
      </p>
      {preflight.issues.length > 0 && (
        <ul aria-label="配布前の確認">
          {preflight.issues.map((issue, index) => (
            <li key={index}>
              {issue.severity === 'block' ? '出力できません: ' : '注意: '}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {!preflight.valid && (
        <p>
          編集内容は保持されています。情報を残すには .casproj または asset.json を保存してください。
        </p>
      )}
      <button type="button" disabled={busy || !preflight.valid} onClick={() => void run()}>
        配布用ZIPをダウンロード
      </button>
      {busy && <p role="status">配布用ZIPを準備中…</p>}
      {complete && <p role="status">「{complete}」のダウンロードを開始しました。</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
