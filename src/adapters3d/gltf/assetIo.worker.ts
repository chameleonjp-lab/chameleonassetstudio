/// <reference lib="webworker" />
import { ASSET_IO_PROFILE, assertIoBudget } from '../../core3d/profile/assetIoProfile';
import type { AssetIoRequest } from '../../core3d/ports/assetIoPort';
import { buildInspectionReport, exportInspectionWarnings } from '../../core3d/inspection/report';
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
      request.kind === 'inspect'
        ? await buildInspectionReport(request.snapshot)
        : request.kind === 'import'
          ? await importGlb(request.bytes, request.projectId, request.allowLoss, request.sidecar)
          : await (async () => {
              const encoded = await exportGlb(request.snapshot, progress, { verifyImages: true });
              return buildAssetPackage(
                request.snapshot.project,
                encoded.bytes,
                [
                  ...encoded.warnings,
                  ...exportInspectionWarnings(
                    await buildInspectionReport({ ...request.snapshot, unavailableBlobs: [] }),
                  ),
                ],
                request.snapshot.blobs,
              );
            })();
    if (request.kind === 'inspect')
      assertIoBudget(
        new TextEncoder().encode(JSON.stringify(result)).length,
        ASSET_IO_PROFILE.jsonBytes,
        'Inspection report',
      );
    self.postMessage({ kind: 'result', result });
  } catch (error) {
    self.postMessage({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
