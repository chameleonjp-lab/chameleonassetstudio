import { formatNativeDisplayReason } from './editingFailure';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NativeCameraAction, NativeViewportFactory } from '../../core3d/ports/renderPort';
import type { NativeImportReview } from './importReview';
import { mountNativeImportPreview, type NativeImportPreviewState } from './importPreview';

const factory: NativeViewportFactory = async (host, onStatus) => {
  const { NativeViewport } = await import('../../adapters3d/three/renderer');
  return new NativeViewport(host, { onStatus });
};
const loading: NativeImportPreviewState = { state: 'loading', ready: false };
const actions: { value: NativeCameraAction; label: string }[] = [
  { value: 'orbit-left', label: '取込候補を左から見る' },
  { value: 'orbit-right', label: '取込候補を右から見る' },
  { value: 'orbit-up', label: '取込候補を上から見る' },
  { value: 'orbit-down', label: '取込候補を下から見る' },
  { value: 'zoom-in', label: '取込候補を拡大' },
  { value: 'zoom-out', label: '取込候補を縮小' },
];
export function NativeImportPreview({
  review,
  onReady,
}: {
  review: NativeImportReview;
  onReady(review: NativeImportReview, ready: boolean): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountNativeImportPreview> | null>(null);
  const observer = useRef(onReady);
  const [status, setStatus] = useState<NativeImportPreviewState>(loading);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    observer.current = onReady;
  }, [onReady]);
  useEffect(() => {
    let live = true;
    setStatus(loading);
    setError('');
    observer.current(review, false);
    try {
      if (!host.current) throw new Error('表示領域がありません。');
      controller.current = mountNativeImportPreview(
        host.current,
        review,
        (next) => {
          if (!live) return;
          setStatus(next);
          observer.current(review, next.ready);
        },
        { factory },
      );
    } catch {
      setStatus({ state: 'error', ready: false, reason: '取込候補の表示を準備できませんでした。' });
      observer.current(review, false);
    }
    return () => {
      live = false;
      observer.current(review, false);
      const previous = controller.current;
      controller.current = null;
      previous?.dispose();
    };
  }, [review]);
  function camera(action?: NativeCameraAction) {
    const current = controller.current;
    if (!current || !current.state.ready) return;
    const result = action ? current.cameraAction(action) : current.fit();
    setError(
      result.ok ? '' : '取込候補のカメラを変更できませんでした。表示状態を確認してください。',
    );
  }
  const summary = review.summary;
  return (
    <section className="native-import-preview" aria-label="変換後GLBの未保存プレビュー">
      <p>
        候補: {summary.projectName} / 部品 {summary.nodeCount}、形状 {summary.meshCount}、材質{' '}
        {summary.materialCount}、clip {summary.clipCount}
      </p>
      <p>
        原本情報 {summary.sourceCount}、保持する原本等 {summary.totalBlobBytes.toLocaleString()}{' '}
        bytes
      </p>
      <p className="native-asset-io-hash">原本GLBのSHA-256: {summary.sourceHash}</p>
      <p>
        変換・損失の注意:{' '}
        {summary.losses.length
          ? summary.losses.join('、')
          : '検査で列挙された追加の損失なし。すべての外部環境との同等性を保証するものではありません。'}
      </p>
      <div ref={host} className="native-import-preview-host" aria-label="取込候補の3D表示領域" />
      <p
        role={
          ['error', 'unavailable', 'unsupported', 'context-lost'].includes(status.state)
            ? 'alert'
            : 'status'
        }
      >
        {status.ready
          ? '取込候補を表示中（未保存）'
          : status.state === 'loading'
            ? '取込候補の表示を準備しています。'
            : '取込候補の表示は準備できていません。保存の確認はできません。原本と現在の作品は保持しています。'}
      </p>
      {status.reason && !status.ready && (
        <details>
          <summary>表示できない理由</summary>
          <p>{formatNativeDisplayReason(status.reason, 'viewport')}</p>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="native-asset-io-downloads">
        <button type="button" disabled={!status.ready} onClick={() => camera()}>
          取込候補を全体表示
        </button>
        {actions.map((action) => (
          <button
            key={action.value}
            type="button"
            disabled={!status.ready}
            onClick={() => camera(action.value)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
