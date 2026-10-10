import { createResourceOwner, reserveResourceBytes } from '../profile/resourceLedger';
import { requestResult } from './db';
import { hashBlob } from './repository';

/** Derived, regenerable data only. Never open, upgrade or collect a project database here. */
export const THUMBNAIL_CACHE_DB_NAME = 'chameleon-asset-studio-3d-derived-thumbnails';
export const THUMBNAIL_CACHE_DB_VERSION = 1;
export const THUMBNAIL_CACHE_LIMITS = Object.freeze({
  entries: 32,
  totalBytes: 16 * 1024 * 1024,
  entryBytes: 256 * 1024,
  edge: 256,
});
const TIMEOUT_MS = 5000;
const STORES = ['entries', 'pngs', 'meta'] as const;
const INPUT_KEYS = ['projectId', 'revision', 'bytes', 'width', 'height'];
const ENTRY_KEYS = ['projectId', 'revision', 'width', 'height', 'byteLength', 'hash', 'token'];
const META_KEYS = ['id', 'generation', 'count', 'byteTotal'];

export interface ThumbnailInput {
  projectId: string;
  revision: number;
  bytes: Uint8Array;
  width: number;
  height: number;
}
export interface ThumbnailMetadata extends Omit<ThumbnailInput, 'bytes'> {
  byteLength: number;
  hash: string;
  /** Database-wide monotonic token; replacement/clear never reuse a previous token. */
  token: number;
}
export interface ThumbnailRead extends ThumbnailMetadata {
  /** Detached bytes, owned by this result until release; do not use after release. */
  bytes: Uint8Array;
  release(): void;
}
export interface ThumbnailSummary {
  count: number;
  byteTotal: number;
  generation: number;
}
export interface ThumbnailPutOptions {
  /** Token observed before rendering, or null if no cached entry was observed. */
  expectedToken: number | null;
  /** Latest editor revision known at publication, including unsaved edits. */
  latestRevision: number;
  /** Synchronous session/job fence, checked after hashing and immediately before writes begin. */
  canCommit?: () => boolean;
}
interface MetaRecord extends ThumbnailSummary {
  id: 'generation';
}
interface CacheState {
  summary: ThumbnailSummary;
  entries: ThumbnailMetadata[];
}

export class ThumbnailCacheConflictError extends Error {
  constructor(public readonly reason: 'token' | 'revision' | 'generation') {
    super(`Thumbnail cache changed (${reason}); refresh before retrying.`);
    this.name = 'ThumbnailCacheConflictError';
  }
}
export class ThumbnailCacheIntegrityError extends Error {
  constructor(message: string) {
    super(`Thumbnail cache is unrecognized or damaged: ${message}. No cache records were removed.`);
    this.name = 'ThumbnailCacheIntegrityError';
  }
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function projectId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
/** Inspect descriptors before reading values: no accessors, extra payloads or source data. */
function fields(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Expected a plain thumbnail record');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Expected a plain thumbnail record');
  const names = Reflect.ownKeys(value);
  if (
    names.length < keys.length ||
    names.length > keys.length + optional.length ||
    names.some((key) => typeof key !== 'string' || (!keys.includes(key) && !optional.includes(key)))
  )
    throw new Error('Unexpected thumbnail record fields');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of [...keys, ...optional]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor && optional.includes(key)) continue;
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Thumbnail fields must be enumerable data properties');
    result[key] = descriptor.value;
  }
  return result;
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;

/** Native accessors avoid overridden .length/.buffer/iterator/species on caller-owned bytes. */
function bytesView(value: unknown): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype)
    throw new Error('Thumbnail bytes must be a Uint8Array');
  const length = byteLengthGetter.call(value) as number;
  const buffer = bufferGetter.call(value) as ArrayBuffer;
  if (!(buffer instanceof ArrayBuffer) || !integer(length, 33, THUMBNAIL_CACHE_LIMITS.entryBytes))
    throw new Error('Thumbnail PNG exceeds the 256 KiB profile or is too short');
  return new Uint8Array(buffer, byteOffsetGetter.call(value), length);
}
function dimensions(value: Record<string, unknown>): void {
  if (
    !projectId(value.projectId) ||
    !integer(value.revision) ||
    !integer(value.width, 1, THUMBNAIL_CACHE_LIMITS.edge) ||
    !integer(value.height, 1, THUMBNAIL_CACHE_LIMITS.edge)
  )
    throw new Error('Invalid thumbnail project, revision or dimensions (maximum 256 × 256)');
}
/** Header validation only; this core module deliberately has no image decoder or canvas. */
function pngHeader(bytes: Uint8Array, width: number, height: number): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    signature.some((value, index) => bytes[index] !== value) ||
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452 ||
    view.getUint32(16) !== width ||
    view.getUint32(20) !== height ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1 ||
    !(
      { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] } as Record<
        number,
        number[]
      >
    )[bytes[25]]?.includes(bytes[24])
  )
    throw new Error('Thumbnail must have a PNG signature and matching valid IHDR dimensions');
}
function metadata(value: unknown): ThumbnailMetadata {
  const entry = fields(value, ENTRY_KEYS);
  dimensions(entry);
  if (
    !integer(entry.byteLength, 33, THUMBNAIL_CACHE_LIMITS.entryBytes) ||
    !integer(entry.token, 1) ||
    typeof entry.hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.hash)
  )
    throw new Error('Invalid thumbnail metadata');
  return entry as unknown as ThumbnailMetadata;
}
function integrity<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ThumbnailCacheIntegrityError) throw error;
    throw new ThumbnailCacheIntegrityError(
      error instanceof Error ? error.message : 'invalid record',
    );
  }
}
function abort(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    /* Already completed or aborted. */
  }
}

export class ThumbnailCache {
  private closed = false;
  constructor(private readonly db: IDBDatabase) {
    if (db.name !== THUMBNAIL_CACHE_DB_NAME)
      throw new ThumbnailCacheIntegrityError('unexpected database namespace');
    schema(db);
    db.onversionchange = () => this.close();
    db.onclose = () => {
      this.closed = true;
    };
  }
  close(): void {
    this.closed = true;
    this.db.close();
  }
  private transaction<T>(
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Thumbnail cache is closed'));
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = this.db.transaction([...STORES], mode);
      } catch (error) {
        reject(error);
        return;
      }
      let settled = false;
      let ready = false;
      let result: T;
      let failure: { error: unknown } | undefined;
      const rejectFinished = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const fail = (error: unknown) => {
        if (settled || failure) return;
        failure = { error };
        // Keep the operation's allocation tickets until rollback has actually finished.
        abort(transaction);
      };
      const timer = setTimeout(() => {
        abort(transaction);
        this.close();
        rejectFinished(failure?.error ?? new Error('Thumbnail cache transaction timed out'));
      }, TIMEOUT_MS);
      transaction.onabort = () =>
        rejectFinished(
          failure?.error ??
            transaction.error ??
            new DOMException('Thumbnail transaction aborted', 'AbortError'),
        );
      transaction.onerror = () => {
        /* Abort carries the final transaction error. */
      };
      transaction.oncomplete = () => {
        if (settled) return;
        if (failure) {
          rejectFinished(failure.error);
          return;
        }
        if (!ready) {
          rejectFinished(new Error('Thumbnail transaction completed before its operation'));
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      void operation(transaction).then((value) => {
        result = value;
        ready = true;
      }, fail);
    });
  }
  /** Metadata-only reads; binary values are never fetched by list/summary. */
  private async state(transaction: IDBTransaction): Promise<CacheState> {
    const [rawEntries, rawMeta, pngKeys] = await Promise.all([
      requestResult(
        transaction.objectStore('entries').getAll(undefined, THUMBNAIL_CACHE_LIMITS.entries + 1),
      ),
      requestResult(transaction.objectStore('meta').getAll(undefined, 2)),
      requestResult(
        transaction.objectStore('pngs').getAllKeys(undefined, THUMBNAIL_CACHE_LIMITS.entries + 1),
      ),
    ]);
    return integrity(() => {
      if (rawEntries.length > THUMBNAIL_CACHE_LIMITS.entries || rawMeta.length !== 1)
        throw new Error('unexpected record count');
      const meta = fields(rawMeta[0], META_KEYS);
      if (
        meta.id !== 'generation' ||
        !integer(meta.generation) ||
        !integer(meta.count, 0, THUMBNAIL_CACHE_LIMITS.entries) ||
        !integer(meta.byteTotal, 0, THUMBNAIL_CACHE_LIMITS.totalBytes)
      )
        throw new Error('invalid generation record');
      const entries = rawEntries.map(metadata);
      if (
        entries.length !== meta.count ||
        pngKeys.length !== meta.count ||
        entries.reduce((total, entry) => total + entry.byteLength, 0) !== meta.byteTotal ||
        entries.some(
          (entry, index) =>
            entry.projectId !== pngKeys[index] || entry.token > (meta.generation as number),
        ) ||
        new Set(entries.map((entry) => entry.token)).size !== entries.length
      )
        throw new Error('metadata and PNG records disagree');
      return {
        summary: { count: meta.count, byteTotal: meta.byteTotal, generation: meta.generation },
        entries,
      };
    });
  }
  async listMetadata(): Promise<ThumbnailMetadata[]> {
    return this.transaction(
      'readonly',
      async (transaction) => (await this.state(transaction)).entries,
    );
  }
  async summary(): Promise<ThumbnailSummary> {
    return this.transaction(
      'readonly',
      async (transaction) => (await this.state(transaction)).summary,
    );
  }
  async read(id: string): Promise<ThumbnailRead | null> {
    if (!projectId(id)) throw new Error('Invalid thumbnail project ID');
    let owner: ReturnType<typeof createResourceOwner> | undefined;
    try {
      const result = await this.transaction('readonly', async (transaction) => {
        const entry = (await this.state(transaction)).entries.find(
          (entry) => entry.projectId === id,
        );
        if (!entry) return null;
        // Include the IndexedDB result, detached return bytes and hash working copy.
        owner = createResourceOwner('storage', THUMBNAIL_CACHE_LIMITS.entryBytes * 3);
        const raw = await requestResult(transaction.objectStore('pngs').get(id));
        return integrity(() => {
          const record = fields(raw, ['projectId', 'bytes']);
          const bytes = bytesView(record.bytes);
          if (record.projectId !== id || bytes.byteLength !== entry.byteLength)
            throw new Error('PNG size or identity mismatch');
          pngHeader(bytes, entry.width, entry.height);
          return { ...entry, bytes: new Uint8Array(bytes) };
        });
      });
      if (!result) return null;
      if ((await hashBlob(result.bytes)) !== result.hash)
        throw new ThumbnailCacheIntegrityError('PNG hash mismatch');
      owner!.resize(result.byteLength);
      return { ...result, release: owner!.release };
    } catch (error) {
      owner?.release();
      throw error;
    }
  }
  async put(input: ThumbnailInput, options: ThumbnailPutOptions): Promise<ThumbnailMetadata> {
    const value = fields(input, INPUT_KEYS);
    const guard = fields(options, ['expectedToken', 'latestRevision'], ['canCommit']);
    dimensions(value);
    if (
      (guard.expectedToken !== null && !integer(guard.expectedToken, 1)) ||
      !integer(guard.latestRevision)
    )
      throw new Error('Thumbnail put requires an expected token and latest revision');
    if (guard.canCommit !== undefined && typeof guard.canCommit !== 'function')
      throw new Error('Thumbnail canCommit must be a synchronous function');
    const canCommit = guard.canCommit as (() => boolean) | undefined;
    const assertCurrent = () => {
      if (canCommit && canCommit() !== true)
        throw new DOMException('Thumbnail request is no longer current', 'AbortError');
    };
    if (value.revision !== guard.latestRevision) throw new ThumbnailCacheConflictError('revision');
    const view = bytesView(value.bytes);
    pngHeader(view, value.width as number, value.height as number);
    // Validate every bound before allocation; copy synchronously before hashing can yield.
    const release = reserveResourceBytes('storage', view.byteLength * 3);
    try {
      const bytes = new Uint8Array(view);
      const hash = await hashBlob(bytes);
      assertCurrent();
      // A replacement is never an implicit repair of an unrecognized/corrupt payload.
      // Hashing stays outside the write transaction; its CAS checks the observed token again.
      const previous = await this.read(value.projectId as string);
      previous?.release();
      return await this.transaction('readwrite', async (transaction) => {
        const state = await this.state(transaction);
        const current = state.entries.find((entry) => entry.projectId === value.projectId);
        if ((current?.token ?? null) !== guard.expectedToken)
          throw new ThumbnailCacheConflictError('token');
        if (current && (value.revision as number) < current.revision)
          throw new ThumbnailCacheConflictError('revision');
        const count = state.summary.count + (current ? 0 : 1);
        const byteTotal = state.summary.byteTotal - (current?.byteLength ?? 0) + bytes.byteLength;
        if (count > THUMBNAIL_CACHE_LIMITS.entries || byteTotal > THUMBNAIL_CACHE_LIMITS.totalBytes)
          throw new Error(
            'Thumbnail cache is full; existing entries were retained. Explicit cleanup is required.',
          );
        if (state.summary.generation === Number.MAX_SAFE_INTEGER)
          throw new ThumbnailCacheIntegrityError('generation exhausted');
        const generation = state.summary.generation + 1;
        const entry: ThumbnailMetadata = {
          projectId: value.projectId as string,
          revision: value.revision as number,
          width: value.width as number,
          height: value.height as number,
          byteLength: bytes.byteLength,
          hash,
          token: generation,
        };
        // No await between the synchronous UI fence and the first atomic write.
        // A later cancellation does not delete or roll back a successfully published copy.
        assertCurrent();
        await requestResult(
          transaction.objectStore('pngs').put({ projectId: entry.projectId, bytes }),
        );
        await requestResult(transaction.objectStore('entries').put(entry));
        await requestResult(
          transaction
            .objectStore('meta')
            .put({ id: 'generation', generation, count, byteTotal } satisfies MetaRecord),
        );
        return { ...entry };
      });
    } finally {
      release();
    }
  }
  /**
   * Call only after the UI has shown summary() and obtained explicit user approval.
   * A changed generation rejects the whole operation; no partial removal or implicit eviction.
   */
  async clearDerived(
    expectedGeneration: number,
    canCommit?: () => boolean,
  ): Promise<ThumbnailSummary> {
    if (!integer(expectedGeneration)) throw new Error('Invalid thumbnail cleanup generation');
    if (canCommit !== undefined && typeof canCommit !== 'function')
      throw new Error('Thumbnail canCommit must be a synchronous function');
    const state = await this.transaction('readonly', (transaction) => this.state(transaction));
    if (state.summary.generation !== expectedGeneration)
      throw new ThumbnailCacheConflictError('generation');
    // Recognize and verify each payload before destructive work, without retaining a binary list.
    for (const entry of state.entries) {
      const read = await this.read(entry.projectId);
      try {
        if (!read || read.token !== entry.token)
          throw new ThumbnailCacheConflictError('generation');
      } finally {
        read?.release();
      }
    }
    return this.transaction('readwrite', async (transaction) => {
      const current = await this.state(transaction);
      if (current.summary.generation !== expectedGeneration)
        throw new ThumbnailCacheConflictError('generation');
      if (
        current.entries.length !== state.entries.length ||
        current.entries.some((entry, index) =>
          ENTRY_KEYS.some(
            (key) =>
              entry[key as keyof ThumbnailMetadata] !==
              state.entries[index][key as keyof ThumbnailMetadata],
          ),
        )
      )
        throw new ThumbnailCacheIntegrityError(
          'records changed without advancing their generation',
        );
      if (expectedGeneration === Number.MAX_SAFE_INTEGER)
        throw new ThumbnailCacheIntegrityError('generation exhausted');
      const summary = { count: 0, byteTotal: 0, generation: expectedGeneration + 1 };
      if (canCommit && canCommit() !== true)
        throw new DOMException('Thumbnail cleanup is no longer confirmed', 'AbortError');
      // Delete only individually recognized keys, never a database or unrecognized records.
      for (const entry of current.entries) {
        await requestResult(transaction.objectStore('pngs').delete(entry.projectId));
        await requestResult(transaction.objectStore('entries').delete(entry.projectId));
      }
      await requestResult(
        transaction.objectStore('meta').put({ id: 'generation', ...summary } satisfies MetaRecord),
      );
      return summary;
    });
  }
}

function schema(db: IDBDatabase): void {
  if (
    db.version !== THUMBNAIL_CACHE_DB_VERSION ||
    [...db.objectStoreNames].sort().join() !== [...STORES].sort().join()
  )
    throw new ThumbnailCacheIntegrityError('unexpected database schema');
  const transaction = db.transaction([...STORES], 'readonly');
  for (const name of STORES) {
    const store = transaction.objectStore(name);
    if (
      store.keyPath !== (name === 'meta' ? 'id' : 'projectId') ||
      store.autoIncrement ||
      store.indexNames.length
    )
      throw new ThumbnailCacheIntegrityError('unexpected object store schema');
  }
}

export function openThumbnailCache(
  options: { indexedDB?: IDBFactory } = {},
): Promise<ThumbnailCache> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error('Thumbnail cache opening timed out')),
      TIMEOUT_MS,
    );
    try {
      const factory = options.indexedDB ?? globalThis.indexedDB;
      if (!factory) {
        fail(new Error('IndexedDB is unavailable for thumbnails'));
        return;
      }
      const request = factory.open(THUMBNAIL_CACHE_DB_NAME, THUMBNAIL_CACHE_DB_VERSION);
      request.onblocked = () => fail(new Error('Another tab is blocking thumbnail cache opening'));
      request.onerror = () => fail(request.error ?? new Error('Could not open thumbnail cache'));
      request.onupgradeneeded = (event) => {
        if (settled || event.oldVersion !== 0) {
          request.transaction?.abort();
          return;
        }
        try {
          request.result.createObjectStore('entries', { keyPath: 'projectId' });
          request.result.createObjectStore('pngs', { keyPath: 'projectId' });
          request.result
            .createObjectStore('meta', { keyPath: 'id' })
            .add({ id: 'generation', generation: 0, count: 0, byteTotal: 0 } satisfies MetaRecord);
        } catch (error) {
          request.transaction?.abort();
          fail(error);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        let cache: ThumbnailCache;
        try {
          cache = new ThumbnailCache(db);
        } catch (error) {
          db.close();
          fail(error);
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(cache);
      };
    } catch (error) {
      fail(error);
    }
  });
}
