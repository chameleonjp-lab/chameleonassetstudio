import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasDistribution } from '../../src/core/export/distributionCanvas.js';
import { createPixiDistribution } from '../../src/core/export/distributionPixi.js';
import { createPhaserDistribution } from '../../src/core/export/distributionPhaser.js';
import { distributionEventsBetween } from '../../src/core/export/distributionRuntime.js';

function fixture(scale = 1, loop = true) {
  const frame = (id, page) => ({
    id,
    name: 'same',
    page,
    rotated: false,
    rect: { x: 20, y: 30, width: 10 * scale, height: 12 * scale },
    sourceSize: { width: 32 * scale, height: 32 * scale },
    contentRect: { x: 1, y: 2, width: 8 * scale, height: 9 * scale },
    contentOffset: { x: 2 * scale, y: 3 * scale },
    origin: { x: 3 * scale, y: 4 * scale },
    anchors: [
      { id: 'hand', name: 'hand', role: 'custom', position: { x: 8 * scale, y: 6 * scale } },
    ],
    colliders: [
      {
        id: 'hit',
        name: 'hidden',
        purpose: 'body',
        visible: false,
        shape: 'rect',
        rect: { x: 2 * scale, y: 3 * scale, width: 4 * scale, height: 5 * scale },
      },
    ],
  });
  const frames = [frame('a', 0), frame('b', 1)];
  let startMs = 0;
  const occurrences = [
    ['a', 0, 40],
    ['b', 1, 120],
    ['a', 0, 40],
  ].map(([frameId, frameIndex, durationMs], index) => {
    const entry = {
      index,
      frameId,
      frameIndex,
      page: frameIndex,
      startMs,
      durationMs,
      events: [
        {
          id: 'event-' + frameId,
          frameId,
          name: 'tick',
          payload: { code: 'globalThis.unwanted = true' },
        },
      ],
    };
    startMs += durationMs;
    return entry;
  });
  return {
    manifest: {
      format: 'chameleon-distribution',
      version: '0.2.0',
      frames,
      animations: [{ id: 'animation', name: 'same', loop, durationMs: 200, occurrences }],
    },
    images: [{ page: 0 }, { page: 1 }],
    position: { x: 100, y: 200 },
  };
}

test('Canvas direct ESM: variable durations, multipage, repeated IDs and inactive ordered events at 1/2/3x', () => {
  for (const scale of [1, 2, 3]) {
    const calls = [];
    const player = createCanvasDistribution({
      ...fixture(scale),
      context: {
        drawImage(...args) {
          calls.push(args);
        },
      },
    });
    const first = player.start();
    assert.equal(first.events.length, 1);
    assert.equal(first.projection.colliders[0].visible, false);
    assert.deepEqual(calls[0].slice(1), [
      21,
      32,
      8 * scale,
      9 * scale,
      100 - scale,
      200 - scale,
      8 * scale,
      9 * scale,
    ]);
    assert.deepEqual(first.projection.anchors[0].position, {
      x: 100 + 5 * scale,
      y: 200 + 2 * scale,
    });
    assert.equal(player.advance(40).projection.page, 1);
    const last = player.advance(390);
    assert.equal(last.projection.page, 0);
    assert.deepEqual(
      last.events.map((e) => e.timeMs),
      [160, 200, 240, 360, 400],
    );
    assert.equal(globalThis.unwanted, undefined);
    player.stop();
    assert.deepEqual(player.advance(99).events, []);
    assert.equal(player.start().events[0].timeMs, 0);
    player.setPosition({ x: 0, y: 0 });
    assert.equal(calls.at(-1)[5], -scale);
    player.dispose();
    player.dispose();
    assert.throws(() => player.start(), /disposed/);
  }
});

test('nonloop holds final image, empty timelines do not synthesize an event, still supports drawFrame', () => {
  const options = fixture(1, false);
  const player = createCanvasDistribution({ ...options, context: { drawImage() {} } });
  player.start();
  const result = player.advance(500);
  assert.equal(result.sample.complete, true);
  assert.equal(result.projection.frameId, 'a');
  assert.equal(player.isRunning(), false);
  assert.deepEqual(
    result.events.map((e) => e.timeMs),
    [40, 160],
  );
  const empty = structuredClone(options);
  empty.manifest.animations[0].occurrences = [];
  empty.manifest.animations[0].durationMs = 0;
  assert.equal(
    createCanvasDistribution({
      ...empty,
      context: {
        drawImage() {
          throw Error('must not draw');
        },
      },
    }).start().projection,
    null,
  );
  options.manifest.animations = [];
  assert.equal(
    createCanvasDistribution({ ...options, context: { drawImage() {} } }).start().projection
      .frameId,
    'a',
  );
});

test('catchup fails atomically and malformed references/version reject', () => {
  const options = fixture();
  const player = createCanvasDistribution({ ...options, context: { drawImage() {} } });
  player.start();
  assert.throws(() => player.advance(2_000_000), /limit/);
  assert.equal(player.advance(40).events[0].timeMs, 40);
  assert.throws(
    () => distributionEventsBetween(options.manifest.animations[0], null, 200, 1),
    /limit/,
  );
  options.manifest.version = '0.1.0';
  assert.throws(() => createCanvasDistribution({ ...options, context: {} }), /0.2.0/);
  options.manifest.version = '0.2.0';
  options.manifest.animations[0].occurrences[0].frameIndex = 99;
  assert.throws(() => createCanvasDistribution({ ...options, context: {} }).start(), /Unresolved/);
});

function pixiMock() {
  const sources = [],
    textures = [];
  class ImageSource {
    constructor(options) {
      this.options = options;
      sources.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Texture {
    constructor(options) {
      this.options = options;
      textures.push(this);
    }
    destroy(flag) {
      this.destroyed = true;
      this.flag = flag;
    }
  }
  class Rectangle {
    constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    }
  }
  const sprite = {
    texture: { original: true },
    anchor: {
      set(...args) {
        this.args = args;
      },
    },
    position: {
      set(...args) {
        this.args = args;
      },
    },
  };
  return { PIXI: { ImageSource, Texture, Rectangle }, sources, textures, sprite };
}
test('Pixi mock uses owned page sources + crop textures and common gameplay placement; dispose is safe', () => {
  const mock = pixiMock();
  const original = mock.sprite.texture;
  const options = fixture(3);
  const player = createPixiDistribution({ ...options, ...mock });
  assert.equal(mock.sources.length, 2);
  player.start();
  const next = player.advance(40);
  assert.equal(mock.sprite.texture.options.source, mock.sources[1]);
  assert.deepEqual(
    { ...mock.sprite.texture.options.frame },
    { x: 21, y: 32, width: 24, height: 27 },
  );
  assert.deepEqual(mock.sprite.position.args, [97, 197]);
  assert.equal(next.projection.colliders[0].visible, false);
  player.dispose();
  assert.equal(mock.sprite.texture, original);
  assert.ok(mock.sources.every((s) => s.destroyed));
  assert.ok(mock.textures.every((t) => t.destroyed && t.flag === false));
});
function phaserMock() {
  const textures = new Map(),
    removed = [];
  const scene = {
    textures: {
      exists: (key) => textures.has(key),
      addImage(key, image) {
        const texture = {
          key,
          image,
          frames: [],
          add(...args) {
            this.frames.push(args);
            return {};
          },
        };
        textures.set(key, texture);
        return texture;
      },
      remove(key) {
        removed.push(key);
        textures.delete(key);
      },
    },
  };
  const sprite = {
    texture: { key: 'original' },
    frame: { name: 'old' },
    setTexture(key, frame) {
      this.texture = typeof key === 'string' ? textures.get(key) : key;
      this.frame = { name: frame };
    },
    setOrigin(...args) {
      this.origin = args;
    },
    setPosition(...args) {
      this.position = args;
    },
    setVisible(value) {
      this.visible = value;
    },
  };
  return { scene, sprite, textures, removed };
}
test('Phaser mock registers per-page frames and advances the same timeline; collisions never remove existing textures', () => {
  const mock = phaserMock();
  const player = createPhaserDistribution({ ...fixture(), ...mock, keyPrefix: 'one' });
  player.start();
  player.advance(40);
  assert.equal(mock.sprite.texture.key, 'one:page:1');
  assert.deepEqual(mock.sprite.position, [99, 199]);
  assert.deepEqual(mock.sprite.origin, [0, 0]);
  assert.deepEqual(mock.textures.get('one:page:1').frames[0], [1, 0, 21, 32, 8, 9]);
  assert.throws(
    () => createPhaserDistribution({ ...fixture(), ...mock, keyPrefix: 'one' }),
    /exists/,
  );
  assert.equal(mock.textures.size, 2);
  player.dispose();
  assert.equal(mock.sprite.texture.key, 'original');
  assert.deepEqual(mock.removed, ['one:page:0', 'one:page:1']);
  player.dispose();
  assert.equal(mock.removed.length, 2);
});
test('engine construction failure releases only newly allocated resources', () => {
  const mock = pixiMock();
  const bad = fixture();
  bad.manifest.frames[1].origin.x = NaN;
  assert.throws(() => createPixiDistribution({ ...bad, ...mock }), /Non-finite/);
  assert.ok(mock.sources.every((s) => s.destroyed));
  assert.ok(mock.textures.every((s) => s.destroyed));
  const phaser = phaserMock();
  assert.throws(
    () => createPhaserDistribution({ ...bad, ...phaser, keyPrefix: 'failed' }),
    /Non-finite/,
  );
  assert.equal(phaser.textures.size, 0);
});

test('empty animation hides preexisting engine sprites without changing still asset behavior', () => {
  const options = fixture();
  options.manifest.animations[0].occurrences = [];
  options.manifest.animations[0].durationMs = 0;
  const pixi = pixiMock();
  pixi.sprite.visible = true;
  const pixiPlayer = createPixiDistribution({ ...options, ...pixi });
  assert.equal(pixiPlayer.start().projection, null);
  assert.equal(pixi.sprite.visible, false);
  pixiPlayer.dispose();
  const phaser = phaserMock();
  phaser.sprite.visible = true;
  const phaserPlayer = createPhaserDistribution({ ...options, ...phaser, keyPrefix: 'empty' });
  assert.equal(phaserPlayer.start().projection, null);
  assert.equal(phaser.sprite.visible, false);
  phaserPlayer.dispose();
  options.manifest.animations = [];
  const still = pixiMock();
  const stillPlayer = createPixiDistribution({ ...options, ...still });
  assert.notEqual(stillPlayer.start().projection, null);
  assert.equal(still.sprite.visible, true);
  stillPlayer.dispose();
});
