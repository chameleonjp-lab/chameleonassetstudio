import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { exportImage, exportZip } from './exportAsset';

const {
  loadBlobMock,
  saveProject,
  saveAsset,
  saveBlob,
  saveProjectBundle,
  saveAssetRevision,
  deleteBlob,
} = vi.hoisted(() => ({
  loadBlobMock: vi.fn(),
  saveProject: vi.fn(),
  saveAsset: vi.fn(),
  saveBlob: vi.fn(),
  saveProjectBundle: vi.fn(),
  saveAssetRevision: vi.fn(),
  deleteBlob: vi.fn(),
}));

vi.mock('../storage', () => ({
  loadBlob: loadBlobMock,
  saveProject,
  saveAsset,
  saveBlob,
  saveProjectBundle,
  saveAssetRevision,
  deleteBlob,
}));

vi.mock('../images/decodeImageSource', () => ({
  decodeImageSource: vi.fn(async () => ({
    source: { width: 1, height: 1 },
    width: 1,
    height: 1,
    close: vi.fn(),
  })),
}));

class TestCanvas {
  width = 0;
  height = 0;
  getContext() {
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
  async convertToBlob(options?: { type?: string }) {
    return new Blob([new Uint8Array([1])], { type: options?.type ?? 'image/png' });
  }
}

describe('exportAsset texture kind boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('OffscreenCanvas', TestCanvas);
    loadBlobMock.mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' }));
  });

  function assetReferencing(kind: 'edit' | 'source' | 'thumbnail'): Asset {
    const asset = structuredClone(characterAsset) as unknown as Asset;
    const texture = asset.textures.find((candidate) => candidate.kind === kind) ?? {
      id: 'tex_thumbnail',
      kind,
      name: 'thumbnail',
      mimeType: 'image/png',
      size: { width: 1, height: 1 },
      path: 'thumbs/main.png',
    };
    if (!asset.textures.some((candidate) => candidate.id === texture.id)) {
      asset.textures.push(texture);
    }
    asset.layers = asset.layers.map((layer) => ({ ...layer, textureId: texture.id }));
    return asset;
  }

  it('edit 参照の layer は export できる', async () => {
    await expect(exportImage(assetReferencing('edit'), 'image/png')).resolves.toBeInstanceOf(Blob);
    expect(loadBlobMock).toHaveBeenCalled();
  });

  it('source 参照の layer は Blob を読まずに export を拒否する', async () => {
    await expect(exportImage(assetReferencing('source'), 'image/png')).rejects.toThrow(
      /edit テクスチャ/,
    );
    expect(loadBlobMock).not.toHaveBeenCalled();
  });

  it('thumbnail 参照の layer は Blob を読まずに export を拒否する', async () => {
    await expect(exportImage(assetReferencing('thumbnail'), 'image/png')).rejects.toThrow(
      /edit テクスチャ/,
    );
    expect(loadBlobMock).not.toHaveBeenCalled();
  });

  it('export ZIP 生成後も保存系 API は呼ばれない', async () => {
    await expect(exportZip(assetReferencing('edit'))).resolves.toBeInstanceOf(Blob);
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveAsset).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(saveProjectBundle).not.toHaveBeenCalled();
    expect(saveAssetRevision).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});
