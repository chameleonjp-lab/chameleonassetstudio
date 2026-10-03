import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app/App';
import { EntryBoundary } from './EntryBoundary';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EntryBoundary domain="2D">
      <App />
    </EntryBoundary>
  </StrictMode>,
);
