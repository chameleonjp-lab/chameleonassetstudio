import { describe, expect, it } from 'vitest';
import { analyzeNativeArchitecture, type NativeArchitectureInput } from './nativeArchitecture';

const A = 'src/core3d/a.ts';
const B = 'src/core3d/b.ts';
const DOC = 'docs/architecture/3d/example.md';
function audit(files: Record<string, string>, options: Partial<NativeArchitectureInput> = {}) {
  return analyzeNativeArchitecture({
    files,
    roots: ['src/core3d'],
    consumerRoots: [],
    documents: [],
    ...options,
  });
}
function document(text: string, files: Record<string, string> = {}) {
  return audit({ [DOC]: text, ...files }, { roots: [], documents: [DOC] });
}
const codes = (report: ReturnType<typeof audit>) => report.issues.map((issue) => issue.code);
const mermaid = (text: string) => '```mermaid\nflowchart TD\n' + text + '\n```';

describe('native architecture source graph', () => {
  it('classifies AST imports, mixed type specifiers, re-exports, import types and lazy literals', () => {
    const report = audit({
      [A]: `
        import './b';
        import type { B } from './b';
        import { type B, value } from './b';
        import { type B as Other } from './b';
        export * from './b';
        export type { B } from './b';
        export { type B, value } from './b';
        type Imported = import('./b').B;
        const lazy = () => import('./b');
        const template = () => import(\`./b\`);
        // import './missing';
        const prose = "import './missing'";
      `,
      [B]: 'export interface B {}\nexport const value = 1;',
    });
    expect(report.ok).toBe(true);
    expect(report.edges.filter((edge) => edge.kind === 'runtime')).toHaveLength(6);
    expect(report.edges.filter((edge) => edge.kind === 'type')).toHaveLength(6);
    expect(report.edges.filter((edge) => edge.syntax === 'dynamic-import')).toHaveLength(2);
    expect(report.edges.every((edge) => edge.to === B)).toBe(true);
  });

  it('resolves extensionless directories, TS sources written as JS imports and assets', () => {
    const report = audit({
      [A]: "import './nested'; import './b.js'; import './style.css';",
      [B]: 'export {};',
      'src/core3d/nested/index.ts': 'export {};',
      'src/core3d/style.css': '@import "./not-traversed.css";',
    });
    expect(report.ok).toBe(true);
    expect(report.edges.map((edge) => [edge.to, edge.kind])).toEqual(
      [
        ['src/core3d/nested/index.ts', 'runtime'],
        [B, 'runtime'],
        ['src/core3d/style.css', 'asset'],
      ].sort((a, b) => a[1].localeCompare(b[1])),
    );
    expect(report.scope.inspectedSources).not.toContain('src/core3d/style.css');
  });

  it('does not inspect tests, specs, declarations or __tests__ files', () => {
    const report = audit({
      [A]: 'export {};',
      'src/core3d/a.test.ts': "import './missing-test';",
      'src/core3d/a.spec.tsx': "import './missing-spec';",
      'src/core3d/a.d.ts': "import './missing-declaration';",
      'src/core3d/__tests__/helper.ts': "import './missing-helper';",
    });
    expect(report.ok).toBe(true);
    expect(report.scope.inspectedSources).toEqual([A]);
  });

  it('preserves ESM/CommonJS extension substitution rather than choosing a same-name TS file', () => {
    const report = audit({
      [A]: "import './esm.mjs'; import './common.cjs';",
      'src/core3d/esm.mts': 'export {};',
      'src/core3d/esm.ts': 'export {};',
      'src/core3d/common.cts': 'export {};',
      'src/core3d/common.ts': 'export {};',
    });
    expect(report.ok).toBe(true);
    expect(report.edges.map((edge) => edge.to)).toEqual([
      'src/core3d/esm.mts',
      'src/core3d/common.cts',
    ]);
  });

  it('permits type declarations but rejects a runtime import of an excluded source', () => {
    const report = audit({
      [A]: "import type { X } from './x.d.ts'; import './a.test';",
      'src/core3d/x.d.ts': 'export interface X {}',
      'src/core3d/a.test.ts': 'export {};',
    });
    expect(codes(report)).toEqual(['excluded-runtime-target']);
    expect(report.scope.inspectedSources).toEqual([A]);
  });

  it('reports unresolved relative targets while leaving package internals unverified', () => {
    const report = audit({ [A]: "export * from './missing'; import 'uninspected-package';" });
    expect(report.ok).toBe(false);
    expect(codes(report)).toEqual(['unresolved-relative-import']);
    expect(report.edges.find((edge) => edge.external)?.specifier).toBe('uninspected-package');
    expect(report.limitations.join(' ')).toContain('package availability');
  });

  it('does not treat an existing but unsupplied source as inspected', () => {
    const report = audit({ [A]: "import './b';" }, { exists: (path) => path === A || path === B });
    expect(codes(report)).toEqual(['missing-source-text']);
    expect(report.scope.inspectedSources).toEqual([A]);
  });

  it('reports nonliteral lazy/worker targets and unsupported dependency syntax', () => {
    const report = audit({
      [A]: `
      import(target);
      new Worker(new URL(target, import.meta.url));
      new Worker(workerUrl);
      require('./b');
      importScripts('./b');
      import old = require('./b');
      import.meta.glob('./*.ts');
    `,
    });
    expect(report.ok).toBe(false);
    expect(codes(report)).toEqual(Array(7).fill('unsupported-source-target'));
  });

  it('fails closed on import query/hash transforms rather than claiming bundle resolution', () => {
    const report = audit({ [A]: "import './b?worker'; import './b#named';", [B]: 'export {};' });
    expect(codes(report)).toEqual(['unsupported-module-suffix', 'unsupported-module-suffix']);
    expect(report.edges.every((edge) => edge.to === B)).toBe(true);
  });

  it.each([
    'self.importScripts',
    'window.importScripts',
    'globalThis.importScripts',
    "self['importScripts']",
  ])('fails closed on qualified classic worker loading through %s', (loader) => {
    const report = audit({ [A]: `${loader}('./b.ts');`, [B]: 'export {};' });
    expect(codes(report)).toEqual(['unsupported-source-target']);
    expect(report.ok).toBe(false);
  });

  it('rejects absolute/escaping inputs and does not print absolute dependency paths', () => {
    expect(() => audit({ '/private/repo/a.ts': '' })).toThrow('repository-relative');
    expect(() => audit({ '../a.ts': '' })).toThrow('repository-relative');
    const report = audit({
      [A]: "import '/private/repo/secret.ts'; import 'file:///private/repo/secret.ts'; import '../../../outside';",
    });
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain('/private/repo');
    expect(codes(report)).toContain('unresolved-relative-import');
  });

  it('reports parser errors and missing configured roots/documents', () => {
    expect(codes(audit({ [A]: 'import {' }))).toContain('source-parse-error');
    const report = audit({}, { documents: [DOC] });
    expect(codes(report).sort()).toEqual(['missing-document', 'missing-source-root']);
    expect(report.ok).toBe(false);
  });

  it('reports runtime cycle components, including literal lazy edges and self imports', () => {
    const report = audit({
      [A]: "import('./b');",
      [B]: "export * from './a';",
      'src/core3d/self.ts': "import './self';",
    });
    expect(report.runtimeCycles).toEqual([[A, B], ['src/core3d/self.ts']]);
    expect(report.ok).toBe(false);
  });

  it('keeps type-only and mixed type/runtime cycles informational and distinct', () => {
    const typeOnly = audit({
      [A]: "import type { B } from './b';",
      [B]: "export type { A } from './a';",
    });
    expect(typeOnly.ok).toBe(true);
    expect(typeOnly.runtimeCycles).toEqual([]);
    expect(typeOnly.typeOnlyCycles).toEqual([[A, B]]);
    const mixed = audit({ [A]: "import './b';", [B]: "export type { A } from './a';" });
    expect(mixed.ok).toBe(true);
    expect(mixed.runtimeCycles).toEqual([]);
    expect(mixed.typeOnlyCycles).toEqual([]);
    expect(mixed.typeInvolvingCycles).toEqual([[A, B]]);
  });

  it('follows a lazy descendant and literal worker without calling a worker boundary an import cycle', () => {
    const entry = 'src/entries/3d.tsx';
    const lazy = 'src/features/editor3d/lazy.ts';
    const worker = 'src/adapters3d/job.worker.ts';
    const report = audit(
      {
        [entry]: "import('../features/editor3d/lazy');",
        [lazy]:
          "new Worker(new URL('../../adapters3d/job.worker.ts', import.meta.url), { type: 'module' });",
        [worker]: "import '../features/editor3d/lazy';",
      },
      { roots: [entry] },
    );
    expect(report.summary.workerEdges).toBe(1);
    expect(report.scope.inspectedSources).toEqual([worker, entry, lazy].sort());
    expect(report.runtimeCycles).toEqual([]);
    expect(report.workerDependencyCycles).toEqual([[worker, lazy].sort()]);
  });

  it('checks literal asset URLs without executing or traversing them', () => {
    const report = audit({
      [A]: "new URL('./image.png', import.meta.url);",
      'src/core3d/image.png': 'not executable',
    });
    expect(report.ok).toBe(true);
    expect(report.summary.assetEdges).toBe(1);
    expect(report.scope.inspectedSources).toEqual([A]);
  });

  it.each(
    ['window', 'globalThis', 'self'].flatMap((global) =>
      ['Worker', 'SharedWorker'].flatMap((worker) =>
        ['URL', `${global}.URL`].map((url) => ({ worker: `${global}.${worker}`, url })),
      ),
    ),
  )(
    'follows qualified $worker(new $url(...)) through a hidden 2D dependency',
    ({ worker, url }) => {
      const entry = 'src/features/editor3d/start.ts';
      const job = 'src/shared/job.ts';
      const legacy = 'src/core/legacy.ts';
      const report = audit(
        {
          [entry]: `new ${worker}(new ${url}('../../shared/job.ts', import.meta.url));`,
          [job]: "import '../core/legacy';",
          [legacy]: 'export {};',
        },
        { roots: [entry] },
      );
      expect(report.summary.workerEdges).toBe(1);
      expect(report.summary.assetEdges).toBe(0);
      expect(report.scope.inspectedSources).toContain(job);
      expect(report.violations).toContainEqual(
        expect.objectContaining({
          code: 'three-d-to-two-d',
          via: [entry, job, legacy],
        }),
      );
      expect(report.ok).toBe(false);
    },
  );

  it('recognizes literal bracket-qualified worker constructors', () => {
    const report = audit({
      [A]: "new globalThis['Worker'](new self['URL']('./b.ts', import.meta.url));",
      [B]: 'export {};',
    });
    expect(report.ok).toBe(true);
    expect(report.edges[0]).toMatchObject({ kind: 'worker', to: B });
  });

  it.each([
    "new custom.Worker(new URL('./b.ts', import.meta.url));",
    "new window.Worker(new custom.URL('./b.ts', import.meta.url));",
    "new globalThis[name](new URL('./b.ts', import.meta.url));",
  ])('fails closed on unsupported browser constructor syntax: %s', (source) => {
    const report = audit({ [A]: source, [B]: 'export {};' });
    expect(codes(report)).toContain('unsupported-source-target');
    expect(report.ok).toBe(false);
  });

  it.each(['window', 'globalThis', 'self'])(
    'classifies a standalone %s.URL as an asset',
    (global) => {
      const report = audit({
        [A]: `new ${global}.URL('./image.png', import.meta.url);`,
        'src/core3d/image.png': '',
      });
      expect(report.ok).toBe(true);
      expect(report.summary.assetEdges).toBe(1);
      expect(report.summary.workerEdges).toBe(0);
    },
  );

  it('reports missing worker scripts and worker URLs that resolve to non-code assets', () => {
    const report = audit({
      [A]: "new Worker(new URL('./missing.ts', import.meta.url)); new Worker(new URL('./image.png', import.meta.url));",
      'src/core3d/image.png': '',
    });
    expect(codes(report)).toEqual(['unresolved-relative-import', 'unsupported-worker-target']);
    expect(report.ok).toBe(false);
  });

  it('produces identical evidence for differently ordered input maps', () => {
    const first = { [A]: "import './b';", [B]: 'export {};' };
    const second = Object.fromEntries(Object.entries(first).reverse());
    expect(audit(first)).toEqual(audit(second));
  });
});

describe('native architecture dependency ownership', () => {
  it.each([
    'react',
    'react-dom/client',
    'three',
    'three/addons/example.js',
    '@babylonjs/core',
    'babylonjs-gltf2interface',
  ])('rejects core dependencies on %s, including type-only dependencies', (name) => {
    const report = audit({ [A]: `import type { Value } from '${name}';` });
    expect(report.violations.some((issue) => issue.code === 'core-boundary')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it.each([
    'src/adapters3d/x.ts',
    'src/features/editor3d/x.ts',
    'src/core/x.ts',
    'src/features/editor/x.ts',
    'src/features/home/x.ts',
    'src/workers/x.ts',
    'src/renderers/canvas2d/x.ts',
  ])('rejects core dependency ownership crossing into %s', (target) => {
    const report = audit({ [A]: `import '../../${target}';`, [target]: 'export {};' });
    expect(report.violations.some((issue) => issue.code === 'core-boundary')).toBe(true);
  });

  it('rejects adapter to product UI imports reached through a neutral module', () => {
    const adapter = 'src/adapters3d/a.ts';
    const bridge = 'src/shared/bridge.ts';
    const ui = 'src/features/editor3d/ui.ts';
    const report = audit(
      {
        [adapter]: "import '../shared/bridge';",
        [bridge]: "export type { UI } from '../features/editor3d/ui';",
        [ui]: 'export interface UI {}',
      },
      { roots: [adapter] },
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({
        code: 'adapter-ui-boundary',
        via: [adapter, bridge, ui],
        kind: 'type',
      }),
    );
  });

  it('detects a 3D to 2D path hidden behind a lazy import and worker', () => {
    const entry = 'src/entries/3d.tsx';
    const lazy = 'src/shared/lazy.ts';
    const worker = 'src/shared/job.worker.ts';
    const twoD = 'src/core/legacy.ts';
    const report = audit(
      {
        [entry]: "import('../shared/lazy');",
        [lazy]: "new Worker(new URL('./job.worker.ts', import.meta.url));",
        [worker]: "import '../core/legacy';",
        [twoD]: 'export {};',
      },
      { roots: [entry] },
    );
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: 'three-d-to-two-d', via: [entry, lazy, worker, twoD] }),
    );
  });

  it('keeps similarly named directories separate from the forbidden 2D prefixes', () => {
    const report = audit({
      [A]: "import '../core3d-extra/value';",
      'src/core3d-extra/value.ts': 'export {};',
    });
    expect(report.ok).toBe(true);
  });

  it('enforces core/adapter ownership for descendants even when only the entry is configured', () => {
    const entry = 'src/entries/3d.tsx';
    const adapter = 'src/adapters3d/a.ts';
    const ui = 'src/features/editor3d/ui.ts';
    const report = audit(
      {
        [entry]: "import '../core3d/a'; import '../adapters3d/a';",
        [A]: "import 'three';",
        [adapter]: "import '../features/editor3d/ui';",
        [ui]: 'export {};',
      },
      { roots: [entry] },
    );
    expect(report.violations.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['core-boundary', 'adapter-ui-boundary']),
    );
  });

  it('permits an independent Babylon consumer and blocks both directions of product leakage', () => {
    const consumer = 'tools/3d-consumer/main.ts';
    const isolated = audit(
      { [A]: 'export {};', [consumer]: "import '@babylonjs/core';" },
      { consumerRoots: [consumer] },
    );
    expect(isolated.ok).toBe(true);
    const leaked = audit(
      {
        [A]: "import '../../tools/3d-consumer/main';",
        [consumer]: "import '../../src/core3d/a'; import '@babylonjs/core';",
      },
      { consumerRoots: [consumer] },
    );
    expect(leaked.violations.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['consumer-in-product', 'product-in-consumer', 'core-boundary']),
    );
  });
});

describe('architecture documentation integrity', () => {
  it('checks files and directories while marking anchors, queries and external URLs unverified', () => {
    const report = document(
      '[file](./other.md?view=1#section)\n[dir](../../../src/core3d)\n[anchor](#local)\n[web](https://example.invalid/never-fetched)',
      { 'docs/architecture/3d/other.md': '', [A]: '' },
    );
    expect(report.ok).toBe(true);
    expect(report.links).toEqual([
      expect.objectContaining({
        target: 'docs/architecture/3d/other.md',
        targetKind: 'file',
        status: 'exists',
        anchor: 'unverified',
        query: 'unverified',
      }),
      expect.objectContaining({ target: 'src/core3d', targetKind: 'directory', status: 'exists' }),
      expect.objectContaining({ target: DOC, anchor: 'unverified' }),
      expect.objectContaining({ status: 'external-unverified' }),
    ]);
  });

  it('supports injected directory knowledge without resolving a directory as a source module', () => {
    const report = audit(
      { [A]: "import './nested';", [DOC]: '[folder](../../../src/core3d/nested)' },
      {
        documents: [DOC],
        exists: (path) => path === A || path === DOC || path === 'src/core3d/nested',
        pathKind: (path) => (path === 'src/core3d/nested' ? 'directory' : 'file'),
      },
    );
    expect(codes(report)).toEqual(['unresolved-relative-import']);
    expect(report.links[0]).toMatchObject({ status: 'exists', targetKind: 'directory' });
  });

  it('does not mistake historical P paths, code spans or fenced examples for links', () => {
    const report = document(
      'P `src/core3d/planned.ts` and `[example](missing.md)`\n```text\n[fake](missing.md)\n```',
    );
    expect(report.ok).toBe(true);
    expect(report.links).toEqual([]);
  });

  it('reports missing files even when the link includes a query or fragment', () => {
    const report = document('[missing](./missing.md?view=1#section)');
    expect(codes(report)).toEqual(['missing-markdown-target']);
    expect(report.links[0]).toMatchObject({
      target: 'docs/architecture/3d/missing.md',
      status: 'missing',
      anchor: 'unverified',
      query: 'unverified',
    });
  });

  it('handles encoded spaces, parentheses and reference definitions', () => {
    const report = document(
      '[file](./a%20b.md)\n[paren](./a(b).md "title")\n[reference][target]\n[target]: ./a%20b.md',
      { 'docs/architecture/3d/a b.md': '', 'docs/architecture/3d/a(b).md': '' },
    );
    expect(report.ok).toBe(true);
    expect(report.links).toHaveLength(3);
    expect(codes(document('[reference][missing]'))).toEqual(['missing-markdown-reference']);
  });

  it('fails closed on escaping, absolute, malformed and unclosed link/fence targets', () => {
    for (const link of [
      '[x](../../../../outside.md)',
      '[x](/private/file.md)',
      '[x](./bad%zz.md)',
      '[x](./unclosed',
    ])
      expect(document(link).ok).toBe(false);
    expect(codes(document('```mermaid\nflowchart TD'))).toEqual(['unclosed-markdown-fence']);
  });

  it('checks declared nodes and forward targets, with lifecycle feedback separate from import cycles', () => {
    const report = document(
      mermaid('LC_ACTIVE["active"] -->|"hidden"| LC_HIDDEN\nLC_HIDDEN["hidden"] --> LC_ACTIVE'),
    );
    expect(report.ok).toBe(true);
    expect(report.diagrams[0].feedbackCycles).toEqual([['LC_ACTIVE', 'LC_HIDDEN']]);
    expect(report.runtimeCycles).toEqual([]);
  });

  it('reports undeclared edge targets and duplicate definitions', () => {
    const report = document(mermaid('EN_ROOT["entry"] --> EN_MISSING\nEN_ROOT["duplicate"]'));
    expect(codes(report)).toEqual(['undeclared-mermaid-node', 'duplicate-mermaid-node']);
    expect(report.ok).toBe(false);
  });

  it.each([
    'A["ok"] -.-> B["unsupported arrow"]',
    'A["ok"] -->',
    'subgraph EXAMPLE',
    'A[unquoted] --> B["label"]',
    'A["ok"] --> missing',
    'A["ok"] -->|"label"|',
  ])('does not silently pass unsupported Mermaid: %s', (syntax) => {
    const report = document(mermaid(syntax));
    expect(codes(report)).toContain('unsupported-mermaid-syntax');
    expect(report.ok).toBe(false);
  });

  it('scopes node IDs to individual diagrams rather than the whole document', () => {
    const report = document(
      mermaid('RD_A["first"] --> RD_B["second"]') +
        '\n' +
        mermaid('RD_A["another"] --> RD_B["another"]'),
    );
    expect(report.ok).toBe(true);
    expect(report.diagrams).toHaveLength(2);
  });

  it('reports unsupported Mermaid fence options instead of skipping the diagram silently', () => {
    const report = document('```mermaid options\nflowchart TD\nA["a"] --> B\n```');
    expect(codes(report)).toEqual(['unsupported-mermaid-syntax']);
    expect(report.ok).toBe(false);
  });
});
