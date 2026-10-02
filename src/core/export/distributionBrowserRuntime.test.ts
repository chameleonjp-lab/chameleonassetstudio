import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('runs the shipped browser ESM directly in Node, without a TypeScript/Vite transform', () => {
  const testFile = fileURLToPath(
    new URL('../../../tools/d3/distributionRuntime.test.mjs', import.meta.url),
  );
  const output = execFileSync(process.execPath, ['--test', testFile], { encoding: 'utf8' });
  expect(output).toContain('fail 0');
});
