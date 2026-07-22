import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const sourceCommit = dirty ? `${head}-dirty` : head;

export default defineConfig({
  root: resolve(__dirname),
  define: {
    __H3_SOURCE_COMMIT__: JSON.stringify(sourceCommit),
  },
  build: {
    outDir: resolve(__dirname, '../../dist-h3'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
  },
});
