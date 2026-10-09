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
