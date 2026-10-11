import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceDirectory = resolve(root, 'test-results/product-import-first-draw-rehearsal');
await mkdir(evidenceDirectory, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    '--config',
    'tools/3d-evaluation/productImportFirstDrawRehearsal.config.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NATIVE_PRODUCT_IMPORT_FIRST_DRAW_EVIDENCE_DIR: evidenceDirectory,
      PRODUCT_IMPORT_FIRST_DRAW_RUNS: process.env.PRODUCT_IMPORT_FIRST_DRAW_RUNS ?? '5',
      PRODUCT_IMPORT_FIRST_DRAW_BROWSER: process.env.PRODUCT_IMPORT_FIRST_DRAW_BROWSER ?? 'all',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
