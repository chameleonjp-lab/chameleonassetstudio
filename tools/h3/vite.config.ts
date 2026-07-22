import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { createH3PublicationWindow } from './publication';

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const sourceCommit = dirty ? `${head}-dirty` : head;
const publicationWindow = createH3PublicationWindow(
  process.env.H3_PUBLISHED_AT,
  process.env.H3_EXPIRES_AT,
);
const outDir = resolve(__dirname, '../../dist-h3');
const configuredBasePath = process.env.H3_BASE_PATH?.trim() || '/';
const basePath = configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`;

export default defineConfig({
  root: resolve(__dirname),
  base: basePath,
  define: {
    __H3_SOURCE_COMMIT__: JSON.stringify(sourceCommit),
    __H3_PUBLISHED_AT__: JSON.stringify(publicationWindow?.publishedAt ?? null),
    __H3_EXPIRES_AT__: JSON.stringify(publicationWindow?.expiresAt ?? null),
  },
  plugins: [
    {
      name: 'h3-publication-metadata',
      closeBundle() {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
          resolve(outDir, 'publication.json'),
          `${JSON.stringify(
            {
              schemaVersion: 'h3-publication-1',
              status: publicationWindow ? 'open' : 'local-build',
              publishedAt: publicationWindow?.publishedAt ?? null,
              expiresAt: publicationWindow?.expiresAt ?? null,
              sourceCommit,
            },
            null,
            2,
          )}\n`,
          'utf8',
        );
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
});
