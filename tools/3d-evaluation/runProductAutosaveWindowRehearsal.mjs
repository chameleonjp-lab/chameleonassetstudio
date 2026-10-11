import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceDirectory = resolve(root, 'test-results/product-autosave-window-rehearsal');
await mkdir(evidenceDirectory, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    '--config',
    'tools/3d-evaluation/productAutosaveWindowRehearsal.config.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NATIVE_PRODUCT_AUTOSAVE_WINDOW_EVIDENCE_DIR: evidenceDirectory,
      PRODUCT_AUTOSAVE_WINDOW_RUNS: process.env.PRODUCT_AUTOSAVE_WINDOW_RUNS ?? '20',
      PRODUCT_AUTOSAVE_WINDOW_BROWSER: process.env.PRODUCT_AUTOSAVE_WINDOW_BROWSER ?? 'all',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
