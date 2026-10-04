import { identityTransform, type Project3D, type Vec3 } from '../model/project';

/** One editable native primitive. The caller commits this mutation through ProjectHistory. */
export function addBox(project: Project3D, id: string): void {
  const nodeId = `${id}-node`,
    meshId = `${id}-mesh`,
    materialId = `${id}-material`;
  if (
    project.nodes.some((node) => node.id === nodeId) ||
    project.meshes.some((mesh) => mesh.id === meshId) ||
    project.materials.some((material) => material.id === materialId)
  )
    throw new Error('Box IDs already exist');
  const positions: Vec3[] = [
    [-0.5, -0.5, -0.5],
    [0.5, -0.5, -0.5],
    [0.5, 0.5, -0.5],
    [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [0.5, -0.5, 0.5],
    [0.5, 0.5, 0.5],
    [-0.5, 0.5, 0.5],
  ];
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [1, 2, 6],
    [1, 6, 5],
    [0, 4, 7],
    [0, 7, 3],
    [3, 7, 6],
    [3, 6, 2],
    [0, 1, 5],
    [0, 5, 4],
  ];
  project.materials.push({
    id: materialId,
    baseColor: [0.15, 0.7, 0.35, 1],
    metallic: 0,
    roughness: 0.65,
  });
  project.meshes.push({
    id: meshId,
    vertices: positions.map((position, index) => ({ id: `${id}-v${index}`, position })),
    faces: faces.map((indices, index) => ({
      id: `${id}-f${index}`,
      vertexIds: indices.map((vertex) => `${id}-v${vertex}`),
      uv: (index === 0
        ? [
            [1, 0],
            [0, 1],
            [0, 0],
          ]
        : index === 1
          ? [
              [1, 0],
              [1, 1],
              [0, 1],
            ]
          : index % 2 === 0
            ? [
                [0, 0],
                [1, 0],
                [1, 1],
              ]
            : [
                [0, 0],
                [1, 1],
                [0, 1],
              ]) as [number, number][],
      materialId,
    })),
  });
  project.nodes.push({
    id: nodeId,
    name: '箱',
    parentId: null,
    transform: identityTransform(),
    meshId,
  });
}
