import {
  cloneProject,
  validateProject,
  type Project3D,
  type Transform3D,
  type Material3D,
  type Vec3,
  type Quaternion,
} from '../model/project';
import { worldMatrix, transformPoint } from '../model/coordinates';

/** Intrinsic XYZ Euler angles, degrees; canonical storage remains a quaternion. */
export function rotationFromDegrees([x, y, z]: Vec3): Quaternion {
  if (![x, y, z].every(Number.isFinite)) throw new Error('回転角は有限の数値で入力してください。');
  const [a, b, c] = [x, y, z].map((value) => ((value % 360) * Math.PI) / 360);
  const [s1, s2, s3] = [Math.sin(a), Math.sin(b), Math.sin(c)];
  const [c1, c2, c3] = [Math.cos(a), Math.cos(b), Math.cos(c)];
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
export function rotationToDegrees([x, y, z, w]: Quaternion): Vec3 {
  const m13 = 2 * (x * z + y * w);
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  const rx =
    Math.abs(m13) < 0.9999999
      ? Math.atan2(-2 * (y * z - x * w), 1 - 2 * (x * x + y * y))
      : Math.atan2(2 * (y * z + x * w), 1 - 2 * (x * x + z * z));
  const rz =
    Math.abs(m13) < 0.9999999 ? Math.atan2(-2 * (x * y - z * w), 1 - 2 * (y * y + z * z)) : 0;
  return [rx, ry, rz].map((value) => (value * 180) / Math.PI) as Vec3;
}

function node(project: Project3D, id: string) {
  const found = project.nodes.find((item) => item.id === id);
  if (!found) throw new Error('対象オブジェクトがありません。選択し直してください。');
  return found;
}
function assertStatic(project: Project3D, nodeId: string) {
  const affected = new Set([nodeId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const item of project.nodes)
      if (item.parentId && affected.has(item.parentId) && !affected.has(item.id)) {
        affected.add(item.id);
        changed = true;
      }
  }
  const animationScope = new Set(affected);
  let parentId = node(project, nodeId).parentId;
  while (parentId !== null) {
    if (animationScope.has(parentId)) throw new Error('階層が循環しています。');
    animationScope.add(parentId);
    parentId = node(project, parentId).parentId;
  }
  if (
    project.skins.some(
      (skin) =>
        skin.joints.some((joint) => affected.has(joint.nodeId)) ||
        project.nodes.some((item) => affected.has(item.id) && item.meshId === skin.meshId),
    ) ||
    project.clips.some((clip) => clip.tracks.some((track) => animationScope.has(track.nodeId)))
  )
    throw new Error('リグ・アニメーション付きの変更は未対応です。元の作品を保持しています。');
}

/** Local TRS only. Candidate is committed once by ProjectHistory. */
export function setNodeTransform(project: Project3D, nodeId: string, transform: Transform3D) {
  node(project, nodeId);
  assertStatic(project, nodeId);
  if (
    transform.scale.some(
      (value) => Math.fround(value) === 0 || !Number.isFinite(Math.fround(1 / value)),
    )
  )
    throw new Error('倍率が表示精度で0になるか、法線の表示範囲を超えます。変更していません。');
  const candidate = cloneProject(project);
  node(candidate, nodeId).transform = structuredClone(transform);
  validateProject(candidate);
  assertFiniteAuthoringCoordinates(candidate);
  node(project, nodeId).transform = structuredClone(transform);
}

/** Display-coordinate guard for committed native authoring; no renderer dependency. */
export function assertFiniteAuthoringCoordinates(project: Project3D) {
  for (const item of project.nodes) {
    const matrix = worldMatrix(project, item.id);
    const finite = (value: number) => Number.isFinite(Math.fround(value));
    const inverseRepresentable = (values: number[]) => {
      const scale = Math.max(...values.map(Math.abs));
      if (!scale || !Number.isFinite(scale)) return false;
      const [a, b, c, d, e, f, g, h, i] = values.map((value) => value / scale);
      const cofactors = [
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
      const determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6];
      return determinant !== 0 && cofactors.every((value) => finite(value / determinant / scale));
    };
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
    if (
      !matrix.every(finite) ||
      !inverseRepresentable(linear) ||
      !inverseRepresentable(linear.map(Math.fround)) ||
      project.meshes
        .find((mesh) => mesh.id === item.meshId)
        ?.vertices.some((vertex) => !transformPoint(matrix, vertex.position).every(finite))
    )
      throw new Error('表示可能な座標の範囲を超えます。変更していません。');
  }
}

export function renameNode(project: Project3D, nodeId: string, name: string) {
  if (!name.trim() || name.length > 4096) throw new Error('名前は1〜4096文字で入力してください。');
  node(project, nodeId).name = name;
}

/** Independent mesh/material copy. Parent transform is retained, not baked. */
export function cloneNode(project: Project3D, nodeId: string, prefix: string): string {
  const original = node(project, nodeId);
  assertStatic(project, nodeId);
  if (project.nodes.some((item) => item.parentId === nodeId))
    throw new Error('階層全体の複製は未対応です。末端の部品を選んでください。');
  const candidate = cloneProject(project);
  const copy = structuredClone(original);
  copy.id = `${prefix}-node`;
  copy.name = `${original.name} コピー`.slice(0, 4096);
  if (original.meshId) {
    const source = project.meshes.find((mesh) => mesh.id === original.meshId)!;
    const mesh = structuredClone(source);
    mesh.id = `${prefix}-mesh`;
    const vertexIds = new Map(
      mesh.vertices.map((vertex, index) => [vertex.id, `${prefix}-v${index}`]),
    );
    mesh.vertices.forEach((vertex) => {
      vertex.id = vertexIds.get(vertex.id)!;
    });
    const materials = new Map<string, string>();
    mesh.faces.forEach((face, index) => {
      face.id = `${prefix}-f${index}`;
      face.vertexIds = face.vertexIds.map((id) => vertexIds.get(id)!);
      if (face.materialId) {
        let id = materials.get(face.materialId);
        if (!id) {
          id = `${prefix}-m${materials.size}`;
          candidate.materials.push({
            ...structuredClone(
              project.materials.find((material) => material.id === face.materialId)!,
            ),
            id,
          });
          materials.set(face.materialId, id);
        }
        face.materialId = id;
      }
    });
    candidate.meshes.push(mesh);
    copy.meshId = mesh.id;
  }
  candidate.nodes.push(copy);
  validateProject(candidate);
  project.nodes = candidate.nodes;
  project.meshes = candidate.meshes;
  project.materials = candidate.materials;
  return copy.id;
}

type Factors = Pick<Material3D, 'baseColor' | 'metallic' | 'roughness'>;
/** Updating a shared material is explicit in the UI. Optional copy affects one mesh. */
export function updateMaterial(
  project: Project3D,
  materialId: string,
  factors: Factors,
  copyForMeshId?: string,
) {
  const material = project.materials.find((item) => item.id === materialId);
  if (!material) throw new Error('対象の材質がありません。');
  if (
    [...factors.baseColor, factors.metallic, factors.roughness].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    ) ||
    factors.baseColor.length !== 4
  )
    throw new Error('材質の数値は0〜1で入力してください。');
  if (copyForMeshId) {
    const mesh = project.meshes.find((item) => item.id === copyForMeshId);
    if (!mesh || !mesh.faces.some((face) => face.materialId === materialId))
      throw new Error('対象の面に材質がありません。');
    if (project.nodes.filter((item) => item.meshId === mesh.id).length > 1)
      throw new Error('共有meshです。先に部品を複製してください。');
    const id = crypto.randomUUID();
    project.materials.push({ ...structuredClone(material), ...structuredClone(factors), id });
    mesh.faces.forEach((face) => {
      if (face.materialId === materialId) face.materialId = id;
    });
  } else Object.assign(material, structuredClone(factors));
}
