import { useEffect, useRef, useState } from 'react';

export interface ImportPreviewContent {
  id: string;
  modeLabel: string;
  title: string;
  fileNames: string[];
  assetCount: number;
  layerCount: number;
  frameCount: number;
  animationCount: number;
  details: string[];
  losses: string[];
  warnings: string[];
}

interface ImportPreviewDialogProps {
  preview: ImportPreviewContent;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/** L1の「正本へ保存する前に内容・loss・warningを確認する」共通dialog。 */
export function ImportPreviewDialog({
  preview,
  busy,
  onConfirm,
  onCancel,
}: ImportPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const needsWarningConfirmation = preview.losses.length > 0 || preview.warnings.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    cancelButtonRef.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    setWarningsConfirmed(false);
  }, [preview.id]);

  return (
    <dialog
      ref={dialogRef}
      className="import-preview-backdrop"
      aria-labelledby="import-preview-title"
      aria-describedby="import-preview-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
    >
      <section className="import-preview-dialog">
        <header>
          <p className="import-preview-mode">{preview.modeLabel}</p>
          <h2 id="import-preview-title">取り込み確定前preview</h2>
        </header>
        <p id="import-preview-description">
          まだProject・Asset・画像Blobへ保存していません。内容を確認してから確定してください。
        </p>

        <section aria-label="取り込む内容">
          <h3>{preview.title}</h3>
          <p>
            Asset {preview.assetCount}件 / layer {preview.layerCount}件 / frame {preview.frameCount}
            件 / animation {preview.animationCount}件
          </p>
          <ol className="import-preview-files">
            {preview.fileNames.map((fileName, index) => (
              <li key={`${index}:${fileName}`}>{fileName}</li>
            ))}
          </ol>
          <ul>
            {preview.details.map((detail, index) => (
              <li key={`${index}:${detail}`}>{detail}</li>
            ))}
          </ul>
        </section>

        {preview.losses.length > 0 && (
          <section className="import-preview-losses" aria-label="編集対象外になる内容">
            <h3>失われる・編集対象外になる内容</h3>
            <ul>
              {preview.losses.map((loss, index) => (
                <li key={`${index}:${loss}`}>{loss}</li>
              ))}
            </ul>
          </section>
        )}

        {preview.warnings.length > 0 && (
          <section className="import-preview-warnings" aria-label="取り込みwarning">
            <h3>warning</h3>
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={`${index}:${warning}`}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        {needsWarningConfirmation && (
          <label className="import-preview-warning-confirm">
            <input
              type="checkbox"
              checked={warningsConfirmed}
              disabled={busy}
              onChange={(event) => setWarningsConfirmed(event.target.checked)}
            />
            loss・warningを確認し、source原本を保持したうえで取り込みます
          </label>
        )}

        <div className="import-preview-actions">
          <button ref={cancelButtonRef} type="button" disabled={busy} onClick={onCancel}>
            取り込みを取消
          </button>
          <button
            type="button"
            disabled={busy || (needsWarningConfirmation && !warningsConfirmed)}
            onClick={() => void onConfirm()}
          >
            {busy ? '原子保存中…' : '取り込みを確定'}
          </button>
        </div>
        <p className="editor-note">
          確定後は1回の「元に戻す」で今回の取り込み全体を削除し、「やり直す」で復元できます。
        </p>
      </section>
    </dialog>
  );
}
