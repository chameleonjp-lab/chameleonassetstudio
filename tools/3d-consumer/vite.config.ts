import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Standalone test consumer. The product build must never import this entry or Babylon.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-3d-consumer', import.meta.url)),
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
  build: { outDir: '../../dist-3d-consumer', emptyOutDir: true, manifest: true },
});
