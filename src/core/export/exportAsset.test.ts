import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { exportImage, exportZip } from './exportAsset';

const loadBlobMock = vi.fn();

vi.mock('../storage', () => ({
  loadBlob: (key: string) => loadBlobMock(key),
}));

vi.mock('../images/decodeImageSource', () => ({
  decodeImageSource: vi.fn(async () => ({
    source: {},
    close: vi.fn(),
  })),
}));

class FakeCanvas {
  width = 0;
  height = 0;

  getContext(type: string): unknown {
    if (type !== '2d') {
      return null;
    }
    return {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
    };
  }

  toBlob(callback: (blob: Blob | null) => void, type: string): void {
    callback(new Blob([new Uint8Array([1, 2, 3])], { type }));
  }
}

beforeEach(() => {
  loadBlobMock.mockReset();
  loadBlobMock.mockResolvedValue(new Blob([new Uint8Array([9])], { type: 'image/png' }));
  vi.stubGlobal('document', {
    createElement: (tagName: string) => {
      if (tagName !== 'canvas') {
        throw new Error(`unexpected element: ${tagName}`);
      }
      return new FakeCanvas();
    },
  });
});

describe('export の層境界', () => {
  it('合成画像の入力に source / thumbnail ではなく layer が参照する edit Blob を使う', async () => {
    const asset = characterAsset as unknown as Asset;

    await exportImage(asset, 'image/png');

    expect(loadBlobMock).toHaveBeenCalledTimes(1);
    expect(loadBlobMock).toHaveBeenCalledWith(`${asset.id}/textures/main.png`);
    expect(loadBlobMock).not.toHaveBeenCalledWith(`${asset.id}/source/original.png`);
    expect(loadBlobMock).not.toHaveBeenCalledWith(`${asset.id}/thumbnails/thumb.webp`);
  });

  it('export ZIP の生成は配布物を IndexedDB 保存 API へ書き戻さない', async () => {
    const asset = characterAsset as unknown as Asset;

    const blob = await exportZip(asset);

    expect(blob.type).toBe('application/zip');
    expect(loadBlobMock).toHaveBeenCalled();
  });
});
