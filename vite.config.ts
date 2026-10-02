import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const configuredBasePath = process.env.APP_BASE_PATH?.trim() || '/';
const basePath = configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`;

const dirty =
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim().length > 0;
const revision =
  process.env.APP_SOURCE_COMMIT?.trim() ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
export default defineConfig({
  define: { __APP_REVISION__: JSON.stringify(revision), __APP_DIRTY__: JSON.stringify(dirty) },
  base: basePath,
  plugins: [
    react(),
    {
      name: 'build-information',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({ revision, dirty, status: 'development', scope: '2d' }) + '\n',
        });
      },
    },
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
