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
  validateProject(project);
  const posed = cloneProject(project);
  const ids = new Set<string>();
  const jointIds = new Set(
    project.skins.flatMap((skin) => skin.joints.map((joint) => joint.nodeId)),
  );
  for (const update of updates) {
    if (ids.has(update.nodeId) || !jointIds.has(update.nodeId))
      throw new Error('Pose target must be a unique bound joint');
    ids.add(update.nodeId);
    assertNodeEditable(project, update.nodeId, true);
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
      skin.joints.some((joint) => affected(joint.nodeId)) ||
      project.nodes.some((node) => node.meshId === skin.meshId && affected(node.id))
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
          checkedVector(normalMatrix.precise, inputVector([...normal, 0]), normalMatrix.rounded);
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
