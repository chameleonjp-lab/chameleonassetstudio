import {
  Component,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Project3D } from '../../core3d/model/project';
import './nativeViewportPanel.css';
import { NativeInspectionControls } from './NativeInspectionControls';

import type {
  NativeViewportResult,
  NativeCameraAction,
  NativeViewportStatus,
  NativeViewportSuspensionContract,
  NativeViewportPort,
  NativeViewportFactory,
} from '../../core3d/ports/renderPort';
export type {
  NativeViewportPort,
  NativeViewportStatus,
  NativeViewportFactory,
} from '../../core3d/ports/renderPort';

export interface NativeViewportPanelProps {
  project: Project3D;
  factory: NativeViewportFactory;
  /** Read durable/current revisions and source completeness at the moment of the request. */
  getSuspensionContract: () => NativeViewportSuspensionContract;
  /** Reject when saving fails; requesting autosave alone is not a successful save. */
  onSave: () => Promise<void>;
}

type PanelStatus = NativeViewportStatus | { state: 'loading'; reason?: string };
type Notice = { text: string; error?: boolean; detail?: string } | null;
type Instance = {
  projectId: string;
  port: NativeViewportPort | null;
  revision: number | null;
  cancelled: boolean;
  busy: boolean;
};

const statusText: Record<PanelStatus['state'], string> = {
  loading: '3D表示を準備しています。',
  empty: '表示する3Dデータはありません。',
  active: '3D表示中',
  hidden: '画面が見えない間は描画とカメラ操作を停止しています。',
  frozen: 'ページの一時停止中は描画とカメラ操作を停止しています。',
  suspended: 'GPU表示を休止しています。保存済みの内容から再開できます。',
  'context-lost': 'GPUとの接続が失われました。ブラウザーの復旧を待っています。',
  unavailable: 'この環境ではWebGL2の3D表示を利用できません。',
  unsupported:
    'この内容の3D表示には対応していません。リグ・アニメーション・テクスチャ・三角形以外の面などは表示準備中です。',
  error: '3D表示を続けられませんでした。',
  disposed: '3D表示を終了しました。',
};

const cameraActionGroups: {
  label: string;
  actions: { action: NativeCameraAction; text: string; label: string }[];
}[] = [
  {
    label: '回転',
    actions: [
      { action: 'orbit-left', text: '左へ', label: 'カメラを左へ回転' },
      { action: 'orbit-right', text: '右へ', label: 'カメラを右へ回転' },
      { action: 'orbit-up', text: '上へ', label: 'カメラを上へ回転' },
      { action: 'orbit-down', text: '下へ', label: 'カメラを下へ回転' },
    ],
  },
  {
    label: '平行移動',
    actions: [
      { action: 'pan-left', text: '左へ', label: 'カメラを左へ平行移動' },
      { action: 'pan-right', text: '右へ', label: 'カメラを右へ平行移動' },
      { action: 'pan-up', text: '上へ', label: 'カメラを上へ平行移動' },
      { action: 'pan-down', text: '下へ', label: 'カメラを下へ平行移動' },
    ],
  },
  {
    label: '拡大・縮小',
    actions: [
      { action: 'zoom-in', text: '拡大', label: '3D表示を拡大' },
      { action: 'zoom-out', text: '縮小', label: '3D表示を縮小' },
    ],
  },
];

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function isFailure(status: PanelStatus) {
  return ['context-lost', 'unavailable', 'unsupported', 'error'].includes(status.state);
}

class ViewportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="native-viewport-panel" aria-label="3D表示">
        <p role="alert">
          3D表示の画面でエラーが発生しました。プロジェクトの保存・バックアップは、この表示の外から操作できます。
        </p>
      </section>
    ) : (
      this.props.children
    );
  }
}

export function NativeViewportPanel(props: NativeViewportPanelProps) {
  // A project switch also resets local UI and detaches any unresolved factory's host.
  return (
    <ViewportBoundary key={props.project.id}>
      <ViewportContent {...props} />
    </ViewportBoundary>
  );
}

function ViewportContent(props: NativeViewportPanelProps) {
  const { project, factory } = props;
  const headingId = useId();
  const guidanceId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const instanceRef = useRef<Instance | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<PanelStatus>({ state: 'loading' });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  // Only committed props may be observed by a save completion or a late factory.
  useLayoutEffect(() => {
    latest.current = props;
  });

  const isCurrent = useCallback((instance: Instance) => {
    return !instance.cancelled && instanceRef.current === instance;
  }, []);

  const updateProject = useCallback(
    (instance: Instance) => {
      const current = latest.current.project;
      if (!isCurrent(instance) || !instance.port || current.id !== instance.projectId) return;
      if (instance.revision === current.revision) return;
      const port = instance.port;
      let result: NativeViewportResult;
      try {
        result = port.setProject(current);
      } catch (cause) {
        instance.port = null;
        try {
          port.dispose();
        } catch {
          // Preserve the original display error without propagating cleanup into the shell.
        }
        setStatus({ state: 'error', reason: errorText(cause) });
        throw cause;
      }
      instance.revision = current.revision;
      setStatus(port.status);
      if (!result.ok) throw new Error(result.reason);
      setNotice(null);
    },
    [isCurrent],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // An obsolete factory can finish only inside its detached host, never a newer canvas.
    const ownedHost = host.ownerDocument.createElement('div');
    ownedHost.className = 'native-viewport-runtime';
    host.appendChild(ownedHost);
    const instance: Instance = {
      projectId: project.id,
      port: null,
      revision: null,
      cancelled: false,
      busy: false,
    };
    instanceRef.current = instance;
    setStatus({ state: 'loading' });
    setNotice(null);
    setBusy(false);

    void Promise.resolve()
      .then(() => {
        if (instance.cancelled) return null;
        return factory(ownedHost, (next) => {
          if (!instance.cancelled) setStatus({ ...next });
        });
      })
      .then((port) => {
        if (!port) return;
        if (instance.cancelled) {
          port.dispose();
          return;
        }
        instance.port = port;
        updateProject(instance);
      })
      .catch((cause: unknown) => {
        if (instance.cancelled) return;
        setStatus((current) =>
          isFailure(current) ? current : { state: 'error', reason: errorText(cause) },
        );
        setNotice({
          error: true,
          text: '3D表示を準備できませんでした。現在の内容はこのタブに保持しています。',
          detail: errorText(cause),
        });
      });

    return () => {
      instance.cancelled = true;
      if (instanceRef.current === instance) instanceRef.current = null;
      try {
        instance.port?.dispose();
      } catch {
        // Cleanup must not take down the shell's independently owned backup controls.
      } finally {
        instance.port = null;
        ownedHost.remove();
      }
    };
    // Latest committed project data is read after the factory resolves; object identity is irrelevant.
  }, [factory, project.id, attempt, updateProject]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance?.port) return;
    try {
      updateProject(instance);
    } catch (cause) {
      setStatus((current) =>
        isFailure(current) ? current : { state: 'error', reason: errorText(cause) },
      );
      setNotice({
        error: true,
        text: '3D表示を更新できませんでした。現在の内容はこのタブに保持しています。',
        detail: errorText(cause),
      });
    }
    // Project getters may return a fresh clone on every render. Only revisions cause reconstruction.
  }, [project.id, project.revision, updateProject]);

  function runCamera(operation: (port: NativeViewportPort) => void) {
    const instance = instanceRef.current;
    if (!instance?.port || instance.busy || instance.cancelled) return;
    setNotice(null);
    try {
      operation(instance.port);
    } catch (cause) {
      setNotice({ error: true, text: `カメラを操作できませんでした。${errorText(cause)}` });
    }
  }

  async function run(operation: (instance: Instance, port: NativeViewportPort) => Promise<void>) {
    const instance = instanceRef.current;
    if (!instance?.port || instance.busy || instance.cancelled) return;
    instance.busy = true;
    setBusy(true);
    setNotice(null);
    try {
      await operation(instance, instance.port);
    } catch (cause) {
      if (isCurrent(instance))
        setNotice({
          error: true,
          text: '操作を完了できませんでした。現在の編集内容はこのタブに保持しています。',
          detail: errorText(cause),
        });
    } finally {
      instance.busy = false;
      if (isCurrent(instance)) setBusy(false);
    }
  }

  async function pause(instance: Instance, port: NativeViewportPort) {
    await latest.current.onSave();
    if (!isCurrent(instance)) return;
    updateProject(instance);
    const contract = { ...latest.current.getSuspensionContract() };
    const result = port.suspend(contract);
    setStatus(port.status);
    if (!result.ok) throw new Error(result.reason);
    setNotice({ text: '保存済みの内容と復元に必要な素材を確認し、GPU表示を休止しました。' });
  }

  async function resume(instance: Instance, port: NativeViewportPort) {
    updateProject(instance);
    const contract = { ...latest.current.getSuspensionContract() };
    const result = port.resume(contract);
    setStatus(port.status);
    if (!result.ok) throw new Error(result.reason);
    setNotice({ text: '保存済みの内容からGPU表示を再開しました。' });
  }

  async function downloadPng(instance: Instance, port: NativeViewportPort) {
    updateProject(instance);
    const snapshot = latest.current.project;
    if (instance.revision !== snapshot.revision || instance.projectId !== snapshot.id)
      throw new Error('最新の内容を表示できていません。表示の更新後にPNGを作成してください。');
    const blob = await port.capturePng();
    if (!isCurrent(instance)) return;
    if (
      latest.current.project.id !== snapshot.id ||
      latest.current.project.revision !== snapshot.revision
    )
      throw new Error('画像の作成中に内容が更新されました。もう一度PNGを作成してください。');
    const document = hostRef.current?.ownerDocument;
    if (!document) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const filename = Array.from(snapshot.name, (character) =>
      character.charCodeAt(0) < 32 ? '_' : character,
    )
      .join('')
      .replace(/[\\/:*?"<>|]/g, '_');
    anchor.download = `${filename || '3d-view'}.png`;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Keep the URL valid for the browser's download task; this timer owns no controller or project.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setNotice({ text: 'PNG画像のダウンロードを開始しました。編集用バックアップではありません。' });
  }

  const active = status.state === 'active';
  const suspended = status.state === 'suspended';
  const canPause = ['active', 'hidden', 'frozen', 'context-lost'].includes(status.state);
  const failed = isFailure(status);

  return (
    <section className="native-viewport-panel" aria-labelledby={headingId}>
      <div className="native-viewport-heading">
        <h3 id={headingId}>3D表示</h3>
        <p>編集内容の保存・バックアップは、プロジェクトの保存操作から行えます。</p>
      </div>
      <div className="native-viewport-actions" role="group" aria-label="3D表示の操作">
        <button
          type="button"
          disabled={busy || !active}
          onClick={() => runCamera((port) => port.resetCamera())}
        >
          カメラをリセット
        </button>
        <button
          type="button"
          disabled={busy || !active}
          onClick={() => runCamera((port) => port.fitCamera())}
        >
          全体を表示
        </button>
        <button
          type="button"
          disabled={busy || (!canPause && !suspended)}
          onClick={() => void run(suspended ? resume : pause)}
        >
          {suspended ? 'GPU表示を再開' : '保存してGPU表示を休止'}
        </button>
        <button type="button" disabled={busy || !active} onClick={() => void run(downloadPng)}>
          PNG画像を保存
        </button>
        {failed && (
          <button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
            3D表示を再試行
          </button>
        )}
      </div>
      <div className="native-viewport-camera-actions" role="group" aria-label="カメラの操作">
        {cameraActionGroups.map((group) => (
          <fieldset key={group.label} disabled={busy || !active}>
            <legend>{group.label}</legend>
            <div className="native-viewport-camera-buttons">
              {group.actions.map(({ action, text, label }) => (
                <button
                  key={action}
                  type="button"
                  aria-label={label}
                  onClick={() =>
                    runCamera((port) => {
                      const result = port.cameraAction(action);
                      if (!result.ok) throw new Error(result.reason);
                    })
                  }
                >
                  {text}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p id={guidanceId} className="native-viewport-guidance">
        ドラッグ・1本指で回転、ホイール・2本指のピンチで拡大縮小、右ドラッグ・2本指の移動で平行移動します。
        Tabキーで操作ボタンへ移動し、Enter・スペースキーで回転・平行移動・拡大縮小できます。
        GPUの休止・再開には、現在の内容の保存が必要です。
        PNGは背景付きの表示画像です。操作パネルや3Dの編集データは含みません。
      </p>
      <div
        ref={hostRef}
        className="native-viewport-host"
        role="group"
        aria-label={`${project.name}の3D表示`}
        aria-describedby={guidanceId}
        aria-busy={status.state === 'loading'}
      />
      <NativeInspectionControls
        key={attempt}
        project={project}
        disabled={busy || !active}
        run={runCamera}
      />
      <div className={failed ? 'native-viewport-status is-error' : 'native-viewport-status'}>
        <p role={failed ? 'alert' : 'status'} aria-atomic="true">
          {statusText[status.state]}
          {failed && ' 現在の内容を残す保存・バックアップの操作は引き続き利用できます。'}
        </p>
        {status.reason && (
          <details className="native-viewport-reason">
            <summary>表示状態の詳細</summary>
            <p>{status.reason}</p>
          </details>
        )}
      </div>
      {busy && <p role="status">操作中です。完了するまでこのタブを開いておいてください。</p>}
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {notice?.detail && notice.detail !== status.reason && (
        <details className="native-viewport-reason">
          <summary>操作結果の詳細</summary>
          <p>{notice.detail}</p>
        </details>
      )}
    </section>
  );
}
