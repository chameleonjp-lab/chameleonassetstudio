import { expect, it, vi } from 'vitest';
import { buildRichDistributionExample } from './richDistributionExamples';

it('starts the Canvas example from the RAF clock even when performance.now is later', async () => {
  const html = buildRichDistributionExample('canvas2d');
  const module = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  expect(module).toBeTruthy();
  const source = module!.replace(/^import .*;$/gm, '');
  const ticks: Array<(time: number) => void> = [];
  const listeners = new Map<string, () => void>();
  const advance = vi.fn((delta: number) => {
    if (delta < 0) throw new Error('negative playback time');
  });
  const player = { start: vi.fn(), advance, dispose: vi.fn() };
  const loaded = {
    manifest: {
      assetId: 'asset',
      frames: [{ sourceSize: { width: 32, height: 32 }, origin: { x: 0, y: 0 } }],
    },
    images: [],
  };
  const pkg = {
    assets: [loaded],
    packageManifest: { assets: [{ name: 'sample' }] },
    dispose: vi.fn(),
  };
  const status = { textContent: '' };
  const select = { value: '0', disabled: false, append: vi.fn(), addEventListener: vi.fn() };
  const stage = { append: vi.fn(), replaceChildren: vi.fn() };
  const context = { imageSmoothingEnabled: true, clearRect: vi.fn() };
  const document = {
    querySelector: (selector: string) =>
      selector === '#status' ? status : selector === '#asset' ? select : stage,
    createElement: (name: string) =>
      name === 'canvas' ? { width: 0, height: 0, getContext: () => context } : {},
  };
  const request = (tick: (time: number) => void) => {
    ticks.push(tick);
    return ticks.length;
  };
  const cancel = vi.fn();
  const execute = new Function(
    'loadRichPackage',
    'createCanvasDistribution',
    'document',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'performance',
    'window',
    `return (async () => {${source}})();`,
  ) as (...args: unknown[]) => Promise<void>;
  await execute(
    async () => pkg,
    () => player,
    document,
    request,
    cancel,
    { now: () => 500 },
    { addEventListener: (event: string, callback: () => void) => listeners.set(event, callback) },
  );
  expect(status.textContent).toContain('読み込み成功');
  expect(() => ticks.shift()!(100)).not.toThrow();
  expect(() => ticks.shift()!(150)).not.toThrow();
  expect(advance.mock.calls).toEqual([[0], [50]]);
  expect(player.start).toHaveBeenCalledTimes(1);
  listeners.get('pagehide')!();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(player.dispose).toHaveBeenCalledTimes(1);
  expect(pkg.dispose).toHaveBeenCalledTimes(1);
});
