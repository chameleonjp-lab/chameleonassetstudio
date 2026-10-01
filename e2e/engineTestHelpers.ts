import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

// Optional verified CDN cache for managed environments whose browser trust store
// cannot read the session proxy CA. Default CI still loads the public CDN.
export async function useVerifiedEngineCache(page: Page, engine: 'phaser' | 'pixi') {
  const directory = process.env.PLAYWRIGHT_ENGINE_CACHE_DIR;
  if (!directory) return;
  const reference =
    engine === 'phaser'
      ? {
          filename: 'phaser-4.2.0.min.js',
          url: 'https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js',
          hash: '0021a766a53abd24d67474b0a318568caa260812d95e92e86b85fe2fb0018e93',
        }
      : {
          filename: 'pixi-8.12.0.min.js',
          url: 'https://cdn.jsdelivr.net/npm/pixi.js@8.12.0/dist/pixi.min.js',
          hash: 'f69d3e1aad9db2498db0f4e9f103df7062cbaf52f5e19792102008c96fd11b34',
        };
  const bytes = await readFile(join(directory, reference.filename));
  if (createHash('sha256').update(bytes).digest('hex') !== reference.hash) {
    throw new Error('Engine CDN cache integrity mismatch');
  }
  await page.route(reference.url, (route) =>
    route.fulfill({ body: bytes, contentType: 'application/javascript' }),
  );
}
