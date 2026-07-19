import { describe, expect, it } from 'vitest';
import { createImageAsset } from '../model';
import { validateAsset } from '../schema/validate';
import {
  MAX_IMPORT_DIMENSION,
  MAX_IMPORT_FILE_BYTES,
  assetNameFromFileName,
  blobKeyFor,
  checkImageDimensions,
  checkImportFile,
  extensionForMimeType,
  sha256Blob,
} from './importImage';

describe('checkImportFile', () => {
  it('PNG / JPG / WebP は受け付ける', () => {
    expect(checkImportFile({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(checkImportFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkImportFile({ name: 'a.webp', type: 'image/webp', size: 1000 })).toBeNull();
  });

  it('対応していない形式は理由を返す', () => {
    const message = checkImportFile({ name: 'a.gif', type: 'image/gif', size: 1000 });
    expect(message).toContain('対応していないファイル形式');
    expect(message).toContain('image/gif');
  });

  it('MIME タイプが空でも理由を返す', () => {
    const message = checkImportFile({ name: 'a', type: '', size: 1000 });
    expect(message).toContain('対応していないファイル形式');
  });

  it('25MB を超えるファイルは理由を返す', () => {
    const message = checkImportFile({
      name: 'big.png',
      type: 'image/png',
      size: MAX_IMPORT_FILE_BYTES + 1,
    });
    expect(message).toContain('ファイルサイズが大きすぎます');
  });

  it('ちょうど 25MB は受け付ける', () => {
    expect(
      checkImportFile({ name: 'ok.png', type: 'image/png', size: MAX_IMPORT_FILE_BYTES }),
    ).toBeNull();
  });
});

describe('checkImageDimensions', () => {
  it('4096 x 4096 までは受け付ける', () => {
    expect(checkImageDimensions(MAX_IMPORT_DIMENSION, MAX_IMPORT_DIMENSION)).toBeNull();
    expect(checkImageDimensions(1, 1)).toBeNull();
  });

  it('4096 を超えると理由を返す', () => {
    const message = checkImageDimensions(MAX_IMPORT_DIMENSION + 1, 100);
    expect(message).toContain('画像サイズが大きすぎます');
    expect(message).toContain(String(MAX_IMPORT_DIMENSION));
  });

  it('0 以下の寸法は理由を返す', () => {
    expect(checkImageDimensions(0, 100)).not.toBeNull();
  });
});

describe('assetNameFromFileName / extensionForMimeType', () => {
  it('拡張子を除いた名前を返す', () => {
    expect(assetNameFromFileName('hero.png')).toBe('hero');
    expect(assetNameFromFileName('トマト.webp')).toBe('トマト');
    expect(assetNameFromFileName('archive.tar.gz')).toBe('archive.tar');
  });

  it('名前が空になる場合は image を返す', () => {
    expect(assetNameFromFileName('.png')).toBe('image');
  });

  it('MIME タイプから拡張子を引ける', () => {
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('image/webp')).toBe('webp');
  });
});

describe('sha256Blob', () => {
  it('source Blob原本のbytesをlowercase SHA-256で返す', async () => {
    await expect(sha256Blob(new Blob(['abc']))).resolves.toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('createImageAsset', () => {
  const options = {
    name: 'hero',
    size: { width: 512, height: 256 },
    sourceMimeType: 'image/png',
    sourceExtension: 'png',
  } as const;

  it('schema 検証を通るアセットを作る', () => {
    const asset = createImageAsset(options);
    const result = validateAsset(asset);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('原点は下中央になる（要件 11.6）', () => {
    const asset = createImageAsset(options);
    expect(asset.origin).toEqual({ x: 256, y: 256 });
  });

  it('source / edit / thumbnail のテクスチャを持ち、編集用を画像レイヤーが参照する', () => {
    const asset = createImageAsset(options);
    const kinds = asset.textures.map((texture) => texture.kind);
    expect(kinds).toEqual(['source', 'edit', 'thumbnail']);
    const editTexture = asset.textures.find((texture) => texture.kind === 'edit')!;
    expect(asset.layers).toHaveLength(1);
    expect(asset.layers[0].textureId).toBe(editTexture.id);
    expect(editTexture.mimeType).toBe('image/png');
  });

  it('テクスチャの path はアセットディレクトリ相対になる', () => {
    const asset = createImageAsset({
      ...options,
      sourceMimeType: 'image/jpeg',
      sourceExtension: 'jpg',
    });
    const paths = asset.textures.map((texture) => texture.path);
    expect(paths[0]).toBe('source/original.jpg');
    expect(paths[1]).toBe('textures/main.png');
    expect(paths[2]).toMatch(/^thumbnails\/thumb\.(webp|png)$/);
  });

  it('blobKeyFor はアセット ID とパスを結合する', () => {
    expect(blobKeyFor('asset_1', 'textures/main.png')).toBe('asset_1/textures/main.png');
  });

  it('thumbnailには実際に縮小した寸法を記録できる', () => {
    const asset = createImageAsset({
      ...options,
      thumbnailSize: { width: 256, height: 128 },
    });
    expect(asset.textures.find((texture) => texture.kind === 'thumbnail')?.size).toEqual({
      width: 256,
      height: 128,
    });
  });
});
