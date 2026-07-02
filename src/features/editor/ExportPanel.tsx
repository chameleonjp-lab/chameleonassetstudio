import { useState } from 'react';
import {
  downloadBlob,
  exportAssetJson,
  exportImage,
  exportZip,
} from '../../core/export/exportAsset';
import type { Asset } from '../../core/model';

interface ExportPanelProps {
  asset: Asset;
}

type ExportKind = 'png' | 'webp' | 'json' | 'zip';

const EXPORT_BUTTONS: Array<{ kind: ExportKind; label: string }> = [
  { kind: 'png', label: 'PNG をダウンロード' },
  { kind: 'webp', label: 'WebP をダウンロード' },
  { kind: 'json', label: 'asset.json をダウンロード' },
  { kind: 'zip', label: 'ZIP をダウンロード' },
];

/** アセットの書き出しパネル（Phase 10）。PNG / WebP / asset.json / ZIP をダウンロードする。 */
export function ExportPanel({ asset }: ExportPanelProps) {
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
