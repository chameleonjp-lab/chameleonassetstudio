import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceDirectory = resolve(root, 'docs/evidence/3d');
await mkdir(evidenceDirectory, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    '--config',
    'tools/3d-evaluation/productContinuousAutosaveRehearsal.config.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NATIVE_PRODUCT_CONTINUOUS_AUTOSAVE_EVIDENCE_DIR: evidenceDirectory,
      PRODUCT_CONTINUOUS_AUTOSAVE_RUNS: process.env.PRODUCT_CONTINUOUS_AUTOSAVE_RUNS ?? '5',
      PRODUCT_CONTINUOUS_AUTOSAVE_COMMITS: process.env.PRODUCT_CONTINUOUS_AUTOSAVE_COMMITS ?? '20',
      PRODUCT_CONTINUOUS_AUTOSAVE_PAUSE_MS:
        process.env.PRODUCT_CONTINUOUS_AUTOSAVE_PAUSE_MS ?? '200',
      PRODUCT_CONTINUOUS_AUTOSAVE_BROWSER: process.env.PRODUCT_CONTINUOUS_AUTOSAVE_BROWSER ?? 'all',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
