import { formatNativeEditingFailure } from './editingFailure';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  captureInspectionSnapshot,
  isInspectionStale,
  type InspectionReport,
  type InspectionTarget,
} from '../../core3d/inspection/report';
import type { AssetIoJob } from '../../core3d/ports/assetIoPort';
import {
  ASSET_IO_PROFILE,
  assertIoBudget,
  reserveAssetIoBytes,
} from '../../core3d/profile/assetIoProfile';
import type { ProjectSession } from './projectSession';
import './nativeQualityPanel.css';
export function NativeQualityPanel({
  session,
  onNavigate,
}: {
  session: ProjectSession;
  onNavigate?: (target: InspectionTarget, revision: number) => void;
}) {
  const subscription = useMemo(
    () => ({
      subscribe: (f: () => void) => session.edit.subscribe(f),
      snapshot: () => session.state.revision,
    }),
    [session],
  );
  useSyncExternalStore(subscription.subscribe, subscription.snapshot, subscription.snapshot);
  const [report, setReport] = useState<InspectionReport | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [issuePage, setIssuePage] = useState(0),
    [sourcePage, setSourcePage] = useState(0);
  const active = useRef<AssetIoJob | null>(null),
    generation = useRef(0);
  const reportReservation = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    generation.current++;
    active.current?.cancel();
    active.current = null;
    setBusy(false);
  }, []);
  useEffect(() => {
    reportReservation.current?.();
    reportReservation.current = null;
    setReport(null);
    setNotice('');
    const background = () => {
      if (document.hidden) {
        cancel();
        setNotice('背景に移ったため検査を中止しました。');
      }
    };
    const interrupted = () => {
      cancel();
      setNotice('画面の中断により検査を中止しました。');
    };
    document.addEventListener('visibilitychange', background);
    document.addEventListener('freeze', interrupted);
    window.addEventListener('pagehide', interrupted);
    return () => {
      cancel();
      document.removeEventListener('visibilitychange', background);
      document.removeEventListener('freeze', interrupted);
      window.removeEventListener('pagehide', interrupted);
      reportReservation.current?.();
      reportReservation.current = null;
    };
  }, [session, cancel]);
  const inspect = async () => {
    cancel();
    const token = ++generation.current;
    setBusy(true);
    setNotice('');
    const identity = { id: session.project.id, revision: session.state.revision };
    let releaseCapture: (() => void) | undefined;
    try {
      const { startAssetIo } = await import('../../adapters3d/gltf/assetIoClient');
      if (token !== generation.current) return;
      if (session.project.id !== identity.id || session.state.revision !== identity.revision)
        throw Error('検査の準備中に作品が変わりました。再検査してください。');
      const project = session.project;
      const jsonBytes = new TextEncoder().encode(JSON.stringify(project)).length;
      assertIoBudget(jsonBytes, ASSET_IO_PROFILE.jsonBytes, 'Inspection JSON');
      const blobBound = Math.min(
        project.blobIds.length * ASSET_IO_PROFILE.sourceBytes,
        ASSET_IO_PROFILE.totalBlobBytes,
      );
      releaseCapture = reserveAssetIoBytes(jsonBytes * 4 + blobBound * 4);
      const snapshot = captureInspectionSnapshot(project, (id) =>
        session.readBlob(id, ASSET_IO_PROFILE.sourceBytes),
      );
      releaseCapture();
      releaseCapture = undefined;
      const job = startAssetIo({ kind: 'inspect', snapshot });
      active.current = job;
      const result = await job.promise;
      if (token !== generation.current) return;
      if (!('statistics' in result)) throw Error('品質検査の応答が一致しません。');
      const reportBytes = new TextEncoder().encode(JSON.stringify(result)).length;
      assertIoBudget(reportBytes, ASSET_IO_PROFILE.jsonBytes, 'Inspection report');
      const releaseReport = reserveAssetIoBytes(reportBytes * 4);
      reportReservation.current?.();
      reportReservation.current = releaseReport;
      setIssuePage(0);
      setSourcePage(0);
      setReport(result);
      setNotice('検査結果を取得しました。');
    } catch (error) {
      if (token === generation.current) setNotice(formatNativeEditingFailure(error, 'quality'));
    } finally {
      releaseCapture?.();
      if (token === generation.current) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  const stale = report ? isInspectionStale(report, session.project) : false;
  return (
    <section className="native-quality" aria-label="作品の品質検査">
      <h3>作品の品質検査</h3>
      <p>対応形式: {ASSET_IO_PROFILE.id}。この作品の他エンジン実行: 未検証。</p>
      <p>
        固定サンプルの検査結果は、この作品の動作保証には使いません。GPUメモリと実機性能は未測定です。
      </p>
      <p>
        編集頂点と三角形は共有meshを一度だけ数え、instance数は別欄です。寸法は保存TRSによる範囲で、アニメーション全体の範囲ではありません。画素数は画像ヘッダー由来で、デコード成功を保証しません。
      </p>
      <button type="button" disabled={busy} onClick={() => void inspect()}>
        現在の版を検査
      </button>
      <button
        type="button"
        disabled={!busy}
        onClick={() => {
          cancel();
          setNotice('検査を中止しました。');
        }}
      >
        検査を中止
      </button>
      <p role="status">{busy ? '検査中…' : notice}</p>
      {report && (
        <>
          <p>
            検査版: {report.revision}
            {stale ? ' / 作品が変更されています。再検査してください。' : ''}
          </p>
          <dl>
            {Object.entries(report.statistics).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  {typeof value === 'object' && value !== null && 'status' in value
                    ? value.status === 'known'
                      ? JSON.stringify(value.value)
                      : `未確認: ${value.reason}`
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          <h4>警告と修正先</h4>
          {report.issues.length === 0 ? (
            <p>この静的検査で警告は見つかりませんでした。</p>
          ) : (
            <ol>
              {report.issues.slice(issuePage * 50, (issuePage + 1) * 50).map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <strong>
                    {issue.severity}: {issue.message}
                  </strong>
                  <p>{issue.impact}</p>
                  <p>{issue.remedy}</p>
                  <p>対象: {JSON.stringify(issue.target)}</p>
                  {onNavigate &&
                    issue.target.kind !== 'source' &&
                    issue.target.kind !== 'project' && (
                      <button
                        type="button"
                        disabled={stale || busy}
                        onClick={() => {
                          if (!isInspectionStale(report, session.project))
                            onNavigate(issue.target, report.revision);
                        }}
                      >
                        編集先を確認
                      </button>
                    )}
                </li>
              ))}
            </ol>
          )}
          {report.issues.length > 50 && (
            <div>
              <p>
                警告 {issuePage * 50 + 1}〜{Math.min(report.issues.length, (issuePage + 1) * 50)} /{' '}
                {report.issues.length}件
              </p>
              <button disabled={issuePage === 0} onClick={() => setIssuePage((p) => p - 1)}>
                前の警告
              </button>
              <button
                disabled={(issuePage + 1) * 50 >= report.issues.length}
                onClick={() => setIssuePage((p) => p + 1)}
              >
                次の警告
              </button>
            </div>
          )}
          <h4>保持原本の情報</h4>
          {report.sources.slice(sourcePage * 10, (sourcePage + 1) * 10).map((source) => (
            <details key={source.sourceId}>
              <summary>{source.sourceId}</summary>
              <pre>{JSON.stringify(source, null, 2)}</pre>
            </details>
          ))}
          {report.sources.length > 10 && (
            <div>
              <p>
                原本 {sourcePage * 10 + 1}〜{Math.min(report.sources.length, (sourcePage + 1) * 10)}{' '}
                / {report.sources.length}件
              </p>
              <button disabled={sourcePage === 0} onClick={() => setSourcePage((p) => p - 1)}>
                前の原本
              </button>
              <button
                disabled={(sourcePage + 1) * 10 >= report.sources.length}
                onClick={() => setSourcePage((p) => p + 1)}
              >
                次の原本
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
