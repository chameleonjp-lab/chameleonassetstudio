import { composeTransform, multiplyMatrices, transformPoint } from '../model/coordinates';
import { inspectNativeImage } from '../model/nativeImageMetadata';
import type { Project3D, Vec3 } from '../model/project';
import { ASSET_IO_PROFILE as P } from '../profile/assetIoProfile';

/** Unknown is deliberately different from a measured zero or a known empty scene. */
export type Measurement<T> = { status: 'known'; value: T } | { status: 'unknown'; reason: string };
export interface InspectionBounds {
  min: Vec3;
  max: Vec3;
  size: Vec3;
}
export interface TextureStatistics {
  blobId: string;
  materialIds: string[];
  encodedBytes: Measurement<number>;
  dimensions: Measurement<{ width: number; height: number }>;
}
export interface ProjectStatistics {
  /** Mesh-local native vertices; each stored mesh, including unused meshes, counted once. */
  vertices: number;
  triangleFaces: number;
  nonTriangleFaces: number;
  /** Distinct face-material groups per stored mesh, not renderer draw calls. */
  materialGroups: number;
  meshInstances: number;
  instanceTriangleFaces: number;
  materials: number;
  textures: number;
  joints: number;
  jointBindings: number;
  clips: number;
  nonemptyClips: number;
  /** Encoded image header dimensions only; no claim that pixels were decoded. */
  decodedPixels: Measurement<number>;
  knownDecodedPixels: number;
  unknownTextureCount: number;
  textureDetails: TextureStatistics[];
  projectJsonBytes: number;
  retainedBlobBytes: Measurement<number>;
  knownRetainedBlobBytes: number;
  missingBlobIds: string[];
  exportedGlbBytes: Measurement<number>;
  gpuMemoryBytes: Measurement<number>;
  /** Stored geometry under saved node TRS, including hidden instances; not animated bounds. */
  bounds: Measurement<InspectionBounds | null>;
  boundsBasis: 'world-space-stored-geometry';
}

const known = <T>(value: T): Measurement<T> => ({ status: 'known', value });
const unknown = (reason: string): Measurement<never> => ({ status: 'unknown', reason });

function inspectBounds(project: Project3D): Measurement<InspectionBounds | null> {
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const meshes = new Map(project.meshes.map((mesh) => [mesh.id, mesh]));
  const matrices = new Map<string, number[]>();
  const depths = new Map<string, number>();
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let points = 0;
  try {
    for (const node of project.nodes) {
      if (node.meshId === undefined) continue;
      const mesh = meshes.get(node.meshId);
      if (!mesh) throw new Error('Bounds contain a missing mesh reference');
      points += mesh.vertices.length;
      // Repeated instances can expand a small native mesh into excessive work.
      if (points * 3 > P.decodedAccessorValues)
        throw new Error('World-space bounds evaluation exceeds the inspection profile');
      const chain: typeof project.nodes = [];
      const seen = new Set<string>();
      let next: string | null = node.id;
      while (next !== null && !matrices.has(next)) {
        if (seen.has(next)) throw new Error('Bounds contain a cyclic hierarchy');
        if (seen.size >= P.hierarchyDepth)
          throw new Error('Bounds hierarchy exceeds the inspection profile');
        seen.add(next);
        const ancestor = nodes.get(next);
        if (!ancestor) throw new Error('Bounds contain a missing parent reference');
        chain.push(ancestor);
        next = ancestor.parentId;
      }
      while (chain.length) {
        const ancestor = chain.pop()!;
        const depth = ancestor.parentId === null ? 1 : depths.get(ancestor.parentId)! + 1;
        if (depth > P.hierarchyDepth)
          throw new Error('Bounds hierarchy exceeds the inspection profile');
        const local = composeTransform(ancestor.transform);
        const matrix =
          ancestor.parentId === null
            ? local
            : multiplyMatrices(matrices.get(ancestor.parentId)!, local);
        if (!matrix.every(Number.isFinite)) throw new Error('Non-finite world transform');
        matrices.set(ancestor.id, matrix);
        depths.set(ancestor.id, depth);
      }
      const matrix = matrices.get(node.id)!;
      for (const vertex of mesh.vertices) {
        const position = transformPoint(matrix, vertex.position);
        if (!position.every(Number.isFinite)) throw new Error('Non-finite world-space bounds');
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], position[axis]);
          max[axis] = Math.max(max[axis], position[axis]);
        }
      }
    }
    if (!points) return known(null);
    const size = max.map((value, axis) => value - min[axis]) as Vec3;
    if (!size.every(Number.isFinite)) throw new Error('Non-finite bounds size');
    return known({ min, max, size });
  } catch (error) {
    return unknown(error instanceof Error ? error.message : 'Bounds could not be measured');
  }
}

/** Pure inspection of a detached project and available bytes; never changes geometry or sources. */
export function inspectStatistics(
  project: Project3D,
  blobs: ReadonlyMap<string, Uint8Array>,
  options: { exportedGlbBytes?: number } = {},
): ProjectStatistics {
  let vertices = 0,
    triangleFaces = 0,
    nonTriangleFaces = 0,
    materialGroups = 0;
  const trianglesByMesh = new Map<string, number>();
  for (const mesh of project.meshes) {
    vertices += mesh.vertices.length;
    const triangles = mesh.faces.filter((face) => face.vertexIds.length === 3).length;
    triangleFaces += triangles;
    nonTriangleFaces += mesh.faces.length - triangles;
    trianglesByMesh.set(mesh.id, triangles);
    materialGroups += new Set(mesh.faces.map((face) => face.materialId)).size;
  }
  const textureMaterials = new Map<string, string[]>();
  for (const material of project.materials) {
    if (material.textureBlobId === undefined) continue;
    const uses = textureMaterials.get(material.textureBlobId) ?? [];
    uses.push(material.id);
    textureMaterials.set(material.textureBlobId, uses);
  }
  let knownDecodedPixels = 0,
    unknownTextureCount = 0;
  const textureDetails: TextureStatistics[] = [...textureMaterials].map(([blobId, materialIds]) => {
    const bytes = blobs.get(blobId);
    let dimensions: TextureStatistics['dimensions'];
    try {
      if (!bytes) throw new Error('Texture bytes are unavailable');
      const { width, height } = inspectNativeImage(bytes);
      dimensions = known({ width, height });
      knownDecodedPixels += width * height;
    } catch (error) {
      unknownTextureCount++;
      dimensions = unknown(error instanceof Error ? error.message : 'Unknown image dimensions');
    }
    return {
      blobId,
      materialIds,
      encodedBytes: bytes ? known(bytes.byteLength) : unknown('Texture bytes are unavailable'),
      dimensions,
    };
  });
  let knownRetainedBlobBytes = 0;
  const missingBlobIds: string[] = [];
  for (const id of new Set(project.blobIds)) {
    const bytes = blobs.get(id);
    if (bytes) knownRetainedBlobBytes += bytes.byteLength;
    else missingBlobIds.push(id);
  }
  const instances = project.nodes.filter((node) => node.meshId !== undefined);
  return {
    vertices,
    triangleFaces,
    nonTriangleFaces,
    materialGroups,
    meshInstances: instances.length,
    instanceTriangleFaces: instances.reduce(
      (total, node) => total + (trianglesByMesh.get(node.meshId!) ?? 0),
      0,
    ),
    materials: project.materials.length,
    textures: textureMaterials.size,
    joints: new Set(project.skins.flatMap((skin) => skin.joints.map((joint) => joint.nodeId))).size,
    jointBindings: project.skins.reduce((total, skin) => total + skin.joints.length, 0),
    clips: project.clips.length,
    nonemptyClips: project.clips.filter((clip) => clip.tracks.some((track) => track.keys.length))
      .length,
    decodedPixels: unknownTextureCount
      ? unknown('One or more texture dimensions could not be inspected')
      : known(knownDecodedPixels),
    knownDecodedPixels,
    unknownTextureCount,
    textureDetails,
    projectJsonBytes: new TextEncoder().encode(JSON.stringify(project)).byteLength,
    retainedBlobBytes: missingBlobIds.length
      ? unknown('One or more retained blobs are unavailable')
      : known(knownRetainedBlobBytes),
    knownRetainedBlobBytes,
    missingBlobIds,
    exportedGlbBytes:
      options.exportedGlbBytes !== undefined &&
      Number.isSafeInteger(options.exportedGlbBytes) &&
      options.exportedGlbBytes >= 0
        ? known(options.exportedGlbBytes)
        : unknown('No measured GLB output for this snapshot'),
    gpuMemoryBytes: unknown('GPU memory has not been measured'),
    bounds: inspectBounds(project),
    boundsBasis: 'world-space-stored-geometry',
  };
}
