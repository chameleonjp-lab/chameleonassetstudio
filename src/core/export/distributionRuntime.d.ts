import type {
  DistributionTimeline,
  DistributionSample,
  DistributionEventDelivery,
} from './distributionTimeline';
import type { DistributionFrameData } from './distributionFrameData';
import type { Asset, Collider } from '../model';
export type DistributionPosition = { x: number; y: number };
export interface DistributionProjection {
  frameId: string;
  page: number;
  sourceRect: { x: number; y: number; width: number; height: number };
  destinationRect: { x: number; y: number; width: number; height: number };
  origin: DistributionPosition;
  anchors: Asset['anchors'];
  colliders: Collider[];
}
export interface DistributionPlaybackResult {
  sample: DistributionSample | null;
  events: DistributionEventDelivery[];
}
export function assertDistributionTimeline(timeline: DistributionTimeline): void;
export function sampleDistributionTimeline(
  timeline: DistributionTimeline,
  timeMs: number,
): DistributionSample | null;
export function distributionEventsBetween(
  timeline: DistributionTimeline,
  afterMs: number | null,
  throughMs: number,
  maxDeliveries?: number,
): DistributionEventDelivery[];
export function createDistributionPlayback(timeline: DistributionTimeline): {
  start(): DistributionPlaybackResult;
  advance(deltaMs: number): DistributionPlaybackResult;
  stop(): void;
  isRunning(): boolean;
};
export function assertFrameGeometry(frame: DistributionFrameData): void;
export function projectDistributionFrame(
  frame: DistributionFrameData,
  position: DistributionPosition,
): DistributionProjection;
export interface DistributionPlayerOptions {
  manifest: {
    format: string;
    version: string;
    frames: DistributionFrameData[];
    animations: DistributionTimeline[];
  };
  images: readonly CanvasImageSource[];
  animationId?: string;
  position?: DistributionPosition;
}
export interface DistributionPlayerResult extends DistributionPlaybackResult {
  projection: DistributionProjection | null;
}
export interface DistributionPlayer {
  start(): DistributionPlayerResult;
  advance(deltaMs: number): DistributionPlayerResult;
  stop(): void;
  isRunning(): boolean;
  drawFrame(frameId: string): DistributionProjection;
  setPosition(position: DistributionPosition): DistributionProjection | null;
  dispose(): void;
}
export function createDistributionPlayer(
  options: DistributionPlayerOptions,
  render: (projection: DistributionProjection, frame: DistributionFrameData) => void,
  release?: () => void,
  clear?: () => void,
): DistributionPlayer;
