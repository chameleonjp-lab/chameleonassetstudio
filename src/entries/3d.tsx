import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryBoundary } from './EntryBoundary';

const Editor3DShell = lazy(() =>
  import('../features/editor3d/Editor3DShell').then((module) => ({
    default: module.Editor3DShell,
  })),
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EntryBoundary domain="3D">
      <Suspense fallback={<p role="status">3Dの保存・救出機能を準備中…</p>}>
        <Editor3DShell />
      </Suspense>
    </EntryBoundary>
  </StrictMode>,
);
