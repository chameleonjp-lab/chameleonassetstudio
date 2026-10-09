/// <reference lib="webworker" />
import type { AssetIoRequest } from '../../core3d/ports/assetIoPort';
import { exportGlb } from './export';
import { importGlb } from './import';
import { buildAssetPackage } from '../../core3d/export/mapping';
self.onmessage = async (event: MessageEvent<AssetIoRequest>) => {
  try {
    const request = event.data;
    const progress = (phase: string, fraction: number) =>
      self.postMessage({ kind: 'progress', phase, fraction });
    progress('start', 0);
    const result =
      request.kind === 'import'
        ? await importGlb(request.bytes, request.projectId, request.allowLoss, request.sidecar)
        : await (async () => {
            const encoded = await exportGlb(request.snapshot, progress, { verifyImages: true });
            return buildAssetPackage(
              request.snapshot.project,
              encoded.bytes,
              encoded.warnings,
              request.snapshot.blobs,
            );
          })();
    self.postMessage({ kind: 'result', result });
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
