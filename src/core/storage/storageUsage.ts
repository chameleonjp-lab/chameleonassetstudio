export type StorageEstimateStatus = 'available' | 'unsupported' | 'error';

export interface StorageUsage {
  status: StorageEstimateStatus;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
}

export type StorageWarningLevel = 'normal' | 'notice' | 'warning' | 'critical' | 'unavailable';

/** 2026-07-16 accepted decision B: notice 60%、warning 80%、critical 90%。 */
export const STORAGE_WARNING_THRESHOLDS = {
  notice: 0.6,
  warning: 0.8,
  critical: 0.9,
} as const;

export type PersistentStorageState = 'granted' | 'not-granted' | 'unsupported' | 'error';

function normalizeByteValue(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** ストレージ使用量を取得する。取得不能時に空き容量を推測しない。 */
export async function getStorageUsage(): Promise<StorageUsage> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return {
      status: 'unsupported',
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = normalizeByteValue(estimate.usage);
    const quotaBytes = normalizeByteValue(estimate.quota);
    return {
      status: 'available',
      usageBytes,
      quotaBytes,
      usageRatio:
        usageBytes !== null && quotaBytes !== null && quotaBytes > 0
          ? usageBytes / quotaBytes
          : null,
    };
  } catch {
    return { status: 'error', usageBytes: null, quotaBytes: null, usageRatio: null };
  }
}

export function getStorageWarningLevel(usage: StorageUsage): StorageWarningLevel {
  const ratio = usage.usageRatio;
  if (usage.status !== 'available' || ratio === null) {
    return 'unavailable';
  }
  if (ratio >= STORAGE_WARNING_THRESHOLDS.critical) {
    return 'critical';
  }
  if (ratio >= STORAGE_WARNING_THRESHOLDS.warning) {
    return 'warning';
  }
  if (ratio >= STORAGE_WARNING_THRESHOLDS.notice) {
    return 'notice';
  }
  return 'normal';
}

/** ブラウザが保存領域を保護済みか確認する。未付与でも通常保存は続けられる。 */
export async function getPersistentStorageState(): Promise<PersistentStorageState> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') {
    return 'unsupported';
  }
  try {
    return (await navigator.storage.persisted()) ? 'granted' : 'not-granted';
  } catch {
    return 'error';
  }
}

export function canRequestPersistentStorage(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function';
}

/** 利用者のボタン操作からだけ呼ぶ。自動要求してはならない。 */
export async function requestPersistentStorage(): Promise<PersistentStorageState> {
  if (!canRequestPersistentStorage()) {
    return 'unsupported';
  }
  try {
    return (await navigator.storage.persist()) ? 'granted' : 'not-granted';
  } catch {
    return 'error';
  }
}

/** バイト数を人が読める文字列にする（例: 12.3 MB）。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 'B';
  for (const next of units) {
    if (value < 1024) {
      break;
    }
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(1)} ${unit}`;
}
