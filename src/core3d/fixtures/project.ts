import { createProject, identityTransform, type Project3D } from '../model/project';
/** Hand-authored tiny triangle, two mixed joints, and two explicit TRS keys. CC0 test data. */
export function smallProject(): Project3D {
  const p = createProject('project-one', 'Tiny editable fixture');
  p.nodes = [
    {
      id: 'shape',
      name: 'Triangle',
      parentId: null,
      transform: identityTransform(),
      meshId: 'mesh-one',
    },
    { id: 'joint-a', name: 'A', parentId: null, transform: identityTransform() },
    { id: 'joint-b', name: 'B', parentId: 'joint-a', transform: identityTransform() },
  ];
  p.meshes = [
    {
      id: 'mesh-one',
      vertices: [
        { id: 'v0', position: [0, 0, 0] },
        { id: 'v1', position: [1, 0, 0] },
        { id: 'v2', position: [0, 1, 0] },
      ],
      faces: [
        {
          id: 'f0',
          vertexIds: ['v0', 'v1', 'v2'],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          materialId: 'mat',
        },
      ],
    },
  ];
  p.materials = [{ id: 'mat', baseColor: [0.2, 0.4, 0.6, 1], metallic: 0, roughness: 0.5 }];
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  p.skins = [
    {
      id: 'skin',
      meshId: 'mesh-one',
      joints: [
        { nodeId: 'joint-a', inverseBind: [...identity] },
        { nodeId: 'joint-b', inverseBind: [...identity] },
      ],
      weights: ['v0', 'v1', 'v2'].map((vertexId) => ({
        vertexId,
        jointIds: ['joint-a', 'joint-b'],
        values: [0.25, 0.75],
      })),
    },
  ];
  p.clips = [
    {
      id: 'clip',
      name: 'Move',
      duration: 1,
      loop: true,
      tracks: [
        {
          nodeId: 'joint-b',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [0, 1, 0] },
          ],
        },
      ],
    },
  ];
  return p;
}
