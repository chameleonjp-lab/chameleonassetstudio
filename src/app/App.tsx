import { useState } from 'react';
import { EditorScreen } from '../features/editor/EditorScreen';
import { HomeScreen } from '../features/home/HomeScreen';

type View = { name: 'home' } | { name: 'editor'; projectId: string };

export function App() {
  const [view, setView] = useState<View>({ name: 'home' });

  if (view.name === 'editor') {
    return (
      <EditorScreen projectId={view.projectId} onBackToHome={() => setView({ name: 'home' })} />
    );
  }
  return <HomeScreen onOpenProject={(projectId) => setView({ name: 'editor', projectId })} />;
}
