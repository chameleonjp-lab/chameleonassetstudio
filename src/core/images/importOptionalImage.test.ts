import { describe, expect, it } from 'vitest';
import {
  NEW_ASSET_IMPORT_ACCEPT,
  RASTER_IMPORT_ACCEPT,
  animationLoopForRepetition,
  explainUnsupportedNewAssetFile,
  genericFileMimeTypeMatches,
} from './importOptionalImage';

describe('new Asset optional import gate', () => {
  it('新規Assetだけoptional形式を含み、既存raster gateは3形式を維持する', () => {
    expect(RASTER_IMPORT_ACCEPT).toBe('image/png,image/jpeg,image/webp');
    expect(NEW_ASSET_IMPORT_ACCEPT).toContain('image/svg+xml');
    expect(NEW_ASSET_IMPORT_ACCEPT).toContain('image/gif');
    expect(NEW_ASSET_IMPORT_ACCEPT).toContain('image/apng');
  });

  it.each([
    ['hero.aseprite', '', 'PNG Sprite Sheet'],
    ['layers.psd', 'image/vnd.adobe.photoshop', 'PNGまたはWebP'],
    ['layers.ora', '', 'OpenRaster'],
    ['drawing.kra', '', 'Krita'],
  ])('%sを形式別の代替手順付きで説明する', (name, type, expected) => {
    expect(explainUnsupportedNewAssetFile({ name, type })).toContain(expected);
  });

  it('無限repeatだけをloop有効へ写像する', () => {
    expect(animationLoopForRepetition('none')).toBe(false);
    expect(animationLoopForRepetition('finite')).toBe(false);
    expect(animationLoopForRepetition('infinite')).toBe(true);
  });

  it.each([
    ['safe.svg', 'image/svg+xml'],
    ['anim.gif', 'image/gif'],
    ['anim.apng', 'image/png'],
    ['still.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['image.webp', 'image/webp'],
  ] as const)('generic MIMEの%sは拡張子と%s実体が一致する場合だけ許可する', (name, detected) => {
    expect(genericFileMimeTypeMatches(name, detected)).toBe(true);
  });

  it('generic MIMEでも拡張子と実体が矛盾するfileを拒否する', () => {
    expect(genericFileMimeTypeMatches('spoofed.svg', 'image/gif')).toBe(false);
    expect(genericFileMimeTypeMatches('unknown.bin', 'image/png')).toBe(false);
  });
});
