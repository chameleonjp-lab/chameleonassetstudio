/** Shared engineering estimate cap; not a device-memory or performance guarantee. */
export const RESOURCE_ESTIMATE_CAP_BYTES = 256 * 1024 * 1024;

export type ResourceCategory =
  'texture' | 'asset-io' | 'geometry' | 'history' | 'storage' | 'framebuffer';

export interface ResourceLedgerSnapshot {
  readonly kind: 'ownership-estimate';
  readonly scope: 'realm';
  readonly limitBytes: number;
  readonly totalBytes: number;
  readonly byCategory: Readonly<Record<ResourceCategory, number>>;
}

const byCategory: Record<ResourceCategory, number> = {
  texture: 0,
  'asset-io': 0,
  geometry: 0,
  history: 0,
  storage: 0,
  framebuffer: 0,
};
let totalBytes = 0;

/**
 * Reserve before allocating. This module's singleton covers this JS realm only,
 * not other tabs/workers, IndexedDB quota, or unknown free CPU/GPU memory.
 *
 * A ticket belongs to one allocation owner. Aliases share that ticket; distinct
 * copies need distinct tickets. Ownership can transfer by handing off the same
 * release function. Keep old tickets until their resources are actually freed,
 * including while a replacement allocation is admitted. Rejection never evicts
 * existing owners or discards their data/history. Category-specific limits must
 * still be checked by callers; this cap does not expand their supported profile.
 */
export interface ResourceOwner {
  readonly bytes: number;
  /** Positive deltas are admitted atomically; rejection preserves the old ticket. */
  resize(bytes: number): void;
  release(): void;
}

/** One resizable allocation owner; aliases transfer the same ticket, not a copy. */
export function createResourceOwner(category: ResourceCategory, bytes: number): ResourceOwner {
  if (typeof category !== 'string' || !Object.hasOwn(byCategory, category))
    throw new Error('Unknown resource estimate category');
  let owned = 0;
  let released = false;
  const owner: ResourceOwner = {
    get bytes() {
      return owned;
    },
    resize(next: number) {
      if (released) throw new Error('Resource estimate owner is released');
      if (!Number.isSafeInteger(next) || next < 0)
        throw new Error('Resource estimate bytes must be a non-negative safe integer');
      const delta = next - owned;
      // Subtract before comparing so even MAX_SAFE_INTEGER cannot overflow.
      if (delta > RESOURCE_ESTIMATE_CAP_BYTES - totalBytes)
        throw new Error('Combined resource ownership estimate exceeds the 256 MiB cap');
      totalBytes += delta;
      byCategory[category] += delta;
      owned = next;
    },
    release() {
      if (released) return;
      totalBytes -= owned;
      byCategory[category] -= owned;
      owned = 0;
      released = true;
    },
  };
  owner.resize(bytes);
  return Object.freeze(owner);
}

export function reserveResourceBytes(category: ResourceCategory, bytes: number): () => void {
  return createResourceOwner(category, bytes).release;
}

/** Detached, immutable totals of declared owned bytes, never measured device usage. */
export function resourceLedgerSnapshot(): ResourceLedgerSnapshot {
  return Object.freeze({
    kind: 'ownership-estimate',
    scope: 'realm',
    limitBytes: RESOURCE_ESTIMATE_CAP_BYTES,
    totalBytes,
    byCategory: Object.freeze({ ...byCategory }),
  });
}
