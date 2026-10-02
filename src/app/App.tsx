import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { QualityStatus } from './QualityStatus';
import { BuildInformation } from './BuildInformation';
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
          <BuildInformation />
          <QualityStatus />
          <HomeScreen onOpenProject={(projectId) => setView({ name: 'editor', projectId })} />
        </>
      )}
    </>
  );
}
