import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { reserveNativeTextureBytes } from '../../core3d/model/textureResources';
import {
  inspectNativeImage,
  validateNativeImageDimensions,
  type NativeImageInfo,
} from '../../core3d/model/nativeImageMetadata';
export { inspectNativeImage };
export type { NativeImageInfo };

/** Top-left first, unpremultiplied RGBA8 in the canvas sRGB color space. */
export interface DecodedNativeImage extends NativeImageInfo {
  pixels: Uint8Array;
}

export interface NativeImageSettings {
  /** Per-channel multiplier, [0, 4], applied in linear RGB. */
  gain: readonly [number, number, number];
  /** Additive linear RGB offset, [-1, 1]. */
  brightness: number;
  /** Linear-luminance saturation multiplier, [0, 2]. */
  saturation: number;
}

function invalid(message: string): never {
  throw new Error(`3D画像: ${message}`);
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('画像処理を取り消しました', 'AbortError');
}

let activePixels = 0;
let activeBytes = 0;
let queuedBytes = 0;
interface ImageOperation {
  encodedBytes: number;
  pixels: number;
  estimate: number;
  releaseInput: () => void;
  fail: (error: unknown) => void;
  run: (releaseResources: () => void) => Promise<void>;
}
const imageQueue: ImageOperation[] = [];
const idleWaiters = new Set<() => void>();

/**
 * Observe actual cleanup, including queued work and aborted public promises.
 * This is not a reservation; runImageOperation atomically owns admission.
 */
export function waitForNativeImageOperations(): Promise<void> {
  if (activePixels === 0 && imageQueue.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => idleWaiters.add(resolve));
}

function drainImageQueue(): void {
  if (activePixels !== 0) return;
  const next = imageQueue.shift();
  if (!next) {
    for (const resolveIdle of idleWaiters) resolveIdle();
    idleWaiters.clear();
    return;
  }
  queuedBytes -= next.encodedBytes;
  let releaseWork: () => void;
  try {
    // Keep the snapshot ticket and claim only the remaining operation bytes.
    // Together they cover the full estimate without a release/reacquire gap.
    releaseWork = reserveNativeTextureBytes(
      'native-image-operation',
      next.estimate - next.encodedBytes,
    );
  } catch (error) {
    next.releaseInput();
    next.fail(error);
    drainImageQueue();
    return;
  }
  const releaseResources = () => {
    releaseWork();
    next.releaseInput();
  };
  activePixels = next.pixels;
  activeBytes = next.estimate;
  void (async () => {
    try {
      await next.run(releaseResources);
    } finally {
      releaseResources();
      activePixels = 0;
      activeBytes = 0;
      drainImageQueue();
    }
  })();
}

export function estimateNativeImageOperationBytes(
  info: NativeImageInfo,
  encodedByteLength: number,
): number {
  validateNativeImageDimensions(info.width, info.height);
  if (
    !Number.isSafeInteger(encodedByteLength) ||
    encodedByteLength < 0 ||
    encodedByteLength > NATIVE_TEXTURE_PROFILE.maxFileBytes
  ) {
    invalid('画像ファイルのサイズが不正です');
  }
  return (
    encodedByteLength * 3 + info.width * info.height * 4 * 4 + NATIVE_TEXTURE_PROFILE.maxFileBytes
  );
}

/**
 * Count the input/snapshot/Blob plus four RGBA-sized working surfaces and an
 * encoded-output allowance. This is an explicit conservative estimate, not an
 * assertion about decoder internals, GPU storage or available device memory.
 * Owners must independently bound retained decode, history and renderer copies.
 */
function runImageOperation<T>(
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
  operation: (snapshot: Uint8Array, info: NativeImageInfo) => Promise<T>,
): Promise<T> {
  checkAbort(signal);
  const info = inspectNativeImage(bytes);
  const pixels = info.width * info.height;
  const estimate = estimateNativeImageOperationBytes(info, bytes.byteLength);
  const pendingBytes = queuedBytes + bytes.byteLength;
  // At every possible FIFO start, count that operation plus other queued
  // snapshots. Admission is synchronous, so no check/await/reserve race exists.
  const queuedPeak = Math.max(
    estimate + queuedBytes,
    ...imageQueue.map((job) => job.estimate + pendingBytes - job.encodedBytes),
  );
  if (
    imageQueue.length >= NATIVE_TEXTURE_PROFILE.maxQueuedOperations ||
    pendingBytes > NATIVE_TEXTURE_PROFILE.maxQueuedEncodedBytes ||
    queuedPeak > NATIVE_TEXTURE_PROFILE.maxOperationBytes ||
    (activePixels !== 0 && activeBytes + pendingBytes > NATIVE_TEXTURE_PROFILE.maxOperationBytes)
  ) {
    return Promise.reject(new Error('3D画像: 待機処理数・作業メモリ上限を超えます'));
  }
  // Detach at admission, rather than after a potentially long queue wait.
  const releaseInput = reserveNativeTextureBytes('native-image-input', bytes.byteLength);
  let snapshot: Uint8Array;
  try {
    snapshot = new Uint8Array(bytes);
    const inspected = inspectNativeImage(snapshot);
    if (
      inspected.width !== info.width ||
      inspected.height !== info.height ||
      inspected.mimeType !== info.mimeType
    ) {
      invalid('読み込み中に画像が変更されました');
    }
  } catch (error) {
    releaseInput();
    throw error;
  }
  return new Promise<T>((resolve, reject) => {
    const job: ImageOperation = {
      encodedBytes: snapshot.byteLength,
      pixels,
      estimate,
      releaseInput,
      fail: (error) => {
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
      run: async (releaseResources) => {
        try {
          checkAbort(signal);
          const result = await operation(snapshot, info);
          checkAbort(signal);
          // Browser resources have really closed. Transfer returned payload
          // ownership to the caller before its continuation claims a ticket.
          releaseResources();
          resolve(result);
        } catch (error) {
          releaseResources();
          reject(error);
        } finally {
          releaseResources();
          signal?.removeEventListener('abort', onAbort);
        }
      },
    };
    const onAbort = () => {
      reject(new DOMException('画像処理を取り消しました', 'AbortError'));
      const index = imageQueue.indexOf(job);
      if (index !== -1) {
        imageQueue.splice(index, 1);
        queuedBytes -= job.encodedBytes;
        job.releaseInput();
        signal?.removeEventListener('abort', onAbort);
        drainImageQueue();
      }
      // An active browser decode/encode cannot be cancelled. Its reservation
      // stays occupied until run() finishes and closes the late resources.
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    queuedBytes += job.encodedBytes;
    imageQueue.push(job);
    drainImageQueue();
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') invalid('この環境では画像canvasを利用できません');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function contextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!context) invalid('画像canvasを初期化できません');
  return context;
}

async function decodeSnapshot(
  bytes: Uint8Array,
  info: NativeImageInfo,
  signal?: AbortSignal,
): Promise<DecodedNativeImage> {
  if (typeof createImageBitmap !== 'function') invalid('この環境では画像decodeを利用できません');
  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: info.mimeType }), {
      imageOrientation: 'none',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
    checkAbort(signal);
    if (bitmap.width !== info.width || bitmap.height !== info.height) {
      invalid('decode後の画像寸法がヘッダーと一致しません');
    }
    canvas = createCanvas(info.width, info.height);
    const context = contextFor(canvas);
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, info.width, info.height, { colorSpace: 'srgb' });
    if (
      data.width !== info.width ||
      data.height !== info.height ||
      data.data.length !== info.width * info.height * 4
    ) {
      invalid('decode後の画素数が一致しません');
    }
    checkAbort(signal);
    return {
      ...info,
      pixels: new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength),
    };
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export async function decodeNativeImage(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<DecodedNativeImage> {
  return runImageOperation(bytes, signal, (snapshot, info) =>
    decodeSnapshot(snapshot, info, signal),
  );
}

function validateSettings(settings: NativeImageSettings): NativeImageSettings {
  const inRange = (value: number, low: number, high: number) =>
    Number.isFinite(value) && value >= low && value <= high;
  if (
    !Array.isArray(settings.gain) ||
    settings.gain.length !== 3 ||
    !settings.gain.every((value) => inRange(value, 0, 4)) ||
    !inRange(settings.brightness, -1, 1) ||
    !inRange(settings.saturation, 0, 2)
  ) {
    invalid('色調補正の設定範囲が不正です');
  }
  return { ...settings, gain: [settings.gain[0], settings.gain[1], settings.gain[2]] };
}

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, value) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
});

function toSrgb(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return Math.round(
    255 * (bounded <= 0.0031308 ? bounded * 12.92 : 1.055 * bounded ** (1 / 2.4) - 0.055),
  );
}

async function adjustPixels(
  image: DecodedNativeImage,
  settings: NativeImageSettings,
  signal?: AbortSignal,
): Promise<void> {
  const { pixels, width, height } = image;
  for (let row = 0; row < height; row++) {
    checkAbort(signal);
    for (let offset = row * width * 4; offset < (row + 1) * width * 4; offset += 4) {
      const red = SRGB_TO_LINEAR[pixels[offset]] * settings.gain[0] + settings.brightness;
      const green = SRGB_TO_LINEAR[pixels[offset + 1]] * settings.gain[1] + settings.brightness;
      const blue = SRGB_TO_LINEAR[pixels[offset + 2]] * settings.gain[2] + settings.brightness;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      pixels[offset] = toSrgb(luminance + (red - luminance) * settings.saturation);
      pixels[offset + 1] = toSrgb(luminance + (green - luminance) * settings.saturation);
      pixels[offset + 2] = toSrgb(luminance + (blue - luminance) * settings.saturation);
      // Alpha is retained exactly, never used as a color gain.
    }
    if (row % 32 === 31 && row + 1 < height) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Purely local derived PNG. The original bytes are never modified; callers own
 * provenance/Undo and must also reject stale session revisions before commit.
 * Color operations are deterministic; PNG compression bytes may vary by browser.
 */
export async function deriveNativeImage(
  bytes: Uint8Array,
  settings: NativeImageSettings,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  checkAbort(signal);
  const stableSettings = validateSettings(settings);
  return runImageOperation(bytes, signal, async (snapshot, info) => {
    const image = await decodeSnapshot(snapshot, info, signal);
    await adjustPixels(image, stableSettings, signal);
    checkAbort(signal);
    const canvas = createCanvas(info.width, info.height);
    try {
      const context = contextFor(canvas);
      const data = context.createImageData(info.width, info.height);
      data.data.set(image.pixels);
      context.putImageData(data, 0, 0);
      const encoded = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('3D画像: 派生PNGの生成に失敗しました'));
        }, 'image/png');
      });
      checkAbort(signal);
      if (encoded.size > NATIVE_TEXTURE_PROFILE.maxFileBytes) invalid('派生PNGが16MiBを超えました');
      if (encoded.type !== 'image/png') invalid('派生画像をPNGとして生成できませんでした');
      const output = new Uint8Array(await encoded.arrayBuffer());
      checkAbort(signal);
      const outputInfo = inspectNativeImage(output);
      if (
        outputInfo.mimeType !== 'image/png' ||
        outputInfo.width !== info.width ||
        outputInfo.height !== info.height
      ) {
        invalid('派生PNGの寸法が元画像と一致しません');
      }
      return output;
    } finally {
      canvas.width = canvas.height = 0;
    }
  });
}
