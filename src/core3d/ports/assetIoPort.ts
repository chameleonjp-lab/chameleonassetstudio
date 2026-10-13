import type { AssetSnapshot } from '../export/snapshot';
import type { InspectionReport, InspectionSnapshot } from '../inspection/report';
import type { Project3D } from '../model/project';
export interface AssetImport {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  losses: string[];
  sourceHash: string;
}
export interface AssetExport {
  glb: Uint8Array;
  zip: Uint8Array;
  sidecar: Uint8Array;
  manifest: Uint8Array;
  revision: number;
  warnings: string[];
}
export type AssetIoRequest =
  | { kind: 'inspect'; snapshot: InspectionSnapshot }
  | { kind: 'export'; snapshot: AssetSnapshot }
  | {
      kind: 'import';
      bytes: Uint8Array;
      projectId: string;
      allowLoss: boolean;
      sidecar?: Uint8Array;
    };
export type AssetIoResult = AssetImport | AssetExport | InspectionReport;
export const ASSET_IO_WORKER_FAILURE_CODE = 'ASSET_IO_WORKER_FAILED' as const;
export const ASSET_IO_WORKER_FAILURE_CODES = {
  WORKER: ASSET_IO_WORKER_FAILURE_CODE,
  REQUIRED_EXTENSION: 'ASSET_IO_REQUIRED_EXTENSION_FAILED',
  EXTERNAL_REFERENCE: 'ASSET_IO_EXTERNAL_REFERENCE',
  IMAGE: 'ASSET_IO_IMAGE_INVALID',
  FORMAT: 'ASSET_IO_FORMAT_INVALID',
  PROFILE_LIMIT: 'ASSET_IO_PROFILE_LIMIT',
  SIDECAR: 'ASSET_IO_SIDECAR_MISMATCH',
  LOSS_APPROVAL_REQUIRED: 'ASSET_IO_LOSS_APPROVAL_REQUIRED',
} as const;
export type AssetIoWorkerFailureCode =
  (typeof ASSET_IO_WORKER_FAILURE_CODES)[keyof typeof ASSET_IO_WORKER_FAILURE_CODES];
export type AssetIoWorkerFailure =
  | {
      readonly kind: 'error';
      readonly code: typeof ASSET_IO_WORKER_FAILURE_CODES.LOSS_APPROVAL_REQUIRED;
      readonly losses: readonly string[];
    }
  | {
      readonly kind: 'error';
      readonly code: Exclude<
        AssetIoWorkerFailureCode,
        typeof ASSET_IO_WORKER_FAILURE_CODES.LOSS_APPROVAL_REQUIRED
      >;
    };
export interface AssetIoProgress {
  phase: string;
  fraction: number;
}
export interface AssetIoJob {
  promise: Promise<AssetIoResult>;
  cancel: () => void;
}
