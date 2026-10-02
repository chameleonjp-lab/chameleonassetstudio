import type { DistributionPlayer, DistributionPlayerOptions } from './distributionRuntime.js';
export function createCanvasDistribution(
  options: DistributionPlayerOptions & { context: CanvasRenderingContext2D },
): DistributionPlayer;
