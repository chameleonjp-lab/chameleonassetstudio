import type { DistributionPlayer, DistributionPlayerOptions } from './distributionRuntime.js';
/** Supply the PixiJS 8.12.0 namespace and an unscaled PIXI.Sprite. */
export function createPixiDistribution(
  options: DistributionPlayerOptions & { PIXI: object; sprite: object },
): DistributionPlayer;
