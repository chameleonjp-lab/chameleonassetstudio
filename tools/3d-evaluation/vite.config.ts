import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Separate output, never an input of the product's multi-page build.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: { outDir: '../../dist-3d-evaluation', emptyOutDir: true, manifest: true },
});
