import { useState, type ChangeEvent } from 'react';
import { MAX_FRAME_SET_ITEMS, type ManualGridInput } from '../../core/images/importFrameSet';

interface ImportFrameSetPanelProps {
  accept: string;
  busy: boolean;
  onPrepareSequence: (files: File[]) => Promise<void>;
  onPrepareSheet: (file: File, grid: ManualGridInput) => Promise<void>;
}

type ImportMode = 'sequence' | 'sheet';

export function ImportFrameSetPanel({
  accept,
  busy,
  onPrepareSequence,
  onPrepareSheet,
}: ImportFrameSetPanelProps) {
  const [mode, setMode] = useState<ImportMode>('sequence');
  const [sequenceFiles, setSequenceFiles] = useState<File[]>([]);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [cellWidth, setCellWidth] = useState('32');
  const [cellHeight, setCellHeight] = useState('32');
  const [margin, setMargin] = useState('0');
  const [spacing, setSpacing] = useState('0');

  const handleSequenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setSequenceFiles(event.target.files ? Array.from(event.target.files) : []);
  };

  const handleSheetFile = (event: ChangeEvent<HTMLInputElement>) => {
    setSheetFile(event.target.files?.[0] ?? null);
  };

  return (
    <fieldset className="editor-fieldset import-frame-set-panel" disabled={busy}>
      <legend>連番・Sprite Sheetを取り込む</legend>
      <p className="editor-note">
        通常画像の「1 file = 1 Asset」は維持します。ここでは明示的に1 Assetのframe列を作ります。
      </p>

      <label className="editor-field">
        取り込みモード
        <select
          aria-label="frame列取り込みモード"
          value={mode}
          onChange={(event) => setMode(event.target.value as ImportMode)}
        >
          <option value="sequence">連番画像</option>
          <option value="sheet">Sprite Sheet（手動格子）</option>
        </select>
      </label>

      {mode === 'sequence' ? (
        <div className="import-frame-set-config">
          <label className="import-button">
            連番ファイルを選ぶ
            <input
              type="file"
              accept={accept}
              multiple
              onChange={handleSequenceFiles}
              className="visually-hidden-input"
            />
          </label>
          <p className="editor-note">
            1〜{MAX_FRAME_SET_ITEMS}
            枚・同一寸法。ファイル名の数字を数値順に並べ、確定順をpreviewします。
          </p>
          {sequenceFiles.length > 0 && (
            <ol className="import-frame-set-files" aria-label="選択中の連番画像">
              {sequenceFiles.map((file, index) => (
                <li key={`${index}:${file.name}`}>{file.name}</li>
              ))}
            </ol>
          )}
          <button
            type="button"
            disabled={sequenceFiles.length === 0}
            onClick={() => void onPrepareSequence(sequenceFiles)}
          >
            連番previewを準備
          </button>
        </div>
      ) : (
        <div className="import-frame-set-config">
          <label className="import-button">
            Sprite Sheetファイルを選ぶ
            <input
              type="file"
              accept={accept}
              onChange={handleSheetFile}
              className="visually-hidden-input"
            />
          </label>
          {sheetFile && <p className="import-frame-set-file-name">{sheetFile.name}</p>}
          <p className="editor-note">
            uniform外周marginとcell間spacingを使い、左上から行優先で最大
            {MAX_FRAME_SET_ITEMS}cellを切り出します。
          </p>
          <div className="import-frame-set-grid-fields">
            <label className="editor-field">
              cell幅
              <input
                aria-label="Sprite Sheet cell幅"
                type="number"
                min={1}
                max={4096}
                step={1}
                inputMode="numeric"
                value={cellWidth}
                onChange={(event) => setCellWidth(event.target.value)}
              />
            </label>
            <label className="editor-field">
              cell高さ
              <input
                aria-label="Sprite Sheet cell高さ"
                type="number"
                min={1}
                max={4096}
                step={1}
                inputMode="numeric"
                value={cellHeight}
                onChange={(event) => setCellHeight(event.target.value)}
              />
            </label>
            <label className="editor-field">
              外周margin
              <input
                aria-label="Sprite Sheet 外周margin"
                type="number"
                min={0}
                max={4096}
                step={1}
                inputMode="numeric"
                value={margin}
                onChange={(event) => setMargin(event.target.value)}
              />
            </label>
            <label className="editor-field">
              cell間spacing
              <input
                aria-label="Sprite Sheet cell間spacing"
                type="number"
                min={0}
                max={4096}
                step={1}
                inputMode="numeric"
                value={spacing}
                onChange={(event) => setSpacing(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!sheetFile}
            onClick={() => {
              if (!sheetFile) return;
              void onPrepareSheet(sheetFile, {
                cellWidth: Number(cellWidth),
                cellHeight: Number(cellHeight),
                margin: Number(margin),
                spacing: Number(spacing),
              });
            }}
          >
            Sprite Sheet previewを準備
          </button>
        </div>
      )}
    </fieldset>
  );
}
