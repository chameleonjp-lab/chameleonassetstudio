import { assertAffineMatrix, inverseAffineMatrix } from '../rig/math';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../profile/assetIoProfile';
export interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
  sparse?: unknown;
  min?: number[];
  max?: number[];
}
export interface GltfPrimitive {
  extras?: Record<string, unknown>;
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode?: number;
  targets?: unknown;
  extensions?: Record<string, unknown>;
}
export interface GltfNode {
  camera?: number;
  weights?: unknown;
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  extras?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}
export interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
    baseColorTexture?: { index: number; texCoord?: number; extensions?: Record<string, unknown> };
    metallicRoughnessTexture?: unknown;
  };
  normalTexture?: unknown;
  occlusionTexture?: unknown;
  emissiveTexture?: unknown;
  emissiveFactor?: number[];
  alphaMode?: string;
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}
export interface GltfDocument {
  asset: { version: string; minVersion?: string; generator?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  buffers?: { byteLength: number; uri?: string }[];
  bufferViews?: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
    target?: number;
  }[];
  accessors?: GltfAccessor[];
  nodes?: GltfNode[];
  meshes?: { name?: string; primitives: GltfPrimitive[]; extras?: Record<string, unknown> }[];
  materials?: GltfMaterial[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  textures?: { source?: number; sampler?: number; extensions?: Record<string, unknown> }[];
  samplers?: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }[];
  skins?: {
    joints: number[];
    inverseBindMatrices?: number;
    skeleton?: number;
    extras?: Record<string, unknown>;
  }[];
  animations?: {
    name?: string;
    samplers: { input: number; output: number; interpolation?: string }[];
    channels: { sampler: number; target: { node?: number; path: string } }[];
    extras?: Record<string, unknown>;
  }[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  extensions?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}
const widths: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function validateExtensionDeclarations(
  value: unknown,
  field: 'extensionsUsed' | 'extensionsRequired',
): void {
  if (value === undefined) return;
  const invalid = 'Invalid ' + field + ' declarations';
  requireValue(Array.isArray(value) && value.length > 0, invalid);
  assertIoBudget(value.length, P.extensionDeclarations, field + ' declarations');
  for (const [i, name] of value.entries()) {
    requireValue(typeof name === 'string' && name.length > 0, invalid);
    assertIoBudget(name.length, P.extensionNameChars, field + ' name');
    requireValue(value.indexOf(name) === i, invalid);
  }
}
function index(value: number | undefined, length: number, label: string) {
  requireValue(
    Number.isSafeInteger(value) && value! >= 0 && value! < length,
    'Invalid ' + label + ' index',
  );
  return value!;
}
function depth(value: unknown, level = 0, counter = { count: 0 }): void {
  requireValue(++counter.count <= P.jsonValues, 'JSON value count exceeds profile');
  requireValue(level <= P.jsonDepth, 'JSON depth exceeds profile');
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe JSON key');
      depth(child, level + 1, counter);
    }
}
export interface Preflight {
  json: GltfDocument;
  binary: Uint8Array;
  losses: string[];
  read: (index: number) => number[][];
}
export function preflightGlb(input: Uint8Array): Preflight {
  assertIoBudget(input.length, P.sourceBytes, 'GLB source');
  requireValue(input.length >= 20, 'Truncated GLB');
  const header = new DataView(input.buffer, input.byteOffset, input.byteLength);
  requireValue(
    header.getUint32(0, true) === 0x46546c67 &&
      header.getUint32(4, true) === 2 &&
      header.getUint32(8, true) === input.length,
    'Invalid GLB header',
  );
  let offset = 12,
    jsonBytes: Uint8Array | undefined,
    binary = new Uint8Array(0),
    chunks = 0;
  while (offset < input.length) {
    requireValue(offset + 8 <= input.length, 'Truncated GLB chunk');
    const length = header.getUint32(offset, true),
      type = header.getUint32(offset + 4, true);
    offset += 8;
    requireValue(length % 4 === 0 && offset + length <= input.length, 'Invalid GLB chunk range');
    const bytes = input.subarray(offset, offset + length);
    offset += length;
    if (chunks === 0) {
      requireValue(type === 0x4e4f534a, 'JSON must be first');
      jsonBytes = bytes;
    } else {
      requireValue(chunks === 1 && type === 0x004e4942, 'Unsupported GLB chunk');
      binary = bytes.slice();
    }
    chunks++;
  }
  requireValue(jsonBytes, 'Missing JSON');
  assertIoBudget(jsonBytes.length, P.jsonBytes, 'GLB JSON');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes));
  depth(raw);
  const json = raw as GltfDocument;
  requireValue(
    json &&
      json.asset?.version === '2.0' &&
      (!json.asset.minVersion || json.asset.minVersion === '2.0'),
    'Unsupported glTF version',
  );
  validateExtensionDeclarations(json.extensionsUsed, 'extensionsUsed');
  validateExtensionDeclarations(json.extensionsRequired, 'extensionsRequired');
  requireValue(json.extensionsRequired === undefined, 'Unsupported required extension');
  requireValue((json.buffers?.length ?? 0) <= 1, 'Only embedded GLB buffer supported');
  for (const b of json.buffers ?? [])
    requireValue(
      !b.uri &&
        Number.isSafeInteger(b.byteLength) &&
        b.byteLength >= 0 &&
        b.byteLength <= binary.length &&
        binary.length - b.byteLength <= 3,
      'External URI or invalid buffer',
    );
  const declared = json.buffers?.[0]?.byteLength ?? 0;
  const views = json.bufferViews ?? [],
    accessors = json.accessors ?? [],
    nodes = json.nodes ?? [],
    meshes = json.meshes ?? [];
  assertIoBudget(meshes.length, P.nodes, 'Meshes');
  assertIoBudget(json.materials?.length ?? 0, P.nodes, 'Materials');
  assertIoBudget(nodes.length, P.nodes, 'Nodes');
  assertIoBudget(accessors.length, P.accessors, 'Accessors');
  assertIoBudget(json.images?.length ?? 0, P.images, 'Images');
  assertIoBudget(json.animations?.length ?? 0, P.clips, 'Clips');
  const losses = new Set<string>(json.extensionsUsed ?? []);
  for (const v of views) {
    requireValue(
      v.buffer === 0 &&
        Number.isSafeInteger(v.byteLength) &&
        v.byteLength >= 0 &&
        Number.isSafeInteger(v.byteOffset ?? 0) &&
        (v.byteOffset ?? 0) >= 0 &&
        (v.byteOffset ?? 0) + v.byteLength <= declared,
      'Invalid bufferView range',
    );
    if (v.byteStride !== undefined)
      requireValue(
        Number.isInteger(v.byteStride) &&
          v.byteStride >= 4 &&
          v.byteStride <= 252 &&
          v.byteStride % 4 === 0,
        'Invalid stride',
      );
  }
  let decodedValues = 0;
  for (const a of accessors) {
    requireValue(!a.sparse, 'Sparse accessor is source-only');
    const size = sizes[a.componentType],
      width = widths[a.type];
    requireValue(size && width, 'Unsupported accessor format');
    requireValue(Number.isSafeInteger(a.count) && a.count >= 1, 'Invalid accessor count');
    assertIoBudget(a.count, Math.max(P.vertices, P.keys), 'Accessor count');
    decodedValues += a.count * width;
    assertIoBudget(decodedValues, P.decodedAccessorValues, 'Decoded accessor values');
    const v = views[index(a.bufferView, views.length, 'bufferView')],
      start = a.byteOffset ?? 0,
      stride = v.byteStride ?? size * width;
    requireValue(
      Number.isSafeInteger(start) &&
        start >= 0 &&
        start % size === 0 &&
        ((v.byteOffset ?? 0) + start) % size === 0 &&
        stride >= size * width &&
        stride % size === 0 &&
        start + (a.count - 1) * stride + size * width <= v.byteLength,
      'Accessor outside bufferView',
    );
    requireValue(
      !a.normalized || [5120, 5121, 5122, 5123].includes(a.componentType),
      'Invalid normalized accessor',
    );
  }
  const read = (id: number): number[][] => {
    const a = accessors[index(id, accessors.length, 'accessor')],
      v = views[a.bufferView!],
      size = sizes[a.componentType],
      width = widths[a.type],
      stride = v.byteStride ?? size * width;
    const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: width }, (_, c) => {
        const p = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride + c * size;
        let n =
          a.componentType === 5126
            ? data.getFloat32(p, true)
            : a.componentType === 5125
              ? data.getUint32(p, true)
              : a.componentType === 5123
                ? data.getUint16(p, true)
                : a.componentType === 5122
                  ? data.getInt16(p, true)
                  : a.componentType === 5121
                    ? data.getUint8(p)
                    : data.getInt8(p);
        if (a.normalized)
          n =
            a.componentType === 5120
              ? Math.max(n / 127, -1)
              : a.componentType === 5122
                ? Math.max(n / 32767, -1)
                : n / (a.componentType === 5121 ? 255 : 65535);
        requireValue(Number.isFinite(n), 'Non-finite accessor');
        return n;
      }),
    );
  };
  let vertices = 0,
    triangles = 0;
  for (const mesh of meshes)
    for (const primitive of mesh.primitives) {
      requireValue(
        primitive.mode === undefined || primitive.mode === 4,
        'Only triangles are editable',
      );
      if (primitive.targets) losses.add('morph targets');
      if (primitive.extensions) Object.keys(primitive.extensions).forEach((x) => losses.add(x));
      const pa = accessors[index(primitive.attributes.POSITION, accessors.length, 'POSITION')];
      requireValue(
        pa.componentType === 5126 && pa.type === 'VEC3' && !pa.normalized,
        'Invalid POSITION',
      );
      vertices += pa.count;
      const positions = read(primitive.attributes.POSITION);
      void positions;
      for (const [name, id] of Object.entries(primitive.attributes)) {
        const a = accessors[index(id, accessors.length, name)];
        requireValue(a.count === pa.count, 'Attribute count mismatch');
        if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(name))
          losses.add(name);
        if (name === 'NORMAL')
          requireValue(
            a.type === 'VEC3' && a.componentType === 5126 && !a.normalized,
            'Invalid NORMAL',
          );
        if (name === 'TEXCOORD_0')
          requireValue(
            a.type === 'VEC2' &&
              (a.componentType === 5126 ||
                ([5121, 5123].includes(a.componentType) && a.normalized)),
            'Invalid UV',
          );
        if (name === 'JOINTS_0')
          requireValue(
            a.type === 'VEC4' && [5121, 5123].includes(a.componentType) && !a.normalized,
            'Invalid JOINTS',
          );
        if (name === 'WEIGHTS_0')
          requireValue(
            a.type === 'VEC4' &&
              (a.componentType === 5126 ||
                ([5121, 5123].includes(a.componentType) && a.normalized)),
            'Invalid WEIGHTS',
          );
        const values = read(id);
        if (name === 'NORMAL')
          requireValue(
            values.every((n) => Math.abs(Math.hypot(...n) - 1) <= 1e-4),
            'Invalid non-unit normal; explicit repair required',
          );
      }
      let count = pa.count;
      if (primitive.indices !== undefined) {
        const a = accessors[index(primitive.indices, accessors.length, 'indices')];
        requireValue(
          a.type === 'SCALAR' && [5121, 5123, 5125].includes(a.componentType) && !a.normalized,
          'Invalid indices',
        );
        const values = read(primitive.indices).flat();
        requireValue(
          values.every((x) => Number.isSafeInteger(x) && x >= 0 && x < pa.count),
          'Index exceeds positions',
        );
        count = values.length;
      }
      requireValue(count % 3 === 0, 'Triangle count mismatch');
      triangles += count / 3;
      if (primitive.material !== undefined) {
        index(primitive.material, json.materials?.length ?? 0, 'material');
        const texture = json.materials![primitive.material].pbrMetallicRoughness?.baseColorTexture;
        if (texture)
          requireValue(
            primitive.attributes['TEXCOORD_' + (texture.texCoord ?? 0)] !== undefined,
            'Textured primitive requires UV',
          );
      }
      requireValue(
        (primitive.attributes.JOINTS_0 === undefined) ===
          (primitive.attributes.WEIGHTS_0 === undefined),
        'Incomplete skin attributes',
      );
      if (primitive.attributes.WEIGHTS_0 !== undefined)
        for (const w of read(primitive.attributes.WEIGHTS_0))
          requireValue(
            w.every((x) => x >= 0) && Math.abs(w.reduce((a, b) => a + b, 0) - 1) <= 1e-5,
            'Invalid weights; normalization must be explicit',
          );
    }
  assertIoBudget(vertices, P.vertices, 'Vertices');
  assertIoBudget(triangles, P.triangles, 'Triangles');
  const parents = new Map<number, number>();
  nodes.forEach((n, i) => {
    if (n.camera !== undefined) losses.add('camera');
    if (n.weights !== undefined) losses.add('node morph weights');
    if (n.mesh !== undefined) index(n.mesh, meshes.length, 'mesh');
    if (n.skin !== undefined) index(n.skin, json.skins?.length ?? 0, 'skin');
    for (const child of n.children ?? []) {
      index(child, nodes.length, 'child');
      requireValue(child !== i && !parents.has(child), 'Multiple parents');
      parents.set(child, i);
    }
    if (n.extensions) Object.keys(n.extensions).forEach((x) => losses.add(x));
    for (const [field, width] of [
      ['translation', 3],
      ['rotation', 4],
      ['scale', 3],
      ['matrix', 16],
    ] as const)
      if (n[field] !== undefined)
        requireValue(
          n[field]!.length === width && n[field]!.every(Number.isFinite),
          'Invalid node transform',
        );
    requireValue(!n.matrix || (!n.translation && !n.rotation && !n.scale), 'Mixed matrix/TRS');
    if (n.rotation)
      requireValue(Math.abs(Math.hypot(...n.rotation) - 1) <= 1e-5, 'Invalid node quaternion');
  });
  nodes.forEach((_, i) => {
    const seen = new Set<number>();
    let p: number | undefined = i;
    while (p !== undefined) {
      requireValue(!seen.has(p), 'Cyclic hierarchy');
      seen.add(p);
      requireValue(seen.size <= P.hierarchyDepth, 'Hierarchy depth exceeds profile');
      p = parents.get(p);
    }
  });
  for (const scene of json.scenes ?? [])
    for (const root of scene.nodes ?? []) {
      index(root, nodes.length, 'scene root');
      requireValue(!parents.has(root), 'Scene root has parent');
    }
  if (json.scene !== undefined) index(json.scene, json.scenes?.length ?? 0, 'scene');
  const selectedNodes = new Set<number>();
  const visit = (id: number) => {
    if (selectedNodes.has(id)) return;
    selectedNodes.add(id);
    nodes[id].children?.forEach(visit);
  };
  for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) visit(root);
  if ((json.scenes?.length ?? 0) > 1 || selectedNodes.size !== nodes.length)
    losses.add('non-selected scene nodes retained hidden');
  nodes.forEach((n) => {
    if (
      n.skin !== undefined &&
      selectedNodes.has(nodes.indexOf(n)) &&
      json.skins![n.skin].joints.some((j) => !selectedNodes.has(j))
    )
      throw new Error('Skin joint is outside selected scene');
  });
  for (const skin of json.skins ?? []) {
    assertIoBudget(skin.joints.length, P.joints, 'Joints');
    requireValue(
      skin.joints.length > 0 && new Set(skin.joints).size === skin.joints.length,
      'Invalid joint list',
    );
    skin.joints.forEach((x) => index(x, nodes.length, 'joint'));
    if (skin.inverseBindMatrices !== undefined) {
      const a = accessors[index(skin.inverseBindMatrices, accessors.length, 'inverse bind')];
      requireValue(
        a.type === 'MAT4' && a.componentType === 5126 && a.count >= skin.joints.length,
        'Invalid inverse bind',
      );
      for (const matrix of read(skin.inverseBindMatrices)) {
        assertAffineMatrix(matrix, 'GLB inverse bind');
        inverseAffineMatrix(matrix, 'GLB inverse bind');
      }
    }
  }
  let expandedVertices = 0,
    expandedTriangles = 0;
  meshes.forEach((mesh, meshIndex) => {
    const references = nodes.filter((n) => n.mesh === meshIndex);
    const copies =
      references.filter((n) => n.skin !== undefined).length +
      (references.some((n) => n.skin === undefined) || !references.length ? 1 : 0);
    for (const primitive of mesh.primitives) {
      expandedVertices += accessors[primitive.attributes.POSITION].count * copies;
      expandedTriangles +=
        ((primitive.indices === undefined
          ? accessors[primitive.attributes.POSITION].count
          : accessors[primitive.indices].count) /
          3) *
        copies;
    }
  });
  assertIoBudget(expandedVertices, P.vertices, 'Instanced canonical vertices');
  assertIoBudget(expandedTriangles, P.triangles, 'Instanced canonical triangles');
  const expandedJoints = nodes.reduce(
    (count, n) => count + (n.skin === undefined ? 0 : json.skins![n.skin].joints.length),
    0,
  );
  assertIoBudget(
    input.length * 6 + expandedVertices * 512 + expandedTriangles * 768 + expandedJoints * 1024,
    P.estimatedPeakBytes,
    'Imported canonical peak estimate',
  );
  nodes.forEach((n) => {
    if (n.skin !== undefined) {
      requireValue(n.mesh !== undefined, 'Skin without mesh');
      const skin = json.skins![n.skin];
      for (const p of meshes[n.mesh!].primitives) {
        requireValue(p.attributes.JOINTS_0 !== undefined, 'Skinned mesh missing attributes');
        for (const row of read(p.attributes.JOINTS_0))
          requireValue(
            row.every((x) => x < skin.joints.length),
            'Joint index out of range',
          );
      }
    }
  });
  for (const image of json.images ?? [])
    requireValue(
      !image.uri &&
        ['image/png', 'image/jpeg'].includes(image.mimeType ?? '') &&
        image.bufferView !== undefined &&
        index(image.bufferView, views.length, 'image') >= 0,
      'Image must be embedded PNG/JPEG',
    );
  for (const texture of json.textures ?? []) {
    index(texture.source, json.images?.length ?? 0, 'image source');
    if (texture.sampler === undefined) losses.add('texture sampler default REPEAT');
    else index(texture.sampler, json.samplers?.length ?? 0, 'sampler');
  }
  for (const sampler of json.samplers ?? [])
    if (
      (sampler.wrapS ?? 10497) !== 33071 ||
      (sampler.wrapT ?? 10497) !== 33071 ||
      (sampler.magFilter ?? 9729) !== 9729 ||
      (sampler.minFilter ?? 9987) !== 9729
    )
      losses.add('texture sampler');
  for (const material of json.materials ?? []) {
    if (
      material.normalTexture ||
      material.occlusionTexture ||
      material.emissiveTexture ||
      material.pbrMetallicRoughness?.metallicRoughnessTexture
    )
      losses.add('additional material texture');
    if (material.extensions) Object.keys(material.extensions).forEach((x) => losses.add(x));
    const t = material.pbrMetallicRoughness?.baseColorTexture;
    if (t) {
      index(t.index, json.textures?.length ?? 0, 'texture');
      if (t.texCoord && t.texCoord !== 0) losses.add('texture UV set');
      if (t.extensions) Object.keys(t.extensions).forEach((x) => losses.add(x));
    }
  }
  let keys = 0;
  for (const clip of json.animations ?? []) {
    const targets = new Set<string>();
    for (const channel of clip.channels) {
      const sampler =
        clip.samplers[index(channel.sampler, clip.samplers.length, 'animation sampler')];
      index(channel.target.node, nodes.length, 'animation node');
      const property = channel.target.path;
      if (!['translation', 'rotation', 'scale'].includes(property)) {
        losses.add('animation ' + property);
        continue;
      }
      const identity = channel.target.node + ':' + property;
      requireValue(!targets.has(identity), 'Duplicate animation channel');
      targets.add(identity);
      if (sampler.interpolation && !['STEP', 'LINEAR'].includes(sampler.interpolation)) {
        losses.add(sampler.interpolation);
        continue;
      }
      const a = accessors[index(sampler.input, accessors.length, 'animation time')],
        b = accessors[index(sampler.output, accessors.length, 'animation value')];
      requireValue(
        a.type === 'SCALAR' &&
          a.componentType === 5126 &&
          b.componentType === 5126 &&
          b.type === (property === 'rotation' ? 'VEC4' : 'VEC3') &&
          a.count === b.count,
        'Invalid animation accessor',
      );
      const times = read(sampler.input).flat();
      requireValue(
        times.every((t, i) => t >= 0 && (i === 0 || t > times[i - 1])),
        'Duplicate or unordered key time',
      );
      keys += times.length;
      const values = read(sampler.output);
      if (property === 'rotation')
        requireValue(
          values.every((q) => Math.abs(Math.hypot(...q) - 1) <= 1e-5),
          'Invalid key quaternion',
        );
    }
  }
  assertIoBudget(keys, P.keys, 'Keys');
  return { json, binary, losses: [...losses], read };
}
