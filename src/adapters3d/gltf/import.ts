import { Matrix4, Quaternion, Vector3 } from 'three';
import { preflightGlb } from '../../core3d/import/preflight';
import {
  createProject,
  identityTransform,
  validateProject,
  type Vec3,
  type Quaternion as Q,
  type Mesh3D,
  type Skin3D,
} from '../../core3d/model/project';
import { multiplyMatrices, worldMatrix } from '../../core3d/model/coordinates';
import { inverseAffineMatrix } from '../../core3d/rig/math';
import { sha256 } from '../../core3d/export/snapshot';
import type { AssetImport } from '../../core3d/ports/assetIoPort';
import { inspectNativeImage } from '../../core3d/model/nativeImageMetadata';
import { applySidecar } from '../../core3d/export/mapping';
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
function ids(values: { extras?: Record<string, unknown> }[], prefix: string): string[] {
  const used = new Set<string>();
  return values.map((item, i) => {
    const proposed = item.extras?.casId;
    const id = validId(proposed) ? proposed : prefix + i;
    if (used.has(id)) throw new Error('Duplicate stable ID');
    used.add(id);
    return id;
  });
}
export async function importGlb(
  bytes: Uint8Array,
  projectId: string,
  allowLoss = false,
  sidecar?: Uint8Array,
): Promise<AssetImport> {
  const source = bytes.slice(),
    f = preflightGlb(source),
    g = f.json;
  if (f.losses.length && !allowLoss)
    throw new Error(
      'Source-only features require explicit loss approval: ' + JSON.stringify(f.losses),
    );
  const p = createProject(projectId, 'Imported GLB'),
    sourceHash = await sha256(source),
    blobs = new Map<string, Uint8Array>([[sourceHash, source]]);
  p.blobIds = [sourceHash];
  p.sources = [
    {
      id: 'original-glb',
      blobId: sourceHash,
      mimeType: 'model/gltf-binary',
      rights: { declared: '', embedded: JSON.stringify(g.asset) },
    },
  ];
  const nodeIds = ids(g.nodes ?? [], 'node-'),
    materialIds = ids(g.materials ?? [], 'material-'),
    clipIds = ids(g.animations ?? [], 'clip-');
  const visibleNodes = new Set<number>();
  const visit = (i: number) => {
    if (visibleNodes.has(i)) return;
    visibleNodes.add(i);
    g.nodes?.[i].children?.forEach(visit);
  };
  g.scenes?.[g.scene ?? 0]?.nodes?.forEach(visit);
  const parent = new Map<number, number>();
  g.nodes?.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)));
  p.nodes = (g.nodes ?? []).map((n, i) => {
    let transform = identityTransform();
    if (n.matrix) {
      const m = new Matrix4().fromArray(n.matrix),
        t = new Vector3(),
        q = new Quaternion(),
        s = new Vector3();
      m.decompose(t, q, s);
      const recomposed = new Matrix4().compose(t, q, s);
      if (
        recomposed.elements.some(
          (x, i) =>
            !Number.isFinite(x) ||
            Math.abs(x - n.matrix![i]) > 1e-5 * Math.max(1, Math.abs(n.matrix![i])),
        )
      )
        throw new Error('Shear/projective matrix is source-only');
      transform = {
        translation: t.toArray() as Vec3,
        rotation: q.toArray() as Q,
        scale: s.toArray() as Vec3,
      };
    } else
      transform = {
        translation: (n.translation ?? [0, 0, 0]) as Vec3,
        rotation: (n.rotation ?? [0, 0, 0, 1]) as Q,
        scale: (n.scale ?? [1, 1, 1]) as Vec3,
      };
    return {
      id: nodeIds[i],
      name: n.name ?? nodeIds[i],
      parentId: parent.has(i) ? nodeIds[parent.get(i)!] : null,
      transform,
      visible:
        visibleNodes.has(i) &&
        (typeof n.extras?.casVisible === 'boolean' ? n.extras.casVisible : true),
      locked: typeof n.extras?.casLocked === 'boolean' ? n.extras.casLocked : false,
    };
  });
  const imageHashes: string[] = [];
  let imagePixels = 0;
  for (const [i, image] of (g.images ?? []).entries()) {
    const view = g.bufferViews![image.bufferView!],
      imageBytes = f.binary.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const info = inspectNativeImage(imageBytes);
    if (info.mimeType !== image.mimeType) throw new Error('Image MIME mismatch');
    const hash = await sha256(imageBytes);
    if (!blobs.has(hash)) {
      imagePixels += info.width * info.height;
      if (imagePixels > 8_000_000) throw new Error('Total image pixels exceed native profile');
    }
    imageHashes.push(hash);
    if (!blobs.has(hash)) {
      blobs.set(hash, imageBytes);
      p.blobIds.push(hash);
      p.sources.push({
        id: 'image-' + i,
        blobId: hash,
        mimeType: info.mimeType,
        rights: { declared: '', embedded: '' },
        derivedFrom: {
          sourceId: 'original-glb',
          hash: sourceHash,
          operation: 'extract-embedded-image',
          version: '1',
          settings: JSON.stringify({ image: i }),
        },
      });
    }
  }
  p.materials = (g.materials ?? []).map((m, i) => {
    const v = m.pbrMetallicRoughness,
      t = v?.baseColorTexture;
    return {
      id: materialIds[i],
      baseColor: (v?.baseColorFactor ?? [1, 1, 1, 1]) as [number, number, number, number],
      metallic: v?.metallicFactor ?? 1,
      roughness: v?.roughnessFactor ?? 1,
      emissiveColor: (m.emissiveFactor ?? [0, 0, 0]) as Vec3,
      alphaMode: (m.alphaMode ?? 'OPAQUE') as 'OPAQUE' | 'MASK' | 'BLEND',
      alphaCutoff: m.alphaCutoff ?? 0.5,
      doubleSided: m.doubleSided ?? false,
      ...(t ? { textureBlobId: imageHashes[g.textures![t.index].source!] } : {}),
    };
  });
  let defaultMaterialId: string | undefined;
  if (g.meshes?.some((m) => m.primitives.some((p) => p.material === undefined))) {
    defaultMaterialId = 'gltf-default-material';
    let suffix = 0;
    while (p.materials.some((m) => m.id === defaultMaterialId))
      defaultMaterialId = 'gltf-default-material-' + ++suffix;
    p.materials.push({
      id: defaultMaterialId,
      baseColor: [1, 1, 1, 1],
      metallic: 1,
      roughness: 1,
      alphaMode: 'OPAQUE',
      emissiveColor: [0, 0, 0],
      alphaCutoff: 0.5,
      doubleSided: false,
    });
  }
  const meshIds = ids(g.meshes ?? [], 'mesh-'),
    built = new Map<string, string>(),
    allocatedMeshes = new Set<string>();
  const buildMesh = (
    meshIndex: number,
    skinIndex: number | undefined,
    nodeIndex: number | undefined,
  ) => {
    const bindKey = skinIndex === undefined ? 'static' : nodeIndex;
    const key = meshIndex + ':' + bindKey;
    const existing = built.get(key);
    if (existing) return existing;
    let id =
      skinIndex === undefined
        ? meshIds[meshIndex]
        : meshIds[meshIndex].slice(0, 100) + '-instance-' + nodeIndex;
    let suffix = 0;
    const baseId = id;
    while (allocatedMeshes.has(id)) id = baseId.slice(0, 110) + '-' + ++suffix;
    allocatedMeshes.add(id);
    const mesh: Mesh3D = { id, vertices: [], faces: [] };
    built.set(key, id);
    const rawSkin = skinIndex === undefined ? undefined : g.skins![skinIndex];
    const inverseMesh = rawSkin
      ? inverseAffineMatrix(worldMatrix(p, nodeIds[nodeIndex!]))
      : undefined;
    const inverseBinds =
      rawSkin?.inverseBindMatrices === undefined ? undefined : f.read(rawSkin.inverseBindMatrices);
    const skin: Skin3D | undefined = rawSkin
      ? {
          id: 'skin-' + nodeIndex,
          meshId: id,
          joints: rawSkin.joints.map((joint, i) => ({
            nodeId: nodeIds[joint],
            inverseBind: multiplyMatrices(
              inverseBinds?.[i] ?? new Matrix4().elements,
              inverseMesh!,
            ),
          })),
          weights: [],
        }
      : undefined;
    const positions = new Map<string, number[]>(),
      weightMap = new Map<string, string>();
    for (const [primitiveIndex, primitive] of g.meshes![meshIndex].primitives.entries()) {
      const a = primitive.attributes,
        points = f.read(a.POSITION),
        normals = a.NORMAL === undefined ? undefined : f.read(a.NORMAL),
        uv = a.TEXCOORD_0 === undefined ? undefined : f.read(a.TEXCOORD_0),
        indices =
          primitive.indices === undefined
            ? points.map((_, i) => i)
            : f.read(primitive.indices).flat();
      const joints = skin ? f.read(a.JOINTS_0) : undefined,
        weights = skin ? f.read(a.WEIGHTS_0) : undefined;
      const ownIds = primitive.extras?.casVertexIds;
      const vertexIds = points.map((point, i) => {
        const proposed = Array.isArray(ownIds) ? ownIds[i] : undefined;
        const vertexId = validId(proposed) ? proposed : 'p' + primitiveIndex + '-v' + i;
        if (positions.has(vertexId)) {
          if (JSON.stringify(positions.get(vertexId)) !== JSON.stringify(point))
            throw new Error('Conflicting stable vertex ID');
        } else {
          positions.set(vertexId, point);
          mesh.vertices.push({ id: vertexId, position: point as Vec3 });
        }
        if (skin) {
          const combined = new Map<string, number>();
          for (let k = 0; k < 4; k++)
            if (weights![i][k] > 0) {
              const joint = nodeIds[rawSkin!.joints[joints![i][k]]];
              combined.set(joint, (combined.get(joint) ?? 0) + weights![i][k]);
            }
          const w = { vertexId, jointIds: [...combined.keys()], values: [...combined.values()] },
            encoded = JSON.stringify(w);
          if (weightMap.has(vertexId)) {
            if (weightMap.get(vertexId) !== encoded) throw new Error('Conflicting vertex weights');
          } else {
            weightMap.set(vertexId, encoded);
            skin.weights.push(w);
          }
        }
        return vertexId;
      });
      for (let i = 0; i < indices.length; i += 3) {
        const corners = indices.slice(i, i + 3);
        mesh.faces.push({
          id: 'p' + primitiveIndex + '-f' + i / 3,
          vertexIds: corners.map((index) => vertexIds[index]),
          ...(normals ? { normals: corners.map((index) => normals[index] as Vec3) } : {}),
          ...(uv
            ? { uv: corners.map((index) => [uv[index][0], 1 - uv[index][1]] as [number, number]) }
            : {}),
          materialId:
            primitive.material !== undefined ? materialIds[primitive.material] : defaultMaterialId!,
        });
      }
    }
    p.meshes.push(mesh);
    if (skin) p.skins.push(skin);
    return id;
  };
  g.nodes?.forEach((n, i) => {
    if (n.mesh !== undefined) p.nodes[i].meshId = buildMesh(n.mesh, n.skin, i);
  });
  (g.meshes ?? []).forEach((_, i) => {
    if (!g.nodes?.some((n) => n.mesh === i)) buildMesh(i, undefined, undefined);
  });
  p.clips = (g.animations ?? []).map((clip, i) => {
    const tracks = clip.channels.flatMap((channel) => {
      const s = clip.samplers[channel.sampler];
      if (
        !['translation', 'rotation', 'scale'].includes(channel.target.path) ||
        !['STEP', 'LINEAR'].includes(s.interpolation ?? 'LINEAR')
      )
        return [];
      const times = f.read(s.input).flat(),
        values = f.read(s.output);
      return [
        {
          nodeId: nodeIds[channel.target.node!],
          property: channel.target.path as 'translation' | 'rotation' | 'scale',
          interpolation: (s.interpolation ?? 'LINEAR') as 'STEP' | 'LINEAR',
          keys: times.map((time, i) => ({ time, value: values[i] })),
        },
      ];
    });
    return {
      id: clipIds[i],
      name: clip.name ?? clipIds[i],
      duration: tracks.reduce((n, t) => Math.max(n, t.keys.at(-1)?.time ?? 0), 0),
      loop: false,
      tracks,
    };
  });
  validateProject(p);
  if (sidecar) {
    await applySidecar(p, source, sidecar);
    const hash = await sha256(sidecar);
    if (!blobs.has(hash)) {
      blobs.set(hash, sidecar.slice());
      p.blobIds.push(hash);
      p.sources.push({
        id: 'original-sidecar',
        blobId: hash,
        mimeType: 'application/json',
        rights: {
          declared: '',
          embedded: 'User-declared, unverified provenance retained in exact sidecar bytes',
        },
        derivedFrom: {
          sourceId: 'original-glb',
          hash: sourceHash,
          operation: 'paired-sidecar',
          version: '1',
          settings: 'SHA-256 model match verified; rights not verified',
        },
      });
    }
    validateProject(p);
  }
  return { project: p, blobs, losses: f.losses, sourceHash };
}
