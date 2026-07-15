import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_WARNING_THRESHOLDS,
  canRequestPersistentStorage,
  getPersistentStorageState,
  getStorageUsage,
  getStorageWarningLevel,
  requestPersistentStorage,
  type StorageUsage,
} from './storageUsage';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setStorageManager(storage: Partial<StorageManager> | undefined): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: storage === undefined ? {} : { storage },
  });
}

function usage(ratio: number | null, status: StorageUsage['status'] = 'available'): StorageUsage {
  return {
    status,
    usageBytes: ratio === null ? null : ratio * 100,
    quotaBytes: ratio === null ? null : 100,
    usageRatio: ratio,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

describe('storage estimate', () => {
  it('非対応環境ではunsupportedを返し、空き容量を推測しない', async () => {
    setStorageManager(undefined);

    await expect(getStorageUsage()).resolves.toEqual({
      status: 'unsupported',
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
    });
  });

  it('usage / quotaと使用率を返す', async () => {
    setStorageManager({ estimate: vi.fn().mockResolvedValue({ usage: 60, quota: 100 }) });

    await expect(getStorageUsage()).resolves.toEqual({
      status: 'available',
      usageBytes: 60,
      quotaBytes: 100,
      usageRatio: 0.6,
    });
  });

  it('例外はerrorへ変換し、呼び出し元をrejectしない', async () => {
    setStorageManager({ estimate: vi.fn().mockRejectedValue(new Error('blocked')) });

    await expect(getStorageUsage()).resolves.toEqual({
      status: 'error',
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
    });
  });

  it.each([
    [{ usage: -1, quota: 100 }, null, 100],
    [{ usage: Number.NaN, quota: 100 }, null, 100],
    [{ usage: Number.POSITIVE_INFINITY, quota: 100 }, null, 100],
    [{ usage: 10, quota: -1 }, 10, null],
    [{ usage: 10, quota: Number.NaN }, 10, null],
  ])('不正値をnullへ正規化する: %o', async (estimate, expectedUsage, expectedQuota) => {
    setStorageManager({ estimate: vi.fn().mockResolvedValue(estimate) });

    await expect(getStorageUsage()).resolves.toMatchObject({
      usageBytes: expectedUsage,
      quotaBytes: expectedQuota,
      usageRatio: null,
    });
  });

  it('quotaが0なら割合を計算しない', async () => {
    setStorageManager({ estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 0 }) });

    await expect(getStorageUsage()).resolves.toMatchObject({ usageRatio: null });
  });
});

describe('accepted warning thresholds B', () => {
  it('契約値を固定する', () => {
    expect(STORAGE_WARNING_THRESHOLDS).toEqual({ notice: 0.6, warning: 0.8, critical: 0.9 });
  });

  it.each([
    [0.5999, 'normal'],
    [0.6, 'notice'],
    [0.7999, 'notice'],
    [0.8, 'warning'],
    [0.8999, 'warning'],
    [0.9, 'critical'],
    [1.1, 'critical'],
  ] as const)('使用率%sを%sへ分類する', (ratio, expected) => {
    expect(getStorageWarningLevel(usage(ratio))).toBe(expected);
  });

  it('割合を計算できない状態はunavailableにする', () => {
    expect(getStorageWarningLevel(usage(null))).toBe('unavailable');
    expect(getStorageWarningLevel(usage(null, 'unsupported'))).toBe('unavailable');
    expect(getStorageWarningLevel(usage(null, 'error'))).toBe('unavailable');
  });
});

describe('persistent storage', () => {
  it('状態をgranted / not-grantedへ分類する', async () => {
    setStorageManager({ persisted: vi.fn().mockResolvedValue(true) });
    await expect(getPersistentStorageState()).resolves.toBe('granted');

    setStorageManager({ persisted: vi.fn().mockResolvedValue(false) });
    await expect(getPersistentStorageState()).resolves.toBe('not-granted');
  });

  it('非対応と例外を区別する', async () => {
    setStorageManager({});
    await expect(getPersistentStorageState()).resolves.toBe('unsupported');

    setStorageManager({ persisted: vi.fn().mockRejectedValue(new Error('blocked')) });
    await expect(getPersistentStorageState()).resolves.toBe('error');
  });

  it('persistは明示的な要求関数を呼ぶまで実行しない', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorageManager({ persisted: vi.fn().mockResolvedValue(false), persist });

    expect(canRequestPersistentStorage()).toBe(true);
    await expect(getPersistentStorageState()).resolves.toBe('not-granted');
    expect(persist).not.toHaveBeenCalled();

    await expect(requestPersistentStorage()).resolves.toBe('granted');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('要求拒否・非対応・例外を状態として返す', async () => {
    setStorageManager({ persist: vi.fn().mockResolvedValue(false) });
    await expect(requestPersistentStorage()).resolves.toBe('not-granted');

    setStorageManager({});
    await expect(requestPersistentStorage()).resolves.toBe('unsupported');

    setStorageManager({ persist: vi.fn().mockRejectedValue(new Error('blocked')) });
    await expect(requestPersistentStorage()).resolves.toBe('error');
  });
});
