export const DB_NAME = 'chameleon-asset-studio';
/**
 * v2（2D-1B-STORAGE）: trash / snapshots / quarantine ストアを追加した。
 * 既存の projects / assets / blobs ストアとその中身は一切変更していない
 * （additive のみ）。v1 のデータをこのコードで開いても無変換でそのまま読める。
 */
export const DB_VERSION = 2;

export const STORE_PROJECTS = 'projects';
export const STORE_ASSETS = 'assets';
export const STORE_BLOBS = 'blobs';
/** ごみ箱（2D-1B-STORAGE §B）。プロジェクト単位で project + assets を退避する。 */
export const STORE_TRASH = 'trash';
/** 破壊的画像編集の復旧点（2D-1B-STORAGE §C）。アセット単位で最大 3 件保持する。 */
export const STORE_SNAPSHOTS = 'snapshots';
/** 壊れた .casproj の隔離領域（2D-1B-STORAGE §E）。正本ストアには書き込まない。 */
export const STORE_QUARANTINE = 'quarantine';

export const INDEX_BY_PROJECT = 'byProject';
export const INDEX_BY_ASSET = 'byAsset';

let dbPromise: Promise<IDBDatabase> | null = null;

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageError';
  }
}

/** 保存容量不足時にユーザーへ表示する理由。ごみ箱を空にする・削除する導線を案内する。 */
export const QUOTA_EXCEEDED_MESSAGE =
  '保存容量が不足しています。ごみ箱を空にするか、不要なプロジェクトを削除して空き容量を確保してください。';

/**
 * QuotaExceededError を検出する。
 * 現行ブラウザは DOMException.name で示すが、古い実装は legacy code 22 のみ持つことがあるため両方見る。
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException === 'undefined' || !(error instanceof DOMException)) {
    return false;
  }
  return error.name === 'QuotaExceededError' || error.code === 22;
}

/** request / transaction のエラーを StorageError へ変換する。容量不足は専用メッセージにする。 */
function toStorageError(defaultMessage: string, cause: unknown): StorageError {
  if (isQuotaExceededError(cause)) {
    return new StorageError(QUOTA_EXCEEDED_MESSAGE, { cause });
  }
  return new StorageError(defaultMessage, { cause });
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
  if (!db.objectStoreNames.contains(STORE_TRASH)) {
    db.createObjectStore(STORE_TRASH, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
    const snapshots = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
    snapshots.createIndex(INDEX_BY_ASSET, 'assetId');
  }
  if (!db.objectStoreNames.contains(STORE_QUARANTINE)) {
    db.createObjectStore(STORE_QUARANTINE, { keyPath: 'id' });
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
      request.onsuccess = () => {
        const db = request.result;
        // 他のタブが旧バージョンの接続を開いたままだと upgrade できずブロックされる。
        // 新しいバージョンへの変更が他所で起きたら、この接続を閉じて次回再オープンさせる。
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () =>
        reject(toStorageError('保存用データベースを開けませんでした', request.error));
      request.onblocked = () =>
        reject(
          new StorageError(
            '保存用データベースを開けませんでした。このアプリを開いている他のタブを閉じてから、再読み込みしてください。',
          ),
        );
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
    request.onerror = () => reject(toStorageError('データベース操作に失敗しました', request.error));
  });
}

/**
 * 1 トランザクション内で複数ストアを操作する。
 * fn 内では IndexedDB リクエスト以外の非同期処理を待たないこと
 * （ブラウザはアイドルになったトランザクションを自動コミットする）。
 *
 * fn が例外を投げた場合（IndexedDB のリクエスト以外のエラー、または put() 自体が
 * 同期的に投げる DataError なども含む）は、トランザクションを明示的に中断する。
 * IndexedDB は put() 等の同期例外だけではトランザクションを自動中断しないため、
 * 中断しないと「途中まで成功した書き込みだけコミットされる」部分書き込みが起こり得る。
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
    tx.onerror = () => reject(toStorageError('保存トランザクションが失敗しました', tx.error));
    tx.onabort = () => reject(toStorageError('保存トランザクションが中断されました', tx.error));
  });
  try {
    const result = await fn(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // 既に完了 / 中断済みの場合、abort() は例外を投げるが無視してよい
    }
    // abort の完了（onabort 発火による done の reject）を待ってから、
    // より詳細な元のエラーを投げ直す。待たずに投げると、後から reject される
    // done が未処理の Promise rejection になってしまう。
    await done.catch(() => {});
    throw error;
  }
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
