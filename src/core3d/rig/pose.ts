import { cloneProject, validateProject, type Project3D } from '../model/project';
import { assertNodeEditable, assertMeshEditable } from '../model/editability';
import { multiplyMatrices, worldMatrix } from '../model/coordinates';
import type { RigPoseUpdate } from '../ports/rigPosePort';
import { inverseAffineMatrix, assertAffineMatrix } from './math';
import { validateSkinProfile } from './profile';

interface DualVector {
  precise: number[];
  rounded: number[];
}
const finite = (value: number) => Number.isFinite(Math.fround(value));
/** Follow Three's vertex shader operation order, retaining rounded intermediate values. */
function checkedVector(
  matrix: number[],
  input: DualVector,
  roundedMatrix = matrix.map(Math.fround),
): DualVector {
  const precise: number[] = [],
    rounded: number[] = [];
  for (let row = 0; row < 4; row++) {
    let p = 0,
      f = 0;
    for (let column = 0; column < 4; column++) {
      const product = matrix[row + column * 4] * input.precise[column];
      const fp = Math.fround(roundedMatrix[row + column * 4] * input.rounded[column]);
      p += product;
      f = Math.fround(f + fp);
      if (![product, fp, p, f].every(finite))
        throw new Error('Pose shader intermediate exceeds Float32');
    }
    precise.push(p);
    rounded.push(f);
  }
  return { precise, rounded };
}
function normalWorldMatrix(world: number[]): number[] {
  const inverse = inverseAffineMatrix(world);
  return [
    inverse[0],
    inverse[4],
    inverse[8],
    0,
    inverse[1],
    inverse[5],
    inverse[9],
    0,
    inverse[2],
    inverse[6],
    inverse[10],
    0,
    0,
    0,
    0,
    1,
  ];
}
function checkedWorldNormal(matrix: number[], value: DualVector) {
  const result = checkedVector(matrix, value);
  // Camera view rotation is orthonormal; this sum bounds all of its three-term intermediates.
  if (
    ![result.precise, result.rounded].every((entries) =>
      finite(entries.slice(0, 3).reduce((sum, item) => sum + Math.abs(item), 0)),
    )
  )
    throw new Error('World normal exceeds Float32 view range');
}
function inputVector(values: number[]): DualVector {
  return { precise: values, rounded: values.map(Math.fround) };
}
function checkedProduct(a: number[], b: number[]) {
  // Skeleton palettes are composed on the CPU and then uploaded as Float32 matrices.
  const result = multiplyMatrices(a, b);
  assertAffineMatrix(result);
  return result;
}

function multiplyShaderMatrices(left: DualVector, right: DualVector): DualVector {
  const result: DualVector = { precise: [], rounded: [] };
  for (let column = 0; column < 4; column++) {
    const value = checkedVector(
      left.precise,
      {
        precise: right.precise.slice(column * 4, column * 4 + 4),
        rounded: right.rounded.slice(column * 4, column * 4 + 4),
      },
      left.rounded,
    );
    result.precise.push(...value.precise);
    result.rounded.push(...value.rounded);
  }
  return result;
}

/** Returns a detached posed scene, never a replacement for the stored rest project. */
export function evaluateRigPose(project: Project3D, updates: readonly RigPoseUpdate[]): Project3D {
  return evaluatePose(project, updates, true);
}
/** Display-only object/bone animation; locks protect authoring, not viewing existing clips. */
export function evaluateTransformPose(
  project: Project3D,
  updates: readonly RigPoseUpdate[],
): Project3D {
  return evaluatePose(project, updates, false);
}
function evaluatePose(
  project: Project3D,
  updates: readonly RigPoseUpdate[],
  manual: boolean,
): Project3D {
  validateProject(project);
  const posed = cloneProject(project);
  const ids = new Set<string>();
  const jointIds = new Set(
    project.skins.flatMap((skin) => skin.joints.map((joint) => joint.nodeId)),
  );
  for (const update of updates) {
    if (
      ids.has(update.nodeId) ||
      !project.nodes.some((node) => node.id === update.nodeId) ||
      (manual && !jointIds.has(update.nodeId))
    )
      throw new Error('Pose target must be a unique bound joint');
    ids.add(update.nodeId);
    if (manual) assertNodeEditable(project, update.nodeId, true);
    posed.nodes.find((node) => node.id === update.nodeId)!.transform = structuredClone(
      update.transform,
    );
  }
  validateProject(posed);
  // Rest and posed worlds are resolved once per node, not once per vertex.
  const restWorld = new Map(project.nodes.map((node) => [node.id, worldMatrix(project, node.id)]));
  const posedWorld = new Map(posed.nodes.map((node) => [node.id, worldMatrix(posed, node.id)]));
  for (const value of posedWorld.values()) inverseAffineMatrix(value);
  const skinnedMeshIds = new Set(project.skins.map((skin) => skin.meshId));
  for (const instance of posed.nodes) {
    if (!instance.meshId || skinnedMeshIds.has(instance.meshId)) continue;
    const mesh = posed.meshes.find((value) => value.id === instance.meshId)!;
    for (const vertex of mesh.vertices)
      checkedVector(posedWorld.get(instance.id)!, inputVector([...vertex.position, 1]));
    const matrix = normalWorldMatrix(posedWorld.get(instance.id)!);
    const positions = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
    for (const face of mesh.faces) {
      const [a, b, c] = face.vertexIds.slice(0, 3).map((id) => positions.get(id)!);
      const u = b.map((value, axis) => value - a[axis]),
        v = c.map((value, axis) => value - a[axis]);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...cross),
        normal = length ? cross.map((value) => value / length) : [0, 0, 0];
      for (const value of face.normals ?? [normal])
        checkedWorldNormal(matrix, inputVector([...value, 0]));
    }
  }
  for (const skin of project.skins) {
    const mesh = project.meshes.find((item) => item.id === skin.meshId)!;
    validateSkinProfile(skin, mesh, project.nodes);
    const affected = (id: string) => {
      let current: string | null = id;
      while (current !== null) {
        if (ids.has(current)) return true;
        current = project.nodes.find((node) => node.id === current)!.parentId;
      }
      return false;
    };
    if (
      manual &&
      (skin.joints.some((joint) => affected(joint.nodeId)) ||
        project.nodes.some((node) => node.meshId === skin.meshId && affected(node.id)))
    )
      assertMeshEditable(project, skin.meshId);
    for (const instance of project.nodes.filter((node) => node.meshId === mesh.id)) {
      const inverseMesh = inverseAffineMatrix(posedWorld.get(instance.id)!);
      const palettes = new Map(
        skin.joints.map((joint) => [
          joint.nodeId,
          checkedProduct(posedWorld.get(joint.nodeId)!, joint.inverseBind),
        ]),
      );
      const vertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
      const normalsByVertex = new Map<string, number[][]>();
      for (const face of mesh.faces) {
        const [a, b, c] = face.vertexIds.slice(0, 3).map((id) => vertices.get(id)!);
        const u = b.map((value, axis) => value - a[axis]),
          v = c.map((value, axis) => value - a[axis]);
        const cross = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        const length = Math.hypot(...cross);
        const normal = length > 0 ? cross.map((value) => value / length) : [0, 0, 0];
        face.vertexIds.forEach((id, corner) => {
          const existing = normalsByVertex.get(id) ?? [];
          existing.push(face.normals?.[corner] ?? normal);
          normalsByVertex.set(id, existing);
        });
      }
      const normalMatrices = new Map<string, DualVector>();
      for (const assignment of skin.weights) {
        const restPosition = checkedVector(
          restWorld.get(instance.id)!,
          inputVector([...vertices.get(assignment.vertexId)!, 1]),
        );
        const mixed: DualVector = { precise: [0, 0, 0, 0], rounded: [0, 0, 0, 0] };
        for (let i = 0; i < 4; i++) {
          const point = checkedVector(
            palettes.get(assignment.jointIds[i] ?? skin.joints[0].nodeId)!,
            restPosition,
          );
          for (let axis = 0; axis < 4; axis++) {
            const product = point.precise[axis] * (assignment.values[i] ?? 0);
            const fp = Math.fround(point.rounded[axis] * Math.fround(assignment.values[i] ?? 0));
            mixed.precise[axis] += product;
            mixed.rounded[axis] = Math.fround(mixed.rounded[axis] + fp);
            if (![product, fp, mixed.precise[axis], mixed.rounded[axis]].every(finite))
              throw new Error('Mixed pose position exceeds Float32');
          }
        }
        const normalKey = JSON.stringify([assignment.jointIds, assignment.values]);
        let normalMatrix = normalMatrices.get(normalKey);
        if (!normalMatrix) {
          const weighted: DualVector = { precise: Array(16).fill(0), rounded: Array(16).fill(0) };
          for (let slot = 0; slot < 4; slot++) {
            const palette = palettes.get(assignment.jointIds[slot] ?? skin.joints[0].nodeId)!;
            const weight = assignment.values[slot] ?? 0;
            for (let entry = 0; entry < 16; entry++) {
              weighted.precise[entry] += palette[entry] * weight;
              weighted.rounded[entry] = Math.fround(
                weighted.rounded[entry] +
                  Math.fround(Math.fround(palette[entry]) * Math.fround(weight)),
              );
              if (![weighted.precise[entry], weighted.rounded[entry]].every(finite))
                throw new Error('Skin normal palette exceeds Float32');
            }
          }
          normalMatrix = multiplyShaderMatrices(
            multiplyShaderMatrices(inputVector(inverseMesh), weighted),
            inputVector(restWorld.get(instance.id)!),
          );
          normalMatrices.set(normalKey, normalMatrix);
        }
        for (const normal of normalsByVertex.get(assignment.vertexId) ?? [])
          checkedWorldNormal(
            normalWorldMatrix(posedWorld.get(instance.id)!),
            checkedVector(normalMatrix.precise, inputVector([...normal, 0]), normalMatrix.rounded),
          );
        const local = checkedVector(inverseMesh, mixed);
        checkedVector(posedWorld.get(instance.id)!, {
          precise: [...local.precise.slice(0, 3), 1],
          rounded: [...local.rounded.slice(0, 3), 1],
        });
      }
    }
  }
  return posed;
}

/**
 * Revision-owned immutable rest data. Ordinary samples use deliberately loose absolute
 * bounds at EVERY shader stage, including all four padded slots and normal matrices.
 * A 1e30 ceiling leaves orders of magnitude of Float32 rounding headroom. Anything near
 * that ceiling falls back to the original per-vertex ordered checks; corner sampling
 * alone is never used as a proof for a rounded, multistage shader pipeline.
 */
export function prepareTransformPose(
  project: Project3D,
): (updates: readonly RigPoseUpdate[]) => void {
  validateProject(project);
  const source = cloneProject(project);
  const restWorld = new Map(source.nodes.map((node) => [node.id, worldMatrix(source, node.id)]));
  const maximum = (values: readonly number[]) =>
    values.reduce((result, value) => Math.max(result, Math.abs(value)), 0);
  const positions = new Map(
    source.meshes.map((mesh) => [
      mesh.id,
      mesh.vertices.reduce((value, vertex) => Math.max(value, maximum(vertex.position)), 1),
    ]),
  );
  const normals = new Map(
    source.meshes.map((mesh) => [
      mesh.id,
      mesh.faces.reduce((value, face) => Math.max(value, ...(face.normals ?? []).map(maximum)), 1),
    ]),
  );
  const boundNodes = new Set<string>();
  const include = (id: string) => {
    let node = source.nodes.find((value) => value.id === id);
    while (node) {
      boundNodes.add(node.id);
      node = source.nodes.find((value) => value.id === node!.parentId);
    }
  };
  for (const skin of source.skins) {
    validateSkinProfile(
      skin,
      source.meshes.find((mesh) => mesh.id === skin.meshId),
      source.nodes,
    );
    skin.joints.forEach((joint) => include(joint.nodeId));
    source.nodes.filter((node) => node.meshId === skin.meshId).forEach((node) => include(node.id));
  }
  // Matrix-vector and matrix-matrix bounds include four terms and generous outward slack.
  const product = (a: number, b: number) => 4 * a * b * 1.00001;
  return (updates) => {
    const byId = new Map<string, RigPoseUpdate>();
    for (const update of updates) {
      if (byId.has(update.nodeId) || !restWorld.has(update.nodeId))
        throw new Error('Animation target must be a unique node');
      const t = update.transform;
      if (
        !t ||
        !Array.isArray(t.translation) ||
        !Array.isArray(t.rotation) ||
        !Array.isArray(t.scale) ||
        t.translation.length !== 3 ||
        t.rotation.length !== 4 ||
        t.scale.length !== 3 ||
        ![...t.translation, ...t.rotation, ...t.scale].every(
          (value) => typeof value === 'number' && Number.isFinite(value),
        ) ||
        Math.abs(Math.hypot(...t.rotation) - 1) > 1e-5 ||
        (boundNodes.has(update.nodeId) && t.scale.some((value) => value <= 0))
      )
        throw new Error('Invalid animation TRS');
      byId.set(update.nodeId, update);
    }
    const posed = {
      ...source,
      nodes: source.nodes.map((node) => ({
        ...node,
        transform: byId.get(node.id)?.transform ?? node.transform,
      })),
    };
    const world = new Map(posed.nodes.map((node) => [node.id, worldMatrix(posed, node.id)]));
    const inverses = new Map([...world].map(([id, matrix]) => [id, inverseAffineMatrix(matrix)]));
    let safe = true;
    const bounded = (...values: number[]) => {
      if (values.some((value) => !Number.isFinite(value) || value > 1e30)) safe = false;
    };
    for (const node of posed.nodes) {
      if (!node.meshId) continue;
      const meshMax = positions.get(node.meshId)!;
      const skin = source.skins.find((value) => value.meshId === node.meshId);
      const poseMax = maximum(world.get(node.id)!);
      const inverseMax = maximum(inverses.get(node.id)!);
      if (!skin) {
        bounded(product(poseMax, meshMax), product(inverseMax, normals.get(node.meshId)!));
        continue;
      }
      const restMax = maximum(restWorld.get(node.id)!);
      let paletteMax = 0;
      for (const joint of skin.joints)
        paletteMax = Math.max(
          paletteMax,
          maximum(checkedProduct(world.get(joint.nodeId)!, joint.inverseBind)),
        );
      const weightsMax =
        skin.weights.reduce(
          (result, weight) =>
            Math.max(
              result,
              weight.values.reduce((sum, value) => sum + Math.abs(value), 0),
            ),
          0,
        ) * 1.00001;
      const restPosition = product(restMax, meshMax);
      const bonePosition = product(paletteMax, restPosition);
      const mixed = bonePosition * weightsMax * 1.00001;
      const local = product(inverseMax, mixed);
      const position = product(poseMax, Math.max(local, 1));
      const weightedMatrix = paletteMax * weightsMax * 1.00001;
      const normalFirst = product(inverseMax, weightedMatrix);
      const normalMatrix = product(normalFirst, restMax);
      bounded(
        restPosition,
        bonePosition,
        mixed,
        local,
        position,
        weightedMatrix,
        normalFirst,
        normalMatrix,
        product(normalMatrix, normals.get(node.meshId)!),
        product(inverseMax, product(normalMatrix, normals.get(node.meshId)!)) * 3,
      );
    }
    if (!safe) evaluateTransformPose(source, updates);
  };
}
