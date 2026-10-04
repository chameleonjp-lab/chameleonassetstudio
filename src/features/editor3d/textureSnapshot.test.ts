import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeTextureReservedBytes,
  reserveNativeTextureBytes,
} from '../../core3d/model/textureResources';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { NativeTexturePreparer, nativeTexturePixels } from './textureSnapshot';

const ownedPreparers: NativeTexturePreparer[] = [];
function own(preparer: NativeTexturePreparer) {
  ownedPreparers.push(preparer);
  return preparer;
}
afterEach(async () => {
  for (const preparer of ownedPreparers) {
    preparer.cancel(true);
    await preparer.prepare(nativeBox(), undefined);
    preparer.cancel(true);
  }
  ownedPreparers.length = 0;
  expect(nativeTextureReservedBytes()).toBe(0);
});

const firstHash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const thirdHash = 'c'.repeat(64);
function imageBytes(width = 2, height = 1) {
  return new Uint8Array([width >>> 8, width & 255, height >>> 8, height & 255]);
}
function info(bytes: Uint8Array) {
  return {
    width: bytes[0] * 256 + bytes[1],
    height: bytes[2] * 256 + bytes[3],
    mimeType: 'image/png' as const,
  };
}
function decoded(bytes: Uint8Array) {
  const metadata = info(bytes);
  return { ...metadata, pixels: new Uint8Array(metadata.width * metadata.height * 4).fill(73) };
}
function textured(hashes = [firstHash]) {
  const project = nativeBox();
  project.blobIds = hashes;
  project.materials[0].textureBlobId = hashes[0];
  for (const hash of hashes.slice(1))
    project.materials.push({ ...project.materials[0], id: hash.slice(0, 3), textureBlobId: hash });
  for (const face of project.meshes[0].faces)
    face.uv = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
  return project;
}
function harness() {
  const decode = vi.fn(async (bytes: Uint8Array, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return decoded(bytes);
  });
  const inspect = vi.fn(info);
  return { preparer: own(new NativeTexturePreparer({ inspect, decode })), inspect, decode };
}
function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('native texture revision preparation', () => {
  it('prepares every unique canonical material source and reuses decoded pixels on revisions', async () => {
    const { preparer, decode } = harness();
    const project = textured([firstHash, secondHash]);
    project.materials.push({ ...project.materials[0], id: 'shared' });
    const read = vi.fn(() => imageBytes());
    const snapshot = await preparer.prepare(project, read);
    expect([...snapshot.keys()]).toEqual([firstHash, secondHash]);
    expect(nativeTexturePixels(snapshot)).toBe(4);
    expect(decode).toHaveBeenCalledTimes(2);
    const previousImage = snapshot.get(firstHash);
    const next = await preparer.prepare({ ...project, revision: 1 }, read, 4);
    expect(next.get(firstHash)).toBe(previousImage);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('checks every source before decoding any of them', async () => {
    const { preparer, decode, inspect } = harness();
    const read = (hash: string) => (hash === secondHash ? undefined : imageBytes());
    await expect(preparer.prepare(textured([firstHash, secondHash]), read)).rejects.toThrow(
      '見つかりません',
    );
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
  });

  it('requires complete face UVs before reading or decoding any source', async () => {
    const { preparer, decode } = harness();
    const project = textured();
    project.meshes[0].faces[0].uv = undefined;
    const read = vi.fn(() => imageBytes());
    await expect(preparer.prepare(project, read)).rejects.toThrow('UV');
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects absent readers, absent canonical references, and disagreeing source MIME', async () => {
    const { preparer, decode } = harness();
    await expect(preparer.prepare(textured(), undefined)).rejects.toThrow('読み取れません');
    const project = textured();
    project.blobIds = [];
    await expect(preparer.prepare(project, () => imageBytes())).rejects.toThrow('素材参照');
    const mismatch = textured();
    mismatch.sources.push({
      id: 'source',
      blobId: firstHash,
      mimeType: 'image/jpeg',
      rights: { declared: '', embedded: '' },
    });
    await expect(preparer.prepare(mismatch, () => imageBytes())).rejects.toThrow('一致しません');
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects aggregate pixels from tiny headers before large decode allocations', async () => {
    const { preparer, decode } = harness();
    await expect(
      preparer.prepare(textured([firstHash, secondHash, thirdHash]), () => imageBytes(2000, 1500)),
    ).rejects.toThrow('合計画素数');
    expect(decode).not.toHaveBeenCalled();
  });

  it('accounts for retained renderer copies and peak decode memory before decoding', async () => {
    const { preparer, decode } = harness();
    await expect(
      preparer.prepare(textured(), () => imageBytes(2000, 2000), 4_000_000),
    ).rejects.toThrow('メモリ');
    expect(decode).not.toHaveBeenCalled();
    const read = vi.fn(() => imageBytes());
    await expect(
      preparer.prepare(textured(), read, NATIVE_TEXTURE_PROFILE.maxOperationBytes / 8),
    ).rejects.toThrow('メモリ');
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects invalid decoded dimensions or storage without caching partial output', async () => {
    const decode = vi.fn(async (bytes: Uint8Array) => ({
      ...decoded(bytes),
      pixels: new Uint8Array(1),
    }));
    const preparer = own(new NativeTexturePreparer({ inspect: info, decode }));
    await expect(preparer.prepare(textured(), () => imageBytes())).rejects.toThrow(
      '展開できません',
    );
    decode.mockImplementation(async (bytes) => decoded(bytes));
    await expect(preparer.prepare(textured(), () => imageBytes())).resolves.toHaveProperty(
      'size',
      1,
    );
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('does not cache the first image when a later decode fails', async () => {
    const { preparer, decode } = harness();
    decode
      .mockResolvedValueOnce(decoded(imageBytes()))
      .mockRejectedValueOnce(new Error('decode failed'));
    await expect(
      preparer.prepare(textured([firstHash, secondHash]), () => imageBytes()),
    ).rejects.toThrow('decode failed');
    await preparer.prepare(textured([firstHash, secondHash]), () => imageBytes());
    expect(decode).toHaveBeenCalledTimes(4);
  });

  it('cancels stale revisions and waits for an uncancellable decoder before replacing it', async () => {
    const old = deferred<ReturnType<typeof decoded>>();
    const started = deferred<void>();
    const decode = vi.fn(async (bytes: Uint8Array, _signal?: AbortSignal) => {
      void _signal;
      return decoded(bytes);
    });
    decode.mockImplementationOnce(() => {
      started.resolve();
      return old.promise;
    });
    const preparer = own(new NativeTexturePreparer({ inspect: info, decode }));
    const obsolete = preparer.prepare(textured(), () => imageBytes());
    const rejected = expect(obsolete).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    const replacement = preparer.prepare(textured([secondHash]), () => imageBytes());
    await Promise.resolve();
    expect(decode).toHaveBeenCalledTimes(1);
    old.resolve(decoded(imageBytes()));
    await rejected;
    const snapshot = await replacement;
    expect([...snapshot.keys()]).toEqual([secondHash]);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('discards work cancelled at hidden, freeze, dispose or session boundaries', async () => {
    const old = deferred<ReturnType<typeof decoded>>();
    const started = deferred<void>();
    const decode = vi.fn(() => {
      started.resolve();
      return old.promise;
    });
    const preparer = own(new NativeTexturePreparer({ inspect: info, decode }));
    const operation = preparer.prepare(textured(), () => imageBytes());
    const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    preparer.cancel(true);
    old.resolve(decoded(imageBytes()));
    await rejected;
    decode.mockResolvedValue(decoded(imageBytes()));
    await preparer.prepare(textured(), () => imageBytes());
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('waits for cancelled browser allocations to settle before even copying another source', async () => {
    const idle = deferred<void>();
    const waiting = deferred<void>();
    const read = vi.fn(() => imageBytes());
    const decode = vi.fn(async (bytes: Uint8Array) => decoded(bytes));
    const preparer = own(
      new NativeTexturePreparer({
        inspect: info,
        decode,
        wait: () => {
          waiting.resolve();
          return idle.promise;
        },
      }),
    );
    const operation = preparer.prepare(textured(), read);
    await waiting.promise;
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    idle.resolve();
    await operation;
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('releases the panel cache for GPU suspension and redecodes when requested', async () => {
    const { preparer, decode } = harness();
    await preparer.prepare(textured(), () => imageBytes());
    preparer.cancel(true);
    await preparer.prepare(textured(), () => imageBytes());
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('reserves retained cache pixels once and releases removed or suspended sources', async () => {
    const { preparer } = harness();
    await preparer.prepare(textured([firstHash, secondHash]), () => imageBytes());
    expect(nativeTextureReservedBytes()).toBe(16);
    await preparer.prepare(textured([firstHash, secondHash]), () => imageBytes());
    expect(nativeTextureReservedBytes()).toBe(16);
    await preparer.prepare(textured(), () => imageBytes());
    expect(nativeTextureReservedBytes()).toBe(8);
    preparer.cancel(true);
    expect(nativeTextureReservedBytes()).toBe(0);
  });

  it('holds cached and pending ownership through late cancellation cleanup', async () => {
    const { preparer, decode } = harness();
    await preparer.prepare(textured(), () => imageBytes());
    const pending = deferred<ReturnType<typeof decoded>>();
    const started = deferred<void>();
    decode.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    const operation = preparer.prepare(textured([firstHash, secondHash]), () => imageBytes());
    const result = operation.catch((cause: unknown) => cause);
    await started.promise;
    expect(nativeTextureReservedBytes()).toBe(NATIVE_TEXTURE_PROFILE.maxFileBytes + 16);
    preparer.cancel(true);
    expect(nativeTextureReservedBytes()).toBe(NATIVE_TEXTURE_PROFILE.maxFileBytes + 16);
    pending.resolve(decoded(imageBytes()));
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(nativeTextureReservedBytes()).toBe(0);
  });

  it('refuses before source copying when another owner consumes the shared budget', async () => {
    const bytes =
      NATIVE_TEXTURE_PROFILE.maxOperationBytes - NATIVE_TEXTURE_PROFILE.maxFileBytes + 1;
    const release = reserveNativeTextureBytes('other image operation test', bytes);
    try {
      const { preparer, decode } = harness();
      const read = vi.fn(() => imageBytes());
      await expect(preparer.prepare(textured(), read)).rejects.toThrow('合計メモリ');
      expect(read).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
      expect(nativeTextureReservedBytes()).toBe(bytes);
    } finally {
      release();
    }
  });

  it('reserves output storage before a decode and releases it on shared-budget refusal', async () => {
    const bytes =
      NATIVE_TEXTURE_PROFILE.maxOperationBytes - NATIVE_TEXTURE_PROFILE.maxFileBytes - 7;
    const release = reserveNativeTextureBytes('concurrent render test', bytes);
    try {
      const { preparer, decode } = harness();
      const read = vi.fn(() => imageBytes());
      await expect(preparer.prepare(textured(), read)).rejects.toThrow('合計メモリ');
      expect(read).toHaveBeenCalledTimes(1);
      expect(decode).not.toHaveBeenCalled();
      expect(nativeTextureReservedBytes()).toBe(bytes);
    } finally {
      release();
    }
  });

  it('rejects a changed source between inspection and decode', async () => {
    const { preparer, decode } = harness();
    const read = vi.fn().mockReturnValueOnce(imageBytes()).mockReturnValueOnce(imageBytes(3, 1));
    await expect(preparer.prepare(textured(), read)).rejects.toThrow('変更されました');
    expect(decode).not.toHaveBeenCalled();
  });
});
