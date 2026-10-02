import { useEffect, useRef, useState } from 'react';
import type { Asset, Project } from '../../core/model';
import type { InspectionPanelTarget } from '../../core/model/assetInspection';
import { downloadBlob } from '../../core/export/exportAsset';
import { loadProjectBackup } from '../../core/storage/projectBackup';
import {
  compareRevisions,
  readReferenceRevision,
  revisionJson,
  snapshotRevision,
  type RevisionReview,
  type ReviewSnapshot,
} from '../../core/review/revisionReview';
import './revisionReview.css';

interface Props {
  project: Project;
  assets: Asset[];
  blocked: boolean;
  settingsVersion: number;
  prepare: () => Promise<void>;
  onEdit: (assetId: string, panel: InspectionPanelTarget) => void;
}
const statuses = { added: '追加', removed: '削除', changed: '変更', unchanged: '変更なし' };
const fields: Record<string, string> = {
  name: '識別名',
  displayName: '表示名',
  canvasSize: '画面サイズ',
  origin: '原点',
  textures: '画像情報',
  layers: 'レイヤー',
  parts: 'パーツ',
  anchors: 'アンカー',
  colliders: '当たり判定',
  frames: 'フレーム',
  animations: '動作・時間・イベント',
  rigAnimations: 'リグ動作',
  tags: 'タグ',
  gameAttributes: 'ゲーム属性',
  provenance: '来歴',
  updatedAt: '更新日時',
  createdAt: '作成日時',
  assetType: '素材の種類',
};
export function RevisionReviewPanel({
  project,
  assets,
  blocked,
  settingsVersion,
  prepare,
  onEdit,
}: Props) {
  const [reference, setReference] = useState<ReviewSnapshot | null>(null);
  const [result, setResult] = useState<{
    review: RevisionReview;
    current: ReviewSnapshot;
    stamp: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changedOnly, setChangedOnly] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const operation = useRef<AbortController | null>(null);
  const active = useRef(true);
  const stamp = revisionJson({ project, assets, settingsVersion });
  const latest = useRef(stamp);
  latest.current = stamp;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current?.abort();
    };
  }, []);
  const stale = result !== null && (result.stamp !== stamp || blocked);
  const cancel = () => {
    operation.current?.abort();
    setNotice('比較を取り消しました。素材は変更していません。');
  };
  const run = async (kind: 'capture' | 'compare' | 'file' | 'download', file?: File) => {
    if (operation.current || blocked) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    const initialStamp = latest.current;
    try {
      let snapshot: ReviewSnapshot;
      if (kind === 'file' && file) {
        snapshot = await readReferenceRevision(file, controller.signal);
      } else {
        await prepare();
        if (controller.signal.aborted) return;
        snapshot = await snapshotRevision(await loadProjectBackup(project.id), {
          signal: controller.signal,
        });
        if (initialStamp !== latest.current)
          throw new Error('編集中の内容が変わりました。保存完了後にもう一度確認してください。');
      }
      if (!active.current || controller.signal.aborted) return;
      if (kind === 'download' && result) {
        if (snapshot.fingerprint !== result.current.fingerprint) {
          setResult(null);
          throw new Error('保存済みの内容または出力設定が変わりました。比較し直してください。');
        }
        download();
      } else if (kind === 'compare' && reference) {
        setResult({
          review: compareRevisions(reference, snapshot),
          current: snapshot,
          stamp: initialStamp,
        });
        setNotice('読込時点の比較ができました。変更行から編集し、最後にもう一度比較してください。');
      } else {
        setReference(snapshot);
        setResult(null);
        setNotice(
          kind === 'file'
            ? '前回版を参照用に読み込みました。保存中のプロジェクトは変更していません。'
            : '現在の保存内容を比較基準にしました。素材を修正してから比較できます。',
        );
      }
    } catch (cause) {
      if (active.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (operation.current === controller) operation.current = null;
      if (active.current) setBusy(false);
    }
  };
  const download = () => {
    if (!result || stale) return;
    const report = {
      ...result.review,
      files: result.current.files,
      baselineWarnings: reference?.warnings,
      baselineArchiveSha256: reference?.sourceSha256,
      baselineMigrations: reference?.migrations,
      recordedAt: new Date().toISOString(),
      status: 'snapshot-not-approval',
    };
    downloadBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      'chameleon-revision-review.json',
    );
  };
  const close = () => {
    operation.current?.abort();
    dialog.current?.close();
  };
  const edit = (assetId: string, panel: InspectionPanelTarget) => {
    close();
    onEdit(assetId, panel);
  };
  return (
    <div className="revision-entry">
      <button type="button" onClick={() => dialog.current?.showModal()}>
        修正と受渡しを開く
      </button>
      <dialog
        ref={dialog}
        className="revision-review"
        aria-label="修正と受渡し"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <button type="button" onClick={close}>
          編集・書き出しへ戻る
        </button>
        <h3>修正と受渡し</h3>
        <p>
          1. 比較基準を選ぶ → 2. 変更や不足を確認して編集 → 3.
          再確認して書き出し画面から配布用ZIPとバックアップを保存
        </p>
        <p>
          この画面は参照版を取り込まずに比較します。基準はホームへ戻るかページを閉じると消えるため、残す場合は
          .casproj も保存してください。
        </p>
        <div className="revision-actions">
          <button type="button" disabled={busy || blocked} onClick={() => void run('capture')}>
            現在を比較基準にする
          </button>
          <label>
            前回の .casproj を参照
            <input
              type="file"
              accept=".casproj"
              aria-label="比較する前回のcasproj"
              disabled={busy || blocked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void run('file', file);
              }}
            />
          </label>
          <button
            type="button"
            disabled={!reference || busy || blocked}
            onClick={() => void run('compare')}
          >
            現在の制作内容と比較
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              比較を取り消す
            </button>
          )}
          {reference && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReference(null);
                setResult(null);
                setError(null);
                setNotice('比較基準を外しました。');
              }}
            >
              比較基準を外す
            </button>
          )}
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">比較できませんでした: {error}</p>}
        {reference && (
          <p>
            比較基準: {reference.projectName}（{reference.assets.length}素材）
          </p>
        )}
        {reference && [...reference.warnings, ...reference.migrations].length > 0 && (
          <details>
            <summary>参照版の読込に関する注意</summary>
            <ul>
              {[...reference.warnings, ...reference.migrations].map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </details>
        )}
        {stale && (
          <p role="status">
            制作内容が変わったため、以下は以前の比較結果です。現在の制作内容と比較し直してください。
          </p>
        )}
        {result && (
          <>
            {!result.review.sameProject && (
              <p role="alert">
                異なるプロジェクトIDです。同名の素材も同じIDとはみなさず、追加・削除として比較します。
              </p>
            )}
            <p aria-label="制作差分の件数">
              {Object.entries(statuses)
                .map(
                  ([key, label]) =>
                    `${label} ${result.review.assets.filter((asset) => asset.status === key).length}件`,
                )
                .join(' / ')}
            </p>
            {result.review.projectChanged && <p>プロジェクト情報に変更があります。</p>}
            {result.review.readmeChanged && <p>同梱の説明文に変更があります。</p>}
            {result.review.settingsChanged && (
              <p>書き出し設定に変更があります。配布前に書き出し画面で設定を確認してください。</p>
            )}
            <label>
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(event) => setChangedOnly(event.target.checked)}
              />
              変更または必須確認がある素材だけ表示
            </label>
            <ul className="revision-assets" aria-label="制作差分">
              {result.review.assets
                .filter(
                  (asset) =>
                    !changedOnly ||
                    asset.status !== 'unchanged' ||
                    asset.issues.some((issue) => issue.severity === 'error'),
                )
                .map((asset) => (
                  <li key={asset.id}>
                    <strong>
                      {asset.name} — {statuses[asset.status]}
                    </strong>
                    {asset.fields.length > 0 && (
                      <p>変更: {asset.fields.map((field) => fields[field] ?? field).join('、')}</p>
                    )}
                    {asset.changes.length > 0 && (
                      <ul aria-label="変更内容と編集先">
                        {asset.changes.map((change) => (
                          <li key={change.path}>
                            <strong>{fields[change.field] ?? change.field}</strong>
                            <p>変更箇所: {change.path}</p>
                            <details>
                              <summary>変更前と変更後を確認</summary>
                              <p>前: {change.before}</p>
                              <p>後: {change.after}</p>
                            </details>
                            {change.panel && (
                              <button
                                type="button"
                                disabled={blocked || busy}
                                onClick={() => change.panel && edit(asset.id, change.panel)}
                              >
                                {fields[change.field] ?? change.field}を編集
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {asset.changesTruncated && (
                      <p>
                        細かな変更が200件を超えるため一部を表示しています。対象の編集画面と元ファイルでも確認してください。
                      </p>
                    )}
                    {asset.files.length > 0 && (
                      <details>
                        <summary>画像・同梱ファイルの変更 {asset.files.length}件</summary>
                        <ul>
                          {asset.files.map((file) => (
                            <li key={file.path}>
                              {statuses[file.status]}: {file.path}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {asset.status !== 'removed' && (
                      <button
                        type="button"
                        disabled={blocked || busy}
                        onClick={() => edit(asset.id, 'asset-type')}
                      >
                        「{asset.name}」を編集
                      </button>
                    )}
                    {asset.issues.length > 0 && (
                      <details>
                        <summary>
                          素材の確認項目 {asset.issues.length}件（必須{' '}
                          {asset.issues.filter((issue) => issue.severity === 'error').length}件）
                        </summary>
                        <ul>
                          {asset.issues.map((issue) => (
                            <li key={issue.id}>
                              <p>
                                {issue.severity === 'error'
                                  ? '必須確認'
                                  : issue.severity === 'warning'
                                    ? '推奨確認'
                                    : '情報'}
                                : {issue.message}
                              </p>
                              <p>{issue.action}</p>
                              <button
                                type="button"
                                disabled={blocked || busy}
                                onClick={() => edit(asset.id, issue.target.panel)}
                              >
                                {issue.target.label}へ移動
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
            </ul>
            {result.review.otherFiles.length > 0 && (
              <details>
                <summary>
                  素材に所属しない同梱ファイルの変更 {result.review.otherFiles.length}件
                </summary>
                <ul>
                  {result.review.otherFiles.map((file) => (
                    <li key={file.path}>
                      {statuses[file.status]}: {file.path}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button type="button" disabled={stale || busy} onClick={() => void run('download')}>
              比較記録を保存
            </button>
            <details>
              <summary>比較の範囲と限界</summary>
              <ul>
                {result.review.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p>基準: {result.review.baseline.fingerprint}</p>
              <p>確認時: {result.review.current.fingerprint}</p>
            </details>
          </>
        )}
        <p>
          比較は納品承認ではありません。見た目・動作はプレビューで確認し、「編集・書き出しへ戻る」から配布用ZIPで必要な素材と対象を選んでください。
        </p>
      </dialog>
    </div>
  );
}
