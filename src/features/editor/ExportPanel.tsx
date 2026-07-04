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

const EXPORT_BUTTONS: Array<{ kind: ExportKind; label: string }> = [
  { kind: 'png', label: 'PNG をダウンロード' },
  { kind: 'webp', label: 'WebP をダウンロード' },
  { kind: 'json', label: 'asset.json をダウンロード' },
  { kind: 'zip', label: 'ZIP をダウンロード' },
  { kind: 'casproj', label: '.casproj をダウンロード' },
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

  const runExport = async (kind: ExportKind) => {
    setError(null);
    setBusy(true);
    try {
      switch (kind) {
        case 'png': {
          const blob = await exportImage(asset, 'image/png');
          downloadBlob(blob, `${asset.name}.png`);
          break;
        }
        case 'webp': {
          const blob = await exportImage(asset, 'image/webp');
          downloadBlob(blob, `${asset.name}.webp`);
          break;
        }
        case 'json': {
          const blob = exportAssetJson(asset);
          downloadBlob(blob, `${asset.name}.asset.json`);
          break;
        }
        case 'zip': {
          const blob = await exportZip(asset);
          downloadBlob(blob, `${asset.name}-export.zip`);
          break;
        }
        case 'casproj': {
          const bundle = await buildCasprojBundle(project, projectAssets);
          const blob = await exportCasproj(bundle);
          downloadBlob(blob, `${project.name}.casproj`);
          break;
        }
      }
    } catch (err) {
      setError(`書き出しに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-panel">
      <div className="export-buttons">
        {EXPORT_BUTTONS.map((button) => (
          <button
            key={button.kind}
            type="button"
            disabled={busy}
            onClick={() => void runExport(button.kind)}
          >
            {button.label}
          </button>
        ))}
      </div>
      {busy && <p className="import-status">書き出し中…</p>}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
