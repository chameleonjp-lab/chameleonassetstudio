import { useState } from 'react';
import {
  downloadBlob,
  exportAssetJson,
  exportImage,
  exportZip,
} from '../../core/export/exportAsset';
import { blobKeyFor } from '../../core/images/importImage';
import type { Asset, Project } from '../../core/model';
import {
  exportCasproj,
  loadBlob,
  type CasprojBundle,
  type CasprojFileEntry,
} from '../../core/storage';

interface ExportPanelProps {
  asset: Asset;
  /** `.casproj` 書き出し（プロジェクト単位）に使う。 */
  project: Project;
  /** プロジェクト内の全アセット（`.casproj` に同梱する）。 */
  projectAssets: Asset[];
}

type ExportKind = 'png' | 'webp' | 'json' | 'zip' | 'casproj';

const EXPORT_OPTIONS: Array<{
  kind: ExportKind;
  label: string;
  purpose: string;
  includes: string;
}> = [
  {
    kind: 'png',
    label: 'PNG をダウンロード',
    purpose: '選択中のアセットを、透過対応の完成画像1枚にします。',
    includes: '画像の見た目を保存します。原点・アンカー・判定の線は画像へ入りません。',
  },
  {
    kind: 'webp',
    label: 'WebP をダウンロード',
    purpose: '選択中のアセットを、容量を小さくしやすい完成画像1枚にします。',
    includes: 'PNGと同じ見た目を保存します。利用先がWebP対応か確認してください。',
  },
  {
    kind: 'json',
    label: 'asset.json をダウンロード',
    purpose: '選択中のアセットのゲーム用情報を保存します。',
    includes: '原点・アンカー・判定・フレームなどを含みます。画像ファイル本体は含みません。',
  },
  {
    kind: 'zip',
    label: 'ZIP をダウンロード',
    purpose: '選択中のアセットをゲームへ持ち込む一式にまとめます。',
    includes: '画像、フレーム用シート、ゲーム用情報、補助ファイルを含みます。',
  },
  {
    kind: 'casproj',
    label: '.casproj をダウンロード',
    purpose: '現在のプロジェクト全体を、あとで再編集できるファイルにします。',
    includes: '全アセットと画像を含みます。Undo履歴と復旧点は含まれません。',
  },
];

/** プロジェクトとその全アセットが参照する画像 Blob から `.casproj` バンドルを組み立てる。 */
async function buildCasprojBundle(project: Project, assets: Asset[]): Promise<CasprojBundle> {
  const files: CasprojFileEntry[] = [];
  for (const asset of assets) {
    for (const texture of asset.textures) {
      const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
      if (!blob) {
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      files.push({ path: `assets/${asset.id}/${texture.path}`, bytes });
    }
  }
  return { project, assets, files };
}

/** アセットの書き出しパネル（Phase 10 / 13）。PNG / WebP / asset.json / ZIP / .casproj をダウンロードする。 */
export function ExportPanel({ asset, project, projectAssets }: ExportPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedFileName, setCompletedFileName] = useState<string | null>(null);

  const runExport = async (kind: ExportKind) => {
    setError(null);
    setCompletedFileName(null);
    setBusy(true);
    try {
      let fileName = '';
      switch (kind) {
        case 'png': {
          const blob = await exportImage(asset, 'image/png');
          fileName = `${asset.name}.png`;
          downloadBlob(blob, fileName);
          break;
        }
        case 'webp': {
          const blob = await exportImage(asset, 'image/webp');
          fileName = `${asset.name}.webp`;
          downloadBlob(blob, fileName);
          break;
        }
        case 'json': {
          const blob = exportAssetJson(asset);
          fileName = `${asset.name}.asset.json`;
          downloadBlob(blob, fileName);
          break;
        }
        case 'zip': {
          const blob = await exportZip(asset);
          fileName = `${asset.name}-export.zip`;
          downloadBlob(blob, fileName);
          break;
        }
        case 'casproj': {
          const bundle = await buildCasprojBundle(project, projectAssets);
          const blob = await exportCasproj(bundle);
          fileName = `${project.name}.casproj`;
          downloadBlob(blob, fileName);
          break;
        }
      }
      setCompletedFileName(fileName);
    } catch (err) {
      setError(`書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-panel">
      <div className="export-explanation">
        <strong>自動保存とダウンロードは別です</strong>
        <p>
          自動保存はこのブラウザ内へ作業を残します。別の端末へ移す場合や、Safariのデータ消去に備える場合は
          <code>.casproj</code>も保存してください。
        </p>
      </div>
      <div className="export-buttons">
        {EXPORT_OPTIONS.map((option) => (
          <article key={option.kind} className="export-option">
            <div>
              <strong>{option.purpose}</strong>
              <p>{option.includes}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => void runExport(option.kind)}>
              {option.label}
            </button>
          </article>
        ))}
      </div>
      {busy && <p className="import-status">書き出し中…</p>}
      {completedFileName && (
        <p className="export-complete" role="status">
          「{completedFileName}
          」のダウンロードを開始しました。iPhoneではSafariのダウンロード表示から確認してください。保存先は端末の設定で変わります。
        </p>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
