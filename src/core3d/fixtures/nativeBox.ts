import { createProject, identityTransform, type Project3D, type Vec3 } from '../model/project';

/** Original CC0 finite native test data. No importer, decoder or external asset. */
export function nativeBox(id = 'native-box'): Project3D {
  const project = createProject(id, 'Native box');
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
  const triangles = [
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
  project.nodes = [
    {
      id: 'box-node',
      name: 'Box',
      parentId: null,
      transform: identityTransform(),
      meshId: 'box-mesh',
    },
  ];
  project.meshes = [
    {
      id: 'box-mesh',
      vertices: positions.map((position, index) => ({ id: `v${index}`, position })),
      faces: triangles.map((vertices, index) => ({
        id: `f${index}`,
        vertexIds: vertices.map((vertex) => `v${vertex}`),
        materialId: 'green',
      })),
    },
  ];
  project.materials = [
    { id: 'green', baseColor: [0.15, 0.7, 0.35, 1], metallic: 0, roughness: 0.65 },
  ];
  return project;
}
