import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import {
  nativeTextureReservedBytes,
  reserveNativeTextureBytes,
} from '../../core3d/model/textureResources';
import {
  decodeNativeImage,
  deriveNativeImage,
  estimateNativeImageOperationBytes,
  inspectNativeImage,
  waitForNativeImageOperations,
  type NativeImageSettings,
} from './nativeImage';

// Header-only fixtures are deliberately tiny: browser decoding is separately
// exercised by product E2E. No dimension-limit test allocates its stated pixels.
function join(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function chunk(type: string, data = new Uint8Array()): Uint8Array {
  const output = new Uint8Array(data.length + 12);
  new DataView(output.buffer).setUint32(0, data.length);
  output.set(new TextEncoder().encode(type), 4);
  output.set(data, 8);
  return output;
}

function png(width = 2, height = 1, extra: Uint8Array[] = []): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    ...extra,
    chunk('IDAT', new Uint8Array([0])),
    chunk('IEND'),
  );
}

function segment(marker: number, data: number[] | Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length + 4);
  output.set([0xff, marker]);
  new DataView(output.buffer).setUint16(2, data.length + 2);
  output.set(data, 4);
  return output;
}

function jpeg(width = 2, height = 1, marker = 0xc0, extra: Uint8Array[] = []): Uint8Array {
  const frame = [
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    17,
    0,
    2,
    17,
    0,
    3,
    17,
    0,
  ];
  return join(
    new Uint8Array([255, 216]),
    ...extra,
    segment(marker, frame),
    segment(0xda, [3, 1, 0, 2, 17, 3, 17, 0, 63, 0]),
    new Uint8Array([7, 255, 0, 8, 255, 208, 9, 255, 217]),
  );
}

function exif(orientation: number, little = true): Uint8Array {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(little ? 'II' : 'MM'));
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 1, little);
  view.setUint16(10, 0x0112, little);
  view.setUint16(12, 3, little);
  view.setUint32(14, 1, little);
  view.setUint16(18, orientation, little);
  return bytes;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function browser(pixels = [255, 0, 0, 128, 0, 255, 0, 255], width = 2, height = 1) {
  const bitmap = { width, height, close: vi.fn() };
  const decode = vi.fn().mockResolvedValue(bitmap);
  const contexts: ReturnType<typeof makeContext>[] = [];
  const canvases: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  }[] = [];
  function makeContext() {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ width, height, data: new Uint8ClampedArray(pixels) })),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
    };
  }
  const encode = vi.fn((callback: BlobCallback) =>
    callback(new Blob([png(width, height)], { type: 'image/png' })),
  );
  const createElement = vi.fn(() => {
    const context = makeContext();
    contexts.push(context);
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: encode };
    canvases.push(canvas);
    return canvas;
  });
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('document', { createElement });
  return { bitmap, decode, encode, contexts, canvases, createElement };
}

const neutral: NativeImageSettings = { gain: [1, 1, 1], brightness: 0, saturation: 1 };
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native local image preflight', () => {
  it('recognizes PNG and baseline/progressive JPEG without trusting a filename or MIME', () => {
    expect(inspectNativeImage(png())).toEqual({ mimeType: 'image/png', width: 2, height: 1 });
    for (const marker of [0xc0, 0xc2]) {
      expect(inspectNativeImage(jpeg(3, 2, marker))).toEqual({
        mimeType: 'image/jpeg',
        width: 3,
        height: 2,
      });
    }
  });

  it.each([2047, 2048])('accepts %ipx edges using only header bytes', (edge) => {
    expect(inspectNativeImage(png(edge, edge)).width).toBe(edge);
    expect(inspectNativeImage(jpeg(edge, edge)).height).toBe(edge);
  });

  it.each([0, 2049, 65535])('rejects %ipx edges before browser allocation', async (edge) => {
    const { decode, createElement } = browser();
    await expect(decodeNativeImage(png(edge, 1))).rejects.toThrow('各辺');
    await expect(decodeNativeImage(jpeg(1, edge))).rejects.toThrow('各辺');
    expect(decode).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('rejects unsupported signatures, SVG and URLs before any decoder', async () => {
    const { decode } = browser();
    for (const content of [
      '',
      '<svg/>',
      'https://example.invalid/image.png',
      'GIF89a',
      'RIFFWEBP',
    ]) {
      await expect(decodeNativeImage(new TextEncoder().encode(content))).rejects.toThrow(
        'PNG/JPEG',
      );
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects the encoded size before reading header bytes without allocating a large file', () => {
    const tiny = new Uint8Array();
    Object.defineProperty(tiny, 'byteLength', { value: NATIVE_TEXTURE_PROFILE.maxFileBytes + 1 });
    expect(() => inspectNativeImage(tiny)).toThrow('16MiB');
    const info = inspectNativeImage(png());
    const cap = NATIVE_TEXTURE_PROFILE.maxFileBytes;
    expect(
      estimateNativeImageOperationBytes(info, cap) -
        estimateNativeImageOperationBytes(info, cap - 1),
    ).toBe(3);
    expect(() => estimateNativeImageOperationBytes(info, cap + 1)).toThrow('サイズ');
    expect(() => estimateNativeImageOperationBytes(info, Number.NaN)).toThrow('サイズ');
  });

  it.each(['acTL', 'fcTL', 'fdAT'])('explicitly rejects APNG %s', (type) => {
    expect(() => inspectNativeImage(png(2, 1, [chunk(type)]))).toThrow('APNG');
  });

  it('checks all PNG chunks, including animation after IDAT, overflow and trailing bytes', () => {
    const bytes = png();
    const animated = join(bytes.subarray(0, bytes.length - 12), chunk('acTL'), chunk('IEND'));
    expect(() => inspectNativeImage(animated)).toThrow('APNG');
    const malformed = new Uint8Array(bytes);
    new DataView(malformed.buffer).setUint32(33, 0xffffffff);
    expect(() => inspectNativeImage(malformed)).toThrow('長さ');
    expect(() => inspectNativeImage(bytes.subarray(0, bytes.length - 1))).toThrow('途中');
    expect(() => inspectNativeImage(join(bytes, new Uint8Array([0])))).toThrow('終端');
    expect(() => inspectNativeImage(png(2, 1, [chunk('ABCD')]))).toThrow('必須チャンク');
  });

  it('rejects invalid PNG header encoding and repeated headers', () => {
    const invalidDepth = png();
    invalidDepth[24] = 3;
    expect(() => inspectNativeImage(invalidDepth)).toThrow('画素形式');
    expect(() => inspectNativeImage(png(2, 1, [chunk('IHDR', new Uint8Array(13))]))).toThrow(
      'IHDR',
    );
  });

  it('rejects unsupported JPEG frame modes, CMYK, duplicate frame and malformed scans', () => {
    expect(() => inspectNativeImage(jpeg(2, 1, 0xc3))).toThrow('フレーム');
    const cmyk = jpeg();
    cmyk[11] = 4;
    expect(() => inspectNativeImage(cmyk)).toThrow('8bit');
    const bytes = jpeg();
    expect(() => inspectNativeImage(bytes.subarray(0, bytes.length - 2))).toThrow('終端');
    expect(() => inspectNativeImage(join(bytes, new Uint8Array([0])))).toThrow('終端');
    const duplicate = join(bytes.subarray(0, bytes.length - 2), bytes.subarray(2));
    expect(() => inspectNativeImage(duplicate)).toThrow('フレーム');
    const badLength = jpeg();
    badLength[4] = 0xff;
    expect(() => inspectNativeImage(badLength)).toThrow('長さ');
  });

  it.each([true, false])(
    'accepts only canonical bounded EXIF orientation (little=%s)',
    (little) => {
      expect(inspectNativeImage(png(2, 1, [chunk('eXIf', exif(1, little))])).width).toBe(2);
      for (const orientation of [2, 6, 8]) {
        expect(() =>
          inspectNativeImage(png(2, 1, [chunk('eXIf', exif(orientation, little))])),
        ).toThrow('EXIF回転');
        const metadata = join(new TextEncoder().encode('Exif\0\0'), exif(orientation, little));
        expect(() => inspectNativeImage(jpeg(2, 1, 0xc0, [segment(0xe1, metadata)]))).toThrow(
          'EXIF回転',
        );
      }
      const broken = exif(1);
      new DataView(broken.buffer).setUint32(4, 0xfffffff0, true);
      expect(() => inspectNativeImage(png(2, 1, [chunk('eXIf', broken)]))).toThrow('EXIF参照');
    },
  );
});

describe('native image decode ownership', () => {
  it('uses explicit orientation/color/alpha policy and releases bitmap and canvas', async () => {
    const runtime = browser();
    const bytes = png();
    const original = new Uint8Array(bytes);
    const promise = decodeNativeImage(bytes);
    bytes.fill(0);
    const image = await promise;
    expect(image).toEqual({
      mimeType: 'image/png',
      width: 2,
      height: 1,
      pixels: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 255]),
    });
    expect(runtime.decode).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'none',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
    const blob = runtime.decode.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original);
    expect(runtime.bitmap.close).toHaveBeenCalledTimes(1);
    expect(runtime.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(runtime.canvases[0].getContext).toHaveBeenCalledWith('2d', {
      colorSpace: 'srgb',
      willReadFrequently: true,
    });
  });

  it('rejects dimension disagreement before canvas allocation and closes the bitmap', async () => {
    const runtime = browser([], 1, 2);
    await expect(decodeNativeImage(png())).rejects.toThrow('寸法');
    expect(runtime.bitmap.close).toHaveBeenCalledTimes(1);
    expect(runtime.createElement).not.toHaveBeenCalled();
  });

  it('rejects a failed pixel read and releases both resources', async () => {
    const runtime = browser([1]);
    await expect(decodeNativeImage(png())).rejects.toThrow('画素数');
    expect(runtime.bitmap.close).toHaveBeenCalledTimes(1);
    expect(runtime.canvases[0]).toMatchObject({ width: 0, height: 0 });
  });

  it('does not allocate when already aborted or the decoder is unavailable', async () => {
    const runtime = browser();
    const controller = new AbortController();
    controller.abort();
    await expect(decodeNativeImage(png(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(runtime.decode).not.toHaveBeenCalled();
    vi.stubGlobal('createImageBitmap', undefined);
    await expect(decodeNativeImage(png())).rejects.toThrow('decodeを利用できません');
    expect(runtime.createElement).not.toHaveBeenCalled();
  });

  it('queues a second 2048px image until the aborted first bitmap actually closes', async () => {
    const runtime = browser([], 2048, 2048);
    const pending = deferred<typeof runtime.bitmap>();
    runtime.decode.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const operation = decodeNativeImage(png(2048, 2048), controller.signal);
    const ownedBytes = nativeTextureReservedBytes();
    const idle = vi.fn();
    const cleanup = waitForNativeImageOperations().then(idle);
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(nativeTextureReservedBytes()).toBe(ownedBytes);
    expect(idle).not.toHaveBeenCalled();
    runtime.decode.mockRejectedValueOnce(new Error('queued decoder started after cleanup'));
    const second = decodeNativeImage(png(2048, 2048));
    const secondResult = expect(second).rejects.toThrow('queued decoder started after cleanup');
    expect(runtime.decode).toHaveBeenCalledTimes(1);
    pending.resolve(runtime.bitmap);
    await secondResult;
    await settle();
    await cleanup;
    expect(idle).toHaveBeenCalledTimes(1);
    expect(runtime.bitmap.close).toHaveBeenCalledTimes(1);
    expect(runtime.createElement).not.toHaveBeenCalled();
    expect(runtime.decode).toHaveBeenCalledTimes(2);
    expect(nativeTextureReservedBytes()).toBe(0);
  });

  it('serializes successful concurrent owners and bounds the pending operation count', async () => {
    const runtime = browser([0, 0, 0, 255], 1, 1);
    const pending = deferred<typeof runtime.bitmap>();
    runtime.decode.mockReturnValue(pending.promise);
    const count = NATIVE_TEXTURE_PROFILE.maxQueuedOperations + 1;
    const operations = Array.from({ length: count }, () => decodeNativeImage(png(1, 1)));
    await expect(decodeNativeImage(png(1, 1))).rejects.toThrow('待機処理数');
    expect(runtime.decode).toHaveBeenCalledTimes(1);
    pending.resolve(runtime.bitmap);
    const results = await Promise.all(operations);
    expect(results.every((result) => result.pixels.join(',') === '0,0,0,255')).toBe(true);
    expect(runtime.bitmap.close).toHaveBeenCalledTimes(count);
    expect(runtime.decode).toHaveBeenCalledTimes(count);
    for (const result of runtime.decode.mock.results) expect(result.type).toBe('return');
  });

  it('aborts a queued job without decoding and keeps queued input immutable', async () => {
    const runtime = browser();
    const pending = deferred<typeof runtime.bitmap>();
    runtime.decode.mockReturnValueOnce(pending.promise);
    const first = decodeNativeImage(png());
    const controller = new AbortController();
    const cancelled = decodeNativeImage(png(), controller.signal);
    const bytes = png();
    const original = new Uint8Array(bytes);
    const last = decodeNativeImage(bytes);
    bytes.fill(0);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(runtime.decode).toHaveBeenCalledTimes(1);
    pending.resolve(runtime.bitmap);
    await Promise.all([first, last]);
    await waitForNativeImageOperations();
    expect(runtime.decode).toHaveBeenCalledTimes(2);
    const blob = runtime.decode.mock.calls[1][0] as Blob;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original);
  });

  it('still rejects invalid queued metadata before creating another browser job', async () => {
    const runtime = browser();
    const pending = deferred<typeof runtime.bitmap>();
    runtime.decode.mockReturnValueOnce(pending.promise);
    const first = decodeNativeImage(png());
    await expect(decodeNativeImage(png(2049, 1))).rejects.toThrow('各辺');
    expect(runtime.decode).toHaveBeenCalledTimes(1);
    pending.resolve(runtime.bitmap);
    await first;
    await waitForNativeImageOperations();
  });

  it('rejects an 80MiB derivation with 64MiB retained elsewhere before decode', async () => {
    const runtime = browser();
    const baseline = nativeTextureReservedBytes();
    const retained = reserveNativeTextureBytes('test-retained-renderer', 64 * 1024 * 1024);
    try {
      // Tiny header represents a 2048px image; no actual large pixel allocation.
      await expect(deriveNativeImage(png(2048, 2048), neutral)).rejects.toThrow('合計メモリ');
      expect(runtime.decode).not.toHaveBeenCalled();
      expect(runtime.createElement).not.toHaveBeenCalled();
      await waitForNativeImageOperations();
      expect(nativeTextureReservedBytes()).toBe(baseline + 64 * 1024 * 1024);
    } finally {
      retained();
    }
    expect(nativeTextureReservedBytes()).toBe(baseline);
  });

  it('rejects input copying when other owners already fill the combined budget', async () => {
    const runtime = browser();
    const baseline = nativeTextureReservedBytes();
    const retained = reserveNativeTextureBytes(
      'test-full-owner',
      NATIVE_TEXTURE_PROFILE.maxOperationBytes,
    );
    try {
      await expect(decodeNativeImage(png())).rejects.toThrow('合計メモリ');
      expect(runtime.decode).not.toHaveBeenCalled();
      expect(nativeTextureReservedBytes()).toBe(
        baseline + NATIVE_TEXTURE_PROFILE.maxOperationBytes,
      );
    } finally {
      retained();
    }
    expect(nativeTextureReservedBytes()).toBe(baseline);
  });

  it('advances queued work after a combined-budget claim fails and preserves other tickets', async () => {
    const runtime = browser();
    const baseline = nativeTextureReservedBytes();
    const pending = deferred<typeof runtime.bitmap>();
    runtime.decode.mockReturnValueOnce(pending.promise);
    const first = decodeNativeImage(png());
    const refused = expect(decodeNativeImage(png(2048, 2048))).rejects.toThrow('合計メモリ');
    const last = decodeNativeImage(png());
    const retained = reserveNativeTextureBytes('test-retained-renderer', 64 * 1024 * 1024);
    try {
      pending.resolve(runtime.bitmap);
      await Promise.all([first, refused, last]);
      await waitForNativeImageOperations();
      expect(runtime.decode).toHaveBeenCalledTimes(2);
      expect(runtime.bitmap.close).toHaveBeenCalledTimes(2);
      expect(nativeTextureReservedBytes()).toBe(baseline + 64 * 1024 * 1024);
    } finally {
      retained();
    }
    expect(nativeTextureReservedBytes()).toBe(baseline);
  });

  it('releases codec tickets before the receiving owner claims its result', async () => {
    browser();
    const baseline = nativeTextureReservedBytes();
    await decodeNativeImage(png());
    expect(nativeTextureReservedBytes()).toBe(baseline);
    const resultOwner = reserveNativeTextureBytes(
      'test-result-owner',
      NATIVE_TEXTURE_PROFILE.maxOperationBytes,
    );
    resultOwner();
    await waitForNativeImageOperations();
    expect(nativeTextureReservedBytes()).toBe(baseline);
  });
});

describe('derived baseColor PNG', () => {
  it('preserves neutral pixels and alpha and never mutates the original bytes', async () => {
    const pixels = [128, 64, 32, 17, 9, 0, 255, 0];
    const runtime = browser(pixels);
    const bytes = png();
    const original = new Uint8Array(bytes);
    const output = await deriveNativeImage(bytes, neutral);
    expect(inspectNativeImage(output)).toEqual(inspectNativeImage(original));
    expect(bytes).toEqual(original);
    expect(Array.from(runtime.contexts[1].putImageData.mock.calls[0][0].data)).toEqual(pixels);
    expect(runtime.encode).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
  });

  it.each([
    {
      pixels: [128, 0, 0, 31],
      settings: { ...neutral, gain: [2, 1, 1] },
      expected: [176, 0, 0, 31],
    },
    {
      pixels: [0, 0, 0, 255],
      settings: { ...neutral, brightness: 0.25 },
      expected: [137, 137, 137, 255],
    },
    {
      pixels: [255, 0, 0, 128],
      settings: { ...neutral, saturation: 0 },
      expected: [127, 127, 127, 128],
    },
  ])(
    'applies bounded linear RGB correction and keeps alpha: $expected',
    async ({ pixels, settings, expected }) => {
      const runtime = browser(pixels, 1, 1);
      await deriveNativeImage(png(1, 1), settings as NativeImageSettings);
      expect(Array.from(runtime.contexts[1].putImageData.mock.calls[0][0].data)).toEqual(expected);
    },
  );

  it('rejects out-of-range settings before decoding', async () => {
    const runtime = browser();
    for (const settings of [
      { ...neutral, brightness: Number.NaN },
      { ...neutral, brightness: 1.01 },
      { ...neutral, saturation: -1 },
      { ...neutral, saturation: 2.01 },
      { ...neutral, gain: [1, 1, 4.01] },
    ]) {
      await expect(deriveNativeImage(png(), settings as NativeImageSettings)).rejects.toThrow(
        '設定範囲',
      );
    }
    expect(runtime.decode).not.toHaveBeenCalled();
  });

  it('snapshots settings before an asynchronous decode', async () => {
    const runtime = browser([128, 0, 0, 31], 1, 1);
    const gain: [number, number, number] = [2, 1, 1];
    const settings: NativeImageSettings = { ...neutral, gain };
    const operation = deriveNativeImage(png(1, 1), settings);
    settings.brightness = 1;
    gain[0] = 0;
    await operation;
    expect(Array.from(runtime.contexts[1].putImageData.mock.calls[0][0].data)).toEqual([
      176, 0, 0, 31,
    ]);
  });

  it('rejects a null encoder result and releases its canvas', async () => {
    const runtime = browser();
    runtime.encode.mockImplementation((callback) => callback(null));
    await expect(deriveNativeImage(png(), neutral)).rejects.toThrow('生成に失敗');
    expect(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
  });

  it('rejects encoded dimension disagreement', async () => {
    const runtime = browser();
    runtime.encode.mockImplementation((callback) =>
      callback(new Blob([png(1, 1)], { type: 'image/png' })),
    );
    await expect(deriveNativeImage(png(), neutral)).rejects.toThrow('寸法');
    expect(runtime.canvases[1]).toMatchObject({ width: 0, height: 0 });
  });

  it('discards late encoded output after cancellation and releases its canvas', async () => {
    const runtime = browser();
    let callback: BlobCallback | undefined;
    runtime.encode.mockImplementation((value) => {
      callback = value;
    });
    const controller = new AbortController();
    const operation = deriveNativeImage(png(), neutral, controller.signal);
    await settle();
    expect(callback).toBeDefined();
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    callback!(new Blob([png()], { type: 'image/png' }));
    await settle();
    expect(runtime.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
  });
});
