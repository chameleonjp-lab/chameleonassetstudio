import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from './db';
import {
  QUARANTINE_LIMIT,
  QUARANTINE_MAX_STORED_BYTES,
  deleteQuarantineEntry,
  listQuarantine,
  saveQuarantineEntry,
} from './quarantineStore';

beforeEach(async () => {
  await resetDbForTests();
});

describe('壊れた import の隔離（quarantine）', () => {
  it('隔離したエントリが一覧に出る', async () => {
    await saveQuarantineEntry({
      fileName: 'broken.casproj',
      errorMessage: 'project.json が見つかりません',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });
    const list = await listQuarantine();
    expect(list).toHaveLength(1);
    expect(list[0].fileName).toBe('broken.casproj');
    expect(list[0].errorMessage).toBe('project.json が見つかりません');
    expect(list[0].size).toBe(3);
  });

  it('削除できる', async () => {
    await saveQuarantineEntry({
      fileName: 'broken.casproj',
      errorMessage: '理由',
      bytes: new Uint8Array([1]).buffer,
    });
    const [entry] = await listQuarantine();
    await deleteQuarantineEntry(entry.id);
    expect(await listQuarantine()).toEqual([]);
  });

  it(`最新 ${QUARANTINE_LIMIT} 件だけ保持し、超過分は最古から消える`, async () => {
    for (let i = 0; i < QUARANTINE_LIMIT + 2; i += 1) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 1, i + 1));
      try {
        await saveQuarantineEntry({
          fileName: `broken-${i}.casproj`,
          errorMessage: '理由',
          bytes: new Uint8Array([i]).buffer,
        });
      } finally {
        vi.useRealTimers();
      }
    }
    const list = await listQuarantine();
    expect(list).toHaveLength(QUARANTINE_LIMIT);
    expect(list.map((entry) => entry.fileName)).toEqual([
      'broken-4.casproj',
      'broken-3.casproj',
      'broken-2.casproj',
    ]);
  });

  it('50MB を超えるファイルは bytes を保存せず、size と理由だけ残す', async () => {
    // 実際に 50MB を確保せず byteLength だけ超過させたオブジェクトで代用する
    const bytes = { byteLength: QUARANTINE_MAX_STORED_BYTES + 1 } as ArrayBuffer;
    await saveQuarantineEntry({
      fileName: 'huge.casproj',
      errorMessage: '巨大ファイル',
      bytes,
    });
    const list = await listQuarantine();
    expect(list).toHaveLength(1);
    expect(list[0].size).toBe(QUARANTINE_MAX_STORED_BYTES + 1);
  });
});
