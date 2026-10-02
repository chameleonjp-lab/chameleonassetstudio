import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { renderDistributionPages } from './exportAsset';

describe('distribution renderer real frame identity', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('applies real frame ID default instead of rendering the still asset', async () => {
    const draws: ReturnType<typeof vi.fn>[] = [];
    class Canvas {
      width: number;
      height: number;
      draw = vi.fn();
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        draws.push(this.draw);
      }
      getContext() {
        return {
          drawImage: this.draw,
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          globalAlpha: 1,
        };
      }
      async convertToBlob() {
        return new Blob(['png'], { type: 'image/png' });
      }
    }
    vi.stubGlobal('OffscreenCanvas', Canvas);
    const asset = structuredClone(characterAsset) as unknown as Asset;
    asset.layers.forEach((layer) => {
      layer.visible = true;
    });
    asset.frames = [
      {
        id: 'default',
        name: 'real frame',
        layerStates: asset.layers.map((layer) => ({ layerId: layer.id, visible: false })),
      },
    ];
    const bitmaps = new Map(
      asset.textures.map((texture) => [
        texture.id,
        { source: {} as CanvasImageSource, width: 1, height: 1, close: vi.fn() },
      ]),
    );
    const result = await renderDistributionPages(
      asset,
      bitmaps,
      { profile: 'fixed-grid', compactPages: true },
      1,
    );
    expect(draws[0]).not.toHaveBeenCalled();
    expect(result.layout.frames[0].id).toBe('default');
    expect(result.layout.pages[0].width).toBe(asset.canvasSize.width);
  });
});
