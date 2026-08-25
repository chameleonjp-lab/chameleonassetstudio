import { useEffect, useState } from 'react';

function initialOnlineState(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * オフライン時も、読み込み済み画面の端末内保存・書き出しは続けられることを説明する。
 * navigator.onLineは接続の目安であり、保存成功そのものを保証する値ではない。
 */
export function ConnectionStatus() {
  const [online, setOnline] = useState(initialOnlineState);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setOnline(false);
      setWasOffline(true);
    };
    const handleOnline = () => setOnline(true);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!online || !wasOffline) {
      return;
    }
    const timer = window.setTimeout(() => setWasOffline(false), 5000);
    return () => window.clearTimeout(timer);
  }, [online, wasOffline]);

  if (!online) {
    return (
      <aside
        className="connection-status connection-status--offline"
        role="status"
        aria-label="通信状態"
      >
        <strong>オフラインです</strong>
        <p>
          今開いている画面では、端末内保存と書き出しを続けられます。再読み込みやページ移動は、保存完了を確認してから行ってください。
        </p>
      </aside>
    );
  }

  if (!wasOffline) {
    return null;
  }

  return (
    <aside
      className="connection-status connection-status--online"
      role="status"
      aria-label="通信状態"
    >
      <strong>オンラインに戻りました</strong>
      <p>保存状態を確認してから作業を続けてください。</p>
    </aside>
  );
}
