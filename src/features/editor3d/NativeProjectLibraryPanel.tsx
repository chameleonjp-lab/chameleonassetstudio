import { formatNativeEditingFailure } from './editingFailure';
import { useEffect, useRef, useState } from 'react';
import type {
  ProjectLibraryEntry,
  ProjectRepository,
  RecoverySnapshotSummary,
} from '../../core3d/storage/repository';

type RecoveryPage = Awaited<ReturnType<ProjectRepository['recoveryPage']>>;
type Confirmation =
  | { kind: 'trash' | 'restore'; entry: ProjectLibraryEntry }
  | { kind: 'recover'; entry: ProjectLibraryEntry; snapshot: RecoverySnapshotSummary };
const time = (value: number | null) =>
  value === null ? '時刻の記録なし' : new Date(value).toLocaleString();
const labels = {
  nodes: '部品',
  meshes: '形状',
  materials: '材質',
  skins: 'skin',
  clips: 'clip',
  sources: '原本',
} as const;

export function NativeProjectLibraryPanel({
  repository,
  currentProjectId,
  disabled,
  run,
  onChanged,
  onRecover,
}: {
  repository: ProjectRepository;
  currentProjectId?: string;
  disabled: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
  onRecover: (entry: ProjectLibraryEntry, snapshot: RecoverySnapshotSummary) => Promise<void>;
}) {
  const [entries, setEntries] = useState<ProjectLibraryEntry[] | null>(null);
  const [history, setHistory] = useState<RecoveryPage | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false),
    generation = useRef(0),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const epoch = ++generation.current;
    setEntries(null);
    setHistory(null);
    setConfirmation(null);
    setNotice('');
    setFailure('');
    return () => {
      mounted.current = false;
      generation.current = epoch + 1;
    };
  }, [repository]);
  async function act(operation: () => Promise<void>) {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    setNotice('');
    const epoch = generation.current;
    try {
      await run(async () => {
        try {
          await operation();
        } catch (error) {
          if (mounted.current && epoch === generation.current)
            setFailure(formatNativeEditingFailure(error, 'library'));
          throw error;
        }
      });
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function refresh(epoch = generation.current) {
    const values = await repository.libraryEntries();
    if (mounted.current && epoch === generation.current) {
      setEntries(values);
      setConfirmation(null);
    }
  }
  async function readHistory(entry: ProjectLibraryEntry, offset = 0) {
    const epoch = generation.current,
      value = await repository.recoveryPage(entry.id, offset);
    if (mounted.current && epoch === generation.current) {
      setHistory(value);
      setConfirmation(null);
    }
  }
  async function apply() {
    const request = confirmation;
    const epoch = generation.current;
    const current = () => mounted.current && generation.current === epoch;
    if (!request) return;
    await act(async () => {
      if (request.kind === 'recover') {
        await onRecover(request.entry, request.snapshot);
        if (current())
          setNotice(
            '選んだ版を別の作品として保存しました。元の正常版・ごみ箱の状態は変えていません。',
          );
      } else {
        if (request.entry.id === currentProjectId)
          throw new Error('先に保存してプロジェクトを閉じてください。');
        await repository.changeLibraryTrash(request.entry, request.kind === 'trash');
        if (current())
          setNotice(
            request.kind === 'trash'
              ? '1作品をごみ箱へ移動しました。原本と復旧候補は保持しています。'
              : '1作品をごみ箱から戻しました。保存内容は変更していません。',
          );
      }
      if (!current()) return;
      await refresh(epoch);
      if (!current()) return;
      await onChanged();
      if (current()) setHistory(null);
    });
  }
  const blocked = disabled || pending;
  return (
    <section className="editor3d-card" aria-label="3D保存履歴とごみ箱">
      <h2>復旧候補とごみ箱</h2>
      <p>
        最後に正常保存できた版と、以前の保持版を読みます。未保存の現在の内容は、編集画面のバックアップで別に残してください。
      </p>
      <button type="button" disabled={blocked} onClick={() => void act(refresh)}>
        保存履歴とごみ箱を読む
      </button>
      {notice && <p role="status">{notice}</p>}
      {failure && <p role="alert">{failure}</p>}
      {entries?.length === 0 && <p>保存された作品はありません。</p>}
      {entries && (
        <ul className="editor3d-project-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.name || '名称未設定'}</strong>
              <p>
                {entry.trashed ? 'ごみ箱' : '通常の一覧'} · revision {entry.revision} · 保存{' '}
                {time(entry.savedAt)}
              </p>
              {entry.trashed && <p>ごみ箱移動 {time(entry.trashedAt)}</p>}
              <button
                type="button"
                disabled={blocked}
                aria-label={`復旧候補を読む: ${entry.name}`}
                onClick={() => void act(() => readHistory(entry))}
              >
                正常版・復旧候補を読む
              </button>
              <button
                type="button"
                disabled={blocked || entry.id === currentProjectId}
                aria-label={`${entry.trashed ? 'ごみ箱復元' : 'ごみ箱移動'}を確認: ${entry.name}`}
                onClick={() =>
                  setConfirmation({ kind: entry.trashed ? 'restore' : 'trash', entry })
                }
              >
                {entry.trashed ? 'ごみ箱から戻す' : 'ごみ箱へ移動'}
              </button>
              {entry.id === currentProjectId && (
                <p>移動する前に、この作品を保存して閉じてください。</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {history && (
        <div aria-label="保存版の比較">
          <h3>最後の正常版と保持した復旧候補</h3>
          <p>
            全{history.total}版。現在の正常版は revision {history.rootRevision}
            。表示はメタデータ比較です。コピー作成前に作品と原本のhashを検査します。
          </p>
          <p>
            件数差は正常版からの増減です。件数が同じでも、位置・色・キーなどの内容が異なる場合があります。復旧は別IDのコピーで行い、元の正常版を上書きしません。
          </p>
          <ul>
            {history.entries.map((snapshot) => (
              <li key={snapshot.snapshotId}>
                <p>
                  <strong>{snapshot.kind === 'latest' ? '最後の正常保存' : '復旧候補'}</strong> ·
                  revision {snapshot.revision ?? '不明'} · {time(snapshot.savedAt)}
                </p>
                {!snapshot.available ? (
                  <p>
                    この版のメタデータを読めません。他の候補や取得済みのバックアップを確認してください。
                  </p>
                ) : (
                  <>
                    <p>
                      作品名: {snapshot.name} ·{' '}
                      {!snapshot.difference
                        ? '正常版と比較できません'
                        : snapshot.difference.renamed
                          ? '正常版と名称が異なります'
                          : '名称の差なし'}{' '}
                      ·{' '}
                      {!snapshot.difference
                        ? '内容差は不明'
                        : snapshot.difference.contentChanged
                          ? '内容hashに差あり'
                          : '内容hashの差なし'}
                    </p>
                    {snapshot.counts && (
                      <p>
                        {Object.entries(snapshot.counts)
                          .map(
                            ([key, count]) =>
                              `${labels[key as keyof typeof labels]} ${count}（差 ${snapshot.difference?.counts?.[key as keyof typeof labels] ?? '不明'}）`,
                          )
                          .join(' / ')}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={blocked}
                      aria-label={`revision ${snapshot.revision} の別コピー復旧を確認`}
                      onClick={() => {
                        const entry = entries?.find((value) => value.id === history.projectId);
                        if (entry) setConfirmation({ kind: 'recover', entry, snapshot });
                      }}
                    >
                      この版の別コピー復旧を確認
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={blocked || history.offset === 0}
            onClick={() => {
              const entry = entries?.find((value) => value.id === history.projectId);
              if (entry) void act(() => readHistory(entry, Math.max(0, history.offset - 10)));
            }}
          >
            新しい候補へ
          </button>
          <button
            type="button"
            disabled={blocked || history.offset + history.entries.length >= history.total}
            onClick={() => {
              const entry = entries?.find((value) => value.id === history.projectId);
              if (entry) void act(() => readHistory(entry, history.offset + 10));
            }}
          >
            古い候補へ
          </button>
        </div>
      )}
      {confirmation && (
        <div role="region" aria-label="保存作品の操作確認">
          <h3>
            {confirmation.kind === 'recover'
              ? '別コピーとして復旧しますか'
              : confirmation.kind === 'trash'
                ? 'ごみ箱へ移動しますか'
                : 'ごみ箱から戻しますか'}
          </h3>
          <p>
            対象1作品: {confirmation.entry.name}（{confirmation.entry.id}）
          </p>
          {confirmation.kind === 'recover' ? (
            <p>
              選んだ revision {confirmation.snapshot.revision}{' '}
              を新しいIDで保存して開きます。元の正常版、元の復旧候補、原本は保持します。新しいコピーの容量が必要です。現在の作品を保存できない場合は切り替えません。
            </p>
          ) : (
            <p>
              作品のroot1件の一覧表示だけを変更します。保持中の復旧候補
              {confirmation.entry.recoveryCount}
              版と画像・GLB原本を残します。他の作品と2Dの保存は変更しません。ごみ箱から戻して復元できます。自動消去の期限はありません。
            </p>
          )}
          <button type="button" disabled={blocked} onClick={() => void apply()}>
            {confirmation.kind === 'recover'
              ? '確認した版を別コピーで復旧'
              : confirmation.kind === 'trash'
                ? '確認した1作品をごみ箱へ移動'
                : '確認した1作品をごみ箱から戻す'}
          </button>
          <button type="button" disabled={blocked} onClick={() => setConfirmation(null)}>
            この操作を取り消す
          </button>
        </div>
      )}
      <p>
        完全削除は行いません。ブラウザーのサイトデータやprofileを削除すると、ごみ箱と復旧候補も失う可能性があります。
      </p>
    </section>
  );
}
