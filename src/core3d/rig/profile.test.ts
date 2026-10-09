import { describe, expect, it } from 'vitest';
import {
  identityTransform,
  type Mesh3D,
  type Node3D,
  type Skin3D,
  type Transform3D,
} from '../model/project';
import { restoreRestTransformsById, validateSkinProfile } from './profile';

const identityMatrix = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function fixture(
  jointCount = 2,
  vertexCount = 2,
): {
  nodes: Node3D[];
  mesh: Mesh3D;
  skin: Skin3D;
} {
  const nodes = Array.from({ length: jointCount }, (_, index) => ({
    id: `joint-${index}`,
    name: `Joint ${index}`,
    parentId: null,
    transform: identityTransform(),
  }));
  const mesh: Mesh3D = {
    id: 'mesh',
    vertices: Array.from({ length: vertexCount }, (_, index) => ({
      id: `v${index}`,
      position: [index, 0, 0],
    })),
    faces: [],
  };
  const influenceCount = Math.min(jointCount, 4);
  const skin: Skin3D = {
    id: 'skin',
    meshId: 'mesh',
    joints: nodes.map((node) => ({ nodeId: node.id, inverseBind: identityMatrix() })),
    weights: mesh.vertices.map((vertex) => ({
      vertexId: vertex.id,
      jointIds: nodes.slice(0, influenceCount).map((node) => node.id),
      values: Array.from({ length: influenceCount }, () => 1 / influenceCount),
    })),
  };
  return { nodes, mesh, skin };
}

describe('native skin profile validation', () => {
  it('accepts up to four normalized influences and preserves their original values', () => {
    const { nodes, mesh, skin } = fixture(4, 1);
    skin.weights[0].values = [0, 0.25, 0.25, 0.500005];
    const before = [...skin.weights[0].values];
    expect(() => validateSkinProfile(skin, mesh, nodes)).not.toThrow();
    expect(skin.weights[0].values).toEqual(before);
  });

  it('rejects five influences', () => {
    const { nodes, mesh, skin } = fixture(5, 1);
    skin.weights[0].jointIds = nodes.map((node) => node.id);
    skin.weights[0].values = Array.from({ length: 5 }, () => 0.2);
    expect(() => validateSkinProfile(skin, mesh, nodes)).toThrow('between 1 and 4');
  });

  it('rejects zero, negative, non-finite, duplicate, unknown, and unnormalized weights', () => {
    const cases: Array<{ ids: string[]; values: number[] }> = [
      { ids: ['joint-0', 'joint-1'], values: [0, 0] },
      { ids: ['joint-0', 'joint-1'], values: [-0.1, 1.1] },
      { ids: ['joint-0', 'joint-1'], values: [Number.NaN, 1] },
      { ids: ['joint-0', 'joint-1'], values: [Number.POSITIVE_INFINITY, 0] },
      { ids: ['joint-0', 'joint-0'], values: [0.5, 0.5] },
      { ids: ['joint-0', 'missing'], values: [0.5, 0.5] },
      { ids: ['joint-0', 'joint-1'], values: [0.4, 0.4] },
    ];
    for (const candidate of cases) {
      const { nodes, mesh, skin } = fixture();
      skin.weights[0].jointIds = candidate.ids;
      skin.weights[0].values = candidate.values;
      expect(() => validateSkinProfile(skin, mesh, nodes)).toThrow();
    }
  });

  it('rejects duplicate joint IDs and vertices without assignments', () => {
    const duplicateJoint = fixture();
    duplicateJoint.skin.joints[1].nodeId = duplicateJoint.skin.joints[0].nodeId;
    expect(() =>
      validateSkinProfile(duplicateJoint.skin, duplicateJoint.mesh, duplicateJoint.nodes),
    ).toThrow('Duplicate skin joint');

    const unassigned = fixture();
    unassigned.skin.weights.pop();
    expect(() => validateSkinProfile(unassigned.skin, unassigned.mesh, unassigned.nodes)).toThrow(
      'Every mesh vertex',
    );
  });

  it.each([
    ['non-affine', (matrix: number[]) => (matrix[3] = 0.25)],
    ['singular', (matrix: number[]) => (matrix[0] = 0)],
    ['non-finite', (matrix: number[]) => (matrix[0] = Number.NaN)],
    ['outside Float32 range', (matrix: number[]) => (matrix[12] = 1e300)],
  ])('rejects a %s inverse-bind matrix', (_label, alter) => {
    const { nodes, mesh, skin } = fixture();
    alter(skin.joints[0].inverseBind);
    expect(() => validateSkinProfile(skin, mesh, nodes)).toThrow();
  });

  it('restores saved local TRS by stable ID regardless of current array order', () => {
    const saved: Node3D[] = [
      {
        id: 'root',
        name: 'Root',
        parentId: null,
        transform: {
          translation: [1, 2, 3],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
      {
        id: 'tip',
        name: 'Tip',
        parentId: 'root',
        transform: {
          translation: [0, 1, 0],
          rotation: [0, 0, 0, 1],
          scale: [2, 2, 2],
        },
      },
    ];
    const current: Node3D[] = [
      { ...saved[1], transform: { ...saved[1].transform, translation: [9, 9, 9] } },
      { ...saved[0], transform: { ...saved[0].transform, scale: [3, 3, 3] } },
    ];
    const before = current.map((node) => ({ ...node, transform: { ...node.transform } }));

    const restored = restoreRestTransformsById(current, saved);
    expect(restored.map((node) => node.id)).toEqual(['tip', 'root']);
    expect(restored[0].transform).toEqual(saved[1].transform);
    expect(restored[1].transform).toEqual(saved[0].transform);
    expect(current).toEqual(before);
  });

  it('rejects missing or duplicate rest IDs instead of restoring by array index', () => {
    const saved = fixture().nodes;
    const current = [saved[0], { ...saved[1], id: 'unknown' }];
    expect(() => restoreRestTransformsById(current, saved)).toThrow('missing for node');
    expect(() => restoreRestTransformsById([saved[0], saved[0]], saved)).toThrow(
      'Current node IDs',
    );
  });

  it('rejects sparse saved TRS tuples', () => {
    const node = fixture(1, 1).nodes[0];
    const sparseTuple = (length: number, entries: Record<number, number>): number[] => {
      const tuple = new Array<number>(length);
      for (const [index, value] of Object.entries(entries)) tuple[Number(index)] = value;
      return tuple;
    };
    const sparseTuples = [
      { translation: sparseTuple(3, { 0: 1, 2: 3 }) },
      { rotation: sparseTuple(4, { 0: 0, 2: 0, 3: 1 }) },
      { scale: sparseTuple(3, { 0: 1, 2: 1 }) },
    ];

    for (const tuple of sparseTuples) {
      const malformed = {
        ...node,
        transform: { ...identityTransform(), ...tuple } as unknown as Transform3D,
      };
      expect(() => restoreRestTransformsById([node], [malformed])).toThrow('Saved rest node IDs');
    }
  });

  it('rejects saved rest rotations that are zero, non-normalized, or overflow normalization', () => {
    const node = fixture(1, 1).nodes[0];
    for (const rotation of [
      [0, 0, 0, 0],
      [0, 0, 0, 2],
      [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
    ]) {
      const malformed = {
        ...node,
        transform: { ...identityTransform(), rotation },
      } as unknown as Node3D;
      expect(() => restoreRestTransformsById([node], [malformed])).toThrow('Saved rest node IDs');
    }
  });

  it('preserves a saved rotation at the project quaternion tolerance boundary', () => {
    const node = fixture(1, 1).nodes[0];
    const rotation: [number, number, number, number] = [0, 0, 0, 1.000005];
    const saved = {
      ...node,
      transform: { ...identityTransform(), rotation },
    };
    const restored = restoreRestTransformsById([node], [saved]);
    expect(restored[0].transform.rotation).toEqual(rotation);
    expect(saved.transform.rotation).toEqual(rotation);

    const outsideRotation: [number, number, number, number] = [0, 0, 0, 1.00002];
    const outsideSaved = {
      ...node,
      transform: { ...identityTransform(), rotation: outsideRotation },
    };
    expect(() => restoreRestTransformsById([node], [outsideSaved])).toThrow('Saved rest node IDs');
    expect(outsideSaved.transform.rotation).toEqual(outsideRotation);
  });

  it('rejects sparse mesh vertex positions', () => {
    const { nodes, mesh, skin } = fixture(1, 1);
    const position = new Array<number>(3);
    position[0] = 1;
    position[2] = 3;
    mesh.vertices[0].position = position as unknown as Mesh3D['vertices'][number]['position'];
    expect(() => validateSkinProfile(skin, mesh, nodes)).toThrow('Invalid mesh vertex position');
  });

  it('rejects mesh positions and restored translations outside Float32 range', () => {
    const { nodes, mesh, skin } = fixture(1, 1);
    mesh.vertices[0].position = [1e300, 0, 0];
    expect(() => validateSkinProfile(skin, mesh, nodes)).toThrow('Invalid mesh vertex position');

    const node = fixture(1, 1).nodes[0];
    const saved = {
      ...node,
      transform: { ...identityTransform(), translation: [1e300, 0, 0] as [number, number, number] },
    };
    expect(() => restoreRestTransformsById([node], [saved])).toThrow('Saved rest node IDs');
  });
});
