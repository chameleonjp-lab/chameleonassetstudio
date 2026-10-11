import { afterEach, describe, expect, it, vi } from 'vitest';
import { resourceLedgerSnapshot } from '../../core3d/profile/resourceLedger';
import { createNativeThumbnail, THUMBNAIL_IMAGE_LIMITS } from './thumbnailImage';

function png(width = 512, height = 256, size = 33) {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return new Blob([bytes], { type: 'image/png' });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(width = 512, height = 256) {
  const bitmap = { width, height, close: vi.fn() };
  const dependencies = {
    decode: vi.fn(async () => bitmap),
    encode: vi.fn(async (_bitmap: unknown, w: number, h: number) => png(w, h)),
  };
  return { bitmap, dependencies };
}
afterEach(() => {
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

describe('derived thumbnail image ownership', () => {
  it('scales without upsampling, holds only returned bytes, and releases once', async () => {
    const { bitmap, dependencies } = fixture();
    const result = await createNativeThumbnail(png(), { dependencies });
    expect([result.width, result.height]).toEqual([192, 96]);
    expect(dependencies.encode).toHaveBeenCalledWith(bitmap, 192, 96);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().byCategory.storage).toBe(result.bytes.byteLength);
    expect(resourceLedgerSnapshot().byCategory.texture).toBe(0);
    result.dispose();
    result.dispose();
    expect(() => result.bytes).toThrow('終了');
  });
  it.each([
    [1, 1],
    [64, 128],
    [1, 4096],
  ])('keeps a valid aspect ratio for %sx%s', async (width, height) => {
    const f = fixture(width, height);
    const result = await createNativeThumbnail(png(width, height), {
      dependencies: f.dependencies,
    });
    expect(result.width).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThanOrEqual(1);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(192);
    if (width <= 192 && height <= 192)
      expect([result.width, result.height]).toEqual([width, height]);
    result.dispose();
  });
  it.each([
    new Blob(['not png']),
    new Blob(['bad'], { type: 'image/png' }),
    png(0, 1),
    png(4097, 1),
    png(3000, 3000),
    png(1, 1, THUMBNAIL_IMAGE_LIMITS.sourceBytes + 1),
  ])('rejects invalid source before decode', async (source) => {
    const f = fixture();
    await expect(createNativeThumbnail(source, { dependencies: f.dependencies })).rejects.toThrow();
    expect(f.dependencies.decode).not.toHaveBeenCalled();
  });
  it('does not release running decoder ownership early on cancellation', async () => {
    const f = fixture();
    const pending = deferred<typeof f.bitmap>();
    f.dependencies.decode.mockImplementation(() => pending.promise);
    const controller = new AbortController();
    const operation = createNativeThumbnail(png(), {
      dependencies: f.dependencies,
      signal: controller.signal,
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.dependencies.decode).toHaveBeenCalled());
    controller.abort();
    expect(resourceLedgerSnapshot().byCategory.texture).toBeGreaterThan(0);
    expect(f.bitmap.close).not.toHaveBeenCalled();
    pending.resolve(f.bitmap);
    await rejected;
    expect(f.bitmap.close).toHaveBeenCalledTimes(1);
    expect(f.dependencies.encode).not.toHaveBeenCalled();
  });
  it('retains ownership through non-interruptible encoding cancellation', async () => {
    const f = fixture();
    const pending = deferred<Blob>();
    f.dependencies.encode.mockImplementation(() => pending.promise);
    const controller = new AbortController();
    const operation = createNativeThumbnail(png(), {
      dependencies: f.dependencies,
      signal: controller.signal,
    });
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.dependencies.encode).toHaveBeenCalled());
    controller.abort();
    expect(resourceLedgerSnapshot().totalBytes).toBeGreaterThan(0);
    pending.resolve(png(192, 96));
    await rejected;
    expect(f.bitmap.close).toHaveBeenCalledTimes(1);
  });
  it('rejects pre-aborted work without decoder allocation', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createNativeThumbnail(png(), { dependencies: f.dependencies, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.dependencies.decode).not.toHaveBeenCalled();
  });
  it('closes dimension-mismatched decoded images', async () => {
    const f = fixture(999, 999);
    await expect(createNativeThumbnail(png(), { dependencies: f.dependencies })).rejects.toThrow(
      '一致',
    );
    expect(f.bitmap.close).toHaveBeenCalledTimes(1);
  });
  it.each([
    png(1, 1),
    new Blob(['bad'], { type: 'image/png' }),
    png(192, 96, THUMBNAIL_IMAGE_LIMITS.bytes + 1),
    new Blob([new Uint8Array(40)], { type: 'image/jpeg' }),
  ])('rejects invalid encoded output with complete cleanup', async (encoded) => {
    const f = fixture();
    f.dependencies.encode.mockResolvedValue(encoded);
    await expect(createNativeThumbnail(png(), { dependencies: f.dependencies })).rejects.toThrow();
    expect(f.bitmap.close).toHaveBeenCalledTimes(1);
  });
  it('releases estimates when decode, encode or close throws', async () => {
    for (const kind of ['decode', 'encode', 'close']) {
      const f = fixture();
      if (kind === 'close')
        f.bitmap.close.mockImplementation(() => {
          throw new Error('close failed');
        });
      else f.dependencies[kind as 'decode' | 'encode'].mockRejectedValue(new Error('failed'));
      await expect(
        createNativeThumbnail(png(), { dependencies: f.dependencies }),
      ).rejects.toThrow();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    }
  });
});
