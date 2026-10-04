import { expect, it } from 'vitest';
import { nativeTextureReservedBytes, reserveNativeTextureBytes } from './textureResources';
import { NATIVE_TEXTURE_PROFILE } from './textureProfile';

it('admits estimates atomically and retains overlapping owners until actual release', () => {
  const baseline = nativeTextureReservedBytes();
  const first = reserveNativeTextureBytes('old cache', 64 * 1024 * 1024);
  try {
    expect(() => reserveNativeTextureBytes('derive', 80 * 1024 * 1024)).toThrow('合計');
    expect(nativeTextureReservedBytes()).toBe(baseline + 64 * 1024 * 1024);
    const second = reserveNativeTextureBytes('new cache', 8);
    second();
    second();
    expect(nativeTextureReservedBytes()).toBe(baseline + 64 * 1024 * 1024);
  } finally {
    first();
  }
  expect(nativeTextureReservedBytes()).toBe(baseline);
  expect(() => reserveNativeTextureBytes('invalid', NaN)).toThrow();
  expect(() =>
    reserveNativeTextureBytes('invalid', NATIVE_TEXTURE_PROFILE.maxOperationBytes + 1),
  ).toThrow();
});
