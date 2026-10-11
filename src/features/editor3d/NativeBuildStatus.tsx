import { NativeReleaseNotes } from './NativeReleaseNotes';
import { useEffect, useRef, useState } from 'react';
import type { AppBuildInformation } from '../../core3d/diagnostics/buildInfo';
import { readDeployedBuild } from './updateInformation';

export function NativeBuildStatus({
  disabled,
  onReload,
}: {
  disabled: boolean;
  onReload: () => Promise<void>;
}) {
  const [deployed, setDeployed] = useState<AppBuildInformation | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function check() {
    if (controller.current || busy) return;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setMessage('配信版を確認しています…');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      operation.abort();
    }, 15_000);
    try {
      const result = await readDeployedBuild(
        new URL(import.meta.env.BASE_URL, location.origin).href,
        operation.signal,
      );
      if (!mounted.current || operation.signal.aborted) return;
      setDeployed(result);
      setMessage(
        result.sourceRevision === __APP_REVISION__ && result.sourceDirty === __APP_DIRTY__
          ? 'このタブと同じ版が配信されています。'
          : 'このタブとは別の版が配信されています。再読み込みは自動では行いません。',
      );
    } catch {
      if (mounted.current)
        setMessage(
          timedOut
            ? '配信版の確認が時間切れになりました。通信が戻ったら再試行できます。'
            : operation.signal.aborted
              ? '配信版の確認を中止しました。現在の作品は変更していません。'
              : '配信版を確認できませんでした。通信が戻ったら再試行できます。現在の作品は変更していません。',
        );
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === operation) controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function reload() {
    if (busy || disabled) return;
    setBusy(true);
    setMessage('現在の内容を保存してから再読み込みします。');
    try {
      await onReload();
    } catch {
      if (mounted.current)
        setMessage(
          '保存または再読み込みを完了できませんでした。このタブを閉じず、先に編集用バックアップを取得してください。',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details className="editor3d-panel" aria-label="3Dの版と更新">
      <summary>版と更新を確認</summary>
      <p>
        アプリ {__APP_VERSION__} · 開発版 · source {__APP_REVISION__}
        {__APP_DIRTY__ ? '（ローカル変更あり）' : ''}
      </p>
      <p>このアプリが保存する3D形式: 0.3.0。アプリ版と作品の保存形式は別です。</p>
      <NativeReleaseNotes
        build={{
          appVersion: __APP_VERSION__,
          sourceRevision: __APP_REVISION__,
          sourceDirty: __APP_DIRTY__,
        }}
      />
      <button type="button" disabled={busy} onClick={() => void check()}>
        配信版を確認
      </button>
      {controller.current && (
        <button type="button" onClick={() => controller.current?.abort()}>
          配信版の確認を中止
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {deployed && (
        <p>
          配信中: アプリ {deployed.appVersion} · source {deployed.sourceRevision} · 3D形式{' '}
          {deployed.nativeSchemaVersion}
          {deployed.sourceDirty ? '（ローカル変更あり）' : ''}
        </p>
      )}
      <p>
        新版の作品を旧アプリへ戻しても、保存形式を自動で巻き戻しません。編集用バックアップと移行前の控えを別に保存してください。完全なオフライン起動は保証していません。
      </p>
      <button type="button" disabled={busy || disabled} onClick={() => void reload()}>
        現在の内容を保存して再読み込み
      </button>
      <p>
        <a
          href={`${import.meta.env.BASE_URL}licenses/runtime-notices.txt`}
          target="_blank"
          rel="noopener noreferrer"
        >
          同梱ライブラリのライセンス原文
        </a>
        。作品に使う素材の権利情報とは別です。
      </p>
      <p>
        <a href={`${import.meta.env.BASE_URL}guide/3d/`} target="_blank" rel="noopener noreferrer">
          ガイドを別タブで開く
        </a>
      </p>
    </details>
  );
}
