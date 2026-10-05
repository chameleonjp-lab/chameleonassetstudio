import { assertMeshEditable } from '../model/editability';
import type { Mesh3D, Project3D, Vec3 } from '../model/project';

type Face = Mesh3D['faces'][number];
export type NormalMode = 'flat' | 'smooth';
export interface MeshEdge {
  /** Derived from stable vertex IDs, never a render-buffer index. */
  id: string;
  vertexIds: [string, string];
  faceIds: string[];
}

const ANGLE_EPSILON = 1e-12;
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function finiteVector(value: Vec3): void {
  if (value.length !== 3 || !value.every(Number.isFinite))
    throw new Error('座標には有限の数値を3つ指定してください。');
}

function renderablePosition(value: Vec3): void {
  finiteVector(value);
  if (!value.every((component) => Number.isFinite(Math.fround(component))))
    throw new Error('座標が3D表示で扱える数値範囲を超えています。');
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  const result: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  finiteVector(result);
  return result;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(vector: Vec3): Vec3 {
  finiteVector(vector);
  // Scale before normalization so finite tiny/large shapes do not under/overflow.
  const scale = Math.max(...vector.map(Math.abs));
  if (scale === 0) throw new Error('長さが0の辺や面は編集できません。');
  const scaled = vector.map((value) => value / scale) as Vec3;
  const length = Math.hypot(...scaled);
  return scaled.map((value) => value / length) as Vec3;
}

function triangleNormal(points: Vec3[]): Vec3 {
  const normal = cross(unit(subtract(points[1], points[0])), unit(subtract(points[2], points[0])));
  if (Math.hypot(...normal) <= ANGLE_EPSILON)
    throw new Error('面が退化しています。面積のある三角形に修正してください。');
  return unit(normal);
}

function requireTriangles(mesh: Mesh3D): void {
  if (mesh.faces.some((face) => face.vertexIds.length !== 3))
    throw new Error('この編集は三角形メッシュに対応しています。');
}

function editableMesh(project: Project3D, meshId: string, changesShape: boolean): Mesh3D {
  assertMeshEditable(project, meshId);
  const mesh = project.meshes.find((item) => item.id === meshId);
  if (!mesh) throw new Error('編集するメッシュが見つかりません。');
  if (project.nodes.filter((node) => node.meshId === meshId).length > 1)
    throw new Error('共有メッシュは直接編集できません。独立した複製を作成してください。');
  if (changesShape && project.skins.some((skin) => skin.meshId === meshId))
    throw new Error('bind済みメッシュの形状は変更できません。未bindの複製で編集してください。');
  if (changesShape) {
    const instanceAncestors = new Set<string>();
    for (const instance of project.nodes.filter((node) => node.meshId === meshId)) {
      let node: typeof instance | undefined = instance;
      while (node && !instanceAncestors.has(node.id)) {
        instanceAncestors.add(node.id);
        node = project.nodes.find((item) => item.id === node!.parentId);
      }
    }
    if (
      project.clips.some((clip) => clip.tracks.some((track) => instanceAncestors.has(track.nodeId)))
    )
      throw new Error(
        'アニメーション対象の形状は変更できません。clipのない独立した複製で編集してください。',
      );
  }
  requireTriangles(mesh);
  return structuredClone(mesh);
}

function selectedIds(ids: readonly string[], available: readonly { id: string }[]): Set<string> {
  const selection = new Set(ids);
  const existing = new Set(available.map((item) => item.id));
  if (selection.size === 0 || [...selection].some((id) => !existing.has(id)))
    throw new Error('有効な編集対象を選択してください。');
  return selection;
}

function replaceMesh(project: Project3D, mesh: Mesh3D): void {
  project.meshes[project.meshes.findIndex((item) => item.id === mesh.id)] = mesh;
}

function rebuildNormals(mesh: Mesh3D, mode: NormalMode): void {
  if (mode !== 'flat' && mode !== 'smooth') throw new Error('法線の方式を選択してください。');
  mesh.vertices.forEach((vertex) => renderablePosition(vertex.position));
  const vertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
  const triangles = mesh.faces.map((face) => {
    const points = face.vertexIds.map((id) => {
      const point = vertices.get(id);
      if (!point) throw new Error('面が存在しない頂点を参照しています。');
      return point;
    });
    // The native renderer uses Float32 positions. Refuse a triangle that collapses there.
    triangleNormal(points.map((point) => point.map(Math.fround) as Vec3));
    return { face, points, normal: triangleNormal(points) };
  });
  if (mode === 'flat') {
    for (const { face, normal } of triangles) face.normals = face.vertexIds.map(() => [...normal]);
    return;
  }
  // Angle-weighted by stable vertex ID: UV/material seams stay in corner attributes.
  const sums = new Map<string, { normal: Vec3; weight: number }>();
  for (const { face, points, normal } of triangles) {
    face.vertexIds.forEach((id, index) => {
      const a = unit(subtract(points[(index + 1) % 3], points[index]));
      const b = unit(subtract(points[(index + 2) % 3], points[index]));
      const angle = Math.atan2(Math.hypot(...cross(a, b)), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
      const sum = sums.get(id) ?? { normal: [0, 0, 0], weight: 0 };
      for (let axis = 0; axis < 3; axis++) sum.normal[axis] += normal[axis] * angle;
      sum.weight += angle;
      sums.set(id, sum);
    });
  }
  const normals = new Map<string, Vec3>();
  for (const [id, sum] of sums) {
    if (Math.hypot(...sum.normal) <= ANGLE_EPSILON * sum.weight)
      throw new Error('逆向きの面で法線が相殺されます。flatを選ぶか面の向きを修正してください。');
    normals.set(id, unit(sum.normal));
  }
  for (const face of mesh.faces) face.normals = face.vertexIds.map((id) => [...normals.get(id)!]);
}

/** Read-only, deterministic edges; faceIds also expose boundary/non-manifold incidence. */
export function listMeshEdges(mesh: Mesh3D): MeshEdge[] {
  const edges = new Map<string, MeshEdge>();
  for (const face of mesh.faces) {
    face.vertexIds.forEach((vertexId, index) => {
      const pair = [vertexId, face.vertexIds[(index + 1) % face.vertexIds.length]].sort(
        compareIds,
      ) as [string, string];
      const id = pair.join(':');
      const edge = edges.get(id) ?? { id, vertexIds: pair, faceIds: [] };
      edge.faceIds.push(face.id);
      edges.set(id, edge);
    });
  }
  return [...edges.values()]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((edge) => ({ ...edge, faceIds: edge.faceIds.sort(compareIds) }));
}

/** Local-space movement. All shape edits rebuild flat normals; UI must state this policy. */
export function moveVertices(
  project: Project3D,
  meshId: string,
  vertexIds: readonly string[],
  delta: Vec3,
): void {
  finiteVector(delta);
  const mesh = editableMesh(project, meshId, true);
  const selection = selectedIds(vertexIds, mesh.vertices);
  for (const vertex of mesh.vertices) {
    if (!selection.has(vertex.id)) continue;
    vertex.position = vertex.position.map((value, axis) => value + delta[axis]) as Vec3;
    finiteVector(vertex.position);
  }
  rebuildNormals(mesh, 'flat');
  replaceMesh(project, mesh);
}

/**
 * Replace one triangle by a translated cap and six side triangles, leaving an open base.
 * Cap UVs/material survive; each side quad gets its own [0,1] UV square. Signed distance
 * follows the local winding normal. Returns the fresh cap ID for session selection.
 */
export function extrudeFace(
  project: Project3D,
  meshId: string,
  faceId: string,
  distance: number,
  newIdPrefix: string,
): string {
  if (!Number.isFinite(distance) || distance === 0)
    throw new Error('押出し距離には0以外の有限の数値を指定してください。');
  const mesh = editableMesh(project, meshId, true);
  const face = mesh.faces.find((item) => item.id === faceId);
  if (!face) throw new Error('押し出す面を選択してください。');
  const edges = listMeshEdges(mesh).filter((edge) => edge.faceIds.includes(faceId));
  const faces = new Map(mesh.faces.map((item) => [item.id, item]));
  for (const edge of edges) {
    if (edge.faceIds.length > 2) throw new Error('3面以上が共有する辺は押し出せません。');
    const neighborId = edge.faceIds.find((id) => id !== faceId);
    if (!neighborId) continue;
    const neighbor = faces.get(neighborId)!;
    const [a, b] = edge.vertexIds;
    const follows = (item: Face) => item.vertexIds[(item.vertexIds.indexOf(a) + 1) % 3] === b;
    if (follows(face) === follows(neighbor))
      throw new Error('隣り合う面の向きが一致しません。面の向きを修正してください。');
  }
  const vertexIds = [0, 1, 2].map((index) => `${newIdPrefix}-v${index}`);
  const capId = `${newIdPrefix}-cap`;
  const sideIds = [0, 1, 2].flatMap((index) => [
    `${newIdPrefix}-side${index}a`,
    `${newIdPrefix}-side${index}b`,
  ]);
  const existing = new Set([...mesh.vertices, ...mesh.faces].map((item) => item.id));
  const newIds = [...vertexIds, capId, ...sideIds];
  if (newIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) || existing.has(id)))
    throw new Error('押出しには重複しない有効な新規IDが必要です。');
  const positions = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
  const points = face.vertexIds.map((id) => positions.get(id)!);
  const normal = triangleNormal(points);
  mesh.vertices.push(
    ...points.map((point, index) => {
      const position = point.map((value, axis) => value + normal[axis] * distance) as Vec3;
      finiteVector(position);
      return { id: vertexIds[index], position };
    }),
  );
  const cap: Face = { ...face, id: capId, vertexIds };
  const sides: Face[] = [];
  for (let index = 0; index < 3; index++) {
    const next = (index + 1) % 3;
    const a = face.vertexIds[index],
      b = face.vertexIds[next];
    const newA = vertexIds[index],
      newB = vertexIds[next];
    const material = face.materialId === undefined ? {} : { materialId: face.materialId };
    sides.push(
      {
        id: sideIds[index * 2],
        vertexIds: [a, b, newB],
        uv: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        ...material,
      },
      {
        id: sideIds[index * 2 + 1],
        vertexIds: [a, newB, newA],
        uv: [
          [0, 0],
          [1, 1],
          [0, 1],
        ],
        ...material,
      },
    );
  }
  mesh.faces = mesh.faces.flatMap((item) => (item.id === faceId ? [cap, ...sides] : [item]));
  rebuildNormals(mesh, 'flat');
  replaceMesh(project, mesh);
  return capId;
}

/** Open surfaces and an empty mesh are valid. Retain orphan vertex IDs for further edits. */
export function deleteFaces(project: Project3D, meshId: string, faceIds: readonly string[]): void {
  const mesh = editableMesh(project, meshId, true);
  const selection = selectedIds(faceIds, mesh.faces);
  mesh.faces = mesh.faces.filter((face) => !selection.has(face.id));
  rebuildNormals(mesh, 'flat');
  replaceMesh(project, mesh);
}

/** Normal-only edits keep positions/topology, UV seams, materials, skin and clips intact. */
export function recalculateNormals(project: Project3D, meshId: string, mode: NormalMode): void {
  const mesh = editableMesh(project, meshId, false);
  rebuildNormals(mesh, mode);
  replaceMesh(project, mesh);
}
