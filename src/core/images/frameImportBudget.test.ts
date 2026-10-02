import { describe, expect, it } from 'vitest';
import {
  assertFramePixelBudget,
  assertFrameEncodedBudget,
  frameImportCheckpoint,
} from './frameImportBudget';

describe('frame import budgets', () => {
  it.each([1, 16, 64])('accepts %i standard 512px frames', (count) => {
    expect(() => assertFramePixelBudget(count * 512 * 512)).not.toThrow();
  });
  it('rejects pixels and retained bytes over the boundary', () => {
    expect(() => assertFramePixelBudget(64 * 512 * 512 + 1)).toThrow('64MiB');
    expect(() => assertFramePixelBudget(64 * 4096 * 4096)).toThrow('64MiB');
    expect(() => assertFrameEncodedBudget(128 * 1024 * 1024)).not.toThrow();
    expect(() => assertFrameEncodedBudget(128 * 1024 * 1024 + 1)).toThrow('128MiB');
  });
  it('reports progress and stops before continuing after cancellation', async () => {
    const controller = new AbortController();
    const progress: number[] = [];
    await expect(
      frameImportCheckpoint(
        {
          signal: controller.signal,
          onProgress: (done) => {
            progress.push(done);
            controller.abort();
          },
        },
        1,
        64,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).toEqual([1]);
  });
});
