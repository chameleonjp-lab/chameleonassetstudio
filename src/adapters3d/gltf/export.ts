import { evaluateTransformPose } from '../../core3d/rig/pose';
import type { AssetSnapshot } from '../../core3d/export/snapshot';
import { verifySnapshot } from '../../core3d/export/snapshot';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../../core3d/profile/assetIoProfile';
import type { GltfDocument, GltfPrimitive } from '../../core3d/import/preflight';
import { preflightGlb } from '../../core3d/import/preflight';
import { validateSkinProfile } from '../../core3d/rig/profile';
import { worldMatrix, multiplyMatrices } from '../../core3d/model/coordinates';
import { inspectNativeImage } from '../../core3d/model/nativeImageMetadata';
import { convertAssetImage } from './images';
export function encodeGlb(json: GltfDocument, binary: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(text.length / 4) * 4,
    bl = Math.ceil(binary.length / 4) * 4;
  const total = 12 + 8 + jl + (bl ? 8 + bl : 0);
  assertIoBudget(total, P.outputBytes, 'GLB output');
  const bytes = new Uint8Array(total),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jl, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jl);
  bytes.set(text, 20);
  if (bl) {
    view.setUint32(20 + jl, bl, true);
    view.setUint32(24 + jl, 0x004e4942, true);
    bytes.set(binary, 28 + jl);
  }
  return bytes;
}
/** Direct profile encoder: independent rest graph, no renderer/helpers or exporter library pruning. */
export async function exportGlb(
  snapshot: AssetSnapshot,
  progress: (phase: string, fraction: number) => void = () => {},
  options: { verifyImages?: boolean } = {},
): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  await verifySnapshot(snapshot);
  evaluateTransformPose(snapshot.project, []);
  progress('validate', 0.05);
  const p = snapshot.project,
    warnings: string[] = [],
    normalChanges = new Map<string, number>();
  if (!p.nodes.length) throw new Error('Empty project has no GLB scene to export');
  const json: GltfDocument = {
    asset: { version: '2.0', generator: 'Chameleon Asset Studio basic-gltf2-v1' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    skins: [],
    animations: [],
    images: [],
    textures: [],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
  };
  const chunks: Uint8Array[] = [];
  let length = 0;
  function buffer(bytes: Uint8Array, target?: number): number {
    const aligned = Math.ceil(length / 4) * 4;
    if (aligned > length) chunks.push(new Uint8Array(aligned - length));
    length = aligned;
    const id = json.bufferViews!.length;
    json.bufferViews!.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.length,
      ...(target ? { target } : {}),
    });
    chunks.push(bytes);
    length += bytes.length;
    assertIoBudget(length, P.outputBytes, 'Binary output');
    return id;
  }
  function accessor(
    values: number[],
    width: number,
    type: string,
    componentType = 5126,
    target?: number,
    bounds = false,
  ): number {
    if (values.some((x) => !Number.isFinite(x) || !Number.isFinite(Math.fround(x))))
      throw new Error('Float32 overflow');
    const bytes =
      componentType === 5123
        ? new Uint8Array(new Uint16Array(values).buffer)
        : new Uint8Array(new Float32Array(values).buffer);
    const id = json.accessors!.length,
      entry = {
        bufferView: buffer(bytes, target),
        componentType,
        count: values.length / width,
        type,
      };
    if (!Number.isInteger(entry.count) || entry.count < 1)
      throw new Error('Empty or malformed accessor');
    const ranges = bounds
      ? {
          min: Array.from({ length: width }, (_, axis) => {
            let v = Infinity;
            for (let i = axis; i < values.length; i += width)
              v = Math.min(v, Math.fround(values[i]));
            return v;
          }),
          max: Array.from({ length: width }, (_, axis) => {
            let v = -Infinity;
            for (let i = axis; i < values.length; i += width)
              v = Math.max(v, Math.fround(values[i]));
            return v;
          }),
        }
      : {};
    json.accessors!.push({ ...entry, ...ranges });
    return id;
  }
  const nodeIndex = new Map(p.nodes.map((n, i) => [n.id, i])),
    meshIndex = new Map(p.meshes.map((m, i) => [m.id, i])),
    materialIndex = new Map(p.materials.map((m, i) => [m.id, i]));
  const textureIndex = new Map<string, number>(),
    textureHasAlpha = new Map<string, boolean>();
  for (const material of p.materials)
    if (material.textureBlobId && !textureIndex.has(material.textureBlobId)) {
      const source = snapshot.blobs.get(material.textureBlobId)!;
      const bytes = await convertAssetImage(source, options.verifyImages);
      const info = inspectNativeImage(bytes);
      const id = json.images!.length;
      json.images!.push({ bufferView: buffer(bytes), mimeType: info.mimeType });
      json.textures!.push({ source: id, sampler: 0 });
      textureIndex.set(material.textureBlobId, id);
      textureHasAlpha.set(material.textureBlobId, info.mimeType === 'image/png');
    }
  for (const m of p.materials) {
    const hasAlphaSource = m.textureBlobId ? textureHasAlpha.get(m.textureBlobId) : false;
    const mode =
      m.alphaMode === undefined || m.alphaMode === 'LEGACY_AUTO'
        ? m.baseColor[3] < 1 || hasAlphaSource
          ? 'BLEND'
          : 'OPAQUE'
        : m.alphaMode;
    if (m.alphaMode === undefined || m.alphaMode === 'LEGACY_AUTO')
      warnings.push('Legacy alpha resolved for material ' + m.id);
    json.materials!.push({
      name: m.id,
      pbrMetallicRoughness: {
        baseColorFactor: [...m.baseColor],
        metallicFactor: m.metallic,
        roughnessFactor: m.roughness,
        ...(m.textureBlobId
          ? { baseColorTexture: { index: textureIndex.get(m.textureBlobId)! } }
          : {}),
      },
      emissiveFactor: m.emissiveColor ?? [0, 0, 0],
      alphaMode: mode,
      ...(mode === 'MASK' ? { alphaCutoff: m.alphaCutoff ?? 0.5 } : {}),
      doubleSided: m.doubleSided ?? false,
      extras: { casId: m.id },
    });
  }
  for (const mesh of p.meshes) {
    const skins = p.skins.filter((s) => s.meshId === mesh.id);
    if (skins.length > 1) throw new Error('Ambiguous multiple skins for one mesh');
    const skin = skins[0];
    if (skin) validateSkinProfile(skin, mesh, p.nodes);
    const vertices = new Map(mesh.vertices.map((v) => [v.id, v.position])),
      weights = new Map(skin?.weights.map((w) => [w.vertexId, w]) ?? []),
      jointIndex = new Map(skin?.joints.map((j, i) => [j.nodeId, i]) ?? []);
    const groups = new Map<string, typeof mesh.faces>();
    for (const face of mesh.faces) {
      if (face.vertexIds.length !== 3)
        throw new Error('Non-triangle face requires explicit conversion');
      const key = face.materialId ?? '';
      groups.set(key, [...(groups.get(key) ?? []), face]);
    }
    if (groups.has('') && !materialIndex.has('')) {
      materialIndex.set('', json.materials!.length);
      json.materials!.push({
        name: 'Native default',
        pbrMetallicRoughness: {
          baseColorFactor: [0.55, 0.65, 0.8, 1],
          metallicFactor: 0,
          roughnessFactor: 0.7,
        },
      });
    }
    const primitives: GltfPrimitive[] = [];
    for (const [material, faces] of groups) {
      const pos: number[] = [],
        normal: number[] = [],
        uv: number[] = [],
        joints: number[] = [],
        values: number[] = [],
        ids: string[] = [];
      for (const face of faces) {
        if (
          face.materialId &&
          p.materials.find((m) => m.id === face.materialId)?.textureBlobId &&
          !face.uv
        )
          throw new Error('Textured face requires explicit UV');
        const points = face.vertexIds.map((id) => vertices.get(id)!);
        const a = points[1].map((x, i) => x - points[0][i]),
          b = points[2].map((x, i) => x - points[0][i]),
          cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
          len = Math.hypot(...cross);
        if (!len) throw new Error('Degenerate triangle');
        for (let c = 0; c < 3; c++) {
          const id = face.vertexIds[c];
          pos.push(...points[c]);
          const n = face.normals?.[c] ?? cross.map((x) => x / len),
            nl = Math.hypot(...n);
          if (!nl) throw new Error('Zero normal requires explicit repair');
          if (Math.abs(nl - 1) > 1e-5)
            normalChanges.set(mesh.id, (normalChanges.get(mesh.id) ?? 0) + 1);
          normal.push(...n.map((x) => x / nl));
          const nativeUv = face.uv?.[c] ?? [0, 0];
          uv.push(nativeUv[0], 1 - nativeUv[1]);
          ids.push(id);
          if (skin) {
            const w = weights.get(id)!;
            for (let k = 0; k < 4; k++) {
              joints.push(k < w.jointIds.length ? jointIndex.get(w.jointIds[k])! : 0);
              values.push(w.values[k] ?? 0);
            }
          }
        }
      }
      const attributes: Record<string, number> = {
        POSITION: accessor(pos, 3, 'VEC3', 5126, 34962, true),
        NORMAL: accessor(normal, 3, 'VEC3', 5126, 34962),
        TEXCOORD_0: accessor(uv, 2, 'VEC2', 5126, 34962),
      };
      if (skin) {
        attributes.JOINTS_0 = accessor(joints, 4, 'VEC4', 5123, 34962);
        attributes.WEIGHTS_0 = accessor(values, 4, 'VEC4', 5126, 34962);
      }
      primitives.push({
        attributes,
        material: materialIndex.get(material)!,
        extras: { casVertexIds: ids },
      });
    }
    if (!primitives.length) throw new Error('Empty mesh cannot be emitted as glTF');
    json.meshes!.push({ name: mesh.id, primitives, extras: { casId: mesh.id } });
  }
  const nodeSkins = new Map<string, number>();
  for (const skin of p.skins) {
    const instances = p.nodes.filter((n) => n.meshId === skin.meshId);
    if (!instances.length) throw new Error('Uninstanced skin cannot be exported');
    for (const instance of instances) {
      nodeSkins.set(instance.id, json.skins!.length);
      json.skins!.push({
        joints: skin.joints.map((j) => nodeIndex.get(j.nodeId)!),
        inverseBindMatrices: accessor(
          skin.joints.flatMap((j) => multiplyMatrices(j.inverseBind, worldMatrix(p, instance.id))),
          16,
          'MAT4',
        ),
        extras: { casId: skin.id, casInstance: instance.id },
      });
    }
  }
  if (p.nodes.some((n) => n.visible === false))
    warnings.push(
      'Hidden nodes retained; standard GLB consumers may show them because visibility is application metadata',
    );
  for (const n of p.nodes) {
    const children = p.nodes.flatMap((x, i) => (x.parentId === n.id ? [i] : [])),
      skin = nodeSkins.get(n.id) ?? -1;
    json.nodes!.push({
      name: n.name,
      translation: [...n.transform.translation],
      rotation: [...n.transform.rotation],
      scale: [...n.transform.scale],
      ...(children.length ? { children } : {}),
      ...(n.meshId ? { mesh: meshIndex.get(n.meshId)! } : {}),
      ...(skin >= 0 ? { skin } : {}),
      extras: { casId: n.id, casVisible: n.visible ?? true, casLocked: n.locked ?? false },
    });
    if (n.parentId === null) json.scenes![0].nodes!.push(nodeIndex.get(n.id)!);
  }
  if (json.scenes![0].nodes!.length > 1) {
    let id = 'cas-export-root',
      suffix = 0;
    while (nodeIndex.has(id)) id = 'cas-export-root-' + ++suffix;
    const roots = json.scenes![0].nodes!;
    json.scenes![0].nodes = [json.nodes!.length];
    json.nodes!.push({
      name: 'Asset root',
      children: roots,
      extras: { casId: id, casSyntheticRoot: true },
    });
    warnings.push('Identity asset root added for common skin hierarchy');
  }
  progress('geometry', 0.55);
  for (const clip of p.clips) {
    const channels: NonNullable<GltfDocument['animations']>[number]['channels'] = [],
      samplers: NonNullable<GltfDocument['animations']>[number]['samplers'] = [];
    for (const track of clip.tracks) {
      if (!track.keys.length) continue;
      const keys = structuredClone(track.keys);
      // glTF clip duration is inferred; explicit endpoint holds retain native sparse semantics.
      if (keys[0].time > 0) {
        warnings.push(
          'Endpoint hold inserted at 0 seconds for ' +
            clip.id +
            '/' +
            track.nodeId +
            '/' +
            track.property,
        );
        keys.unshift({ time: 0, value: [...keys[0].value] });
      }
      if (keys.at(-1)!.time < clip.duration) {
        warnings.push(
          'Endpoint hold inserted at duration for ' +
            clip.id +
            '/' +
            track.nodeId +
            '/' +
            track.property,
        );
        keys.push({ time: clip.duration, value: [...keys.at(-1)!.value] });
      }
      const times = keys.map((k) => {
        const rounded = Math.fround(k.time);
        if (Math.abs(rounded - k.time) > 1e-6)
          throw new Error('Key time exceeds Float32 seconds error budget');
        return rounded;
      });
      if (times.some((t, i) => i > 0 && t <= times[i - 1]))
        throw new Error('Key times collapse in Float32');
      const input = accessor(times, 1, 'SCALAR', 5126, undefined, true),
        output = accessor(
          keys.flatMap((k) => k.value),
          track.property === 'rotation' ? 4 : 3,
          track.property === 'rotation' ? 'VEC4' : 'VEC3',
        );
      channels.push({
        sampler: samplers.length,
        target: { node: nodeIndex.get(track.nodeId)!, path: track.property },
      });
      samplers.push({ input, output, interpolation: track.interpolation });
    }
    if (channels.length)
      json.animations!.push({ name: clip.name, channels, samplers, extras: { casId: clip.id } });
    else warnings.push('Empty clip ' + clip.id + ' retained in sidecar only');
  }
  for (const key of [
    'skins',
    'animations',
    'images',
    'textures',
    'samplers',
    'materials',
    'meshes',
    'accessors',
    'bufferViews',
  ] as const)
    if (!json[key]?.length) delete json[key];
  if (!textureIndex.size) delete json.samplers;
  const binary = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    binary.set(chunk, offset);
    offset += chunk.length;
  }
  if (length) json.buffers = [{ byteLength: length }];
  else delete json.buffers;
  for (const [id, count] of normalChanges)
    warnings.push('Normal direction normalized for glTF on ' + id + ': ' + count + ' corners');
  const bytes = encodeGlb(json, binary);
  preflightGlb(bytes);
  progress('encoded', 0.8);
  return { bytes, warnings };
}
