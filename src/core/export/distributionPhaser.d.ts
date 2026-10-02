import type { DistributionPlayer, DistributionPlayerOptions } from './distributionRuntime.js';
/** Supply a Phaser 4.2.0 scene and unscaled sprite; keyPrefix is unique per instance. */
export function createPhaserDistribution(
  options: DistributionPlayerOptions & { scene: object; sprite: object; keyPrefix: string },
): DistributionPlayer;
