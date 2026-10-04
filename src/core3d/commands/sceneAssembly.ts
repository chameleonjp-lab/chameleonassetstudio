import {
  cloneProject,
  identityTransform,
  validateProject,
  type Mesh3D,
  type Node3D,
  type Project3D,
  type Quaternion,
  type Transform3D,
  type Vec3,
} from '../model/project';
import {
  composeTransform,
  multiplyMatrices,
  transformPoint,
  worldMatrix,
} from '../model/coordinates';
import { assertFiniteAuthoringCoordinates, cloneNode } from './objectEditing';

export type ReparentMode = 'keep-world' | 'keep-local';
export type MirrorAxis = 'x' | 'y' | 'z';

// Relative tolerance for floating-point matrix arithmetic, not permission to bake shear.
const TRS_EPSILON = 1e-10;
const identityMatrix = () => composeTransform(identityTransform());

function node(project: Project3D, id: string): Node3D {
  const found = project.nodes.find((item) => item.id === id);
  if (!found) throw new Error('対象オブジェクトがありません。選択し直してください。');
  return found;
}

function ancestors(project: Project3D, id: string | null): Set<string> {
  const ids = new Set<string>();
  while (id !== null) {
    if (ids.has(id)) throw new Error('階層が循環しています。');
    ids.add(id);
    id = node(project, id).parentId;
  }
  return ids;
}

function descendants(project: Project3D, roots: readonly string[]): Set<string> {
  const ids = new Set(roots);
  for (let changed = true; changed;) {
    changed = false;
    for (const item of project.nodes) {
      if (item.parentId !== null && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

function selection(project: Project3D, ids: readonly string[]): Node3D[] {
  if (ids.length === 0 || new Set(ids).size !== ids.length)
    throw new Error('重複しない有効なオブジェクトを選択してください。');
  const selected = new Set(ids);
  return ids.map((id) => {
    const item = node(project, id);
    if ([...ancestors(project, item.parentId)].some((parentId) => selected.has(parentId)))
      throw new Error('親とその子を同時に選択できません。階層の最上位だけを選択してください。');
    return item;
  });
}

function modeRequired(mode: ReparentMode): void {
  if (mode !== 'keep-world' && mode !== 'keep-local')
    throw new Error('world位置を保持するか、local値を保持するか選択してください。');
}

function assertStatic(project: Project3D, roots: readonly string[], newParentId: string | null) {
  const affected = descendants(project, roots);
  const scope = new Set(affected);
  for (const id of [...roots, ...(newParentId === null ? [] : [newParentId])])
    for (const ancestor of ancestors(project, id)) scope.add(ancestor);
  if (
    project.skins.some(
      (skin) =>
        skin.joints.some((joint) => scope.has(joint.nodeId)) ||
        project.nodes.some((item) => affected.has(item.id) && item.meshId === skin.meshId),
    ) ||
    project.clips.some((clip) => clip.tracks.some((track) => scope.has(track.nodeId)))
  )
    throw new Error('リグ・アニメーション付きの組立変更は未対応です。元の作品を保持しています。');
}

/** Clone, validate and swap only after every requested operation succeeds. */
function transaction<T>(project: Project3D, edit: (candidate: Project3D) => T): T {
  validateProject(project);
  const candidate = cloneProject(project);
  const result = edit(candidate);
  validateProject(candidate);
  assertFiniteAuthoringCoordinates(candidate);
  project.nodes = candidate.nodes;
  project.meshes = candidate.meshes;
  project.materials = candidate.materials;
  return result;
}

function inverseAffine(matrix: number[]): number[] {
  const linear = [
    matrix[0],
    matrix[4],
    matrix[8],
    matrix[1],
    matrix[5],
    matrix[9],
    matrix[2],
    matrix[6],
    matrix[10],
  ];
  const scale = Math.max(...linear.map(Math.abs));
  if (!scale || !Number.isFinite(scale)) throw new Error('親の変換行列を逆変換できません。');
  const [a, b, c, d, e, f, g, h, i] = linear.map((value) => value / scale);
  const inverse = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  const determinant = a * inverse[0] + b * inverse[3] + c * inverse[6];
  if (determinant === 0) throw new Error('親の変換行列を逆変換できません。');
  const r = inverse.map((value) => value / determinant / scale);
  const [x, y, z] = matrix.slice(12, 15);
  const result = [
    r[0],
    r[3],
    r[6],
    0,
    r[1],
    r[4],
    r[7],
    0,
    r[2],
    r[5],
    r[8],
    0,
    -(r[0] * x + r[1] * y + r[2] * z),
    -(r[3] * x + r[4] * y + r[5] * z),
    -(r[6] * x + r[7] * y + r[8] * z),
    1,
  ];
  if (!result.every(Number.isFinite)) throw new Error('親の逆変換が数値範囲を超えます。');
  return result;
}

function matricesMatch(a: number[], b: number[]): boolean {
  return a.every((value, index) => {
    const start = Math.floor(index / 4) * 4;
    // Translation axes have independent units: a large X must not hide lost Y detail.
    const scale =
      index >= 12
        ? Math.max(1, Math.abs(value))
        : Math.max(...a.slice(start, start + 4).map(Math.abs));
    return (
      Number.isFinite(value) &&
      Number.isFinite(b[index]) &&
      Math.abs(value - b[index]) <= TRS_EPSILON * scale
    );
  });
}

/** A nonorthogonal basis requires shear, which native 0.1.0 cannot store. */
function exactTRS(matrix: number[]): Transform3D {
  const fail = () => {
    throw new Error(
      'world位置の保持にはshearが必要です。local値保持を選ぶか、親の回転・倍率を調整してください。',
    );
  };
  if (!matrix.every(Number.isFinite)) fail();
  const scale: Vec3 = [
    Math.hypot(matrix[0], matrix[1], matrix[2]),
    Math.hypot(matrix[4], matrix[5], matrix[6]),
    Math.hypot(matrix[8], matrix[9], matrix[10]),
  ];
  if (scale.some((value) => value === 0 || !Number.isFinite(value))) fail();
  const columns = [0, 1, 2].map((column) =>
    matrix.slice(column * 4, column * 4 + 3).map((value) => value / scale[column]),
  );
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, value, index) => sum + value * b[index], 0);
  if (
    Math.max(
      Math.abs(dot(columns[0], columns[1])),
      Math.abs(dot(columns[0], columns[2])),
      Math.abs(dot(columns[1], columns[2])),
    ) > TRS_EPSILON
  )
    fail();
  const [a, b, c] = columns;
  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    b[0] * (a[1] * c[2] - a[2] * c[1]) +
    c[0] * (a[1] * b[2] - a[2] * b[1]);
  if (determinant < 0) {
    scale[0] = -scale[0];
    columns[0] = columns[0].map((value) => -value);
  }
  const [[m11, m21, m31], [m12, m22, m32], [m13, m23, m33]] = columns;
  const trace = m11 + m22 + m33;
  let rotation: Quaternion;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    rotation = [(m32 - m23) / s, (m13 - m31) / s, (m21 - m12) / s, s / 4];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    rotation = [s / 4, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    rotation = [(m12 + m21) / s, s / 4, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    rotation = [(m13 + m31) / s, (m23 + m32) / s, s / 4, (m21 - m12) / s];
  }
  const length = Math.hypot(...rotation);
  rotation = rotation.map((value) => value / length) as Quaternion;
  const transform: Transform3D = {
    translation: matrix.slice(12, 15) as Vec3,
    rotation,
    scale,
  };
  if (!matricesMatch(matrix, composeTransform(transform))) fail();
  return transform;
}

function reparent(
  candidate: Project3D,
  ids: readonly string[],
  parentId: string | null,
  mode: ReparentMode,
): void {
  modeRequired(mode);
  const selected = selection(candidate, ids);
  const targetAncestors = ancestors(candidate, parentId);
  if (ids.some((id) => targetAncestors.has(id)))
    throw new Error('自分自身や子孫を親にすることはできません。');
  assertStatic(candidate, ids, parentId);
  const before = new Map(selected.map((item) => [item.id, worldMatrix(candidate, item.id)]));
  const inverse =
    mode === 'keep-world'
      ? inverseAffine(parentId === null ? identityMatrix() : worldMatrix(candidate, parentId))
      : null;
  for (const item of selected) {
    if (item.parentId === parentId) continue;
    if (inverse) item.transform = exactTRS(multiplyMatrices(inverse, before.get(item.id)!));
    item.parentId = parentId;
  }
  if (
    mode === 'keep-world' &&
    selected.some((item) => !matricesMatch(before.get(item.id)!, worldMatrix(candidate, item.id)))
  )
    throw new Error('数値精度の範囲でworld位置を保持できません。変更していません。');
}

/** Explicit local/world policy; selected subtrees must not overlap. */
export function reparentNodes(
  project: Project3D,
  nodeIds: readonly string[],
  parentId: string | null,
  mode: ReparentMode,
): void {
  transaction(project, (candidate) => reparent(candidate, nodeIds, parentId, mode));
}

/** Creates an identity container under the chosen parent, then reparents the selection. */
export function groupNodes(
  project: Project3D,
  nodeIds: readonly string[],
  groupId: string,
  parentId: string | null,
  mode: ReparentMode,
  name = 'グループ',
): string {
  return transaction(project, (candidate) => {
    selection(candidate, nodeIds);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(groupId) ||
      candidate.nodes.some((item) => item.id === groupId)
    )
      throw new Error('グループには重複しない有効なIDが必要です。');
    if (!name.trim() || name.length > 4096)
      throw new Error('名前は1〜4096文字で入力してください。');
    ancestors(candidate, parentId);
    candidate.nodes.push({ id: groupId, name, parentId, transform: identityTransform() });
    reparent(candidate, nodeIds, groupId, mode);
    return groupId;
  });
}

/** Only meshless containers may be removed; all child IDs and mesh references survive. */
export function ungroupNode(project: Project3D, groupId: string, mode: ReparentMode): string[] {
  return transaction(project, (candidate) => {
    modeRequired(mode);
    const group = node(candidate, groupId);
    if (group.meshId !== undefined) throw new Error('メッシュのないグループを選択してください。');
    assertStatic(candidate, [groupId], group.parentId);
    const children = candidate.nodes
      .filter((item) => item.parentId === groupId)
      .map((item) => item.id);
    if (children.length) reparent(candidate, children, group.parentId, mode);
    candidate.nodes = candidate.nodes.filter((item) => item.id !== groupId);
    return children;
  });
}

function assertPivotDisplayGeometry(mesh: Mesh3D, previous: Vec3[], offset: Vec3): void {
  if (!previous.length) return;
  const fail = () => {
    throw new Error('pivot差分が大きすぎて表示精度で形状を保持できません。変更していません。');
  };
  const bounds = previous.reduce(
    (result, position) => {
      for (let axis = 0; axis < 3; axis++) {
        result.min[axis] = Math.min(result.min[axis], position[axis]);
        result.max[axis] = Math.max(result.max[axis], position[axis]);
      }
      return result;
    },
    { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
  );
  const extents = bounds.max.map((value, axis) => value - bounds.min[axis]);
  const positive = extents.filter((value) => value > 0);
  // Flat axes still permit Float32 rounding for ordinary off-plane pivot movement.
  const flatExtent = positive.length ? Math.min(...positive) : 0;
  const oldPositions = previous.map((position) => position.map(Math.fround) as Vec3);
  const newPositions = mesh.vertices.map((vertex) => vertex.position.map(Math.fround) as Vec3);
  if (
    newPositions.some((position, index) =>
      position.some(
        (value, axis) =>
          !Number.isFinite(value) ||
          !Number.isFinite(oldPositions[index][axis]) ||
          Math.abs(value + offset[axis] - oldPositions[index][axis]) >
            1e-6 * (extents[axis] || flatExtent),
      ),
    )
  )
    fail();
  const vertices = new Map(mesh.vertices.map((vertex, index) => [vertex.id, index]));
  const subtract = (a: Vec3, b: Vec3): Vec3 => a.map((value, axis) => value - b[axis]) as Vec3;
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unchangedVector = (before: Vec3, after: Vec3) => {
    if (
      !before.every(Number.isFinite) ||
      !after.every(Number.isFinite) ||
      Math.hypot(...subtract(after, before)) > 1e-5 * Math.hypot(...before)
    )
      fail();
  };
  for (const face of mesh.faces) {
    const indices = face.vertexIds.map((id) => vertices.get(id)!);
    for (let corner = 0; corner < indices.length; corner++) {
      const a = indices[corner],
        b = indices[(corner + 1) % indices.length];
      unchangedVector(
        subtract(oldPositions[b], oldPositions[a]),
        subtract(newPositions[b], newPositions[a]),
      );
    }
    // Area and orientation catch thin triangles whose individual edges are all long.
    for (let corner = 1; corner + 1 < indices.length; corner++) {
      const [a, b, c] = [indices[0], indices[corner], indices[corner + 1]];
      unchangedVector(
        cross(
          subtract(oldPositions[b], oldPositions[a]),
          subtract(oldPositions[c], oldPositions[a]),
        ),
        cross(
          subtract(newPositions[b], newPositions[a]),
          subtract(newPositions[c], newPositions[a]),
        ),
      );
    }
  }
}

/** Offset from the current local origin; geometry and descendants retain their world pose. */
export function relocatePivot(project: Project3D, nodeId: string, localOffset: Vec3): void {
  transaction(project, (candidate) => {
    if (localOffset.length !== 3 || !localOffset.every(Number.isFinite))
      throw new Error('pivot差分には有限のlocal座標を3つ指定してください。');
    const target = node(candidate, nodeId);
    assertStatic(candidate, [nodeId], target.parentId);
    const mesh = candidate.meshes.find((item) => item.id === target.meshId);
    if (mesh && candidate.nodes.filter((item) => item.meshId === mesh.id).length > 1)
      throw new Error('共有メッシュのpivotは変更できません。独立した複製を作成してください。');
    const oldWorld = worldMatrix(candidate, nodeId);
    const children = candidate.nodes.filter((item) => item.parentId === nodeId);
    const childWorlds = children.map((item) => worldMatrix(candidate, item.id));
    const localPositions = mesh?.vertices.map((vertex) => [...vertex.position] as Vec3);
    const points = mesh?.vertices.map((vertex) => transformPoint(oldWorld, vertex.position));
    target.transform.translation = transformPoint(composeTransform(target.transform), localOffset);
    const subtractOffset = (position: Vec3) =>
      position.map((value, axis) => value - localOffset[axis]) as Vec3;
    if (mesh) for (const vertex of mesh.vertices) vertex.position = subtractOffset(vertex.position);
    // Position buffers use Float32. Finite offsets can erase a small shape after rounding.
    if (mesh) assertPivotDisplayGeometry(mesh, localPositions!, localOffset);
    for (const child of children)
      child.transform.translation = subtractOffset(child.transform.translation);
    const nextWorld = worldMatrix(candidate, nodeId);
    if (
      children.some(
        (child, index) => !matricesMatch(childWorlds[index], worldMatrix(candidate, child.id)),
      ) ||
      mesh?.vertices.some((vertex, index) => {
        const after = transformPoint(nextWorld, vertex.position);
        return points![index].some(
          (value, axis) =>
            !Number.isFinite(after[axis]) ||
            Math.abs(value - after[axis]) > TRS_EPSILON * Math.max(1, Math.abs(value)),
        );
      })
    )
      throw new Error('数値精度の範囲でpivotと形状を保持できません。変更していません。');
  });
}

/** Independent leaf copy; reflection is baked around its local origin, never into node scale. */
export function mirrorNode(
  project: Project3D,
  nodeId: string,
  axis: MirrorAxis,
  copyPrefix: string,
): string {
  return transaction(project, (candidate) => {
    if (axis !== 'x' && axis !== 'y' && axis !== 'z')
      throw new Error('反転するlocal軸を選択してください。');
    const original = node(candidate, nodeId);
    if (original.meshId === undefined) throw new Error('反転するメッシュ部品を選択してください。');
    assertStatic(candidate, [nodeId], original.parentId);
    const copyId = cloneNode(candidate, nodeId, copyPrefix);
    const copy = node(candidate, copyId);
    copy.name = `${original.name} ${axis.toUpperCase()}反転`.slice(0, 4096);
    const mesh = candidate.meshes.find((item) => item.id === copy.meshId)!;
    const component = { x: 0, y: 1, z: 2 }[axis];
    const reflect = (value: Vec3): Vec3 =>
      value.map((entry, index) => (entry === 0 ? 0 : index === component ? -entry : entry)) as Vec3;
    for (const vertex of mesh.vertices) vertex.position = reflect(vertex.position);
    if (
      mesh.vertices.some((vertex) =>
        vertex.position.some((value) => !Number.isFinite(Math.fround(value))),
      )
    )
      throw new Error('反転する形状が表示可能な座標の範囲を超えます。');
    for (const face of mesh.faces) {
      face.vertexIds.reverse();
      face.uv?.reverse();
      if (face.normals) face.normals = face.normals.reverse().map(reflect);
    }
    return copyId;
  });
}
