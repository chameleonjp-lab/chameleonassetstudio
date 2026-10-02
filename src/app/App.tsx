import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { QualityStatus } from './QualityStatus';
const EditorScreen = lazy(() =>
  import('../features/editor/EditorScreen').then((module) => ({ default: module.EditorScreen })),
);

class EditorLoadBoundary extends Component<
  { children: ReactNode; onHome: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section role="alert">
        <p>編集画面を読み込めませんでした。通信を確認して再読み込みしてください。</p>
        <button onClick={this.props.onHome}>ホームへ戻る</button>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </section>
    ) : (
      this.props.children
    );
  }
}
import { HomeScreen } from '../features/home/HomeScreen';

type View = { name: 'home' } | { name: 'editor'; projectId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });

  return (
    <>
      <ConnectionStatus />
      <details className="quality-status" aria-label="公開情報">
        <summary>
          開発版・{__APP_REVISION__.slice(0, 8)}
          {__APP_DIRTY__ ? '（ローカル変更あり）' : ''}
        </summary>
        <p>2D素材の制作機能を検証中です。iPhone Safari実機と新版のゲーム向け配布は未確認です。</p>
        <p>作品の権利は制作者に帰属します。取り込む素材の利用条件は個別に確認してください。</p>
        <a href="https://github.com/chameleonjp-lab/chameleonassetstudio/issues">
          不具合の報告・問い合わせ
        </a>
      </details>
      {view.name === 'editor' ? (
        <EditorLoadBoundary key={view.projectId} onHome={() => setView({ name: 'home' })}>
          <Suspense fallback={<p role="status">編集画面を読み込み中…</p>}>
            <EditorScreen
              projectId={view.projectId}
              onBackToHome={() => setView({ name: 'home' })}
            />
          </Suspense>
        </EditorLoadBoundary>
      ) : (
        <>
          <QualityStatus />
          <HomeScreen onOpenProject={(projectId) => setView({ name: 'editor', projectId })} />
        </>
      )}
    </>
  );
}
