export const DB_NAME = 'chameleon-asset-studio';
export const DB_VERSION = 1;

export const STORE_PROJECTS = 'projects';
export const STORE_ASSETS = 'assets';
export const STORE_BLOBS = 'blobs';

export const INDEX_BY_PROJECT = 'byProject';

let dbPromise: Promise<IDBDatabase> | null = null;

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}

function upgradeDb(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
    db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_ASSETS)) {
    const assets = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
    assets.createIndex(INDEX_BY_PROJECT, 'projectId');
  }
  if (!db.objectStoreNames.contains(STORE_BLOBS)) {
    const blobs = db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
    blobs.createIndex(INDEX_BY_PROJECT, 'projectId');
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new StorageError('この環境では IndexedDB が使えません'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => upgradeDb(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new StorageError('保存用データベースを開けませんでした', { cause: request.error }));
    });
    // 失敗をキャッシュしない（次回の呼び出しで再試行できるようにする）
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError('データベース操作に失敗しました', { cause: request.error }));
  });
}

/**
 * 1 トランザクション内で複数ストアを操作する。
 * fn 内では IndexedDB リクエスト以外の非同期処理を待たないこと
 * （ブラウザはアイドルになったトランザクションを自動コミットする）。
 */
export async function runTransaction<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new StorageError('保存トランザクションが失敗しました', { cause: tx.error }));
    tx.onabort = () =>
      reject(new StorageError('保存トランザクションが中断されました', { cause: tx.error }));
  });
  const result = await fn(tx);
  await done;
  return result;
}

/** テスト用。接続を閉じてデータベースを削除する。 */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () =>
      reject(new StorageError('データベースを削除できませんでした', { cause: request.error }));
  });
}
