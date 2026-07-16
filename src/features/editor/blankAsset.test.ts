import { describe, expect, it } from 'vitest';
import {
  MAX_BLANK_CANVAS_EDGE,
  createBlankAssetBundle,
  validateBlankCanvasSize,
} from './blankAsset';

describe('blank canvas size validation（2D-2-CREATE A）', () => {
  it.each([
    { width: 1, height: 1 },
    { width: 320, height: 180 },
    { width: MAX_BLANK_CANVAS_EDGE, height: MAX_BLANK_CANVAS_EDGE },
  ])('accepts $width x $height', (size) => {
    expect(validateBlankCanvasSize(size)).toBeNull();
  });

  it.each([
    [{ width: 0, height: 64 }, '1以上'],
    [{ width: 64.5, height: 64 }, '整数'],
    [{ width: MAX_BLANK_CANVAS_EDGE + 1, height: 64 }, '4096以下'],
    [{ width: Number.NaN, height: 64 }, '有限'],
  ] as const)('rejects invalid size %# without clamp', (size, message) => {
    expect(validateBlankCanvasSize(size)).toContain(message);
  });

  it('invalid size is rejected before Canvas / Blob generation', async () => {
    await expect(
      createBlankAssetBundle({
        name: 'invalid',
        assetType: 'character',
        size: { width: 4097, height: 64 },
        templateId: 'character-basic',
      }),
    ).rejects.toThrow('4096以下');
  });
});
