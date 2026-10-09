/** This database is deliberately independent of the existing 2D database. */
export const LEGACY_PROJECT_3D_DB_NAME = 'chameleon-asset-studio-3d';
export const PREVIOUS_PROJECT_3D_DB_NAME = 'chameleon-asset-studio-3d-v2';
export const PROJECT_3D_DB_NAME = 'chameleon-asset-studio-3d-v3';
export const PROJECT_3D_DB_VERSION = 1;

export const STORAGE_STORES = [
  'roots',
  'snapshots',
  'blobs',
  'staging',
  'pins',
  'leases',
  'history',
  'meta',
  'legacyBackups',
] as const;
export type StorageStore = (typeof STORAGE_STORES)[number];

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function inTransaction<T>(
  db: IDBDatabase,
  stores: readonly StorageStore[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const transaction = db.transaction([...stores], mode);
  const abort = () => {
    try {
      transaction.abort();
    } catch {
      // An already completed transaction cannot be aborted.
    }
  };
  const completion = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(signal?.reason ?? transaction.error ?? new DOMException('Save aborted', 'AbortError'));
    transaction.onerror = () => {
      // The abort event reports the final transaction outcome.
    };
  });
  // A request can fail before the operation's continuation awaits completion.
  void completion.catch(() => undefined);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } catch (error) {
    abort();
    await completion.catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export function openStorageDatabase(
  options: {
    indexedDB?: IDBFactory;
    name?: string;
  } = {},
): Promise<IDBDatabase> {
  if (options.name === LEGACY_PROJECT_3D_DB_NAME || options.name === PREVIOUS_PROJECT_3D_DB_NAME)
    return Promise.reject(
      new Error('The legacy 0.1.0/0.2.0 namespace is read-only; use copy migration.'),
    );
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = factory.open(options.name ?? PROJECT_3D_DB_NAME, PROJECT_3D_DB_VERSION);
    request.onupgradeneeded = () => {
      for (const store of STORAGE_STORES)
        request.result.createObjectStore(store, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open 3D storage'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Another tab is blocking 3D storage opening'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
