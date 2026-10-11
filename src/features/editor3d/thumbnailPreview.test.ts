import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reserveResourceBytes,
  resourceLedgerSnapshot,
  RESOURCE_ESTIMATE_CAP_BYTES,
} from '../../core3d/profile/resourceLedger';
import type { ThumbnailMetadata, ThumbnailRead } from '../../core3d/storage/thumbnailCache';
import {
  createThumbnailPreviewOwner,
  THUMBNAIL_PREVIEW_LIMITS,
  type ThumbnailPreviewDependencies,
  type ThumbnailPreviewOwner,
} from './thumbnailPreview';

const owners: ThumbnailPreviewOwner[] = [];
const releases: (() => void)[] = [];
const expected: ThumbnailMetadata = {
  projectId: 'preview-project',
  revision: 3,
  token: 7,
  hash: 'a'.repeat(64),
  width: 2,
  height: 3,
  byteLength: 33,
};
const previewBytes = (value = expected) => value.byteLength + value.width * value.height * 8;
function png(value = expected): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.byteLength);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, value.width);
  view.setUint32(20, value.height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}
function ticket(value = expected, bytes: Uint8Array = png(value)) {
  const releaseBytes = reserveResourceBytes('storage', bytes.byteLength);
  releases.push(releaseBytes);
  return { ...value, bytes, release: vi.fn(releaseBytes) } satisfies ThumbnailRead;
}
function dependencies(): ThumbnailPreviewDependencies {
  return {
    createBlob: vi.fn((bytes) => new Blob([bytes], { type: 'image/png' })),
    createObjectURL: vi.fn(() => 'blob:thumbnail-preview'),
    revokeObjectURL: vi.fn(),
  };
}
function own(
  reader: (projectId: string) => Promise<ThumbnailRead | null>,
  deps = dependencies(),
  signal?: AbortSignal,
  metadata = expected,
) {
  const owner = createThumbnailPreviewOwner(metadata, reader, { dependencies: deps, signal });
  owners.push(owner);
  return owner;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function started() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  for (const release of releases.splice(0)) release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

describe('thumbnail preview ownership', () => {
  it('reserves the Blob and display estimate before copying, then retains only the display owner', async () => {
    const read = ticket();
    const reader = vi.fn(async () => read);
    const deps = dependencies();
    deps.createBlob = vi.fn((bytes) => {
      expect(resourceLedgerSnapshot().byCategory.texture).toBe(previewBytes());
      expect(resourceLedgerSnapshot().byCategory.storage).toBe(expected.byteLength);
      expect(read.release).not.toHaveBeenCalled();
      return new Blob([bytes], { type: 'image/png' });
    });
    deps.createObjectURL = vi.fn(() => {
      expect(read.release).toHaveBeenCalledTimes(1);
      expect(resourceLedgerSnapshot().byCategory.storage).toBe(0);
      return 'blob:owned';
    });
    const owner = own(reader, deps);
    const result = await owner.settled;
    expect(reader).toHaveBeenCalledExactlyOnceWith(expected.projectId);
    expect(result).toMatchObject({ url: 'blob:owned', width: 2, height: 3, revision: 3 });
    expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes());
    result!.dispose();
    result!.dispose();
    owner.dispose();
    expect(deps.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:owned');
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('copies before releasing the borrowed read and never mutates cache bytes', async () => {
    const cacheBytes = png();
    const original = cacheBytes.slice();
    const read = ticket(expected, cacheBytes.slice());
    const deps = dependencies();
    const previousRelease = read.release;
    read.release = vi.fn(() => {
      // Simulate a reader invalidating its own buffer as soon as ownership ends.
      read.bytes.fill(0);
      previousRelease();
    });
    let copied!: Blob;
    deps.createObjectURL = vi.fn((blob) => {
      copied = blob;
      return 'blob:detached';
    });
    const owner = own(async () => read, deps);
    const result = await owner.settled;
    expect(new Uint8Array(await copied.arrayBuffer())).toEqual(original);
    expect(cacheBytes).toEqual(original);
    expect(read.release).toHaveBeenCalledTimes(1);
    result!.dispose();
  });

  it('returns null without allocating display resources for a cache miss', async () => {
    const deps = dependencies();
    const owner = own(async () => null, deps);
    expect(await owner.settled).toBeNull();
    owner.dispose();
    expect(deps.createBlob).not.toHaveBeenCalled();
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it.each(['dispose', 'abort'] as const)(
    'waits for the real pending read after %s',
    async (action) => {
      const pending = deferred<ThumbnailRead | null>();
      const read = ticket();
      const deps = dependencies();
      const signal = new AbortController();
      const reader = vi.fn(() => pending.promise);
      const owner = own(reader, deps, signal.signal);
      const settled = vi.fn();
      void owner.settled.then(settled);
      await started();
      expect(reader).toHaveBeenCalledTimes(1);
      if (action === 'dispose') owner.dispose();
      else signal.abort();
      owner.dispose();
      await started();
      expect(read.release).not.toHaveBeenCalled();
      expect(settled).not.toHaveBeenCalled();
      expect(resourceLedgerSnapshot().totalBytes).toBe(expected.byteLength);
      pending.resolve(read);
      expect(await owner.settled).toBeNull();
      expect(read.release).toHaveBeenCalledTimes(1);
      expect(deps.createBlob).not.toHaveBeenCalled();
      expect(deps.createObjectURL).not.toHaveBeenCalled();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );

  it.each(['dispose', 'abort'] as const)(
    'does not start a read when %s happens before initialization',
    async (action) => {
      const signal = new AbortController();
      if (action === 'abort') signal.abort();
      const reader = vi.fn(async () => null);
      const owner = own(reader, dependencies(), signal.signal);
      if (action === 'dispose') owner.dispose();
      expect(await owner.settled).toBeNull();
      expect(reader).not.toHaveBeenCalled();
    },
  );

  it('cleans up a reentrant cancellation from the reader', async () => {
    const read = ticket();
    const deps = dependencies();
    const owner = own(async () => {
      owner.dispose();
      return read;
    }, deps);
    expect(await owner.settled).toBeNull();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createBlob).not.toHaveBeenCalled();
  });

  it('holds both owners during a reentrant cancellation inside the Blob copy', async () => {
    const read = ticket();
    const deps = dependencies();
    deps.createBlob = vi.fn((bytes) => {
      owner.dispose();
      expect(read.release).not.toHaveBeenCalled();
      expect(resourceLedgerSnapshot().totalBytes).toBe(expected.byteLength + previewBytes());
      return new Blob([bytes], { type: 'image/png' });
    });
    const owner = own(async () => read, deps);
    expect(await owner.settled).toBeNull();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('handles cancellation reentered from the read release', async () => {
    const read = ticket();
    const deps = dependencies();
    const releaseBytes = read.release;
    read.release = vi.fn(() => {
      owner.dispose();
      releaseBytes();
    });
    const owner = own(async () => read, deps);
    expect(await owner.settled).toBeNull();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('revokes a URL returned after reentrant cancellation from its factory', async () => {
    const read = ticket();
    const deps = dependencies();
    deps.createObjectURL = vi.fn(() => {
      owner.dispose();
      expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes());
      return 'blob:late';
    });
    const owner = own(async () => read, deps);
    expect(await owner.settled).toBeNull();
    expect(deps.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:late');
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('retains the display budget until a late URL factory really settles', async () => {
    const pending = deferred<string>();
    const read = ticket();
    const signal = new AbortController();
    const deps = dependencies();
    deps.createObjectURL = vi.fn(() => pending.promise);
    const owner = own(async () => read, deps, signal.signal);
    await started();
    expect(deps.createObjectURL).toHaveBeenCalledTimes(1);
    expect(read.release).toHaveBeenCalledTimes(1);
    signal.abort();
    owner.dispose();
    expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes());
    expect(deps.revokeObjectURL).not.toHaveBeenCalled();
    pending.resolve('blob:late-async');
    expect(await owner.settled).toBeNull();
    expect(deps.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:late-async');
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('disposes a ready preview on an abort and removes its listener', async () => {
    const signal = new AbortController();
    const remove = vi.spyOn(signal.signal, 'removeEventListener');
    const deps = dependencies();
    const owner = own(async () => ticket(), deps, signal.signal);
    const result = await owner.settled;
    signal.abort();
    result!.dispose();
    owner.dispose();
    expect(deps.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('does not start another read or URL after repeated awaits and cleanup', async () => {
    const read = ticket();
    const reader = vi.fn(async () => read);
    const deps = dependencies();
    const owner = own(reader, deps);
    const first = await owner.settled;
    expect(await owner.settled).toBe(first);
    first!.dispose();
    owner.dispose();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(deps.createObjectURL).toHaveBeenCalledTimes(1);
    expect(deps.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(read.release).toHaveBeenCalledTimes(1);
  });

  it('keeps independent preview ownership through repeated create/display/dispose cycles', async () => {
    const keeper = own(async () => ticket());
    const kept = await keeper.settled;
    for (let index = 0; index < 40; index += 1) {
      const read = ticket();
      const deps = dependencies();
      const owner = own(async () => read, deps);
      const preview = await owner.settled;
      expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes() * 2);
      preview!.dispose();
      owner.dispose();
      expect(deps.revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(read.release).toHaveBeenCalledTimes(1);
      expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes());
    }
    kept!.dispose();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });
});

describe('thumbnail preview validation and failures', () => {
  it.each([
    ['projectId', 'different'],
    ['revision', 4],
    ['token', 8],
    ['hash', 'b'.repeat(64)],
    ['width', 3],
    ['height', 4],
    ['byteLength', 34],
  ] as const)('rejects changed %s before allocating a Blob', async (key, value) => {
    const read = ticket({ ...expected, [key]: value });
    const deps = dependencies();
    const owner = own(async () => read, deps);
    await expect(owner.settled).rejects.toThrow('cache changed');
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createBlob).not.toHaveBeenCalled();
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('snapshots the expected metadata before a caller mutates it during a pending read', async () => {
    const mutable = { ...expected };
    const pending = deferred<ThumbnailRead>();
    const owner = own(() => pending.promise, dependencies(), undefined, mutable);
    mutable.token += 1;
    mutable.revision += 1;
    mutable.hash = 'b'.repeat(64);
    pending.resolve(ticket());
    const result = await owner.settled;
    expect(result?.revision).toBe(expected.revision);
    result!.dispose();
  });

  it.each([
    ['projectId', ''],
    ['projectId', 'x'.repeat(257)],
    ['revision', -1],
    ['revision', Number.NaN],
    ['token', 0],
    ['token', Number.MAX_SAFE_INTEGER + 1],
    ['width', 0],
    ['width', 257],
    ['height', 257],
    ['height', 1.5],
    ['byteLength', 32],
    ['byteLength', THUMBNAIL_PREVIEW_LIMITS.entryBytes + 1],
    ['hash', 'a'.repeat(63)],
  ] as const)('rejects invalid expected metadata %s=%s before reading', (key, value) => {
    const reader = vi.fn(async () => null);
    expect(() => own(reader, dependencies(), undefined, { ...expected, [key]: value })).toThrow(
      'Invalid thumbnail preview metadata',
    );
    expect(reader).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('rejects metadata accessors without invoking them', () => {
    const getter = vi.fn(() => 2);
    const value = { ...expected };
    Object.defineProperty(value, 'width', { get: getter });
    expect(() => own(async () => null, dependencies(), undefined, value)).toThrow(
      'data properties',
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(['size', 'header', 'dimensions', 'shared', 'subclass'] as const)(
    'rejects invalid %s bytes before Blob allocation',
    async (kind) => {
      let bytes: Uint8Array = png();
      if (kind === 'size') bytes = new Uint8Array(expected.byteLength + 1);
      if (kind === 'header') bytes[0] = 0;
      if (kind === 'dimensions') new DataView(bytes.buffer).setUint32(16, 257);
      if (kind === 'shared') {
        bytes = new Uint8Array(new SharedArrayBuffer(expected.byteLength));
        bytes.set(png());
      }
      if (kind === 'subclass') bytes = new (class extends Uint8Array {})(png());
      const read = ticket(expected, bytes);
      const deps = dependencies();
      const owner = own(async () => read, deps);
      await expect(owner.settled).rejects.toThrow();
      expect(read.release).toHaveBeenCalledTimes(1);
      expect(deps.createBlob).not.toHaveBeenCalled();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );

  it('uses native byte accessors instead of overridden instance byte lengths or iterators', async () => {
    const bytes = png();
    const getter = vi.fn(() => 0);
    Object.defineProperty(bytes, 'byteLength', { get: getter });
    Object.defineProperty(bytes, Symbol.iterator, {
      value: () => {
        throw new Error('iterator');
      },
    });
    const read = ticket();
    read.bytes = bytes;
    const owner = own(async () => read);
    const result = await owner.settled;
    expect(result).not.toBeNull();
    expect(getter).not.toHaveBeenCalled();
    result!.dispose();
  });

  it('accepts the exact bounded profile without copying before admission', async () => {
    const value = { ...expected, width: 256, height: 256, byteLength: 256 * 1024 };
    const owner = own(async () => ticket(value), dependencies(), undefined, value);
    const result = await owner.settled;
    expect(result).toMatchObject({ width: 256, height: 256 });
    expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes(value));
    result!.dispose();
  });

  it('rejects combined-budget overflow before copying and preserves existing owners', async () => {
    const release = reserveResourceBytes(
      'history',
      RESOURCE_ESTIMATE_CAP_BYTES - expected.byteLength,
    );
    releases.push(release);
    const read = ticket();
    const deps = dependencies();
    const owner = own(async () => read, deps);
    await expect(owner.settled).rejects.toThrow('256 MiB cap');
    expect(deps.createBlob).not.toHaveBeenCalled();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().byCategory.history).toBe(
      RESOURCE_ESTIMATE_CAP_BYTES - expected.byteLength,
    );
    expect(resourceLedgerSnapshot().byCategory.texture).toBe(0);
    release();
  });

  it.each(['reader', 'blob', 'url', 'async-url'] as const)(
    'cleans up a failing %s',
    async (phase) => {
      const read = phase === 'reader' ? null : ticket();
      const deps = dependencies();
      const fail = () => {
        throw new Error(`failure:${phase}`);
      };
      const reader = phase === 'reader' ? fail : async () => read;
      if (phase === 'blob') deps.createBlob = vi.fn(fail);
      if (phase === 'url') deps.createObjectURL = vi.fn(fail);
      if (phase === 'async-url') deps.createObjectURL = vi.fn(async () => fail());
      const owner = own(reader, deps);
      await expect(owner.settled).rejects.toThrow(`failure:${phase}`);
      owner.dispose();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
      if (read) expect(read.release).toHaveBeenCalledTimes(1);
      expect(deps.revokeObjectURL).not.toHaveBeenCalled();
    },
  );

  it('cleans up the actual Blob constructor throwing with default dependencies', async () => {
    const read = ticket();
    vi.stubGlobal(
      'Blob',
      class {
        constructor() {
          throw new Error('Blob constructor failed');
        }
      },
    );
    const owner = createThumbnailPreviewOwner(expected, async () => read);
    owners.push(owner);
    await expect(owner.settled).rejects.toThrow('Blob constructor failed');
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('uses browser URL defaults only when an operation runs', async () => {
    vi.stubGlobal('URL', undefined);
    const cancelled = createThumbnailPreviewOwner(expected, async () => null);
    owners.push(cancelled);
    cancelled.dispose();
    expect(await cancelled.settled).toBeNull();
    const read = ticket();
    const owner = createThumbnailPreviewOwner(expected, async () => read);
    owners.push(owner);
    await expect(owner.settled).rejects.toThrow();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it.each(['mime', 'size'] as const)('rejects a Blob with the wrong %s', async (kind) => {
    const deps = dependencies();
    deps.createBlob = vi.fn(
      (bytes) =>
        new Blob(kind === 'size' ? [] : [bytes], {
          type: kind === 'mime' ? 'text/plain' : 'image/png',
        }),
    );
    const read = ticket();
    const owner = own(async () => read, deps);
    await expect(owner.settled).rejects.toThrow('Blob does not match');
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('does not publish an external URL from an incorrect URL adapter', async () => {
    const deps = dependencies();
    deps.createObjectURL = vi.fn(() => 'https://example.invalid/image.png');
    const owner = own(async () => ticket(), deps);
    await expect(owner.settled).rejects.toThrow('local Blob URL');
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('releases the display estimate when revocation throws or reenters disposal', async () => {
    const deps = dependencies();
    deps.revokeObjectURL = vi.fn(() => {
      owner.dispose();
      throw new Error('revoke failed');
    });
    const owner = own(async () => ticket(), deps);
    const result = await owner.settled;
    expect(() => result!.dispose()).not.toThrow();
    owner.dispose();
    expect(deps.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('releases independent resources exactly once when the read release throws', async () => {
    const read = ticket();
    const originalRelease = read.release;
    read.release = vi.fn(() => {
      originalRelease();
      throw new Error('read release failed');
    });
    const deps = dependencies();
    const owner = own(async () => read, deps);
    await expect(owner.settled).rejects.toThrow('read release failed');
    owner.dispose();
    expect(read.release).toHaveBeenCalledTimes(1);
    expect(deps.createObjectURL).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it.each(['reader', 'url'] as const)(
    'waits for an aborted pending %s to reject without leaking',
    async (phase) => {
      const pending = deferred<never>();
      const read = phase === 'reader' ? null : ticket();
      const deps = dependencies();
      if (phase === 'url') deps.createObjectURL = vi.fn(() => pending.promise);
      const owner = own(phase === 'reader' ? () => pending.promise : async () => read, deps);
      await started();
      owner.dispose();
      if (read) expect(resourceLedgerSnapshot().totalBytes).toBe(previewBytes());
      pending.reject(new Error('late failure'));
      expect(await owner.settled).toBeNull();
      if (read) expect(read.release).toHaveBeenCalledTimes(1);
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );
});
