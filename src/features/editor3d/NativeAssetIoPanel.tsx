import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { startAssetIo } from '../../adapters3d/gltf/assetIoClient';
import { captureAssetSnapshot } from '../../core3d/export/snapshot';
import type {
  AssetExport,
  AssetImport,
  AssetIoJob,
  AssetIoProgress,
} from '../../core3d/ports/assetIoPort';
import {
  ASSET_IO_PROFILE,
  assertIoBudget,
  reserveAssetIoBytes,
} from '../../core3d/profile/assetIoProfile';
import type { ProjectSession } from './projectSession';
import './nativeAssetIoPanel.css';

type Kind = 'import' | 'export';
type Activity = {
  kind: Kind;
  generation: number;
  session: ProjectSession;
  id: string;
  revision: number;
  name: string;
  controller: AbortController;
  job?: AssetIoJob;
};
type Progress = AssetIoProgress & { kind: Kind; revision: number };
type ExportRecord = {
  data: AssetExport;
  projectId: string;
  zipName: string;
  release(): void;
};
type Download = { timer: ReturnType<typeof setTimeout>; release(): void };
const lossPrefix = 'Source-only features require explicit loss approval: ';
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const abortError = () => new DOMException('処理を中止しました。', 'AbortError');

function safeFilename(name: string) {
  return (
    name
      .normalize('NFKC')
      .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, '_')
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .slice(0, 80) || '3d-asset'
  );
}

function fileProblem(file: File | null, sidecar: File | null) {
  if (
    file &&
    (!/\.glb$/i.test(file.name) || !file.size || file.size > ASSET_IO_PROFILE.sourceBytes)
  )
    return 'GLBは空でない.glbファイルを選択してください。上限は32MiBです。';
  if (
    sidecar &&
    (!/\.json$/i.test(sidecar.name) || !sidecar.size || sidecar.size > ASSET_IO_PROFILE.jsonBytes)
  )
    return 'game.jsonは空でない.jsonファイルを選択してください。上限は8MiBです。';
  return '';
}

function readFile(file: File, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    reader.onload = () => {
      cleanup();
      if (signal.aborted) reject(abortError());
      else if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('ファイルの内容を読み取れませんでした。'));
    };
    reader.onerror = () => {
      cleanup();
      reject(reader.error ?? new Error('ファイルを読み取れませんでした。'));
    };
    reader.onabort = () => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      reader.readAsArrayBuffer(file);
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}

function phaseLabel(phase: string) {
  return (
    (
      {
        start: '処理を開始',
        validate: '出力内容を検査',
        geometry: '形状と動きを変換',
        encoded: 'GLB・付属ファイルを作成',
      } as Record<string, string>
    )[phase] ?? phase
  );
}

export function NativeAssetIoPanel({
  session,
  onImport,
}: {
  session: ProjectSession;
  onImport(result: AssetImport, signal: AbortSignal): Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [sidecar, setSidecar] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [sidecarKey, setSidecarKey] = useState(0);
  const [allowLoss, setAllowLoss] = useState(false);
  const [losses, setLosses] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [sourceHash, setSourceHash] = useState('');
  const [exported, setExported] = useState<ExportRecord | null>(null);
  const [foreground, setForeground] = useState(!document.hidden);
  const active = useRef<Activity | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const composing = useRef(false);
  const latestSession = useRef(session);
  const available = useRef(!document.hidden);
  const currentExport = useRef<ExportRecord | null>(null);
  const downloads = useRef(new Map<string, Download>());
  const subscription = useMemo(
    () => ({
      subscribe: (listener: () => void) => session.edit.subscribe(listener),
      getSnapshot: () => JSON.stringify([session.state.revision, session.state.readOnly]),
    }),
    [session],
  );
  useSyncExternalStore(subscription.subscribe, subscription.getSnapshot, subscription.getSnapshot);
  const state = session.state;
  const inputProblem = fileProblem(file, sidecar);
  const busy = progress !== null;

  useLayoutEffect(() => {
    latestSession.current = session;
  }, [session]);

  const revokeDownloads = useCallback(() => {
    for (const [url, value] of downloads.current) {
      clearTimeout(value.timer);
      URL.revokeObjectURL(url);
      value.release();
    }
    downloads.current.clear();
  }, []);
  const clearExport = useCallback(() => {
    currentExport.current?.release();
    currentExport.current = null;
    setExported(null);
  }, []);
  const cancel = useCallback((reason: string, notify = true) => {
    const previous = active.current;
    active.current = null;
    generation.current++;
    previous?.controller.abort();
    previous?.job?.cancel();
    if (notify && mounted.current && previous) {
      setProgress(null);
      setFailure('');
      setNotice(reason);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setFile(null);
    setSidecar(null);
    setFileKey((value) => value + 1);
    setAllowLoss(false);
    setLosses([]);
    setSourceHash('');
    setProgress(null);
    setFailure('');
    setNotice('');
    clearExport();
    const unsubscribe = session.edit.subscribe(() => {
      const running = active.current;
      if (
        running?.kind === 'import' &&
        running.session === session &&
        (session.state.readOnly || session.state.revision !== running.revision)
      )
        cancel(
          '読み込み中に作品や編集権限が変わったため中止しました。現在の作品は保持しています。',
        );
    });
    return () => {
      mounted.current = false;
      cancel('', false);
      unsubscribe();
      revokeDownloads();
      currentExport.current?.release();
      currentExport.current = null;
    };
  }, [session, cancel, clearExport, revokeDownloads]);

  useEffect(() => {
    let frozen = false;
    let pageHidden = false;
    const update = () => {
      const allowed = !document.hidden && !frozen && !pageHidden;
      available.current = allowed;
      setForeground(allowed);
      if (!allowed)
        cancel('画面が背景へ移動したため処理を中止しました。再開にはもう一度操作してください。');
    };
    const freeze = () => {
      frozen = true;
      update();
    };
    const resume = () => {
      frozen = false;
      update();
    };
    const hide = () => {
      pageHidden = true;
      update();
      revokeDownloads();
    };
    const show = () => {
      pageHidden = false;
      update();
    };
    document.addEventListener('visibilitychange', update);
    document.addEventListener('freeze', freeze);
    document.addEventListener('resume', resume);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('freeze', freeze);
      document.removeEventListener('resume', resume);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [cancel, revokeDownloads]);

  function isCurrent(running: Activity) {
    return (
      mounted.current &&
      available.current &&
      !document.hidden &&
      active.current === running &&
      generation.current === running.generation &&
      latestSession.current === running.session &&
      !running.controller.signal.aborted
    );
  }
  function begin(kind: Kind) {
    if (composing.current || !mounted.current || !available.current || document.hidden || !open)
      return null;
    if (active.current) {
      setFailure('実行中の処理を終えるか、取り消してから操作してください。');
      return null;
    }
    if (kind === 'import' && session.state.readOnly) {
      setFailure('読み取り専用の作品からは取り込みを開始できません。');
      return null;
    }
    const project = session.project;
    const running: Activity = {
      kind,
      generation: ++generation.current,
      session,
      id: project.id,
      revision: project.revision,
      name: project.name,
      controller: new AbortController(),
    };
    active.current = running;
    setProgress({
      kind,
      revision: project.revision,
      phase: kind === 'import' ? 'ファイルを読み込み' : '固定revisionを準備',
      fraction: 0,
    });
    setFailure('');
    setNotice('');
    return { running, project };
  }
  function observe(running: Activity, value: AssetIoProgress) {
    if (!isCurrent(running)) return;
    setProgress({
      kind: running.kind,
      revision: running.revision,
      phase: phaseLabel(value.phase),
      fraction: Number.isFinite(value.fraction) ? Math.min(1, Math.max(0, value.fraction)) : 0,
    });
  }
  function finish(running: Activity) {
    if (active.current !== running) return;
    active.current = null;
    if (mounted.current) setProgress(null);
  }
  function report(running: Activity, cause: unknown) {
    if (!isCurrent(running)) return;
    const text = message(cause);
    if (running.kind === 'import' && text.startsWith(lossPrefix)) {
      setLosses(text.slice(lossPrefix.length).split(', ').filter(Boolean));
      setAllowLoss(false);
      setFailure(
        'そのまま編集できない情報があります。下の一覧を確認し、対応部分への変換を許可する場合だけチェックして再実行してください。',
      );
    } else setFailure(`${text} 現在の作品と選択した原本は保持しています。`);
  }
  function selectFile(next: File | null, isSidecar: boolean) {
    cancel('選択ファイルが変わったため処理を中止しました。');
    if (isSidecar) setSidecar(next);
    else setFile(next);
    setAllowLoss(false);
    setLosses([]);
    setSourceHash('');
    setFailure('');
    setNotice('');
  }
  async function importAsset() {
    if (!file || inputProblem) return;
    const started = begin('import');
    if (!started) return;
    const { running } = started;
    const permittedLoss = allowLoss && losses.length > 0;
    let releaseRead: (() => void) | undefined;
    let releaseResult: (() => void) | undefined;
    try {
      releaseRead = reserveAssetIoBytes(file.size + (sidecar?.size ?? 0));
      const bytes = await readFile(file, running.controller.signal);
      if (!isCurrent(running)) return;
      assertIoBudget(bytes.length, ASSET_IO_PROFILE.sourceBytes, 'GLB');
      const sidecarBytes = sidecar ? await readFile(sidecar, running.controller.signal) : undefined;
      if (!isCurrent(running)) return;
      if (sidecarBytes)
        assertIoBudget(sidecarBytes.length, ASSET_IO_PROFILE.jsonBytes, 'game.json');
      releaseRead();
      releaseRead = undefined;
      const projectId = crypto.randomUUID();
      running.job = startAssetIo(
        {
          kind: 'import',
          bytes,
          projectId,
          allowLoss: permittedLoss,
          ...(sidecarBytes ? { sidecar: sidecarBytes } : {}),
        },
        (value) => observe(running, value),
      );
      const result = await running.job.promise;
      if (!isCurrent(running)) return;
      if (
        !('project' in result) ||
        result.project.id !== projectId ||
        !(result.blobs instanceof Map) ||
        !Array.isArray(result.losses) ||
        !result.losses.every((loss) => typeof loss === 'string') ||
        !/^[a-f0-9]{64}$/.test(result.sourceHash)
      )
        throw new Error('読み込み結果の識別情報が不正です。');
      const current = session.project;
      if (
        session.state.readOnly ||
        current.id !== running.id ||
        current.revision !== running.revision
      )
        throw new Error('読み込み中に作品や編集権限が変わりました。再実行してください。');
      if (result.losses.length && !permittedLoss)
        throw new Error('未承認の変換を含むため取り込みません。');
      const jsonBytes = new TextEncoder().encode(JSON.stringify(result.project)).length;
      assertIoBudget(jsonBytes, ASSET_IO_PROFILE.jsonBytes, 'Imported project JSON');
      const retainedBytes = [...result.blobs.values()].reduce((sum, value) => {
        if (!(value instanceof Uint8Array)) throw new Error('取り込んだ原本の内容が不正です。');
        return sum + value.length;
      }, 0);
      assertIoBudget(retainedBytes, ASSET_IO_PROFILE.totalBlobBytes, 'Imported blobs');
      // The worker has released its reservation; the atomic copy still retains inputs and staging copies.
      releaseResult = reserveAssetIoBytes(
        jsonBytes * 4 + retainedBytes * 4 + bytes.length + (sidecarBytes?.length ?? 0),
      );
      observe(running, { phase: '新しいコピーを保存', fraction: 0.95 });
      await onImport(result, running.controller.signal);
      if (!isCurrent(running)) return;
      setSourceHash(result.sourceHash);
      setLosses(result.losses);
      setNotice('新しいコピーとして取り込みました。原本GLBもコピー内に保持しています。');
    } catch (cause) {
      report(running, cause);
    } finally {
      releaseRead?.();
      releaseResult?.();
      finish(running);
    }
  }
  async function exportAsset() {
    const started = begin('export');
    if (!started) return;
    const { running, project } = started;
    let releaseCapture: (() => void) | undefined;
    try {
      // Admission precedes blob copies. A conservative bound also includes older downloadable results.
      const jsonBytes = new TextEncoder().encode(JSON.stringify(project)).length;
      assertIoBudget(jsonBytes, ASSET_IO_PROFILE.jsonBytes, 'Project JSON');
      const blobBound = Math.min(
        project.blobIds.length * ASSET_IO_PROFILE.sourceBytes,
        ASSET_IO_PROFILE.totalBlobBytes,
      );
      releaseCapture = reserveAssetIoBytes(jsonBytes * 4 + blobBound * 4);
      const snapshot = captureAssetSnapshot(project, (id) =>
        session.readBlob(id, ASSET_IO_PROFILE.sourceBytes),
      );
      releaseCapture();
      releaseCapture = undefined;
      running.job = startAssetIo({ kind: 'export', snapshot }, (value) => observe(running, value));
      const result = await running.job.promise;
      if (!isCurrent(running)) return;
      if (
        !('glb' in result) ||
        result.revision !== running.revision ||
        !Array.isArray(result.warnings) ||
        !result.warnings.every((warning) => typeof warning === 'string')
      )
        throw new Error('出力結果のrevisionが一致しません。');
      for (const bytes of [result.glb, result.zip, result.sidecar, result.manifest]) {
        if (!(bytes instanceof Uint8Array)) throw new Error('出力ファイルの内容が不正です。');
        assertIoBudget(bytes.length, ASSET_IO_PROFILE.outputBytes, 'Output');
      }
      assertIoBudget(result.sidecar.length, ASSET_IO_PROFILE.jsonBytes, 'game.json');
      assertIoBudget(result.manifest.length, ASSET_IO_PROFILE.jsonBytes, 'manifest.json');
      const retainedBytes =
        result.glb.length + result.zip.length + result.sidecar.length + result.manifest.length;
      const release = reserveAssetIoBytes(retainedBytes);
      const record: ExportRecord = {
        data: result,
        projectId: running.id,
        zipName: `${safeFilename(running.name)}-r${running.revision}.zip`,
        release,
      };
      currentExport.current?.release();
      currentExport.current = record;
      setExported(record);
      setNotice(
        `revision ${result.revision}の出力を作成しました。下のボタンから保存できます。ゲームエンジンでの動作確認は別途必要です。`,
      );
    } catch (cause) {
      report(running, cause);
    } finally {
      releaseCapture?.();
      finish(running);
    }
  }
  function download(bytes: Uint8Array, filename: string, mimeType: string) {
    if (
      composing.current ||
      !mounted.current ||
      !available.current ||
      document.hidden ||
      !exported ||
      currentExport.current !== exported
    )
      return;
    let release: (() => void) | undefined;
    let url: string | undefined;
    try {
      if (session.project.id !== exported.projectId)
        throw new Error('作品が変わりました。もう一度出力してください。');
      release = reserveAssetIoBytes(bytes.length * 2);
      const blob = new Blob([bytes.slice().buffer], { type: mimeType });
      url = URL.createObjectURL(blob);
      const createdUrl = url;
      const releaseBytes = release;
      const timer = setTimeout(() => {
        URL.revokeObjectURL(createdUrl);
        downloads.current.delete(createdUrl);
        releaseBytes();
      }, 60_000);
      downloads.current.set(url, { timer, release: releaseBytes });
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
      setFailure('');
      setNotice(`${filename}（revision ${exported.data.revision}）のダウンロードを開始しました。`);
    } catch (cause) {
      if (url) {
        const retained = downloads.current.get(url);
        if (retained) clearTimeout(retained.timer);
        downloads.current.delete(url);
        URL.revokeObjectURL(url);
      }
      release?.();
      setFailure(message(cause));
    }
  }
  function close() {
    if (composing.current) return;
    const wasRunning = active.current !== null;
    cancel('入出力を閉じたため処理を中止しました。');
    revokeDownloads();
    clearExport();
    setFile(null);
    setSidecar(null);
    setFileKey((value) => value + 1);
    setAllowLoss(false);
    setLosses([]);
    setSourceHash('');
    setFailure('');
    if (!wasRunning) setNotice('入出力を閉じました。作品と保存済みファイルは保持しています。');
    setOpen(false);
  }
  return (
    <section
      className="native-asset-io"
      aria-label="3D GLB入出力"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        } else if (event.key === 'Escape' && active.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel('処理を中止しました。現在の作品と原本は保持しています。');
        }
      }}
      onClickCapture={(event) => {
        if (composing.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <h3>GLBを取り込み・書き出す</h3>
      {open ? (
        <button type="button" onClick={close}>
          GLB入出力を閉じる
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          GLB入出力を開く
        </button>
      )}
      {failure && <p role="alert">{failure}</p>}
      {notice && <p role="status">{notice}</p>}
      {open && (
        <>
          <p>
            取り込みは新しいコピーを作り、現在の作品を上書きしません。失敗・取消時も選択した原本を変更しません。
          </p>
          {!foreground && (
            <p role="status">
              画面が背景にある間は処理できません。戻ってから明示的に再実行してください。
            </p>
          )}
          {state.readOnly && (
            <p role="status">
              読み取り専用です。出力はできます。取り込みは編集可能な作品から行ってください。
            </p>
          )}
          {progress && (
            <div aria-live="polite" className="native-asset-io-progress">
              <p>
                {progress.kind === 'import' ? '取り込み' : '出力'}: {progress.phase}（
                {Math.round(progress.fraction * 100)}%）
              </p>
              <p>
                {progress.kind === 'export' ? '固定した出力元' : '開始時の作品'} revision{' '}
                {progress.revision}
              </p>
              <progress aria-label="GLB入出力の進捗" value={progress.fraction} max={1} />
              <button
                type="button"
                onClick={() =>
                  cancel('処理を中止しました。保存直後のコピーがある場合は作品一覧で確認できます。')
                }
              >
                GLB処理を取り消す
              </button>
            </div>
          )}
          <fieldset disabled={busy || !foreground || state.readOnly}>
            <legend>新しいコピーとして取り込む</legend>
            <label>
              読み込むGLB（32MiBまで）
              <input
                key={`glb-${fileKey}`}
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null, false)}
              />
            </label>
            {file && (
              <p>
                原本: {file.name}（{file.size.toLocaleString()} bytes）
              </p>
            )}
            <label>
              対応するgame.json（任意・8MiBまで）
              <input
                key={`json-${fileKey}-${sidecarKey}`}
                type="file"
                accept=".json,application/json"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null, true)}
              />
            </label>
            {sidecar && <p>付属情報: {sidecar.name}</p>}
            <button
              type="button"
              disabled={!sidecar}
              onClick={() => {
                selectFile(null, true);
                setSidecarKey((value) => value + 1);
              }}
            >
              game.jsonの選択を外す
            </button>
            <p>
              game.jsonは同じGLBのものを選択してください。hashとID対応が異なる組み合わせは拒否します。
            </p>
            {inputProblem && <p role="alert">{inputProblem}</p>}
            {!!losses.length && (
              <div className="native-asset-io-losses">
                <p>編集用への変換で再現されず、原本にだけ残る情報:</p>
                <ul>
                  {losses.map((loss, index) => (
                    <li key={`${index}:${loss}`}>{loss}</li>
                  ))}
                </ul>
              </div>
            )}
            <label className="native-asset-io-checkbox">
              <input
                type="checkbox"
                checked={allowLoss}
                disabled={!losses.length}
                onChange={(event) => setAllowLoss(event.target.checked)}
              />
              一覧の損失を確認し、原本を保持して対応部分だけを編集用に変換する
            </label>
            <p>
              最初は変換を許可せず検査します。対応外の情報は変換後のGLBに再現されません。原本の保全には作品バックアップを使用してください。
            </p>
            <button
              type="button"
              disabled={!file || !!inputProblem || (!!losses.length && !allowLoss)}
              onClick={() => void importAsset()}
            >
              {losses.length
                ? '損失を許可して新しいコピーへ再取り込み'
                : 'GLBを検査して新しいコピーへ取り込む'}
            </button>
          </fieldset>
          {sourceHash && <p className="native-asset-io-hash">保持した原本 SHA-256: {sourceHash}</p>}
          <fieldset disabled={busy || !foreground}>
            <legend>固定revisionから出力する</legend>
            <p>
              現在のrevision: {state.revision}
              。作成開始時のrest正本を固定し、出力中も編集を続けられます。後の変更は次の出力に含まれます。
            </p>
            <p>
              GLBはm・Y上・+Z前の正本座標です。単位・原点・前方向・anchor・colliderはgame.jsonで受け渡します。受渡し先での二重変換に注意してください。
            </p>
            <button type="button" onClick={() => void exportAsset()}>
              GLB・付属情報・ZIPを作成
            </button>
          </fieldset>
          {exported && (
            <section aria-label="作成済みの3D出力">
              <h4>作成済み: revision {exported.data.revision}</h4>
              {state.revision !== exported.data.revision && (
                <p>
                  現在の作品はrevision {state.revision}です。以下は以前に固定したrevision{' '}
                  {exported.data.revision}の出力です。
                </p>
              )}
              <p>
                ZIPにはmodel.glb・game.json・manifest.jsonが入ります。単体保存でもこのファイル名をそろえて使用してください。これは編集用の完全な作品バックアップではありません。
              </p>
              {!!exported.data.warnings.length && (
                <div>
                  <p>出力時の注意:</p>
                  <ul>
                    {exported.data.warnings.map((warning, index) => (
                      <li key={`${index}:${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="native-asset-io-downloads">
                <button
                  type="button"
                  disabled={!foreground}
                  onClick={() => download(exported.data.glb, 'model.glb', 'model/gltf-binary')}
                >
                  GLBを保存
                </button>
                <button
                  type="button"
                  disabled={!foreground}
                  onClick={() => download(exported.data.sidecar, 'game.json', 'application/json')}
                >
                  game.jsonを保存
                </button>
                <button
                  type="button"
                  disabled={!foreground}
                  onClick={() =>
                    download(exported.data.manifest, 'manifest.json', 'application/json')
                  }
                >
                  manifest.jsonを保存
                </button>
                <button
                  type="button"
                  disabled={!foreground}
                  onClick={() => download(exported.data.zip, exported.zipName, 'application/zip')}
                >
                  ZIPを保存
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  revokeDownloads();
                  clearExport();
                }}
              >
                作成済み出力を閉じてメモリを解放
              </button>
              <p>
                大きい作品で容量制限が出た場合は、保存後に作成済み出力を閉じてから再実行してください。
              </p>
              <p>ファイル作成の成功は、受渡し先のゲームエンジンでの動作確認を意味しません。</p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
