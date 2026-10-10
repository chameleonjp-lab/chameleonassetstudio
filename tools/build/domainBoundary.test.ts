import { describe, expect, it } from 'vitest';
import type { OutputBundle } from 'rollup';
import { inspectDomainBundles } from './domainBoundary';
function bundle(extra: string): OutputBundle {
  const chunk = (name: string, path: string, modules: Record<string, unknown>) => ({
    type: 'chunk',
    isEntry: true,
    fileName: name,
    facadeModuleId: '/repo/' + path,
    modules,
    code: '',
    imports: [],
    dynamicImports: [],
    referencedFiles: [],
  });
  return {
    'hub.js': chunk('hub.js', 'index.html', {}),
    '2d.js': chunk('2d.js', '2d/index.html', {}),
    '3d.js': chunk('3d.js', '3d/index.html', { [extra]: {} }),
  } as unknown as OutputBundle;
}
describe('isolated consumer dependency ownership', () => {
  it('allows native 3D product modules', () =>
    expect(inspectDomainBundles(bundle('/repo/src/core3d/model/project.ts'))['3d']).toBeTruthy());
  it('rejects Babylon imports from the actual product bundle', () => {
    for (const path of [
      '/repo/node_modules/@babylonjs/core/scene.js',
      '/repo/node_modules/@babylonjs/loaders/glTF/index.js',
      '/repo/node_modules/babylonjs-gltf2interface/index.js',
    ])
      expect(() => inspectDomainBundles(bundle(path))).toThrow('imports another domain');
  });
});

it('uses a distinct dependency optimizer cache for simultaneous app and consumer servers', async () => {
  const { resolveConfig } = await import('vite');
  const app = await resolveConfig({ configFile: 'vite.config.ts' }, 'serve');
  const consumer = await resolveConfig({ configFile: 'tools/3d-consumer/vite.config.ts' }, 'serve');
  expect(consumer.cacheDir).not.toBe(app.cacheDir);
  expect(consumer.optimizeDeps.entries).toEqual(['index.html']);
});

it('emits distinct native update metadata without replacing the three legacy build contracts', async () => {
  const { resolveConfig } = await import('vite');
  const { parseBuildInformation } = await import('../../src/core3d/diagnostics/buildInfo');
  const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'build');
  const assets: { fileName: string; source: string }[] = [];
  for (const name of ['local-build-information', 'build-information']) {
    const plugin = config.plugins.find((candidate) => candidate.name === name);
    expect(plugin).toBeDefined();
    const hook = plugin!.generateBundle;
    const handler = typeof hook === 'function' ? hook : hook!.handler;
    const invoke = handler as unknown as (
      this: { emitFile: (asset: { fileName: string; source: string }) => void },
      options: object,
      output: OutputBundle,
    ) => void;
    invoke.call(
      {
        emitFile: (asset) => {
          assets.push(asset);
        },
      },
      {},
      bundle('/repo/src/core3d/model/project.ts'),
    );
  }
  expect(new Set(assets.map((asset) => asset.fileName)).size).toBe(assets.length);
  const native = assets.find((asset) => asset.fileName === 'native-build-info.json');
  expect(parseBuildInformation(JSON.parse(native!.source)).nativeSchemaVersion).toBe('0.3.0');
  for (const scope of ['hub', '2d', '3d']) {
    const path = scope === 'hub' ? 'build-info.json' : `${scope}/build-info.json`;
    const legacy = JSON.parse(assets.find((asset) => asset.fileName === path)!.source);
    expect(legacy).toMatchObject({ scope, status: 'development' });
    expect(Object.keys(legacy).sort()).toEqual(['dirty', 'revision', 'scope', 'status']);
  }
});

it('resolves public guide directory requests before the hub fallback without opening a server', async () => {
  const { resolveConfig } = await import('vite');
  for (const base of ['/', '/chameleonassetstudio/']) {
    const previous = process.env.APP_BASE_PATH;
    process.env.APP_BASE_PATH = base;
    try {
      const config = await resolveConfig({ configFile: 'vite.config.ts' }, 'serve');
      const plugin = config.plugins.find(
        (candidate) => candidate.name === 'public-guide-directory-index',
      )!;
      const hook = plugin.configureServer!;
      const handler = typeof hook === 'function' ? hook : hook.handler;
      let middleware!: (request: { url?: string }, response: object, next: () => void) => void;
      const invoke = handler as unknown as (server: {
        middlewares: { use: (value: typeof middleware) => void };
      }) => void;
      invoke({
        middlewares: {
          use: (value) => {
            middleware = value;
          },
        },
      });
      for (const suffix of ['guide/', 'guide/3d/', 'guide/3d/?lang=ja?retained']) {
        const request = { url: base + suffix };
        let next = 0;
        middleware(request, {}, () => {
          next++;
        });
        expect(request.url).toBe(base + suffix.replace(/\/(\?|$)/, '/index.html$1'));
        expect(next).toBe(1);
      }
      for (const url of [
        undefined,
        base + '3d/',
        base + 'guide/3d/index.html',
        base + 'guide/other/',
      ]) {
        const request = { url };
        middleware(request, {}, () => {});
        expect(request.url).toBe(url);
      }
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_PATH;
      else process.env.APP_BASE_PATH = previous;
    }
  }
});
