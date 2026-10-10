import { readFileSync } from 'node:fs';
import { parseBuildInformation } from './src/core3d/diagnostics/buildInfo';
import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { inspectDomainBundles } from './tools/build/domainBoundary';

const configuredBasePath = process.env.APP_BASE_PATH?.trim() || '/';
const basePath = configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`;

const dirty =
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim().length > 0;
const revision =
  process.env.APP_SOURCE_COMMIT?.trim() ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const appVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
const buildInformation = parseBuildInformation({
  format: 'chameleon-build-info-1',
  appVersion,
  sourceRevision: revision,
  sourceDirty: dirty,
  nativeSchemaVersion: '0.3.0',
});
export default defineConfig({
  define: {
    __APP_REVISION__: JSON.stringify(revision),
    __APP_DIRTY__: JSON.stringify(dirty),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  base: basePath,
  build: {
    manifest: true,
    modulePreload: {
      // WebKit can retain failed modulepreloads across reloads (bug 270357).
      // Keep these fallible chunks lazy; Vite retains their CSS dependencies.
      resolveDependencies(filename, dependencies, { hostType }) {
        return hostType === 'js' &&
          /(?:^|\/)(?:NativeViewportPanel|renderer)-[^/]+\.js$/.test(filename)
          ? []
          : dependencies;
      },
    },
    rollupOptions: { input: { hub: 'index.html', two: '2d/index.html', three: '3d/index.html' } },
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    {
      // Vite's public-file lookup is exact; directory URLs otherwise reach the hub fallback.
      name: 'public-guide-directory-index',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url) {
            const [pathname, ...query] = request.url.split('?');
            if ([`${basePath}guide/`, `${basePath}guide/3d/`].includes(pathname))
              request.url = `${pathname}index.html${query.length ? '?' + query.join('?') : ''}`;
          }
          next();
        });
      },
    },
    {
      name: 'local-build-information',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (
            request.url?.split('?')[0] !== `${basePath}native-build-info.json` &&
            request.url?.split('?')[0] !== '/native-build-info.json'
          )
            return next();
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(buildInformation));
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'native-build-info.json',
          source: JSON.stringify(buildInformation, null, 2) + '\n',
        });
      },
    },
    {
      name: 'build-information',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'domain-bundles.json',
          source: JSON.stringify(inspectDomainBundles(bundle), null, 2) + '\n',
        });
        for (const [fileName, scope] of [
          ['build-info.json', 'hub'],
          ['2d/build-info.json', '2d'],
          ['3d/build-info.json', '3d'],
        ]) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: JSON.stringify({ revision, dirty, status: 'development', scope }) + '\n',
          });
        }
      },
    },
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
