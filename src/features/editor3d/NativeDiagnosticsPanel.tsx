import { useEffect, useId, useRef, useState } from 'react';
import {
  buildDiagnosticReport,
  detectDiagnosticBrowser,
  DIAGNOSTIC_LIMITS,
  serializeDiagnosticReport,
  type DiagnosticReportInput,
} from '../../core3d/diagnostics/report';

export type NativeDiagnosticsPanelProps = Omit<DiagnosticReportInput, 'browser'>;

/** No project/session/Error prop: usable even when the editor's rendering subtree has failed. */
export function NativeDiagnosticsPanel({
  appVersion,
  sourceRevision,
  sourceDirty,
  schemaVersion,
  errorId = 'none',
  feature = 'editor',
}: NativeDiagnosticsPanelProps) {
  const id = useId();
  const [steps, setSteps] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [notice, setNotice] = useState('');
  const [copying, setCopying] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const previewVersion = useRef(0);
  const mounted = useRef(true);
  const copyPending = useRef(false);
  const download = useRef<{ url: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewVersion.current += 1;
      if (download.current) {
        clearTimeout(download.current.timer);
        URL.revokeObjectURL(download.current.url);
        download.current = null;
      }
    };
  }, []);

  function createPreview() {
    previewVersion.current++;
    // These props are copied individually; accidental extra props never reach the report.
    const report = buildDiagnosticReport(
      {
        appVersion,
        sourceRevision,
        sourceDirty,
        schemaVersion,
        errorId,
        feature,
        browser: detectDiagnosticBrowser(
          typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        ),
      },
      steps,
    );
    setPreview(serializeDiagnosticReport(report));
    setConfirmReplace(false);
    setNotice('診断情報をこの画面内に作りました。不要な情報は下の欄から消してください。');
  }

  function selectPreview() {
    previewRef.current?.focus();
    previewRef.current?.select();
    setNotice('内容を選択しました。端末のコピー操作を使ってください。');
  }

  async function copyPreview() {
    if (copyPending.current || !preview?.trim()) return;
    const version = previewVersion.current;
    const text = preview;
    copyPending.current = true;
    setCopying(true);
    try {
      // Query only; never request clipboard permission. Unsupported/prompt/denied -> manual copy.
      if (
        !window.isSecureContext ||
        !navigator.clipboard?.writeText ||
        !navigator.permissions?.query ||
        !navigator.userActivation?.isActive
      ) {
        selectPreview();
        return;
      }
      const permission = await navigator.permissions.query({
        name: 'clipboard-write' as PermissionName,
      });
      if (!mounted.current) return;
      if (
        version !== previewVersion.current ||
        previewRef.current?.value !== text ||
        !detailsRef.current?.open ||
        document.hidden
      ) {
        setNotice(
          '確認欄の変更または画面の中断があったため、コピーを取り消しました。内容を確認してからもう一度押してください。',
        );
        return;
      }
      if (permission.state !== 'granted' || !navigator.userActivation?.isActive) {
        selectPreview();
        return;
      }
      await navigator.clipboard.writeText(text);
      if (mounted.current) setNotice('確認した内容をコピーしました。外部には送信していません。');
    } catch {
      if (mounted.current) selectPreview();
    } finally {
      copyPending.current = false;
      if (mounted.current) setCopying(false);
    }
  }

  function downloadPreview() {
    if (!preview?.trim()) return;
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      url = URL.createObjectURL(new Blob([preview], { type: 'text/plain;charset=utf-8' }));
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'assetstudio-diagnostics.txt';
      document.body.append(anchor);
      anchor.click();
      if (download.current) {
        clearTimeout(download.current.timer);
        URL.revokeObjectURL(download.current.url);
      }
      const ownedUrl = url;
      download.current = {
        url: ownedUrl,
        timer: setTimeout(() => {
          URL.revokeObjectURL(ownedUrl);
          download.current = null;
        }, 60_000),
      };
      setNotice(
        'テキストの保存を開始しました。端末でファイルを確認してください。外部には送信していません。',
      );
    } catch {
      if (url) URL.revokeObjectURL(url);
      setNotice(
        'この環境ではファイル保存を開始できませんでした。下の欄を選択し、端末のコピー操作を使ってください。',
      );
    } finally {
      anchor?.remove();
    }
  }

  return (
    <details
      ref={detailsRef}
      className="editor3d-details"
      onToggle={(event) => {
        if (!event.currentTarget.open) previewVersion.current++;
      }}
    >
      <summary>問題報告用の診断情報</summary>
      <p id={`${id}-privacy`}>
        情報はこの画面内だけで作ります。自動送信はしません。作品・素材・名前・保存場所・エラーの詳しい内容は自動で含めません。
        自分で書いた内容はコピーと保存に含まれるため、名前・個人のパス・認証情報を書かず、共有前に確認してください。
      </p>
      <label htmlFor={`${id}-steps`}>再現手順（任意）</label>
      <textarea
        id={`${id}-steps`}
        rows={3}
        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', font: 'inherit' }}
        maxLength={DIAGNOSTIC_LIMITS.reproductionCharacters}
        aria-describedby={`${id}-privacy ${id}-steps-help`}
        value={steps}
        disabled={copying}
        onChange={(event) =>
          setSteps(event.target.value.slice(0, DIAGNOSTIC_LIMITS.reproductionCharacters))
        }
      />
      <p id={`${id}-steps-help`}>
        どの操作で何が起きたかを書いてください。最大{DIAGNOSTIC_LIMITS.reproductionCharacters}文字。
        診断情報を作ったあとに手順を変えても、下の確認欄は自動で書き換わりません。
      </p>
      {preview === null ? (
        <button type="button" onClick={createPreview}>
          診断情報を作成
        </button>
      ) : (
        <>
          <p>
            作成時点の情報です。下の欄はすべて編集・削除できます。コピーと保存には、この欄の内容だけを使います。
          </p>
          <label htmlFor={`${id}-preview`}>共有前の確認・編集</label>
          <textarea
            id={`${id}-preview`}
            ref={previewRef}
            rows={14}
            style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', font: 'inherit' }}
            maxLength={DIAGNOSTIC_LIMITS.reportCharacters}
            aria-describedby={`${id}-privacy`}
            spellCheck={false}
            value={preview}
            onChange={(event) => {
              previewVersion.current++;
              setPreview(event.target.value.slice(0, DIAGNOSTIC_LIMITS.reportCharacters));
              setNotice('');
            }}
          />
          <div className="editor3d-actions">
            <button
              type="button"
              disabled={copying || !preview.trim()}
              onClick={() => void copyPreview()}
            >
              確認した内容をコピー
            </button>
            <button type="button" disabled={copying || !preview.trim()} onClick={selectPreview}>
              内容を選択して手動コピー
            </button>
            <button type="button" disabled={copying || !preview.trim()} onClick={downloadPreview}>
              確認した内容をテキスト保存
            </button>
            <button type="button" disabled={copying} onClick={() => setConfirmReplace(true)}>
              診断情報を作り直す
            </button>
          </div>
          {confirmReplace && (
            <div className="editor3d-alert">
              <p>
                確認欄で編集・削除した内容を置き換え、現在の情報と上の再現手順で作り直しますか？
              </p>
              <div className="editor3d-actions">
                <button type="button" disabled={copying} onClick={createPreview}>
                  置き換えて作り直す
                </button>
                <button type="button" disabled={copying} onClick={() => setConfirmReplace(false)}>
                  今の内容を残す
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p role="status" aria-live="polite">
        {notice}
      </p>
    </details>
  );
}
