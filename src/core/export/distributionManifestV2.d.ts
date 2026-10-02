import type { Asset } from '../model';
import type { DistributionFrameData } from './distributionFrameData';
import type { DistributionTimeline } from './distributionTimeline';
export interface RichDistributionManifest {
  format: 'chameleon-distribution';
  version: '0.2.0';
  assetId: string;
  profile: 'fixed-grid' | 'packed';
  scale: 1 | 2 | 3;
  source: { assetJson: 'asset.json'; canonical: true; sha256: string };
  pages: Array<{ path: string; width: number; height: number; sha256: string }>;
  frames: DistributionFrameData[];
  animations: DistributionTimeline[];
  integrity: { algorithm: 'SHA-256'; manifestHash: string };
}
export interface RichPackageManifest {
  format: 'chameleon-package';
  version: '0.2.0';
  target: 'canvas2d' | 'pixijs' | 'phaser';
  assets: Array<{ id: string; name: string; manifest: string; manifestHash: string }>;
}
export interface LoadedRichDistribution {
  manifest: RichDistributionManifest;
  asset: Asset;
  images: HTMLImageElement[];
  dispose(): void;
}
export function assertRichPath(path: unknown): void;
export function canonicalRichJson(value: unknown): string;
export function validateRichDistributionManifest(value: unknown): RichDistributionManifest;
export function validateRichPackage(value: unknown): RichPackageManifest;
export function loadRichDistribution(
  url: string | URL,
  options?: { signal?: AbortSignal },
): Promise<LoadedRichDistribution>;
export function loadRichPackage(
  url: string | URL,
  options?: { signal?: AbortSignal },
): Promise<{
  packageManifest: RichPackageManifest;
  assets: LoadedRichDistribution[];
  dispose(): void;
}>;

export function assertRichPagePng(bytes: Uint8Array, page: { width: number; height: number }): void;
