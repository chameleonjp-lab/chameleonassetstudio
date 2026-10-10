import { expect, it } from 'vitest';
import { ASSET_IO_PROFILE, assertIoBudget } from './assetIoProfile';
it('admits below/at limits and rejects unsafe/overflow inputs', () => {
  for (const limit of [ASSET_IO_PROFILE.sourceBytes, ASSET_IO_PROFILE.outputBytes]) {
    expect(() => assertIoBudget(limit - 1, limit, 'test')).not.toThrow();
    expect(() => assertIoBudget(limit, limit, 'test')).not.toThrow();
    for (const value of [limit + 1, -1, NaN, Infinity, 0.1])
      expect(() => assertIoBudget(value, limit, 'test')).toThrow();
  }
});

it('shares the peak estimate with image resources in both reservation orders', async () => {
  const { reserveAssetIoBytes, assetIoReservedBytes } = await import('./assetIoProfile');
  const { reserveNativeTextureBytes } = await import('../model/textureResources');
  const releaseIo = reserveAssetIoBytes(200 * 1024 * 1024);
  expect(() => reserveAssetIoBytes(-1)).toThrow();
  expect(() => reserveNativeTextureBytes('parallel image', 60 * 1024 * 1024)).toThrow();
  releaseIo();
  const releaseImage = reserveNativeTextureBytes('parallel image', 100 * 1024 * 1024);
  expect(() => reserveAssetIoBytes(160 * 1024 * 1024)).toThrow();
  releaseImage();
  expect(assetIoReservedBytes()).toBe(0);
});
