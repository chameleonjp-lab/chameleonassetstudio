import { createResourceOwner, type ResourceOwner } from '../../core3d/profile/resourceLedger';
import type { ThumbnailMetadata, ThumbnailRead } from '../../core3d/storage/thumbnailCache';

/** The display boundary mirrors the derived-cache profile, without loading storage code. */
export const THUMBNAIL_PREVIEW_LIMITS = Object.freeze({ edge: 256, entryBytes: 256 * 1024 });

export interface ThumbnailPreview {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  dispose(): void;
}

export interface ThumbnailPreviewDependencies {
  /** Must synchronously copy the borrowed bytes, like the native Blob constructor. */
  createBlob(bytes: Uint8Array<ArrayBuffer>): Blob;
  createObjectURL(blob: Blob): string | Promise<string>;
  revokeObjectURL(url: string): void;
}

export interface ThumbnailPreviewOwner {
  /** Null means a cache miss or cancellation; rejects on invalid/stale data or other failures. */
  readonly settled: Promise<ThumbnailPreview | null>;
  /** Cancels publication; pending, non-interruptible work retains its owners until it settles. */
  dispose(): void;
}

const browserDependencies: ThumbnailPreviewDependencies = {
  createBlob: (bytes) => new Blob([bytes], { type: 'image/png' }),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
};
const metadataKeys = [
  'projectId',
  'revision',
  'width',
  'height',
  'byteLength',
  'hash',
  'token',
] as const;

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function snapshot(value: ThumbnailMetadata): Readonly<ThumbnailMetadata> {
  if (!value || typeof value !== 'object') throw new Error('Invalid thumbnail preview metadata');
  const result: Record<string, unknown> = {};
  for (const key of metadataKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor))
      throw new Error('Thumbnail preview metadata must use data properties');
    result[key] = descriptor.value;
  }
  if (
    typeof result.projectId !== 'string' ||
    result.projectId.length === 0 ||
    result.projectId.length > 256 ||
    !integer(result.revision, 0) ||
    !integer(result.token, 1) ||
    !integer(result.width, 1, THUMBNAIL_PREVIEW_LIMITS.edge) ||
    !integer(result.height, 1, THUMBNAIL_PREVIEW_LIMITS.edge) ||
    !integer(result.byteLength, 33, THUMBNAIL_PREVIEW_LIMITS.entryBytes) ||
    typeof result.hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(result.hash)
  )
    throw new Error('Invalid thumbnail preview metadata (maximum 256 pixels and 256 KiB)');
  return Object.freeze(result) as unknown as Readonly<ThumbnailMetadata>;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;

/** No payload copy or decoder allocation happens while inspecting the borrowed bytes. */
function boundedBytes(
  value: Uint8Array,
  expected: Readonly<ThumbnailMetadata>,
): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype)
    throw new Error('Invalid thumbnail preview bytes');
  const length = byteLengthGetter.call(value) as number;
  const buffer = bufferGetter.call(value) as ArrayBuffer;
  if (!(buffer instanceof ArrayBuffer) || length !== expected.byteLength)
    throw new Error('Thumbnail preview byte length does not match its metadata');
  const bytes = new Uint8Array(buffer, byteOffsetGetter.call(value), length);
  const header = new DataView(buffer, bytes.byteOffset, length);
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].some((part, index) => bytes[index] !== part) ||
    header.getUint32(8) !== 13 ||
    header.getUint32(12) !== 0x49484452 ||
    header.getUint32(16) !== expected.width ||
    header.getUint32(20) !== expected.height
  )
    throw new Error('Thumbnail preview PNG header does not match its metadata');
  return bytes;
}

/**
 * One read and one image URL per owner. The caller bounds the visible owner count and removes
 * its image before disposal. This owns only derived display resources, never cache mutations.
 *
 * A texture reservation covers the encoded Blob plus two RGBA-sized display surfaces. This
 * conservative ownership estimate is neither actual image decoding nor a device-memory claim.
 * The UI must handle image load errors and validate decoded dimensions before displaying it.
 */
export function createThumbnailPreviewOwner(
  expected: ThumbnailMetadata,
  reader: (projectId: string) => Promise<ThumbnailRead | null>,
  options: { signal?: AbortSignal; dependencies?: ThumbnailPreviewDependencies } = {},
): ThumbnailPreviewOwner {
  // Snapshot before an asynchronous reader can observe a caller's metadata mutation.
  const wanted = snapshot(expected);
  const { signal, dependencies = browserDependencies } = options;
  let closed = signal?.aborted ?? false;
  let pending = true;
  let read: ThumbnailRead | null = null;
  let resource: ResourceOwner | null = null;
  let url: string | null = null;

  function releaseRead() {
    const retired = read;
    read = null;
    retired?.release();
  }
  function cleanup() {
    signal?.removeEventListener('abort', dispose);
    const retiredUrl = url;
    const retiredResource = resource;
    url = null;
    resource = null;
    try {
      releaseRead();
    } catch {
      // A failing external cleanup must not strand the independently owned display resources.
    }
    try {
      if (retiredUrl !== null) dependencies.revokeObjectURL(retiredUrl);
    } catch {
      // Native revocation is non-throwing. Continue ledger cleanup if an injected adapter fails.
    } finally {
      retiredResource?.release();
    }
  }
  function dispose() {
    closed = true;
    // Neither a read nor a Blob/URL factory is made interruptible by an abort request.
    if (!pending) cleanup();
  }
  function copyBlob(source: ThumbnailRead): Blob | null {
    const actual = snapshot(source);
    if (metadataKeys.some((key) => actual[key] !== wanted[key]))
      throw new Error('Thumbnail cache changed; refresh the preview before retrying');
    const bytes = boundedBytes(source.bytes, wanted);
    if (closed) return null;
    resource = createResourceOwner('texture', wanted.byteLength + wanted.width * wanted.height * 8);
    return dependencies.createBlob(bytes);
  }
  signal?.addEventListener('abort', dispose, { once: true });

  const settled = Promise.resolve().then(async (): Promise<ThumbnailPreview | null> => {
    let accepted = false;
    try {
      if (closed) return null;
      read = await reader(wanted.projectId);
      if (closed || !read) return null;
      // Keep borrowed byte aliases inside this synchronous call, never across the URL await.
      const blob = copyBlob(read);
      // The Blob snapshot is now independent; retain the read through the entire synchronous copy.
      releaseRead();
      if (closed || !blob) return null;
      if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size !== wanted.byteLength)
        throw new Error('Thumbnail preview Blob does not match its metadata');
      url = await dependencies.createObjectURL(blob);
      if (closed) return null;
      if (typeof url !== 'string' || !url.startsWith('blob:'))
        throw new Error('Thumbnail preview requires a local Blob URL');
      accepted = true;
      return Object.freeze({
        url,
        width: wanted.width,
        height: wanted.height,
        revision: wanted.revision,
        dispose,
      });
    } catch (error) {
      if (closed) return null;
      throw error;
    } finally {
      pending = false;
      if (!accepted || closed) {
        closed = true;
        cleanup();
      }
    }
  });
  return Object.freeze({ settled, dispose });
}
