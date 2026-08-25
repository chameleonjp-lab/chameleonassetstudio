import { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { EditorScreen } from '../features/editor/EditorScreen';
import { HomeScreen } from '../features/home/HomeScreen';

type View = { name: 'home' } | { name: 'editor'; projectId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });

  return (
    <>
      <ConnectionStatus />
      {view.name === 'editor' ? (
        <EditorScreen projectId={view.projectId} onBackToHome={() => setView({ name: 'home' })} />
      ) : (
        <HomeScreen onOpenProject={(projectId) => setView({ name: 'editor', projectId })} />
      )}
    </>
  );
}
