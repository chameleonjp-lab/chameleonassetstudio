import { createDistributionPlayer, projectDistributionFrame } from './distributionRuntime.js';

/** PixiJS 8.12.0 adapter. PIXI and an unscaled sprite are provided by the caller. */
export function createPixiDistribution(options) {
  const { PIXI, sprite, manifest, images } = options;
  const sources = [];
  const textures = new Map();
  const originalTexture = sprite.texture;
  const release = () => {
    if ([...textures.values()].includes(sprite.texture)) sprite.texture = originalTexture;
    for (const texture of textures.values()) texture.destroy(false);
    for (const source of sources) source.destroy();
    textures.clear();
    sources.length = 0;
  };
  try {
    for (const image of images) sources.push(new PIXI.ImageSource({ resource: image }));
    for (const frame of manifest.frames) {
      const s = projectDistributionFrame(frame, { x: 0, y: 0 }).sourceRect;
      // Fully transparent frames need no zero-size GPU texture.
      if (s.width === 0 || s.height === 0) continue;
      textures.set(
        frame.id,
        new PIXI.Texture({
          source: sources[frame.page],
          frame: new PIXI.Rectangle(s.x, s.y, s.width, s.height),
        }),
      );
    }
    return createDistributionPlayer(
      options,
      (projection, frame) => {
        const texture = textures.get(frame.id);
        sprite.visible = Boolean(texture);
        if (!texture) return;
        sprite.texture = texture;
        sprite.anchor.set(0, 0);
        sprite.position.set(projection.destinationRect.x, projection.destinationRect.y);
      },
      release,
      () => {
        sprite.visible = false;
      },
    );
  } catch (error) {
    release();
    throw error;
  }
}
