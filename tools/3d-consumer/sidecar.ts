import {
  hierarchyWorlds,
  identity,
  multiply,
  point,
  sampleValues,
  skinnedPoint,
  type Trs,
  type Vec3,
} from './oracles';

export interface ConsumerNode extends Trs {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  extras?: { casId?: string; casVisible?: boolean };
}
export interface ConsumerPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  targets?: unknown;
}
export interface ConsumerGltf {
  asset: { version: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: ConsumerNode[];
  meshes?: { primitives: ConsumerPrimitive[]; extras?: { casId?: string } }[];
  buffers?: { byteLength: number; uri?: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors?: {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    normalized?: boolean;
    sparse?: unknown;
  }[];
  skins?: { joints: number[]; inverseBindMatrices?: number }[];
  animations?: {
    name?: string;
    extras?: { casId?: string };
    channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[];
  }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  materials?: {
    name?: string;
    extras?: { casId?: string };
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
      baseColorTexture?: { index: number };
    };
    alphaMode?: string;
    alphaCutoff?: number;
    doubleSided?: boolean;
    emissiveFactor?: number[];
  }[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
}
export interface Attachment {
  id: string;
  name: string;
  purpose: string;
  nodeId: string | null;
  transform: Required<Pick<Trs, 'translation' | 'rotation' | 'scale'>>;
}
export interface Collider extends Attachment {
  shape: 'box' | 'sphere' | 'capsule';
  size: number[];
  radius: number;
  height: number;
}
export interface ConsumerSidecar {
  format: 'chameleon-game-3d';
  version: '1.0.0';
  modelHash: string;
  revision: number;
  coordinates: string;
  nodes: { id: string; index: number }[];
  meshes: { id: string; index: number }[];
  clips: { id: string; index: number | null; name: string; duration: number; loop: boolean }[];
  game: {
    assetId: string;
    assetKind: string;
    originMode: string;
    unitMeters: number;
    forward: string;
    origin: number[];
    anchors: Attachment[];
    colliders: Collider[];
  };
}
export interface CheckedAsset {
  gltf: ConsumerGltf;
  binary: Uint8Array;
  sidecar: ConsumerSidecar;
  hash: string;
  read: (index: number) => number[];
}
const widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
function assert(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
function boundedJson(bytes: Uint8Array): unknown {
  assert(bytes.length <= 8 * 1024 * 1024, 'Consumer JSON exceeds 8 MiB');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  let count = 0;
  const visit = (item: unknown, level: number) => {
    assert(level <= 64 && ++count <= 250_000, 'Consumer JSON tree exceeds limits');
    if (item && typeof item === 'object')
      for (const [key, child] of Object.entries(item)) {
        assert(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe JSON key');
        assert(key !== 'uri', 'External or data URI forbidden in independent consumer');
        visit(child, level + 1);
      }
  };
  visit(value, 0);
  return value;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
function at(value: number | undefined, length: number, name: string): number {
  assert(
    Number.isSafeInteger(value) && value! >= 0 && value! < length,
    'Invalid ' + name + ' index',
  );
  return value!;
}
function tuple(value: unknown, count: number, name: string): asserts value is number[] {
  assert(
    Array.isArray(value) &&
      value.length === count &&
      value.every((x) => typeof x === 'number' && Number.isFinite(x)),
    'Invalid ' + name,
  );
}
function stableId(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value),
    'Invalid stable ID',
  );
}

/** Read dimensions before the browser codec can allocate decoded pixels. */
function imagePixels(bytes: Uint8Array, mime: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (mime === 'image/png') {
    assert(
      bytes.length >= 33 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x) &&
        view.getUint32(8) === 13 &&
        view.getUint32(12) === 0x49484452,
      'Invalid PNG header',
    );
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    assert(bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216, 'Invalid JPEG header');
    let cursor = 2;
    while (cursor < bytes.length) {
      assert(bytes[cursor++] === 255, 'Invalid JPEG marker');
      while (bytes[cursor] === 255) cursor++;
      const marker = bytes[cursor++];
      if (marker === 0xd9 || marker === 0xda) break;
      assert(cursor + 2 <= bytes.length, 'Truncated JPEG');
      const length = view.getUint16(cursor);
      assert(length >= 2 && cursor + length <= bytes.length, 'Invalid JPEG segment');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        assert(length >= 8, 'Invalid JPEG frame');
        height = view.getUint16(cursor + 3);
        width = view.getUint16(cursor + 5);
      }
      cursor += length;
    }
  }
  assert(
    width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 16_777_216,
    'Consumer decoded image limit',
  );
  return width * height;
}

export function parseConsumerGlb(bytes: Uint8Array) {
  assert(bytes.length >= 20 && bytes.length <= 32 * 1024 * 1024, 'Consumer GLB size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(
    view.getUint32(0, true) === 0x46546c67 &&
      view.getUint32(4, true) === 2 &&
      view.getUint32(8, true) === bytes.length,
    'Invalid GLB header',
  );
  let cursor = 12,
    json: Uint8Array | undefined,
    binary = new Uint8Array(0),
    chunks = 0;
  while (cursor < bytes.length) {
    assert(cursor + 8 <= bytes.length, 'Truncated GLB');
    const length = view.getUint32(cursor, true),
      type = view.getUint32(cursor + 4, true);
    cursor += 8;
    assert(length % 4 === 0 && cursor + length <= bytes.length, 'Invalid GLB chunk');
    if (chunks === 0) {
      assert(type === 0x4e4f534a, 'GLB JSON must be first');
      json = bytes.subarray(cursor, cursor + length);
    } else {
      assert(chunks === 1 && type === 0x004e4942, 'Unexpected GLB chunk');
      binary = bytes.slice(cursor, cursor + length);
    }
    chunks++;
    cursor += length;
  }
  assert(json, 'Missing GLB JSON');
  const gltf = boundedJson(json) as ConsumerGltf;
  assert(gltf?.asset?.version === '2.0', 'Unsupported glTF version');
  assert(
    !gltf.extensionsRequired?.length && !gltf.extensionsUsed?.length,
    'Decoder/extensions are outside the consumer profile',
  );
  assert((gltf.buffers?.length ?? 0) <= 1, 'Only embedded GLB buffers');
  const declared = gltf.buffers?.[0]?.byteLength ?? 0;
  assert(
    Number.isSafeInteger(declared) &&
      declared >= 0 &&
      declared <= binary.length &&
      binary.length - declared <= 3,
    'GLB buffer length mismatch',
  );
  const views = gltf.bufferViews ?? [],
    accessors = gltf.accessors ?? [],
    nodes = gltf.nodes ?? [],
    meshes = gltf.meshes ?? [];
  assert(nodes.length <= 4096 && accessors.length <= 8192, 'Consumer entity limit');
  views.forEach((v) =>
    assert(
      v.buffer === 0 &&
        Number.isSafeInteger(v.byteLength) &&
        v.byteLength > 0 &&
        Number.isSafeInteger(v.byteOffset ?? 0) &&
        (v.byteOffset ?? 0) >= 0 &&
        (v.byteOffset ?? 0) + v.byteLength <= declared,
      'Invalid buffer view',
    ),
  );
  let components = 0;
  for (const a of accessors) {
    const width = widths[a.type],
      size = sizes[a.componentType],
      v = views[at(a.bufferView, views.length, 'bufferView')];
    assert(
      !a.sparse && width && size && Number.isSafeInteger(a.count) && a.count > 0,
      'Unsupported accessor',
    );
    const offset = a.byteOffset ?? 0,
      stride = v.byteStride ?? size * width;
    assert(
      Number.isSafeInteger(offset) &&
        offset >= 0 &&
        offset % size === 0 &&
        ((v.byteOffset ?? 0) + offset) % size === 0 &&
        Number.isSafeInteger(stride) &&
        stride >= size * width &&
        stride <= 252 &&
        stride % size === 0 &&
        offset + (a.count - 1) * stride + size * width <= v.byteLength,
      'Accessor range/alignment',
    );
    assert(
      !a.normalized || a.componentType === 5121 || a.componentType === 5123,
      'Invalid normalized accessor',
    );
    components += a.count * width;
    assert(components <= 6_000_000, 'Consumer decoded accessor limit');
  }
  const cache = new Map<number, number[]>();
  const read = (index: number): number[] => {
    const old = cache.get(index);
    if (old) return old;
    const a = accessors[at(index, accessors.length, 'accessor')],
      v = views[a.bufferView],
      size = sizes[a.componentType],
      width = widths[a.type],
      stride = v.byteStride ?? width * size;
    const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength),
      out: number[] = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < width; j++) {
        const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride + j * size;
        let n =
          a.componentType === 5126
            ? data.getFloat32(offset, true)
            : a.componentType === 5125
              ? data.getUint32(offset, true)
              : a.componentType === 5123
                ? data.getUint16(offset, true)
                : data.getUint8(offset);
        if (a.normalized) n /= a.componentType === 5121 ? 255 : 65535;
        assert(Number.isFinite(n), 'Non-finite accessor');
        out.push(n);
      }
    cache.set(index, out);
    return out;
  };
  const parents = new Map<number, number>();
  nodes.forEach((n, i) => {
    if (n.mesh !== undefined) at(n.mesh, meshes.length, 'mesh');
    if (n.skin !== undefined) at(n.skin, gltf.skins?.length ?? 0, 'skin');
    n.children?.forEach((child) => {
      at(child, nodes.length, 'child');
      assert(child !== i && !parents.has(child), 'Invalid hierarchy');
      parents.set(child, i);
    });
    for (const [key, count] of [
      ['translation', 3],
      ['rotation', 4],
      ['scale', 3],
      ['matrix', 16],
    ] as const)
      if (n[key] !== undefined) tuple(n[key], count, key);
  });
  nodes.forEach((_, i) => {
    const seen = new Set<number>();
    let index: number | undefined = i;
    while (index !== undefined) {
      assert(!seen.has(index) && seen.size < 256, 'Hierarchy cycle/depth');
      seen.add(index);
      index = parents.get(index);
    }
  });
  const scene = gltf.scenes?.[at(gltf.scene ?? 0, gltf.scenes?.length ?? 0, 'scene')];
  const reachable = new Set<number>();
  const visit = (index: number) => {
    at(index, nodes.length, 'scene root');
    assert(!reachable.has(index), 'Duplicate scene node');
    reachable.add(index);
    nodes[index].children?.forEach(visit);
  };
  scene?.nodes?.forEach((index) => {
    assert(!parents.has(index), 'Scene root has parent');
    visit(index);
  });
  assert(
    reachable.size === nodes.length,
    'Consumer requires all mapped nodes in the selected scene',
  );
  for (const mesh of meshes)
    for (const p of mesh.primitives) {
      assert((p.mode === undefined || p.mode === 4) && !p.targets, 'Only basic triangles');
      const positions = accessors[at(p.attributes.POSITION, accessors.length, 'POSITION')];
      assert(positions.type === 'VEC3' && positions.componentType === 5126, 'Invalid positions');
      for (const [name, index] of Object.entries(p.attributes)) {
        assert(
          ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(name),
          'Unsupported vertex attribute',
        );
        const a = accessors[at(index, accessors.length, 'attribute')];
        assert(a.count === positions.count, 'Attribute count mismatch');
        read(index);
        if (name === 'JOINTS_0')
          assert(
            a.type === 'VEC4' && [5121, 5123].includes(a.componentType) && !a.normalized,
            'Invalid skin joints',
          );
        if (name === 'WEIGHTS_0')
          assert(
            a.type === 'VEC4' &&
              (a.componentType === 5126 ||
                ([5121, 5123].includes(a.componentType) && a.normalized)),
            'Invalid skin weights',
          );
      }
      if (p.indices !== undefined) {
        const a = accessors[at(p.indices, accessors.length, 'indices')];
        assert(
          a.type === 'SCALAR' &&
            [5121, 5123, 5125].includes(a.componentType) &&
            !a.normalized &&
            a.count % 3 === 0 &&
            read(p.indices).every((x) => x >= 0 && x < positions.count),
          'Invalid primitive index',
        );
      } else assert(positions.count % 3 === 0, 'Incomplete triangles');
      if (p.material !== undefined) at(p.material, gltf.materials?.length ?? 0, 'material');
    }
  let pixels = 0;
  assert((gltf.images?.length ?? 0) <= 32, 'Consumer image count');
  gltf.images?.forEach((image) => {
    assert(['image/png', 'image/jpeg'].includes(image.mimeType ?? ''), 'Consumer image format');
    const v = views[at(image.bufferView, views.length, 'image')];
    pixels += imagePixels(
      binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength),
      image.mimeType!,
    );
    assert(pixels * 8 <= 128 * 1024 * 1024, 'Consumer image allocation limit');
  });
  for (const skin of gltf.skins ?? []) {
    assert(skin.joints.length > 0 && skin.joints.length <= 256, 'Skin palette limit');
    skin.joints.forEach((i) => at(i, nodes.length, 'joint'));
    if (skin.inverseBindMatrices !== undefined) {
      const a = accessors[at(skin.inverseBindMatrices, accessors.length, 'IBM')];
      assert(
        a.type === 'MAT4' && a.componentType === 5126 && a.count >= skin.joints.length,
        'Invalid inverse binds',
      );
      read(skin.inverseBindMatrices);
    }
  }
  let expandedVertices = 0;
  nodes.forEach((node) => {
    if (node.mesh === undefined) return;
    for (const p of meshes[node.mesh].primitives) {
      expandedVertices += accessors[p.attributes.POSITION].count;
      assert(expandedVertices <= 300_000, 'Consumer expanded geometry limit');
      if (node.skin !== undefined) {
        const skin = gltf.skins![node.skin],
          joints = read(p.attributes.JOINTS_0),
          weights = read(p.attributes.WEIGHTS_0);
        assert(
          joints.length === weights.length &&
            joints.every((j) => Number.isInteger(j) && j >= 0 && j < skin.joints.length),
          'Skin palette index',
        );
        for (let i = 0; i < weights.length; i += 4)
          assert(
            weights.slice(i, i + 4).every((w) => w >= 0 && w <= 1) &&
              Math.abs(weights.slice(i, i + 4).reduce((a, b) => a + b, 0) - 1) <= 1e-5,
            'Invalid normalized weights',
          );
      }
    }
  });
  for (const clip of gltf.animations ?? []) {
    const seen = new Set<string>();
    for (const channel of clip.channels) {
      at(channel.target.node, nodes.length, 'animation node');
      assert(
        ['translation', 'rotation', 'scale'].includes(channel.target.path),
        'Unsupported animation target',
      );
      const key = channel.target.node + ':' + channel.target.path;
      assert(!seen.has(key), 'Duplicate animation channel');
      seen.add(key);
      const s = clip.samplers[at(channel.sampler, clip.samplers.length, 'sampler')];
      assert(['STEP', 'LINEAR'].includes(s.interpolation ?? 'LINEAR'), 'Unsupported interpolation');
      const input = accessors[at(s.input, accessors.length, 'animation input')],
        output = accessors[at(s.output, accessors.length, 'animation output')];
      assert(
        input.type === 'SCALAR' &&
          input.componentType === 5126 &&
          output.componentType === 5126 &&
          output.type === (channel.target.path === 'rotation' ? 'VEC4' : 'VEC3'),
        'Invalid animation accessor',
      );
      const times = read(s.input),
        values = read(s.output),
        width = channel.target.path === 'rotation' ? 4 : 3;
      assert(
        times.every((t, i) => t >= 0 && (i === 0 || t > times[i - 1])) &&
          values.length === times.length * width,
        'Invalid animation sampler',
      );
    }
  }
  return { gltf, binary, read };
}

export async function checkConsumerAsset(
  glb: Uint8Array,
  sidecarBytes: Uint8Array,
): Promise<CheckedAsset> {
  const parsed = parseConsumerGlb(glb),
    sidecar = boundedJson(sidecarBytes) as ConsumerSidecar,
    hash = await sha256(glb);
  assert(
    sidecar?.format === 'chameleon-game-3d' &&
      sidecar.version === '1.0.0' &&
      sidecar.modelHash === hash &&
      sidecar.coordinates === 'right-handed-meter-y-up-positive-z-forward' &&
      Number.isSafeInteger(sidecar.revision) &&
      sidecar.revision >= 0,
    'Sidecar/model hash or version mismatch',
  );
  const compare = (
    mapping: { id: string; index: number }[],
    objects: { extras?: { casId?: string } }[],
  ) => {
    assert(Array.isArray(mapping) && mapping.length === objects.length, 'Mapping count mismatch');
    const ids = new Set<string>();
    mapping.forEach((entry, index) => {
      stableId(entry.id);
      assert(
        entry.index === index && objects[index].extras?.casId === entry.id && !ids.has(entry.id),
        'Stable ID/index mismatch',
      );
      ids.add(entry.id);
    });
  };
  compare(sidecar.nodes, parsed.gltf.nodes ?? []);
  compare(sidecar.meshes, parsed.gltf.meshes ?? []);
  assert(Array.isArray(sidecar.clips) && sidecar.clips.length <= 128, 'Clip limit');
  const clips = new Set<string>(),
    indices = new Set<number>();
  sidecar.clips.forEach((clip) => {
    stableId(clip.id);
    assert(
      !clips.has(clip.id) &&
        Number.isFinite(clip.duration) &&
        clip.duration >= 0 &&
        typeof clip.loop === 'boolean' &&
        typeof clip.name === 'string',
      'Invalid sidecar clip',
    );
    clips.add(clip.id);
    if (clip.index === null) return;
    const index = at(clip.index, parsed.gltf.animations?.length ?? 0, 'clip');
    assert(
      !indices.has(index) && parsed.gltf.animations![index].extras?.casId === clip.id,
      'Clip mapping mismatch',
    );
    indices.add(index);
    for (const sampler of parsed.gltf.animations![index].samplers) {
      const times = parsed.read(sampler.input);
      assert(
        Math.abs(times[times.length - 1] - clip.duration) <= 1e-6,
        'Clip duration/hold mismatch',
      );
    }
  });
  assert(indices.size === (parsed.gltf.animations?.length ?? 0), 'Missing clip mapping');
  const game = sidecar.game;
  assert(
    game &&
      Array.isArray(game.anchors) &&
      Array.isArray(game.colliders) &&
      game.anchors.length + game.colliders.length <= 4096,
    'Game attachment limit',
  );
  stableId(game.assetId);
  tuple(game.origin, 3, 'game origin');
  assert(
    Number.isFinite(game.unitMeters) &&
      game.unitMeters > 0 &&
      ['+Z', '-Z', '+X', '-X'].includes(game.forward) &&
      ['feet', 'center', 'custom'].includes(game.originMode),
    'Invalid game coordinates',
  );
  const attachments = new Set<string>();
  for (const item of [...game.anchors, ...game.colliders]) {
    stableId(item.id);
    assert(!attachments.has(item.id), 'Duplicate game ID');
    attachments.add(item.id);
    assert(
      item.nodeId === null || sidecar.nodes.some((node) => node.id === item.nodeId),
      'Unknown game binding',
    );
    assert(
      typeof item.name === 'string' && typeof item.purpose === 'string',
      'Invalid attachment name/purpose',
    );
    tuple(item.transform.translation, 3, 'attachment translation');
    tuple(item.transform.rotation, 4, 'attachment rotation');
    tuple(item.transform.scale, 3, 'attachment scale');
    assert(
      Math.abs(Math.hypot(...item.transform.rotation) - 1) <= 1e-5 &&
        item.transform.scale.every((x) => x > 0),
      'Invalid attachment pose',
    );
  }
  for (const item of game.colliders) {
    tuple(item.size, 3, 'collider size');
    assert(
      ['box', 'sphere', 'capsule'].includes(item.shape) &&
        item.size.every((x) => x > 0) &&
        Number.isFinite(item.radius) &&
        item.radius > 0 &&
        Number.isFinite(item.height) &&
        item.height >= 0,
      'Invalid collider dimensions',
    );
  }
  return { ...parsed, sidecar, hash };
}

export function oracleScene(asset: CheckedAsset, clipIndex: number | null, time: number) {
  const nodes = structuredClone(asset.gltf.nodes ?? []);
  if (clipIndex !== null)
    for (const c of asset.gltf.animations![clipIndex].channels) {
      const s = asset.gltf.animations![clipIndex].samplers[c.sampler],
        path = c.target.path as 'translation' | 'rotation' | 'scale';
      nodes[c.target.node][path] = sampleValues(
        asset.read(s.input),
        asset.read(s.output),
        path === 'rotation' ? 4 : 3,
        time,
        (s.interpolation ?? 'LINEAR') as 'STEP' | 'LINEAR',
        path === 'rotation',
      );
    }
  const worlds = hierarchyWorlds(nodes);
  const primitives = nodes.flatMap((node, nodeIndex) =>
    node.mesh === undefined
      ? []
      : asset.gltf.meshes![node.mesh].primitives.map((primitive, primitiveIndex) => {
          const input = asset.read(primitive.attributes.POSITION),
            positions: number[] = [];
          const skin = node.skin === undefined ? undefined : asset.gltf.skins![node.skin];
          const joints = skin ? asset.read(primitive.attributes.JOINTS_0) : [],
            weights = skin ? asset.read(primitive.attributes.WEIGHTS_0) : [];
          const binds =
            skin?.inverseBindMatrices === undefined ? [] : asset.read(skin.inverseBindMatrices);
          const palette = skin?.joints.map((j) => worlds[j]) ?? [],
            inverseBinds =
              skin?.joints.map((_, i) =>
                binds.length ? binds.slice(i * 16, i * 16 + 16) : identity(),
              ) ?? [];
          for (let i = 0; i < input.length / 3; i++)
            positions.push(
              ...(skin
                ? skinnedPoint(
                    input.slice(i * 3, i * 3 + 3),
                    joints.slice(i * 4, i * 4 + 4),
                    weights.slice(i * 4, i * 4 + 4),
                    palette,
                    inverseBinds,
                  )
                : point(worlds[nodeIndex], input.slice(i * 3, i * 3 + 3))),
            );
          return { nodeIndex, primitiveIndex, positions };
        }),
  );
  return { worlds, primitives };
}

export function attachmentWorld(parent: readonly number[] | undefined, local: number[]) {
  return multiply(parent ?? identity(), local);
}
export function worldOrigin(matrix: readonly number[]): Vec3 {
  return point(matrix, [0, 0, 0]);
}
