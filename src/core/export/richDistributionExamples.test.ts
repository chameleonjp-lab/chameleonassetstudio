import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { expect, it, vi } from 'vitest';
import { createDistributionPlayback } from './distributionRuntime.js';
import { buildRichDistributionExample } from './richDistributionExamples';

it.each([1, 2, 3])('keeps the %ix field-check ZIP on the current shipped runtime', (scale) => {
  const entries = unzipSync(
    readFileSync(new URL(`../../../public/release-fixtures/r05-${scale}x.zip`, import.meta.url)),
  );
  for (const target of ['canvas2d', 'pixijs', 'phaser'] as const) {
    expect(strFromU8(entries[`examples/${target}.html`])).toBe(
      buildRichDistributionExample(target),
    );
  }
  for (const module of ['Runtime', 'Canvas', 'Pixi', 'Phaser', 'ManifestV2']) {
    const name = `distribution${module}.js`;
    expect(strFromU8(entries[`helpers/${name}`])).toBe(
      readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'),
    );
  }
  for (const [path, bytes] of Object.entries(entries)) {
    expect(
      new Uint8Array(
        readFileSync(
          new URL(`../../../public/release-fixtures/r05-${scale}x/${path}`, import.meta.url),
        ),
      ),
      path,
    ).toEqual(bytes);
  }
});

it('explains the HTTPS requirement before loading a package without WebCrypto', async () => {
  const status = { textContent: '' };
  const load = vi.fn();
  const module = buildRichDistributionExample('canvas2d')
    .split('<script type="module">')[1]
    .split('</script>')[0]
    .replace(/^import .*;\n/gm, '');
  const run = new Function(
    'document',
    'globalThis',
    'loadRichPackage',
    `return (async () => { ${module} })();`,
  );
  await run({ querySelector: () => status }, { crypto: undefined }, load);
  expect(status.textContent).toContain('HTTPS');
  expect(status.textContent).toContain('localhost');
  expect(load).not.toHaveBeenCalled();
});

it('starts the shipped Canvas example when the first RAF timestamp precedes performance.now', async () => {
  const callbacks: Array<(time: number) => void> = [];
  const listeners = new Map<string, () => void>();
  const cancel = vi.fn();
  const deltas: number[] = [];
  const playback = createDistributionPlayback({
    id: 'walk',
    name: 'walk',
    loop: true,
    durationMs: 1000,
    occurrences: [
      {
        index: 0,
        frameId: 'first',
        frameIndex: 0,
        page: 0,
        startMs: 0,
        durationMs: 1000,
        events: [],
      },
    ],
  });
  const player = {
    start: vi.fn(() => playback.start()),
    advance: (delta: number) => {
      deltas.push(delta);
      return playback.advance(delta);
    },
    dispose: vi.fn(),
  };
  const status = { textContent: '' };
  const select = { value: '0', disabled: false, append: vi.fn(), addEventListener: vi.fn() };
  const stage = { append: vi.fn(), replaceChildren: vi.fn() };
  const document = {
    querySelector: (selector: string) =>
      ({ '#status': status, '#asset': select, '#stage': stage })[selector],
    createElement: (tag: string) =>
      tag === 'canvas'
        ? { width: 0, height: 0, getContext: () => ({ clearRect: vi.fn() }) }
        : { value: '', textContent: '' },
  };
  const loaded = {
    assets: [
      {
        manifest: {
          assetId: 'source',
          frames: [
            {
              sourceSize: { width: 1, height: 1 },
              origin: { x: 0, y: 0 },
            },
          ],
        },
      },
    ],
    packageManifest: { assets: [{ name: 'source' }] },
    dispose: vi.fn(),
  };
  const html = buildRichDistributionExample('canvas2d');
  const module = html
    .split('<script type="module">')[1]
    .split('</script>')[0]
    .replace(/^import .*;\n/gm, '');
  // Execute the actual shipped module with independent clock values and real playback validation.
  const run = new Function(
    'document',
    'window',
    'loadRichPackage',
    'createCanvasDistribution',
    'performance',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'globalThis',
    `return (async () => { ${module} })();`,
  );
  await run(
    document,
    { addEventListener: (event: string, callback: () => void) => listeners.set(event, callback) },
    async () => loaded,
    () => player,
    { now: () => 1000 },
    (callback: (time: number) => void) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel,
    { crypto: { subtle: {} } },
  );
  expect(status.textContent).toContain('読み込み成功');
  for (const time of [900, 900, 916]) {
    const tick = callbacks.shift()!;
    expect(() => tick(time)).not.toThrow();
  }
  expect(deltas).toEqual([0, 0, 16]);
  expect(player.start).toHaveBeenCalledTimes(1);
  listeners.get('pagehide')!();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(player.dispose).toHaveBeenCalledTimes(1);
  expect(loaded.dispose).toHaveBeenCalledTimes(1);
});
