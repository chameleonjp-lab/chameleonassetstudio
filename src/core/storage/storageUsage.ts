export interface StorageUsage {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** ストレージ使用量を取得する。非対応環境では supported: false を返す。 */
export async function getStorageUsage(): Promise<StorageUsage> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') {
    return { supported: false, usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      supported: true,
      usageBytes: estimate.usage ?? null,
      quotaBytes: estimate.quota ?? null,
    };
  } catch {
    return { supported: false, usageBytes: null, quotaBytes: null };
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
