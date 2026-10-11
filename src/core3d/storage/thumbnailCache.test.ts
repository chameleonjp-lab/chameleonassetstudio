import {
  forceCloseDatabase,
  IDBDatabase as FakeDatabase,
  IDBFactory,
  IDBObjectStore,
} from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  reserveResourceBytes,
  resourceLedgerSnapshot,
} from '../profile/resourceLedger';
import {
  LEGACY_PROJECT_3D_DB_NAME,
  PREVIOUS_PROJECT_3D_DB_NAME,
  PROJECT_3D_DB_NAME,
  requestResult,
} from './db';
import {
  openThumbnailCache,
  THUMBNAIL_CACHE_DB_NAME,
  THUMBNAIL_CACHE_DB_VERSION,
  THUMBNAIL_CACHE_LIMITS,
  type ThumbnailCache,
  type ThumbnailInput,
  type ThumbnailRead,
} from './thumbnailCache';

let factory: IDBFactory;
let cache: ThumbnailCache;
let baseline: ReturnType<typeof resourceLedgerSnapshot>;
const handles: ThumbnailCache[] = [];
const databases: IDBDatabase[] = [];
const reads: ThumbnailRead[] = [];

// Actual PNG signature/IHDR fixture. Header variants intentionally test header validation,
// not browser decoding, which belongs to the renderer boundary.
function png(width = 1, height = 1, size?: number): Uint8Array<ArrayBuffer> {
  const source = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6RWQAAAAASUVORK5CYII=',
    'base64',
  );
  const bytes = new Uint8Array(size ?? source.length);
  bytes.set(source.subarray(0, bytes.length));
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
function input(projectId = 'project', revision = 0): ThumbnailInput {
  return { projectId, revision, width: 1, height: 1, bytes: png() };
}
function put(projectId = 'project', revision = 0, expectedToken: number | null = null) {
  return cache.put(input(projectId, revision), { expectedToken, latestRevision: revision });
}
async function read(projectId = 'project') {
  const result = await cache.read(projectId);
  if (result) reads.push(result);
  return result;
}
async function rawDatabase() {
  const db = await requestResult(factory.open(THUMBNAIL_CACHE_DB_NAME));
  databases.push(db);
  return db;
}
async function writeRaw(store: string, value: unknown, key?: IDBValidKey) {
  const db = await rawDatabase();
  const transaction = db.transaction(store, 'readwrite');
  const finished = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  await requestResult(transaction.objectStore(store).put(value, key));
  await finished;
}
async function dump(db: IDBDatabase) {
  const stores = [...db.objectStoreNames];
  const transaction = db.transaction(stores, 'readonly');
  return Object.fromEntries(
    await Promise.all(
      stores.map(async (store) => [
        store,
        await requestResult(transaction.objectStore(store).getAll()),
      ]),
    ),
  );
}
beforeEach(async () => {
  baseline = resourceLedgerSnapshot();
  factory = new IDBFactory();
  cache = await openThumbnailCache({ indexedDB: factory });
  handles.push(cache);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const result of reads.splice(0)) result.release();
  for (const handle of handles.splice(0)) handle.close();
  for (const db of databases.splice(0)) db.close();
  expect(resourceLedgerSnapshot()).toEqual(baseline);
});

describe('isolated, bounded derived thumbnail cache', () => {
  it('snapshots before hashing, returns detached owned bytes and persists only allowed fields', async () => {
    const value = input();
    const original = value.bytes.slice();
    const pending = cache.put(value, { expectedToken: null, latestRevision: 0 });
    expect(resourceLedgerSnapshot().byCategory.storage).toBe(
      baseline.byCategory.storage + original.length * 3,
    );
    value.bytes.fill(0);
    value.projectId = 'changed';
    value.revision = 9;
    const entry = await pending;
    expect(entry).toMatchObject({
      projectId: 'project',
      revision: 0,
      byteLength: original.length,
      token: 1,
    });
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    const result = await read();
    expect(result!.bytes).toEqual(original);
    expect(resourceLedgerSnapshot().byCategory.storage).toBe(
      baseline.byCategory.storage + original.length,
    );
    result!.bytes.fill(44);
    result!.release();
    result!.release();
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    const again = await read();
    expect(again!.bytes).toEqual(original);
    const db = await rawDatabase();
    expect(db.version).toBe(THUMBNAIL_CACHE_DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(['entries', 'meta', 'pngs']);
    const stored = await dump(db);
    expect(Object.keys(stored.entries[0]).sort()).toEqual([
      'byteLength',
      'hash',
      'height',
      'projectId',
      'revision',
      'token',
      'width',
    ]);
    expect(Object.keys(stored.pngs[0]).sort()).toEqual(['bytes', 'projectId']);
  });

  it('lists bounded metadata without fetching any binary values and detaches metadata', async () => {
    await put();
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const get = vi.spyOn(IDBObjectStore.prototype, 'get');
    const list = await cache.listMetadata();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('bytes');
    list[0].revision = 999;
    expect((await cache.listMetadata())[0].revision).toBe(0);
    expect(await cache.summary()).toEqual({ count: 1, byteTotal: png().length, generation: 1 });
    expect(get).not.toHaveBeenCalled();
    expect(
      getAll.mock.contexts.every((store) => (store as unknown as IDBObjectStore).name !== 'pngs'),
    ).toBe(true);
    expect(getAll.mock.calls.every(([, count]) => typeof count === 'number' && count <= 33)).toBe(
      true,
    );
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    expect(await cache.read('missing')).toBeNull();
  });

  it('leaves every canonical/legacy/2D database byte-for-byte unchanged, including after clear', async () => {
    const originals: [IDBDatabase, unknown][] = [];
    for (const name of [
      'chameleon-asset-studio',
      LEGACY_PROJECT_3D_DB_NAME,
      PREVIOUS_PROJECT_3D_DB_NAME,
      PROJECT_3D_DB_NAME,
    ]) {
      const request = factory.open(name, 7);
      request.onupgradeneeded = () => request.result.createObjectStore('roots', { keyPath: 'id' });
      const db = await requestResult(request);
      databases.push(db);
      await requestResult(
        db
          .transaction('roots', 'readwrite')
          .objectStore('roots')
          .put({
            id: 'source',
            bytes: new Uint8Array([1, 2, 3]),
            unsaved: 'retain',
            backup: 'retain',
          }),
      );
      originals.push([db, await dump(db)]);
    }
    const open = vi.spyOn(factory, 'open');
    const other = await openThumbnailCache({ indexedDB: factory });
    handles.push(other);
    await put();
    const summary = await cache.summary();
    await cache.clearDerived(summary.generation);
    expect(open.mock.calls).toEqual([[THUMBNAIL_CACHE_DB_NAME, 1]]);
    for (const [db, original] of originals) {
      expect(db.version).toBe(7);
      expect(await dump(db)).toEqual(original);
    }
  });

  it('rejects accessors, extra source payloads, invalid IDs/revisions and oversized inputs before hashing', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest');
    const getter = vi.fn(() => png());
    const accessor = input();
    Object.defineProperty(accessor, 'bytes', { get: getter, enumerable: true });
    const invalid = [
      accessor,
      { ...input(), sourceBlob: new Uint8Array([1]) },
      { ...input(), projectName: 'not stored' },
      { ...input(), projectId: '' },
      { ...input(), projectId: 'x'.repeat(257) },
      { ...input(), revision: -1 },
      { ...input(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...input(), bytes: png(1, 1, THUMBNAIL_CACHE_LIMITS.entryBytes + 1) },
      { ...input(), bytes: new Uint8Array(32) },
      { ...input(), bytes: new Uint8Array(new SharedArrayBuffer(100)) },
    ];
    for (const value of invalid)
      await expect(
        cache.put(value as ThumbnailInput, { expectedToken: null, latestRevision: 0 }),
      ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
    expect(await cache.summary()).toEqual({ count: 0, byteTotal: 0, generation: 0 });
  });

  it('uses native byte accessors without invoking caller iterators, species or shadowed properties', async () => {
    const bytes = png();
    const trap = vi.fn(() => {
      throw new Error('caller code executed');
    });
    for (const key of ['buffer', 'byteLength', 'byteOffset', 'length', 'constructor'])
      Object.defineProperty(bytes, key, { get: trap });
    Object.defineProperty(bytes, Symbol.iterator, { get: trap });
    await cache.put({ ...input(), bytes }, { expectedToken: null, latestRevision: 0 });
    expect(trap).not.toHaveBeenCalled();
    expect((await read())!.bytes).toEqual(png());
  });

  it('checks PNG signature, IHDR dimensions, edge profile and valid IHDR fields without decoding', async () => {
    const invalid = [
      { ...input(), width: 0 },
      { ...input(), width: 257 },
      { ...input(), height: 1.5 },
      { ...input(), bytes: png(2, 1) },
      { ...input(), bytes: png(1, 2) },
    ];
    for (const [offset, value] of [
      [0, 0],
      [11, 12],
      [12, 0],
      [24, 3],
      [25, 7],
      [26, 1],
      [27, 1],
      [28, 2],
    ]) {
      const bytes = png();
      bytes[offset] = value;
      invalid.push({ ...input(), bytes });
    }
    for (const value of invalid)
      await expect(cache.put(value, { expectedToken: null, latestRevision: 0 })).rejects.toThrow();
    await cache.put(
      {
        ...input(),
        width: 256,
        height: 256,
        bytes: png(256, 256, THUMBNAIL_CACHE_LIMITS.entryBytes),
      },
      { expectedToken: null, latestRevision: 0 },
    );
    expect((await cache.summary()).byteTotal).toBe(THUMBNAIL_CACHE_LIMITS.entryBytes);
  });

  it('arbitrates simultaneous same-revision renders across connections with exact token CAS', async () => {
    const first = await put();
    const other = await openThumbnailCache({ indexedDB: factory });
    handles.push(other);
    const outcomes = await Promise.allSettled([
      cache.put(input(), { expectedToken: first.token, latestRevision: 0 }),
      other.put(input(), { expectedToken: first.token, latestRevision: 0 }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { name: 'ThumbnailCacheConflictError', reason: 'token' },
    });
    expect((await cache.summary()).generation).toBe(2);
    await expect(
      cache.put(input(), { expectedToken: first.token, latestRevision: 0 }),
    ).rejects.toMatchObject({ reason: 'token' });
  });

  it('does not overwrite a newer revision, even with its current token, and rejects stale editor results', async () => {
    const newer = await put('project', 4);
    await expect(put('project', 3, newer.token)).rejects.toMatchObject({ reason: 'revision' });
    await expect(
      cache.put(input('project', 4), { expectedToken: newer.token, latestRevision: 5 }),
    ).rejects.toMatchObject({ reason: 'revision' });
    await expect(
      cache.put(input('project', 6), { expectedToken: newer.token, latestRevision: 5 }),
    ).rejects.toMatchObject({ reason: 'revision' });
    expect((await read())!.revision).toBe(4);
  });

  it('admits at most 32 entries with no automatic expiry/eviction and permits bounded replacement', async () => {
    for (let index = 0; index < 32; index++) await put(`project-${index}`);
    const before = await cache.summary();
    await expect(put('overflow')).rejects.toThrow('cache is full');
    expect(await cache.summary()).toEqual(before);
    expect(await cache.listMetadata()).toHaveLength(32);
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
    expect(await cache.listMetadata()).toHaveLength(32);
    const first = (await cache.listMetadata()).find((entry) => entry.projectId === 'project-0')!;
    const next = await put('project-0', 1, first.token);
    expect(next.token).toBe(33);
    expect((await cache.summary()).count).toBe(32);
  });

  it('rolls back PNG, metadata and generation on quota failure and permits safe retry', async () => {
    const first = await put();
    const original = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'meta') throw new DOMException('No space', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(put('project', 1, first.token)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    failing.mockRestore();
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    expect((await read())!.revision).toBe(0);
    expect(await cache.summary()).toEqual({ count: 1, byteTotal: png().length, generation: 1 });
    expect((await put('project', 1, first.token)).token).toBe(2);
  });

  it('rolls back an asynchronous request error after writing the PNG', async () => {
    const first = await put();
    const original = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'entries') return this.add(value);
      return original.call(this, value, key);
    });
    await expect(put('project', 1, first.token)).rejects.toMatchObject({ name: 'ConstraintError' });
    failing.mockRestore();
    expect((await read())!.token).toBe(first.token);
    expect((await cache.summary()).generation).toBe(1);
  });

  it('requires exact clear consent generation, and token generations survive clears without ABA', async () => {
    const old = await put();
    const approved = await cache.summary();
    await put('another');
    await expect(cache.clearDerived(approved.generation)).rejects.toMatchObject({
      reason: 'generation',
    });
    expect((await cache.summary()).count).toBe(2);
    const current = await cache.summary();
    expect(await cache.clearDerived(current.generation)).toEqual({
      count: 0,
      byteTotal: 0,
      generation: 3,
    });
    const fresh = await put();
    expect(fresh.token).toBe(4);
    await expect(put('project', 1, old.token)).rejects.toMatchObject({ reason: 'token' });
    expect((await read())!.token).toBe(fresh.token);
  });

  it('rejects a write arriving while clear validates its approved snapshot', async () => {
    await put();
    const approved = await cache.summary();
    const original = cache.read.bind(cache);
    let injected = false;
    vi.spyOn(cache, 'read').mockImplementation(async (id) => {
      const result = await original(id);
      if (!injected) {
        injected = true;
        await put('arriving');
      }
      return result;
    });
    await expect(cache.clearDerived(approved.generation)).rejects.toMatchObject({
      reason: 'generation',
    });
    expect((await cache.summary()).count).toBe(2);
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('rolls back every deletion when cleanup metadata commit fails', async () => {
    await put();
    await put('another');
    const approved = await cache.summary();
    const original = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'meta') throw new DOMException('No space', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(cache.clearDerived(approved.generation)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    failing.mockRestore();
    expect(await cache.summary()).toEqual(approved);
    expect((await read())!.revision).toBe(0);
    expect((await read('another'))!.revision).toBe(0);
  });

  it('fails closed on corrupt PNGs and refuses implicit repair or cleanup', async () => {
    const first = await put();
    const bytes = png();
    bytes[40] ^= 1;
    await writeRaw('pngs', { projectId: 'project', bytes });
    await expect(cache.read('project')).rejects.toThrow('hash mismatch');
    await expect(put('project', 1, first.token)).rejects.toThrow('hash mismatch');
    await expect(cache.clearDerived(1)).rejects.toThrow('hash mismatch');
    expect((await cache.summary()).count).toBe(1);
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('does not clear unrecognized or orphan records', async () => {
    await put();
    await writeRaw('pngs', { projectId: 'unknown', source: 'must not remove' });
    const db = await rawDatabase();
    const before = await dump(db);
    await expect(cache.summary()).rejects.toThrow('metadata and PNG records disagree');
    await expect(cache.clearDerived(1)).rejects.toThrow('No cache records were removed');
    expect(await dump(db)).toEqual(before);
  });

  it('rejects metadata corruption during clear even if it failed to advance the epoch', async () => {
    const entry = await put();
    const original = cache.read.bind(cache);
    vi.spyOn(cache, 'read').mockImplementationOnce(async (id) => {
      const result = await original(id);
      await writeRaw('entries', { ...entry, revision: entry.revision + 1 });
      return result;
    });
    await expect(cache.clearDerived(1)).rejects.toThrow('without advancing their generation');
    expect((await cache.summary()).count).toBe(1);
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('rejects extra metadata, invalid totals, exhausted epochs and unrecognized same-key payloads', async () => {
    await put();
    await writeRaw('pngs', { projectId: 'project', bytes: png(), originalSource: 'retain' });
    await expect(cache.clearDerived(1)).rejects.toThrow('Unexpected thumbnail record fields');
    await writeRaw('pngs', { projectId: 'project', bytes: png() });
    await writeRaw('meta', {
      id: 'generation',
      generation: 1,
      count: 1,
      byteTotal: THUMBNAIL_CACHE_LIMITS.totalBytes + 1,
    });
    await expect(cache.summary()).rejects.toThrow('invalid generation record');
    await writeRaw('meta', {
      id: 'generation',
      generation: Number.MAX_SAFE_INTEGER,
      count: 1,
      byteTotal: png().length,
    });
    await expect(put('new')).rejects.toThrow('generation exhausted');
    await expect(cache.clearDerived(Number.MAX_SAFE_INTEGER)).rejects.toThrow(
      'generation exhausted',
    );
    await writeRaw('meta', { id: 'foreign', text: 'retain' });
    await expect(cache.summary()).rejects.toThrow('unexpected record count');
  });

  it('admits binary copies against the shared realm ledger and transfers/releases read ownership', async () => {
    await put();
    const hold = reserveResourceBytes(
      'geometry',
      RESOURCE_ESTIMATE_CAP_BYTES - baseline.totalBytes,
    );
    try {
      await expect(put('new')).rejects.toThrow('Combined resource ownership');
      await expect(cache.read('project')).rejects.toThrow('Combined resource ownership');
      expect((await cache.listMetadata()).length).toBe(1);
    } finally {
      hold();
    }
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    const result = await read();
    expect(resourceLedgerSnapshot().byCategory.storage).toBe(
      baseline.byCategory.storage + result!.byteLength,
    );
    cache.close();
    // Closing the connection does not release bytes still owned by a caller.
    expect(resourceLedgerSnapshot().byCategory.storage).toBe(
      baseline.byCategory.storage + result!.byteLength,
    );
    result!.release();
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('releases pending snapshot ownership if hashing fails', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('Hash unavailable'));
    await expect(put()).rejects.toThrow('Hash unavailable');
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    expect(await cache.summary()).toEqual({ count: 0, byteTotal: 0, generation: 0 });
  });

  it('rejects a cancelled UI session after delayed hashing without entering a write', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      await waiting;
      return digest(...args);
    });
    let current = true;
    const write = vi.spyOn(IDBObjectStore.prototype, 'put');
    const pending = cache.put(input(), {
      expectedToken: null,
      latestRevision: 0,
      canCommit: () => current,
    });
    current = false;
    finish();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(write).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    expect((await cache.summary()).generation).toBe(0);
  });

  it('checks the UI fence again inside the final transaction before the first write', async () => {
    const first = await put();
    const write = vi.spyOn(IDBObjectStore.prototype, 'put');
    const canCommit = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(
      cache.put(input('project', 1), { expectedToken: first.token, latestRevision: 1, canCommit }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(canCommit).toHaveBeenCalledTimes(2);
    expect(write).not.toHaveBeenCalled();
    expect((await cache.summary()).generation).toBe(1);
    expect((await read())!.revision).toBe(0);
  });

  it('rejects fence accessors and thrown/asynchronous fences without executing writes', async () => {
    const accessor = vi.fn(() => () => true);
    const options = { expectedToken: null, latestRevision: 0 };
    Object.defineProperty(options, 'canCommit', { enumerable: true, get: accessor });
    await expect(cache.put(input(), options)).rejects.toThrow('data properties');
    expect(accessor).not.toHaveBeenCalled();
    const write = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(
      cache.put(input(), {
        expectedToken: null,
        latestRevision: 0,
        canCommit: () => {
          throw new Error('Session closed');
        },
      }),
    ).rejects.toThrow('Session closed');
    await expect(
      cache.put(input(), {
        expectedToken: null,
        latestRevision: 0,
        canCommit: (async () => true) as unknown as () => boolean,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(write).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('preserves a complete committed copy when cancellation occurs after the first write begins', async () => {
    let current = true;
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'pngs') current = false;
      return original.call(this, value, key);
    });
    await cache.put(input(), { expectedToken: null, latestRevision: 0, canCommit: () => current });
    expect(current).toBe(false);
    expect((await cache.summary()).count).toBe(1);
  });

  it('retains every entry when cleanup confirmation closes during validation or its fence throws', async () => {
    await put();
    const before = await cache.summary();
    let confirmed = true;
    const original = cache.read.bind(cache);
    vi.spyOn(cache, 'read').mockImplementation(async (id) => {
      const result = await original(id);
      confirmed = false;
      return result;
    });
    const remove = vi.spyOn(IDBObjectStore.prototype, 'delete');
    await expect(cache.clearDerived(before.generation, () => confirmed)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(
      cache.clearDerived(before.generation, () => {
        throw new Error('Dialog closed');
      }),
    ).rejects.toThrow('Dialog closed');
    expect(remove).not.toHaveBeenCalled();
    expect(await cache.summary()).toEqual(before);
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });
});

describe('thumbnail cache opening and connection lifecycle', () => {
  it('handles unavailable, denied and errored IndexedDB opens', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openThumbnailCache()).rejects.toThrow('unavailable');
    const denied = {
      open: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    await expect(openThumbnailCache({ indexedDB: denied })).rejects.toMatchObject({
      name: 'SecurityError',
    });
    const request = { error: new DOMException('Open failed', 'UnknownError') } as IDBOpenDBRequest;
    const failing = { open: () => request } as unknown as IDBFactory;
    const pending = openThumbnailCache({ indexedDB: failing });
    request.onerror!.call(request, new Event('error'));
    await expect(pending).rejects.toThrow();
  });

  it('rejects blocked opens promptly and closes a late successful connection', async () => {
    const request = {} as IDBOpenDBRequest;
    const opening = openThumbnailCache({
      indexedDB: { open: () => request } as unknown as IDBFactory,
    });
    request.onblocked!.call(request, new Event('blocked') as IDBVersionChangeEvent);
    await expect(opening).rejects.toThrow('blocking');
    const close = vi.fn();
    Object.defineProperty(request, 'result', { value: { close } });
    request.onsuccess!.call(request, new Event('success'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('times out stalled opens and aborts any late initial upgrade instead of creating stores', async () => {
    vi.useFakeTimers();
    const request = {} as IDBOpenDBRequest;
    const opening = openThumbnailCache({
      indexedDB: { open: () => request } as unknown as IDBFactory,
    });
    const rejected = expect(opening).rejects.toThrow('opening timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    const abort = vi.fn();
    Object.defineProperty(request, 'transaction', { value: { abort } });
    request.onupgradeneeded!.call(request, { oldVersion: 0 } as IDBVersionChangeEvent);
    expect(abort).toHaveBeenCalledOnce();
  });

  it('rejects closed handles, closes on versionchange and does not upgrade a newer cache version', async () => {
    cache.close();
    await expect(cache.summary()).rejects.toThrow('closed');
    await expect(put()).rejects.toThrow('closed');
    const other = await openThumbnailCache({ indexedDB: factory });
    handles.push(other);
    const request = factory.open(THUMBNAIL_CACHE_DB_NAME, 2);
    const newer = await requestResult(request);
    databases.push(newer);
    await expect(other.listMetadata()).rejects.toThrow('closed');
    await expect(openThumbnailCache({ indexedDB: factory })).rejects.toMatchObject({
      name: 'VersionError',
    });
    expect(newer.version).toBe(2);
  });

  it('handles an unexpected close event and retains an already completed write', async () => {
    const first = await put();
    let connection: IDBDatabase | undefined;
    let closed: Promise<void> | undefined;
    const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      const request = original.call(this, value, key);
      if (this.name === 'pngs') {
        connection = this.transaction.db;
        closed = new Promise<void>((resolve) =>
          connection!.addEventListener('close', () => resolve(), { once: true }),
        );
        // fake-indexeddb's forced close waits for its current transaction to finish.
        // Its published declaration uses the constructor type; the implementation takes an instance.
        forceCloseDatabase(connection as unknown as Parameters<typeof forceCloseDatabase>[0]);
      }
      return request;
    });
    const saved = await put('project', 1, first.token);
    await closed;
    fail.mockRestore();
    expect(connection).toBeDefined();
    await expect(cache.summary()).rejects.toThrow('closed');
    expect(resourceLedgerSnapshot()).toEqual(baseline);
    const reopened = await openThumbnailCache({ indexedDB: factory });
    handles.push(reopened);
    expect((await reopened.listMetadata())[0].token).toBe(saved.token);
  });

  it('rejects an unrecognized cache schema without modifying it', async () => {
    const separate = new IDBFactory();
    const request = separate.open(THUMBNAIL_CACHE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('foreign');
    const db = await requestResult(request);
    databases.push(db);
    await expect(openThumbnailCache({ indexedDB: separate })).rejects.toThrow(
      'unexpected database schema',
    );
    expect([...db.objectStoreNames]).toEqual(['foreign']);
  });

  it('rejects transaction-open failures and releases input copy ownership', async () => {
    vi.spyOn(FakeDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('Closed', 'InvalidStateError');
    });
    await expect(put()).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('bounds a transaction that never dispatches request, completion or abort events', async () => {
    vi.useFakeTimers();
    const request = {} as IDBRequest;
    const transaction = {
      abort: vi.fn(),
      objectStore: () => ({ getAll: () => request, getAllKeys: () => request }),
    } as unknown as IDBTransaction;
    vi.spyOn(FakeDatabase.prototype, 'transaction').mockReturnValue(transaction);
    const pending = cache.summary();
    const rejected = expect(pending).rejects.toThrow('transaction timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(transaction.abort).toHaveBeenCalledOnce();
    await expect(cache.listMetadata()).rejects.toThrow('closed');
  });
});
