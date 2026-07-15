import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  QUOTA_EXCEEDED_MESSAGE,
  STORE_ASSETS,
  STORE_BLOBS,
  STORE_PROJECTS,
  StorageError,
  isQuotaExceededError,
  isQuotaExceededStorageError,
  requestToPromise,
  resetDbForTests,
} from './db';

beforeEach(async () => {
  await resetDbForTests();
});

afterEach(async () => {
  await resetDbForTests();
});

describe('DB v1 -> v2 互換性（2D-1B-STORAGE §A）', () => {
  it('v1 相当のデータを v2 のコードで開いても、既存 store の中身がそのまま読める', async () => {
    // v1 と同じ store 構成（projects / assets / blobs のみ）で DB を作り、データを入れる。
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        const assets = db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
        assets.createIndex('byProject', 'projectId');
        const blobs = db.createObjectStore(STORE_BLOBS, { keyPath: 'key' });
        blobs.createIndex('byProject', 'projectId');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readwrite');
        tx.objectStore(STORE_PROJECTS).put({
          format: 'chameleon-project',
          version: '0.1.0',
          id: 'project_v1',
          name: 'v1 プロジェクト',
          assets: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        tx.objectStore(STORE_ASSETS).put({
          id: 'asset_v1',
          projectId: 'project_v1',
          data: { id: 'asset_v1', name: 'v1 asset' },
        });
        tx.objectStore(STORE_BLOBS).put({
          key: 'asset_v1/textures/main.png',
          projectId: 'project_v1',
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]).buffer,
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    // v2 のコード（DB_VERSION=2、db.ts の openDb 経由）で同じ DB を開く。
    // upgradeneeded で trash / snapshots / quarantine が追加されるだけで、
    // 既存 3 store の中身は無変換のまま残っていることを確認する。
    const { openDb, STORE_TRASH, STORE_SNAPSHOTS, STORE_QUARANTINE } = await import('./db');
    const db = await openDb();
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining([
        STORE_PROJECTS,
        STORE_ASSETS,
        STORE_BLOBS,
        STORE_TRASH,
        STORE_SNAPSHOTS,
        STORE_QUARANTINE,
      ]),
    );

    const tx = db.transaction([STORE_PROJECTS, STORE_ASSETS, STORE_BLOBS], 'readonly');
    const project = await requestToPromise(tx.objectStore(STORE_PROJECTS).get('project_v1'));
    const asset = await requestToPromise(tx.objectStore(STORE_ASSETS).get('asset_v1'));
    const blob = await requestToPromise(
      tx.objectStore(STORE_BLOBS).get('asset_v1/textures/main.png'),
    );
    expect(project).toMatchObject({ id: 'project_v1', name: 'v1 プロジェクト' });
    expect(asset).toMatchObject({ id: 'asset_v1', projectId: 'project_v1' });
    expect(blob).toMatchObject({ key: 'asset_v1/textures/main.png', mimeType: 'image/png' });
  });
});

describe('容量不足（QuotaExceededError）の検出（2D-1B-STORAGE §D）', () => {
  it('isQuotaExceededError は DOMException(QuotaExceededError) を検出する', () => {
    expect(isQuotaExceededError(new DOMException('容量不足', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError(new DOMException('その他', 'AbortError'))).toBe(false);
    expect(isQuotaExceededError(new Error('容量不足'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  interface FakeRequest {
    result: undefined;
    error: DOMException | null;
    onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  }

  it('requestToPromise は QuotaExceededError を保存容量不足のメッセージへ変換する', async () => {
    // 実際の IndexedDB リクエストを模した最小限のオブジェクトでエラーパスだけを検証する
    // （容量不足を実ブラウザ / fake-indexeddb 上で再現する手段が無いため、モックで注入する）。
    const fake: FakeRequest = { result: undefined, error: null, onsuccess: null, onerror: null };

    const promise = requestToPromise(fake as unknown as IDBRequest<void>);
    fake.error = new DOMException('容量不足です', 'QuotaExceededError');
    fake.onerror?.();

    await expect(promise).rejects.toThrow(StorageError);
    await expect(promise).rejects.toThrow(QUOTA_EXCEEDED_MESSAGE);
    const convertedError = await promise.catch((error: unknown) => error);
    expect(isQuotaExceededStorageError(convertedError)).toBe(true);
  });

  it('QuotaExceededError 以外の request エラーは既存の汎用メッセージのままにする', async () => {
    const fake: FakeRequest = { result: undefined, error: null, onsuccess: null, onerror: null };

    const promise = requestToPromise(fake as unknown as IDBRequest<void>);
    fake.error = new DOMException('不明なエラー', 'UnknownError');
    fake.onerror?.();

    await expect(promise).rejects.toThrow(/データベース操作に失敗しました/);
  });
});
