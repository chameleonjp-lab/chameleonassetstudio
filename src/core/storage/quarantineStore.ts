import { generateId } from '../model';
import { STORE_QUARANTINE, requestToPromise, runTransaction } from './db';

/** 隔離領域（quarantine）に保持する最新エントリ数（2D-1B-STORAGE §E）。 */
export const QUARANTINE_LIMIT = 3;

/** これを超える ZIP は元データ（bytes）を保存せず、理由とサイズだけ残す。 */
export const QUARANTINE_MAX_STORED_BYTES = 50 * 1024 * 1024;

/** quarantine ストアの 1 レコード。壊れた import は正本ストアへ一切書き込まず、ここへ隔離する。 */
export interface QuarantineRecord {
  id: string;
  fileName: string;
  importedAt: string;
  errorMessage: string;
  size: number;
  /** 50MB 超のファイルは容量節約のため元データを保存しない。 */
  bytes?: ArrayBuffer;
}

export interface SaveQuarantineEntryInput {
  fileName: string;
  errorMessage: string;
  /** 50MiB以下で読み込み済みの場合だけ渡す。 */
  bytes?: ArrayBuffer;
  /** bytesを読む前に拒否した入力では、File.sizeだけを記録する。 */
  size?: number;
}

/** 読み込みに失敗した信頼しない入力を隔離領域へ保存する（最新 QUARANTINE_LIMIT 件のみ保持）。 */
export async function saveQuarantineEntry(input: SaveQuarantineEntryInput): Promise<void> {
  const size = input.bytes?.byteLength ?? input.size;
  if (size === undefined || !Number.isFinite(size) || size < 0) {
    throw new Error('quarantineへ保存する入力sizeが不正です。');
  }
  const record: QuarantineRecord = {
    id: generateId('quarantine'),
    fileName: input.fileName,
    importedAt: new Date().toISOString(),
    errorMessage: input.errorMessage,
    size,
    ...(input.bytes && size <= QUARANTINE_MAX_STORED_BYTES ? { bytes: input.bytes } : {}),
  };
  await runTransaction([STORE_QUARANTINE], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_QUARANTINE).put(record));
    const all = await requestToPromise(
      tx.objectStore(STORE_QUARANTINE).getAll() as IDBRequest<QuarantineRecord[]>,
    );
    if (all.length <= QUARANTINE_LIMIT) {
      return;
    }
    const sorted = [...all].sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1));
    const overflow = sorted.slice(0, sorted.length - QUARANTINE_LIMIT);
    for (const old of overflow) {
      await requestToPromise(tx.objectStore(STORE_QUARANTINE).delete(old.id));
    }
  });
}

export interface QuarantineSummary {
  id: string;
  fileName: string;
  importedAt: string;
  errorMessage: string;
  size: number;
}

/** 隔離済みファイルの一覧。新しい順。 */
export async function listQuarantine(): Promise<QuarantineSummary[]> {
  const rows = await runTransaction([STORE_QUARANTINE], 'readonly', (tx) =>
    requestToPromise(tx.objectStore(STORE_QUARANTINE).getAll() as IDBRequest<QuarantineRecord[]>),
  );
  return rows
    .map(({ id, fileName, importedAt, errorMessage, size }) => ({
      id,
      fileName,
      importedAt,
      errorMessage,
      size,
    }))
    .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
}

/** 隔離済みファイルを 1 件削除する。 */
export async function deleteQuarantineEntry(id: string): Promise<void> {
  await runTransaction([STORE_QUARANTINE], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_QUARANTINE).delete(id)),
  );
}
