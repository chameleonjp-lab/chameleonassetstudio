import { NativeDiagnosticsPanel } from '../features/editor3d/NativeDiagnosticsPanel';
import '../features/editor3d/editor3d.css';
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
    <EntryBoundary
      domain="3D"
      recovery={
        <div className="editor3d">
          <NativeDiagnosticsPanel
            appVersion={__APP_VERSION__}
            sourceRevision={__APP_REVISION__}
            sourceDirty={__APP_DIRTY__}
            schemaVersion="0.3.0"
            errorId="editor-render-failed"
            feature="editor"
          />
        </div>
      }
    >
      <Suspense fallback={<p role="status">3Dの保存・救出機能を準備中…</p>}>
        <Editor3DShell />
      </Suspense>
    </EntryBoundary>
  </StrictMode>,
);
