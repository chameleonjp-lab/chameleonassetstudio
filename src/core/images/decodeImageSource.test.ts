import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImageSource } from './decodeImageSource';

const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

class FakeImageOnload {
  naturalWidth = 32;
  naturalHeight = 16;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

class FakeImageOnerror {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

describe('decodeImageSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createImageBitmap が使える場合は ImageBitmap を使い、close() で解放する', async () => {
    const close = vi.fn();
    const fakeBitmap = { width: 64, height: 48, close };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap),
    );

    const decoded = await decodeImageSource(blob);
    expect(decoded.source).toBe(fakeBitmap);
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(48);
    decoded.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('createImageBitmap が無い環境では HTMLImageElement へフォールバックし、close() で revoke する', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: revoke,
    });
    vi.stubGlobal('Image', FakeImageOnload);

    const decoded = await decodeImageSource(blob);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(16);
    expect(revoke).not.toHaveBeenCalled();
    decoded.close();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });

  it('デコード失敗時は ObjectURL を revoke してからエラーにする', async () => {
    const revoke = vi.fn();
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: revoke,
    });
    vi.stubGlobal('Image', FakeImageOnerror);

    await expect(decodeImageSource(blob)).rejects.toThrow('画像をデコードできませんでした');
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});
