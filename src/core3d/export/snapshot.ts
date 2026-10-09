import { inspectNativeImage } from '../model/nativeImageMetadata';
import { NATIVE_TEXTURE_PROFILE } from '../model/textureProfile';
import { validateProject, type Project3D } from '../model/project';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../profile/assetIoProfile';
export interface AssetSnapshot {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  estimatedBytes: number;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
/** Capture all mutable inputs before the first await; export may continue while the editor changes. */
export function captureAssetSnapshot(
  project: Project3D,
  readBlob: (id: string) => Uint8Array,
): AssetSnapshot {
  validateProject(project);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(project)).length;
  assertIoBudget(jsonBytes, P.jsonBytes, 'Project JSON');
  const sourceBytes = project.blobIds.map((id) => [id, readBlob(id)] as const);
  const retained = sourceBytes.reduce((n, [, b]) => n + b.length, 0);
  assertIoBudget(retained, P.totalBlobBytes, 'Retained blobs');
  const hashes = new Set(
    project.materials.flatMap((m) => (m.textureBlobId ? [m.textureBlobId] : [])),
  );
  let pixels = 0;
  for (const hash of hashes) {
    const bytes = sourceBytes.find(([id]) => id === hash)?.[1];
    if (!bytes) throw new Error('Missing texture source');
    try {
      const info = inspectNativeImage(bytes);
      pixels += info.width * info.height;
    } catch (error) {
      if (
        String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
        String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
      )
        throw error;
      pixels += NATIVE_TEXTURE_PROFILE.maxTotalPixels;
    }
  }
  assertIoBudget(pixels, NATIVE_TEXTURE_PROFILE.maxTotalPixels, 'Texture pixels');
  const estimatedBytes = jsonBytes * 4 + retained * 4 + pixels * 8;
  assertIoBudget(estimatedBytes, P.estimatedPeakBytes, 'Export peak estimate');
  return {
    project: structuredClone(project),
    blobs: new Map(sourceBytes.map(([id, b]) => [id, b.slice()])),
    estimatedBytes,
  };
}
export async function verifySnapshot(snapshot: AssetSnapshot) {
  validateProject(snapshot.project);
  for (const id of snapshot.project.blobIds) {
    const bytes = snapshot.blobs.get(id);
    if (!bytes || (await sha256(bytes)) !== id) throw new Error('Source hash mismatch');
  }
}
