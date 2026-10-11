import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceDirectory = resolve(root, 'test-results/product-animation-frame-rehearsal');
await mkdir(evidenceDirectory, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  [
    'playwright',
    'test',
    '--config',
    'tools/3d-evaluation/productAnimationFrameRehearsal.config.ts',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NATIVE_PRODUCT_ANIMATION_FRAME_EVIDENCE_DIR: evidenceDirectory,
      PRODUCT_ANIMATION_FRAME_WINDOW_MS: process.env.PRODUCT_ANIMATION_FRAME_WINDOW_MS ?? '60000',
      PRODUCT_ANIMATION_FRAME_BROWSER: process.env.PRODUCT_ANIMATION_FRAME_BROWSER ?? 'all',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
