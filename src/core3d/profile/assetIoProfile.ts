import { nativeTextureReservedBytes } from '../model/textureResources';
/** Versioned, conservative I/O admission limits; not physical-device performance certification. */
export const ASSET_IO_PROFILE = {
  id: 'cas3d-basic-gltf2-v1',
  sourceBytes: 32 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
  totalBlobBytes: 48 * 1024 * 1024,
  outputBytes: 64 * 1024 * 1024,
  estimatedPeakBytes: 256 * 1024 * 1024,
  jsonDepth: 64,
  jsonValues: 250_000,
  hierarchyDepth: 256,
  decodedAccessorValues: 6_000_000,
  nodes: 4096,
  accessors: 8192,
  vertices: 300_000,
  triangles: 300_000,
  joints: 256,
  clips: 128,
  keys: 200_000,
  images: 32,
} as const;
export function assertIoBudget(bytes: number, limit: number, label: string): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit)
    throw new Error(label + ' exceeds ' + ASSET_IO_PROFILE.id);
}

const reservations = new Map<symbol, number>();
export function reserveAssetIoBytes(bytes: number): () => void {
  assertIoBudget(bytes, ASSET_IO_PROFILE.estimatedPeakBytes, 'Asset I/O reservation');
  assertIoBudget(
    bytes + assetIoReservedBytes() + nativeTextureReservedBytes(),
    ASSET_IO_PROFILE.estimatedPeakBytes,
    'Concurrent asset I/O estimate',
  );
  const token = Symbol();
  reservations.set(token, bytes);
  return () => {
    reservations.delete(token);
  };
}

export function assetIoReservedBytes(): number {
  return [...reservations.values()].reduce((n, v) => n + v, 0);
}
