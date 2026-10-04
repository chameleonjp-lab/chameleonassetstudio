import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyChanges, changedScope } from './classify-changes.mjs';

test('Markdown-only changes do not build, test browsers or publish', () => {
  assert.deepEqual(classifyChanges(['AGENTS.md', 'docs/plan.md', 'public/guide/readme.md']), {
    code: false,
    e2e: false,
    publish: false,
    h3: false,
  });
});
test('product and build inputs publish and receive browser checks', () => {
  for (const file of [
    'src/features/home/home.css',
    'public/guide/index.html',
    'index.html',
    '2d/index.html',
    '3d/index.html',
    'src/entries/3d.tsx',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json',
    'tools/pages/assemble.mjs',
    'tools/build/domainBoundary.ts',
    '.github/workflows/h3-pages.yml',
  ]) {
    const scope = classifyChanges([file]);
    assert.equal(scope.publish, true, file);
    assert.equal(scope.e2e, true, file);
  }
});
test('test-only changes do not publish', () => {
  assert.deepEqual(classifyChanges(['e2e/app.spec.ts']), {
    code: true,
    e2e: true,
    publish: false,
    h3: false,
  });
});
test('UI-only changes avoid H3 measurement while core and publishing changes retain it', () => {
  assert.equal(classifyChanges(['src/features/editor/editor.css']).h3, false);
  for (const file of [
    'src/core/rig/rig.ts',
    'src/core/model/asset.ts',
    'tools/h3/matrix.ts',
    'tools/pages/assemble.mjs',
    'tools/build/domainBoundary.ts',
    '.github/workflows/ci.yml',
  ])
    assert.equal(classifyChanges([file]).h3, true, file);
});
test('unavailable base fails safe and initial pushes receive all checks', () => {
  assert.deepEqual(changedScope(undefined, 'HEAD'), {
    code: true,
    e2e: true,
    publish: true,
    h3: true,
  });
});

test('separate WebKit configuration requires browser checks without publishing', () => {
  assert.equal(classifyChanges(['playwright.webkit.config.ts']).e2e, true);
  assert.equal(classifyChanges(['playwright.webkit.config.ts']).publish, false);
});

test('isolated native viewport evaluation keeps browser checks without product publication', () => {
  for (const file of [
    'tools/3d-evaluation/nativeViewport.ts',
    'tools/3d-evaluation/package-lock.json',
    'tools/3d-edit-evaluation/controller.ts',
    'tools/3d-edit-evaluation/vite.config.ts',
  ]) {
    assert.deepEqual(classifyChanges([file]), { code: true, e2e: true, publish: false, h3: false });
  }
});
