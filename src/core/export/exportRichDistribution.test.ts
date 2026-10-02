import { describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { computeDistributionSheetLayout } from './atlas';
import { inspectDistributionPreflight } from './preflight';
import {
  exportRichDistributionZip,
  inspectRichDistributionPreflight,
} from './exportRichDistribution';
import { validateRichDistributionManifest } from './distributionManifestV2.js';
const calls = vi.hoisted(() => ({ load: vi.fn(), close: vi.fn(), render: vi.fn() }));
vi.mock('./exportAsset', () => ({
  ExportError: class extends Error {},
  loadAssetBitmaps: calls.load,
  renderDistributionPages: calls.render,
}));
function fixture(id = 'asset-first') {
  const asset = structuredClone(characterAsset) as unknown as Asset;
  asset.id = id;
  asset.frames = [100, 200, 300].map((durationMs, i) => ({
    id: 'f' + i,
    name: 'same',
    layerStates: [],
    durationMs,
  }));
  asset.animations = [
    {
      id: 'animation',
      name: 'animation',
      fps: 12,
      loop: true,
      frameIds: ['f0', 'f1', 'f0', 'f2'],
      events: [{ id: 'event', name: 'step', frameId: 'f0', payload: { value: 1 } }],
    },
  ];
  return asset;
}
function rendering(asset: Asset) {
  const layout = computeDistributionSheetLayout(
    asset.frames!.map((frame) => ({
      id: frame.id,
      name: frame.name,
      sourceSize: asset.canvasSize,
      contentRect: { x: 0, y: 0, ...asset.canvasSize },
    })),
  );
  return { layout, pages: layout.pages.map(() => new Blob(['page'])) };
}
describe('rich distribution separate export path', () => {
  it('exports repeated occurrences and identical labels without weakening old preflight', async () => {
    const asset = fixture();
    expect(inspectDistributionPreflight(asset).valid).toBe(false);
    expect(inspectRichDistributionPreflight(asset).valid).toBe(true);
    calls.load.mockResolvedValue(new Map([['image', { close: calls.close }]]));
    calls.render.mockImplementation(async (a: Asset) => rendering(a));
    const archive = unzipSync(
      new Uint8Array(
        await (await exportRichDistributionZip([asset, fixture('asset-second')])).arrayBuffer(),
      ),
    );
    const pkg = JSON.parse(new TextDecoder().decode(archive['package-manifest.json']));
    expect(pkg.assets).toHaveLength(2);
    expect(new Set(pkg.assets.map((entry: { manifest: string }) => entry.manifest)).size).toBe(2);
    for (const entry of pkg.assets) {
      const manifest = validateRichDistributionManifest(
        JSON.parse(new TextDecoder().decode(archive[entry.manifest])),
      );
      expect(manifest.animations[0].occurrences.map((o) => o.startMs)).toEqual([0, 100, 300, 400]);
      expect(manifest.animations[0].occurrences[2].events[0].payload).toEqual({ value: 1 });
    }
    expect(archive['helpers/distributionRuntime.js']).toBeTruthy();
    expect(archive['helpers/distributionManifestV2.js']).toBeTruthy();
    expect(archive['examples/pixijs.html']).toBeTruthy();
    expect(calls.close).toHaveBeenCalled();
  });
  it('preflights every asset and cancellation before touching image storage', async () => {
    calls.load.mockClear();
    const bad = fixture('bad');
    bad.animations[0].frameIds = ['missing'];
    await expect(exportRichDistributionZip([fixture(), bad])).rejects.toThrow();
    expect(calls.load).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportRichDistributionZip([fixture()], { signal: controller.signal }),
    ).rejects.toThrow();
    expect(calls.load).not.toHaveBeenCalled();
  });
  it('rejects metadata expansion and duplicate IDs before rendering', async () => {
    const asset = fixture();
    asset.animations[0].frameIds = Array(4097).fill('f0');
    expect(inspectRichDistributionPreflight(asset).valid).toBe(false);
    await expect(exportRichDistributionZip([fixture(), fixture()])).rejects.toThrow(/ID/);
  });
  it('closes loaded bitmaps when rendering fails', async () => {
    calls.close.mockClear();
    calls.load.mockResolvedValue(new Map([['image', { close: calls.close }]]));
    calls.render.mockRejectedValue(new Error('render failed'));
    await expect(exportRichDistributionZip([fixture()])).rejects.toThrow('render failed');
    expect(calls.close).toHaveBeenCalledTimes(1);
  });
});

describe('real packed-layout contract', () => {
  it.each([1, 2, 3])(
    'exports a trimmed %sx package accepted by its bundled validator',
    async (scale) => {
      const asset = fixture();
      calls.load.mockResolvedValue(new Map([['image', { close: calls.close }]]));
      calls.render.mockImplementation(async (source: Asset) => {
        const layout = computeDistributionSheetLayout(
          source.frames!.map((frame) => ({
            id: frame.id,
            name: frame.name,
            sourceSize: {
              width: source.canvasSize.width * scale,
              height: source.canvasSize.height * scale,
            },
            contentRect: { x: 2 * scale, y: 3 * scale, width: 8 * scale, height: 9 * scale },
          })),
          { profile: 'packed' },
        );
        return { layout, pages: layout.pages.map(() => new Blob(['PNG fixture'])) };
      });
      const archive = unzipSync(
        new Uint8Array(
          await (
            await exportRichDistributionZip([asset], { profile: 'packed', scale })
          ).arrayBuffer(),
        ),
      );
      const pkg = JSON.parse(new TextDecoder().decode(archive['package-manifest.json']));
      const manifest = validateRichDistributionManifest(
        JSON.parse(new TextDecoder().decode(archive[pkg.assets[0].manifest])),
      );
      expect(manifest.frames[0].contentRect).toEqual({
        x: 0,
        y: 0,
        width: 8 * scale,
        height: 9 * scale,
      });
      expect(manifest.frames[0].contentOffset).toEqual({ x: 2 * scale, y: 3 * scale });
    },
  );
});
