import { mkdir, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import {
  exportAssetJson,
  exportDistributionZip,
  exportImage,
  exportSpriteSheet,
  exportZip,
} from './exportAsset';

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
    return new Blob([new Uint8Array([1])], {
      type: options?.type ?? 'image/png',
    });
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
    asset.layers = asset.layers.map((layer) => ({
      ...layer,
      textureId: texture.id,
    }));
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

  it('時間を失うSprite Sheet / ZIPはBlob読込前に拒否し、PNGとasset.jsonは許可する', async () => {
    const asset = assetReferencing('edit');
    asset.frames![0].durationMs = 180;

    await expect(exportSpriteSheet(asset)).rejects.toThrow(/個別表示時間/);
    await expect(exportZip(asset)).rejects.toThrow(/個別表示時間/);
    expect(loadBlobMock).not.toHaveBeenCalled();

    expect(exportAssetJson(asset)).toBeInstanceOf(Blob);
    await expect(exportImage(asset, 'image/png')).resolves.toBeInstanceOf(Blob);
    expect(loadBlobMock).toHaveBeenCalled();
  });

  it('eventを失うZIPは画像処理・保存処理の前に拒否する', async () => {
    const asset = assetReferencing('edit');
    asset.animations[0].events = [
      { id: 'event_1', name: 'attack_start', frameId: asset.frames![0].id },
    ];

    await expect(exportZip(asset)).rejects.toThrow(/attack_start.*イベント/);
    expect(loadBlobMock).not.toHaveBeenCalled();
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveAsset).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
    expect(saveProjectBundle).not.toHaveBeenCalled();
    expect(saveAssetRevision).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('Frame collider overrideはPNG/WebP/asset.jsonを許可しSprite Sheet/ZIPをBlob読込前に拒否する', async () => {
    const asset = assetReferencing('edit');
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 1, y: 2, width: 3, height: 4, futureGeometry: 'keep' },
        visible: false,
        futureEntry: { keep: true },
      },
    ];

    await expect(exportSpriteSheet(asset)).rejects.toThrow(/frame_idle_0.*col_body/s);
    await expect(exportZip(asset)).rejects.toThrow(/asset\.json.*\.casproj/s);
    expect(loadBlobMock).not.toHaveBeenCalled();

    const json = exportAssetJson(asset);
    expect(JSON.parse(await json.text()).frames[0].colliderOverrides).toEqual(
      asset.frames![0].colliderOverrides,
    );
    await expect(exportImage(asset, 'image/png')).resolves.toBeInstanceOf(Blob);
    await expect(exportImage(asset, 'image/webp')).resolves.toBeInstanceOf(Blob);
    expect(loadBlobMock).toHaveBeenCalled();
  });

  it('意味不正なFrame collider overrideは許可形式も画像処理前に拒否する', async () => {
    const asset = assetReferencing('edit');
    asset.frames![0].colliderOverrides = [{ colliderId: 'missing', visible: false }];
    expect(() => exportAssetJson(asset)).toThrow(/frame-override-dangling-collider/);
    await expect(exportImage(asset, 'image/png')).rejects.toThrow(
      /frame-override-dangling-collider/,
    );
    expect(loadBlobMock).not.toHaveBeenCalled();
  });

  it('distribution ZIPをlegacy ZIPと分離し、manifest hashとentry順を固定する', async () => {
    const asset = assetReferencing('edit');
    const firstBlob = await exportDistributionZip(asset);
    const secondBlob = await exportDistributionZip(asset);
    const legacyBlob = await exportZip(asset);
    const firstEntries = unzipSync(new Uint8Array(await firstBlob.arrayBuffer()));
    const secondEntries = unzipSync(new Uint8Array(await secondBlob.arrayBuffer()));
    const legacyEntries = unzipSync(new Uint8Array(await legacyBlob.arrayBuffer()));

    expect(firstEntries['manifest.json']).toBeInstanceOf(Uint8Array);
    expect(legacyEntries['manifest.json']).toBeUndefined();
    expect(Object.keys(firstEntries)).toEqual(Object.keys(secondEntries));
    expect(firstEntries['manifest.json']).toEqual(secondEntries['manifest.json']);

    const manifest = JSON.parse(new TextDecoder().decode(firstEntries['manifest.json']));
    expect(manifest).toMatchObject({
      format: 'chameleon-distribution',
      version: '0.1.0',
      profile: 'fixed-grid',
      scale: 1,
      files: {
        manifest: 'manifest.json',
        atlasJson: 'atlas/atlas.json',
      },
      integrity: { algorithm: 'SHA-256' },
    });
    expect(manifest.integrity.manifestHash).toMatch(/^[0-9a-f]{64}$/);

    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/group15-core-evidence.json',
      `${JSON.stringify(
        {
          workPackage: '2D-4-CORE',
          manifestHash: manifest.integrity.manifestHash,
          entryPaths: Object.keys(firstEntries),
          legacyManifestAbsent: legacyEntries['manifest.json'] === undefined,
          repeatedManifestEqual: firstEntries['manifest.json'].every(
            (byte, index) => byte === secondEntries['manifest.json'][index],
          ),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  });

  it('distribution ZIPも既存の理由付き拒否をBlob読込前に維持する', async () => {
    const asset = assetReferencing('edit');
    asset.frames![0].durationMs = 180;

    await expect(exportDistributionZip(asset)).rejects.toThrow(/個別表示時間/);
    expect(loadBlobMock).not.toHaveBeenCalled();
  });
});
