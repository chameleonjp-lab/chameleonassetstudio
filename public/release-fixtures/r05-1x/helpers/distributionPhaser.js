import { createDistributionPlayer, projectDistributionFrame } from './distributionRuntime.js';

/** Phaser 4.2.0 adapter. Use an instance-unique keyPrefix and an unscaled sprite. */
export function createPhaserDistribution(options) {
  const { scene, sprite, manifest, images, keyPrefix } = options;
  if (typeof keyPrefix !== 'string' || !keyPrefix)
    throw new Error('A unique texture keyPrefix is required');
  const keys = images.map((_, index) => `${keyPrefix}:page:${index}`);
  const created = [];
  const nonempty = new Set();
  const originalTexture = sprite.texture;
  const originalFrame = sprite.frame?.name;
  const release = () => {
    if (created.some((key) => sprite.texture?.key === key) && originalTexture)
      sprite.setTexture(originalTexture, originalFrame);
    for (const key of created) scene.textures.remove(key);
    created.length = 0;
  };
  try {
    // Check the entire namespace before changing the texture manager.
    for (const key of keys)
      if (scene.textures.exists(key)) throw new Error('Texture key already exists');
    for (const [index, image] of images.entries()) {
      const texture = scene.textures.addImage(keys[index], image);
      if (!texture) throw new Error('Could not register page texture');
      created.push(keys[index]);
      for (const frame of manifest.frames.filter((entry) => entry.page === index)) {
        const s = projectDistributionFrame(frame, { x: 0, y: 0 }).sourceRect;
        if (s.width === 0 || s.height === 0) continue;
        // Numeric packed indexes avoid collisions with Phaser's reserved __BASE frame.
        const name = manifest.frames.indexOf(frame);
        if (!texture.add(name, 0, s.x, s.y, s.width, s.height))
          throw new Error('Could not register texture frame');
        nonempty.add(frame.id);
      }
    }
    return createDistributionPlayer(
      options,
      (projection, frame) => {
        sprite.setVisible(nonempty.has(frame.id));
        if (!nonempty.has(frame.id)) return;
        sprite.setTexture(keys[frame.page], manifest.frames.indexOf(frame));
        sprite.setOrigin(0, 0);
        sprite.setPosition(projection.destinationRect.x, projection.destinationRect.y);
      },
      release,
      () => {
        sprite.setVisible(false);
      },
    );
  } catch (error) {
    release();
    throw error;
  }
}
