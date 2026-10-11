import { describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { IndependentConsumer } from './main';
import {
  checkConsumerAsset,
  parseConsumerGlb,
  sha256,
  type ConsumerGltf,
  type ConsumerSidecar,
} from './sidecar';
import {
  compose,
  hierarchyWorlds,
  point,
  sampleValues,
  secondsForSample,
  skinnedPoint,
} from './oracles';

// Hand-authored glTF only: deliberately no native encoder, evaluator, or sidecar helper.
async function fixture(
  change?: (json: ConsumerGltf, sidecar: ConsumerSidecar) => void,
  scaled = false,
) {
  const chunks: Uint8Array[] = [],
    views: NonNullable<ConsumerGltf['bufferViews']> = [],
    accessors: NonNullable<ConsumerGltf['accessors']> = [];
  let offset = 0;
  const add = (data: number[], type: string, width: number, integer = false) => {
    const bytes = integer
      ? new Uint8Array(new Uint16Array(data).buffer)
      : new Uint8Array(new Float32Array(data).buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    chunks.push(padded);
    offset += padded.length;
    accessors.push({
      bufferView: views.length - 1,
      componentType: integer ? 5123 : 5126,
      count: data.length / width,
      type,
    });
    return accessors.length - 1;
  };
  const positions = add(
    scaled ? [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, -0.5] : [0, 0, 0, 1, 0, 0, 0, 1, 0],
    'VEC3',
    3,
  );
  const normals = add([0, 0, 1, 0, 0, 1, 0, 0, 1], 'VEC3', 3);
  const joints = add(
    scaled ? [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0] : Array(12).fill(0),
    'VEC4',
    4,
    true,
  );
  const weights = add(
    scaled
      ? [0.75, 0.25, 0, 0, 0.75, 0.25, 0, 0, 0.75, 0.25, 0, 0]
      : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'VEC4',
    4,
  );
  const indices = add([0, 1, 2], 'SCALAR', 1, true);
  const binds = add(
    scaled
      ? [
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0,
          0, 1,
        ]
      : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -10, 0, 0, 1],
    'MAT4',
    16,
  );
  const input = add(scaled ? [0, 0.5, 1, 2] : [0, 1, 2], 'SCALAR', 1),
    output = add(
      scaled ? [0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 2, 0] : [0, 0, 0, 2, 0, 0, 2, 0, 0],
      'VEC3',
      3,
    );
  const gltf: ConsumerGltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [3] }],
    buffers: [{ byteLength: offset }],
    bufferViews: views,
    accessors,
    nodes: [
      { name: 'Same', mesh: 0, skin: 0, translation: [999, 0, 0], extras: { casId: 'mesh-node' } },
      { name: 'Same', translation: [10, 0, 0], children: [2], extras: { casId: 'root' } },
      { name: 'Same', extras: { casId: 'joint' } },
      { name: 'Same', children: [0, 1], extras: { casId: 'asset-root' } },
    ],
    meshes: [
      {
        extras: { casId: 'triangle' },
        primitives: [
          {
            attributes: {
              POSITION: positions,
              NORMAL: normals,
              JOINTS_0: joints,
              WEIGHTS_0: weights,
            },
            indices,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'Same',
        extras: { casId: 'material' },
        pbrMetallicRoughness: {
          baseColorFactor: [0.25, 0.5, 0.75, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
      { name: 'Unused', extras: { casId: 'unused' } },
    ],
    skins: [{ joints: [2], inverseBindMatrices: binds }],
    animations: [
      {
        name: 'Same',
        extras: { casId: 'move' },
        channels: [{ sampler: 0, target: { node: 2, path: 'translation' } }],
        samplers: [{ input, output, interpolation: 'LINEAR' }],
      },
    ],
  };
  if (scaled) {
    gltf.nodes![0].translation = [2, 0, 0];
    gltf.nodes![1].translation = [0, 0, 0];
    gltf.nodes![2].translation = [0, 1, 0];
    gltf.nodes![3].translation = [-1, 2, 3];
    gltf.nodes![3].scale = [2, 3, 4];
    gltf.skins![0].joints = [2, 1];
  }
  const transform = { translation: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const sidecar: ConsumerSidecar = {
    format: 'chameleon-game-3d',
    version: '1.0.0',
    modelHash: '',
    coordinates: 'right-handed-meter-y-up-positive-z-forward',
    revision: 4,
    nodes: gltf.nodes!.map((n, index) => ({ id: n.extras!.casId!, index })),
    meshes: [{ id: 'triangle', index: 0 }],
    clips: [
      { id: 'move', index: 0, name: 'Same', duration: 2, loop: true },
      { id: 'empty', index: null, name: 'Same', duration: 3, loop: false },
    ],
    game: {
      assetId: 'original-test',
      assetKind: 'prop',
      originMode: 'custom',
      unitMeters: 0.01,
      forward: '-X',
      origin: [4, 5, 6],
      anchors: [{ id: 'grip', name: 'Grip', purpose: 'attachment', nodeId: 'joint', transform }],
      colliders: [
        {
          id: 'hit',
          name: 'Hit',
          purpose: 'hitbox',
          nodeId: 'mesh-node',
          transform,
          shape: 'capsule',
          size: [1, 1, 1],
          radius: 1,
          height: 0,
        },
      ],
    },
  };
  change?.(gltf, sidecar);
  const json = new TextEncoder().encode(JSON.stringify(gltf)),
    jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + offset),
    dv = new DataView(bytes.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, bytes.length, true);
  dv.setUint32(12, jsonLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(json, 20);
  dv.setUint32(20 + jsonLength, offset, true);
  dv.setUint32(24 + jsonLength, 0x004e4942, true);
  let cursor = 28 + jsonLength;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  sidecar.modelHash = await sha256(bytes);
  return { glb: bytes, sidecar: new TextEncoder().encode(JSON.stringify(sidecar)) };
}

describe('independent hand arithmetic', () => {
  it('uses column-vector parent scale, rotation and mixed bone weights', () => {
    const worlds = hierarchyWorlds([
      { translation: [10, 0, 0], scale: [2, 3, 4], children: [1] },
      { translation: [1, 2, 3] },
    ]);
    expect(point(worlds[1], [1, 1, 1])).toEqual([14, 9, 16]);
    const rotation = compose({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    expect(point(rotation, [1, 0, 0])[1]).toBeCloseTo(1);
    const identity = compose({}),
      translated = compose({ translation: [4, 8, 12] });
    expect(
      skinnedPoint([1, 2, 3], [0, 1], [0.25, 0.75], [identity, translated], [identity, identity]),
    ).toEqual([4, 8, 12]);
  });
  it('keeps exact scrub endpoint, wraps playback only, and handles sparse STEP and quaternion signs', () => {
    expect(secondsForSample(2, 2, true, 'scrub')).toBe(2);
    expect(secondsForSample(2, 2, true, 'playback')).toBe(0);
    expect(secondsForSample(2, -0.5, true, 'playback')).toBe(1.5);
    expect(sampleValues([1, 2], [0, 0, 0, 4, 0, 0], 3, 0, 'LINEAR')).toEqual([0, 0, 0]);
    expect(sampleValues([1, 2], [0, 0, 0, 4, 0, 0], 3, 2, 'STEP')).toEqual([4, 0, 0]);
    expect(sampleValues([0, 2], [0, 0, 0, 1, 0, 0, 0, -1], 4, 1, 'LINEAR', true)).toEqual([
      0, 0, 0, 1,
    ]);
  });
});

describe('independent sidecar admission', () => {
  it('rejects decoded image dimensions before a browser codec is created', async () => {
    const p = await fixture((g, s) => {
      g.nodes = [];
      g.meshes = [];
      g.skins = [];
      g.animations = [];
      g.accessors = [];
      g.scenes = [{ nodes: [] }];
      g.images = [{ bufferView: 0, mimeType: 'image/png' }];
      s.nodes = [];
      s.meshes = [];
      s.clips = [];
      s.game.anchors = [];
      s.game.colliders = [];
    });
    const view = new DataView(p.glb.buffer),
      start = 28 + view.getUint32(12, true);
    p.glb.set([137, 80, 78, 71, 13, 10, 26, 10], start);
    view.setUint32(start + 8, 13);
    view.setUint32(start + 12, 0x49484452);
    view.setUint32(start + 16, 16384);
    view.setUint32(start + 20, 16384);
    expect(() => parseConsumerGlb(p.glb)).toThrow('decoded image limit');
  });
  it('checks hash, exact ID/index association and permits empty clip/capsule cylinder height zero', async () => {
    const p = await fixture();
    const result = await checkConsumerAsset(p.glb, p.sidecar);
    expect(result.sidecar.clips[1].index).toBeNull();
    expect(result.sidecar.game.colliders[0].height).toBe(0);
    const bad = JSON.parse(new TextDecoder().decode(p.sidecar));
    bad.modelHash = '0'.repeat(64);
    await expect(
      checkConsumerAsset(p.glb, new TextEncoder().encode(JSON.stringify(bad))),
    ).rejects.toThrow('hash');
  });
  it.each(['uri', 'extension', 'mapping', 'clip', 'attachment', 'range'])(
    'rejects invalid %s before starting Babylon',
    async (kind) => {
      const p = await fixture((g, s) => {
        if (kind === 'uri') g.buffers![0].uri = 'https://example.invalid/secret';
        if (kind === 'extension') g.extensionsRequired = ['KHR_draco_mesh_compression'];
        if (kind === 'mapping') s.nodes[0].id = 'root';
        if (kind === 'clip') s.clips[0].index = 9;
        if (kind === 'attachment') s.game.anchors[0].nodeId = 'missing';
        if (kind === 'range') g.accessors![0].count = 999999;
      });
      await expect(checkConsumerAsset(p.glb, p.sidecar)).rejects.toThrow();
    },
  );
  it('rejects invalid GLB byte count', async () => {
    const p = await fixture();
    expect(() => parseConsumerGlb(p.glb.slice(0, -1))).toThrow('header');
  });
});

describe('actual Babylon CPU consumer', () => {
  it('cancels pending admission before engine creation, rejects concurrency and preserves a loaded asset on bad reload', async () => {
    const factory = vi.fn(
      () =>
        new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: false,
          lockstepMaxSteps: 4,
        }),
    );
    const consumer = new IndependentConsumer(factory),
      p = await fixture();
    try {
      const pending = consumer.load(p.glb, p.sidecar);
      await expect(consumer.load(p.glb, p.sidecar)).rejects.toThrow('already in progress');
      consumer.dispose();
      await expect(pending).rejects.toThrow('cancelled');
      expect(factory).not.toHaveBeenCalled();
      const rest = await consumer.load(p.glb, p.sidecar);
      await expect(consumer.load(p.glb, new TextEncoder().encode('{}'))).rejects.toThrow();
      expect(consumer.snapshot().hash).toBe(rest.hash);
      expect(consumer.snapshot().resources).toEqual(rest.resources);
    } finally {
      consumer.dispose();
    }
  });
  it('matches fixed F07 parent-scale and 75/25 mixed-bone bounds without the native exporter', async () => {
    const consumer = new IndependentConsumer(
      () =>
        new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: false,
          lockstepMaxSteps: 4,
        }),
    );
    const p = await fixture(undefined, true);
    const bounds = (values: number[]) =>
      [0, 1, 2].map((axis) => {
        const components = values.filter((_, index) => index % 3 === axis);
        return [Math.min(...components), Math.max(...components)];
      });
    try {
      const rest = await consumer.load(p.glb, p.sidecar);
      expect(bounds(rest.meshes[0].positions)).toEqual([
        [2, 4],
        [0.5, 3.5],
        [1, 5],
      ]);
      const pose = consumer.sample('move', 1);
      expect(bounds(pose.meshes[0].positions)).toEqual([
        [2, 4],
        [2.75, 5.75],
        [1, 5],
      ]);
      expect(pose.oracle).toMatchObject({ positionPass: true, nodePass: true });
    } finally {
      consumer.dispose();
    }
  });
  it('uses real AnimationGroup loop/end notifications and separately clocks empty clips', async () => {
    const consumer = new IndependentConsumer(
      () =>
        new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: false,
          lockstepMaxSteps: 4,
        }),
    );
    const p = await fixture();
    try {
      await consumer.load(p.glb, p.sidecar);
      consumer.play('move', 20);
      await vi.waitFor(() => expect(consumer.snapshot().playback.loops).toBeGreaterThan(0), {
        timeout: 2000,
        interval: 25,
      });
      expect(consumer.stop().playback.playing).toBe(false);
      expect(consumer.snapshot().oracle.positionPass).toBe(true);
      const nonloop = await fixture((_, s) => {
        s.clips[0].loop = false;
      });
      await consumer.load(nonloop.glb, nonloop.sidecar);
      consumer.play('move', 20);
      await vi.waitFor(() => expect(consumer.snapshot().playback.ends).toBe(1), {
        timeout: 2000,
        interval: 25,
      });
      expect(consumer.snapshot().sample.time).toBe(2);
      expect(consumer.snapshot().meshes[0].positions[0]).toBe(2);
      expect(consumer.snapshot().playback.source).toBe('animation-group');
      consumer.play('empty', 100);
      await vi.waitFor(() => expect(consumer.snapshot().playback.ends).toBe(1), {
        timeout: 1000,
        interval: 10,
      });
      expect(consumer.snapshot().sample.time).toBe(3);
      expect(consumer.snapshot().meshes[0].positions[0]).toBe(0);
      expect(consumer.snapshot().playback.source).toBe('empty-clip-clock');
    } finally {
      consumer.dispose();
    }
  });
  it('samples fresh post-skin world positions, restores empty clips, and reloads without scene growth', async () => {
    const consumer = new IndependentConsumer(
      () =>
        new NullEngine({
          renderWidth: 64,
          renderHeight: 64,
          textureSize: 64,
          deterministicLockstep: false,
          lockstepMaxSteps: 4,
        }),
    );
    const p = await fixture();
    try {
      const rest = await consumer.load(p.glb, p.sidecar);
      expect(rest.oracle.positionPass).toBe(true);
      expect(rest.meshes[0].positions.slice(0, 3)).toEqual([0, 0, 0]);
      expect(rest.materials[0].baseColor).toEqual([0.25, 0.5, 0.75, 1]);
      expect(rest.materials[1].loaded).toBe(false);
      for (const [time, x] of [
        [0.5, 1],
        [1, 2],
        [2, 2],
        [0.25, 0.5],
      ]) {
        const r = consumer.sample('move', time);
        expect(r.oracle.positionPass).toBe(true);
        expect(r.meshes[0].positions[0]).toBeCloseTo(x);
        expect(r.anchors[0].position).toEqual([10 + x, 1, 0]);
      }
      expect(consumer.sample('move', 2, 'playback').meshes[0].positions[0]).toBe(0);
      expect(consumer.sample('empty', 1).meshes[0].positions[0]).toBe(0);
      expect(consumer.snapshot().colliders[0].position).toEqual([999, 1, 0]);
      expect((await consumer.load(p.glb, p.sidecar)).resources).toEqual(rest.resources);
      expect(consumer.dispose()).toEqual({ disposed: true, pending: 0 });
      expect(() => consumer.snapshot()).toThrow('No asset');
      expect((await consumer.load(p.glb, p.sidecar)).resources).toEqual(rest.resources);
    } finally {
      consumer.dispose();
    }
  });
});
