import { createDistributionPlayer } from './distributionRuntime.js';

/** Canvas 2D adapter. Caller clears its scene and supplies elapsed milliseconds. */
export function createCanvasDistribution(options) {
  const { context, images } = options;
  return createDistributionPlayer(options, (projection) => {
    const s = projection.sourceRect;
    const d = projection.destinationRect;
    if (s.width > 0 && s.height > 0)
      context.drawImage(
        images[projection.page],
        s.x,
        s.y,
        s.width,
        s.height,
        d.x,
        d.y,
        d.width,
        d.height,
      );
  });
}
