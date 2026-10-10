import type { AssetSnapshot } from '../export/snapshot';
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
  | { kind: 'export'; snapshot: AssetSnapshot }
  | {
      kind: 'import';
      bytes: Uint8Array;
      projectId: string;
      allowLoss: boolean;
      sidecar?: Uint8Array;
    };
export type AssetIoResult = AssetImport | AssetExport;
export interface AssetIoProgress {
  phase: string;
  fraction: number;
}
export interface AssetIoJob {
  promise: Promise<AssetIoResult>;
  cancel: () => void;
}
