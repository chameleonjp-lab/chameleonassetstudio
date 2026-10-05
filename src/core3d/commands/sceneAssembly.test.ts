import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../backup/backup';
import { composeTransform, transformPoint, worldMatrix } from '../model/coordinates';
import {
  createProject,
  identityTransform,
  validateProject,
  type Mesh3D,
  type Project3D,
  type Vec3,
} from '../model/project';
import { smallProject } from '../fixtures/project';
import { ProjectHistory } from './history';
import { rotationFromDegrees } from './objectEditing';
import { addPrimitive } from './primitives';
import {
  groupNodes,
  mirrorNode,
  relocatePivot,
  reparentNodes,
  ungroupNode,
  type MirrorAxis,
} from './sceneAssembly';

function fixture(): Project3D {
  const project = createProject('assembly');
  for (const prefix of ['a', 'b'])
    addPrimitive(project, prefix, {
      kind: 'box',
      width: 2,
      height: 3,
      depth: 4,
      segments: 1,
    });
  project.nodes[0].transform.translation = [1, 2, 3];
  project.nodes[1].transform.translation = [-3, 1, 4];
  return project;
}
function addParent(project: Project3D, id: string, parentId: string | null = null) {
  const result = { id, name: id, parentId, transform: identityTransform() };
  project.nodes.push(result);
  return result;
}
function close(actual: number[], expected: number[], digits = 9) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
}
function points(project: Project3D, nodeId: string): Vec3[] {
  const target = project.nodes.find((item) => item.id === nodeId)!;
  const matrix = worldMatrix(project, nodeId);
  return project.meshes
    .find((item) => item.id === target.meshId)!
    .vertices.map((v) => transformPoint(matrix, v.position));
}
function expectUnchanged(project: Project3D, operation: () => unknown, message?: RegExp) {
  const original = structuredClone(project);
  expect(operation).toThrow(message);
  expect(project).toEqual(original);
}
function faceNormal(mesh: Mesh3D, face: Mesh3D['faces'][number]): Vec3 {
  const [a, b, c] = face.vertexIds.map((id) => mesh.vertices.find((v) => v.id === id)!.position);
  const ab = b.map((value, axis) => value - a[axis]);
  const ac = c.map((value, axis) => value - a[axis]);
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return normal.map((value) => value / Math.hypot(...normal)) as Vec3;
}

describe('native hierarchy assembly', () => {
  it('groups sibling subtrees and ungroups them without changing world pose or stable references', () => {
    const project = fixture();
    const parent = addParent(project, 'parent');
    parent.transform = {
      translation: [4, -3, 2],
      rotation: rotationFromDegrees([20, 30, 40]),
      scale: [-2, 3, 4],
    };
    project.nodes.slice(0, 2).forEach((item) => {
      item.parentId = 'parent';
    });
    const descendant = addParent(project, 'descendant', 'a-node');
    descendant.transform.translation = [3, 2, 1];
    const before = new Map(project.nodes.map((item) => [item.id, worldMatrix(project, item.id)]));
    const meshes = structuredClone(project.meshes);
    expect(
      groupNodes(project, ['a-node', 'b-node'], 'group', 'parent', 'keep-world', '柱の組立'),
    ).toBe('group');
    expect(project.nodes.at(-1)).toEqual({
      id: 'group',
      name: '柱の組立',
      parentId: 'parent',
      transform: identityTransform(),
    });
    expect(project.nodes.slice(0, 2).map((item) => item.parentId)).toEqual(['group', 'group']);
    for (const [id, matrix] of before) close(worldMatrix(project, id), matrix);
    expect(project.meshes).toEqual(meshes);
    expect(ungroupNode(project, 'group', 'keep-world')).toEqual(['a-node', 'b-node']);
    expect(project.nodes.some((item) => item.id === 'group')).toBe(false);
    for (const [id, matrix] of before) close(worldMatrix(project, id), matrix);
    validateProject(project);
  });

  it('groups selections from distinct parent branches under an explicit parent', () => {
    const project = fixture();
    addParent(project, 'first').transform.translation = [10, 0, 0];
    addParent(project, 'second').transform.translation = [0, 20, 0];
    project.nodes[0].parentId = 'first';
    project.nodes[1].parentId = 'second';
    const before = ['a-node', 'b-node'].map((id) => worldMatrix(project, id));
    groupNodes(project, ['a-node', 'b-node'], 'group', 'second', 'keep-world');
    ['a-node', 'b-node'].forEach((id, index) => close(worldMatrix(project, id), before[index]));
  });

  it('keeps local values exactly when requested and visibly changes world coordinates', () => {
    const project = fixture();
    addParent(project, 'parent').transform.translation = [10, 20, 30];
    const original = structuredClone(project.nodes[0].transform);
    reparentNodes(project, ['a-node'], 'parent', 'keep-local');
    expect(project.nodes[0].transform).toEqual(original);
    close(worldMatrix(project, 'a-node').slice(12, 15), [11, 22, 33]);
    groupNodes(project, ['a-node'], 'group', null, 'keep-local');
    expect(project.nodes[0].transform).toEqual(original);
    project.nodes.find((item) => item.id === 'group')!.transform.translation = [1, 1, 1];
    ungroupNode(project, 'group', 'keep-local');
    expect(project.nodes[0].transform).toEqual(original);
    close(worldMatrix(project, 'a-node').slice(12, 15), [1, 2, 3]);
  });

  it.each<Vec3>([
    [25, 40, -15],
    [180, 0, 0],
    [0, 180, 0],
    [0, 0, 180],
  ])('preserves world TRS and descendants for negative scales and rotation %s', (x, y, z) => {
    const project = fixture();
    const parent = addParent(project, 'parent');
    parent.transform = {
      translation: [5, 7, -11],
      rotation: rotationFromDegrees([x, y, z]),
      scale: [-2, 2, 2],
    };
    project.nodes[0].transform.rotation = rotationFromDegrees([35, -15, 42]);
    project.nodes[0].transform.scale = [2, -3, 4];
    addParent(project, 'child', 'a-node').transform.translation = [2, 1, -4];
    const before = worldMatrix(project, 'a-node');
    const childBefore = worldMatrix(project, 'child');
    reparentNodes(project, ['a-node'], 'parent', 'keep-world');
    close(worldMatrix(project, 'a-node'), before);
    close(worldMatrix(project, 'child'), childBefore);
    expect(Math.hypot(...project.nodes[0].transform.rotation)).toBeCloseTo(1, 12);
    reparentNodes(project, ['a-node'], null, 'keep-world');
    close(worldMatrix(project, 'a-node'), before);
    close(worldMatrix(project, 'child'), childBefore);
  });

  it('rejects nonuniform rotated-parent shear atomically across a multi-selection', () => {
    const project = fixture();
    addParent(project, 'parent').transform = {
      ...identityTransform(),
      rotation: rotationFromDegrees([0, 0, 35]),
      scale: [2, 1, 3],
    };
    project.nodes[0].parentId = 'parent'; // First target could be kept untouched.
    expectUnchanged(
      project,
      () => reparentNodes(project, ['a-node', 'b-node'], 'parent', 'keep-world'),
      /shear/,
    );
    expectUnchanged(
      project,
      () => groupNodes(project, ['a-node', 'b-node'], 'new-group', 'parent', 'keep-world'),
      /shear/,
    );
    reparentNodes(project, ['b-node'], 'parent', 'keep-local');
    expect(project.nodes[1].parentId).toBe('parent');
  });

  it('refuses ungrouping when the resulting local transform would need shear', () => {
    const project = fixture();
    const parent = addParent(project, 'parent');
    parent.transform.scale = [2, 1, 3];
    project.nodes[0].parentId = 'parent';
    project.nodes[0].transform.rotation = rotationFromDegrees([0, 0, 35]);
    expectUnchanged(project, () => ungroupNode(project, 'parent', 'keep-world'), /shear/);
  });

  it('rejects cycles, overlapping or invalid selections, missing parents, and duplicate group IDs', () => {
    const project = fixture();
    addParent(project, 'child', 'a-node');
    for (const parentId of ['a-node', 'child', 'missing'])
      expectUnchanged(project, () => reparentNodes(project, ['a-node'], parentId, 'keep-world'));
    for (const ids of [[], ['a-node', 'a-node'], ['missing'], ['a-node', 'child']]) {
      expectUnchanged(project, () => reparentNodes(project, ids, null, 'keep-local'));
      expectUnchanged(project, () => groupNodes(project, ids, 'group', null, 'keep-world'));
    }
    expectUnchanged(project, () => groupNodes(project, ['a-node'], 'a-node', null, 'keep-local'));
    expectUnchanged(project, () => groupNodes(project, ['a-node'], 'group', 'child', 'keep-local'));
    expectUnchanged(project, () => ungroupNode(project, 'a-node', 'keep-world'));
    expectUnchanged(project, () =>
      reparentNodes(project, ['b-node'], null, 'unknown' as 'keep-world'),
    );
    expectUnchanged(project, () =>
      groupNodes(project, ['b-node'], 'group', null, 'keep-world', ' '),
    );
  });

  it.each([0, 1e-50, 1e50])(
    'refuses a non-renderable parent scale %s without committing',
    (scale) => {
      const project = fixture();
      addParent(project, 'parent').transform.scale = [scale, 1, 1];
      expectUnchanged(project, () => reparentNodes(project, ['a-node'], 'parent', 'keep-world'));
      expectUnchanged(project, () => reparentNodes(project, ['a-node'], 'parent', 'keep-local'));
    },
  );

  it('preserves shared mesh ownership during hierarchy-only changes', () => {
    const project = fixture();
    project.nodes[1].meshId = project.nodes[0].meshId;
    const before = structuredClone(project.meshes);
    groupNodes(project, ['a-node', 'b-node'], 'group', null, 'keep-world');
    expect(project.nodes[0].meshId).toBe(project.nodes[1].meshId);
    expect(project.meshes).toEqual(before);
    expect(ungroupNode(project, 'group', 'keep-world')).toEqual(['a-node', 'b-node']);
  });

  it('does not let a large world X hide lost Y translation during keep-world reparenting', () => {
    const project = fixture();
    project.nodes[0].transform.translation = [1e8, 0.001, 0];
    addParent(project, 'parent').transform.translation = [0, 1e14, 0];
    expectUnchanged(
      project,
      () => reparentNodes(project, ['a-node'], 'parent', 'keep-world'),
      /数値精度/,
    );
    expectUnchanged(
      project,
      () => groupNodes(project, ['a-node'], 'group', 'parent', 'keep-world'),
      /数値精度/,
    );
  });
});

describe('native pivot relocation', () => {
  it('retains world geometry, child matrices, corner attributes, and IDs with rotated nonuniform ancestors', () => {
    const project = fixture();
    const parent = addParent(project, 'parent');
    parent.transform = {
      translation: [7, -1, 9],
      rotation: rotationFromDegrees([10, -25, 40]),
      scale: [-2, 3, 0.5],
    };
    project.nodes[0].parentId = 'parent';
    project.nodes[0].transform.rotation = rotationFromDegrees([15, 20, 30]);
    project.nodes[0].transform.scale = [2, -3, 4];
    project.nodes[1].parentId = 'a-node';
    addParent(project, 'descendant', 'b-node').transform.translation = [1, 2, 3];
    const before = points(project, 'a-node');
    const childWorld = worldMatrix(project, 'b-node');
    const descendantWorld = worldMatrix(project, 'descendant');
    const faces = structuredClone(project.meshes[0].faces);
    const vertices = structuredClone(project.meshes[0].vertices);
    const offset: Vec3 = [0.25, -0.5, 1];
    const desiredOrigin = transformPoint(worldMatrix(project, 'a-node'), offset);
    relocatePivot(project, 'a-node', offset);
    points(project, 'a-node').forEach((position, index) => close(position, before[index]));
    close(worldMatrix(project, 'a-node').slice(12, 15), desiredOrigin);
    close(worldMatrix(project, 'b-node'), childWorld);
    close(worldMatrix(project, 'descendant'), descendantWorld);
    expect(project.meshes[0].faces).toEqual(faces);
    expect(project.meshes[0].vertices.map((v) => v.id)).toEqual(vertices.map((v) => v.id));
    project.meshes[0].vertices.forEach((v, index) =>
      close(
        v.position,
        vertices[index].position.map((value, axis) => value - offset[axis]),
      ),
    );
    validateProject(project);
  });

  it('relocates a meshless group origin while retaining each child and descendant pose', () => {
    const project = fixture();
    groupNodes(project, ['a-node', 'b-node'], 'group', null, 'keep-world');
    const group = project.nodes.find((item) => item.id === 'group')!;
    group.transform = {
      translation: [4, 2, 1],
      rotation: rotationFromDegrees([20, 30, -40]),
      scale: [-2, 3, 4],
    };
    const before = project.nodes.slice(0, 2).map((item) => worldMatrix(project, item.id));
    const meshes = structuredClone(project.meshes);
    relocatePivot(project, 'group', [1, 2, 3]);
    project.nodes
      .slice(0, 2)
      .forEach((item, index) => close(worldMatrix(project, item.id), before[index]));
    expect(project.meshes).toEqual(meshes);
  });

  it('rejects shared meshes and invalid or precision-destroying offsets atomically', () => {
    const project = fixture();
    for (const offset of [
      [NaN, 0, 0],
      [Infinity, 0, 0],
      [1e8, 0, 0],
      [1e30, 0, 0],
    ] as Vec3[])
      expectUnchanged(project, () => relocatePivot(project, 'a-node', offset));
    project.nodes[1].meshId = project.nodes[0].meshId;
    expectUnchanged(project, () => relocatePivot(project, 'a-node', [1, 2, 3]), /共有/);
  });

  it('checks display precision against shape extent even when its local center is far from zero', () => {
    const project = fixture();
    for (const vertex of project.meshes[0].vertices) vertex.position[0] += 1e6;
    expectUnchanged(project, () => relocatePivot(project, 'a-node', [1e8, 0, 0]), /表示精度/);
    relocatePivot(project, 'a-node', [1, 0, 0]);
    validateProject(project);
  });

  it('rejects thin-axis collapse independently of a much taller axis', () => {
    const project = createProject('thin-pivot');
    addPrimitive(project, 'thin', {
      kind: 'box',
      width: 0.001,
      height: 1000,
      depth: 1,
      segments: 1,
    });
    expectUnchanged(project, () => relocatePivot(project, 'thin-node', [100000, 0, 0]), /表示精度/);
    const history = new ProjectHistory(project);
    expect(() => history.execute((p) => relocatePivot(p, 'thin-node', [100000, 0, 0]))).toThrow(
      /表示精度/,
    );
    expect(history.project).toEqual(project);
    expect(history.canUndo).toBe(false);
  });

  it('preserves small face details even when all mesh-axis extents are large', () => {
    const project = createProject('small-detail');
    addPrimitive(project, 'shape', {
      kind: 'plane',
      width: 1000,
      height: 1,
      depth: 1000,
      segments: 1,
    });
    const mesh = project.meshes[0];
    mesh.vertices.push(
      { id: 'detail-a', position: [0, 0, 0] },
      { id: 'detail-b', position: [500, 0, 0.0005] },
      { id: 'detail-c', position: [1000, 0, 0] },
    );
    mesh.faces.push({ id: 'detail-face', vertexIds: ['detail-a', 'detail-b', 'detail-c'] });
    expectUnchanged(
      project,
      () => relocatePivot(project, 'shape-node', [0, 0, 100000]),
      /表示精度/,
    );
  });

  it('allows an ordinary off-plane pivot without requiring an exact-zero rounding residual', () => {
    const project = createProject('plane-pivot');
    addPrimitive(project, 'plane', { kind: 'plane', width: 2, height: 1, depth: 3, segments: 2 });
    const before = points(project, 'plane-node');
    const faces = structuredClone(project.meshes[0].faces);
    relocatePivot(project, 'plane-node', [0.1, 0.3, -0.2]);
    points(project, 'plane-node').forEach((position, index) => close(position, before[index]));
    expect(project.meshes[0].faces).toEqual(faces);
    expect(project.nodes[0].transform.translation).toEqual([0.1, 0.3, -0.2]);
    validateProject(project);
  });

  it('does not let a large parent X hide lost child Y translation during meshless pivot relocation', () => {
    const project = createProject('child-pivot');
    addPrimitive(project, 'tiny', {
      kind: 'box',
      width: 0.0001,
      height: 0.0001,
      depth: 0.0001,
      segments: 1,
    });
    const group = addParent(project, 'group');
    group.transform.translation = [1e8, 0, 0];
    project.nodes[0].parentId = 'group';
    project.nodes[0].transform.translation = [0, 0.001, 0];
    expectUnchanged(project, () => relocatePivot(project, 'group', [0, 1e14, 0]), /数値精度/);
  });
});

describe('independent baked mirror', () => {
  it.each<MirrorAxis>(['x', 'y', 'z'])(
    'reflects %s positions and corner normals while preserving winding, UV seams, and material ownership',
    (axis) => {
      const project = fixture();
      addParent(project, 'parent').transform = {
        translation: [2, 3, 4],
        rotation: rotationFromDegrees([20, 10, 30]),
        scale: [-2, 3, 4],
      };
      project.nodes[0].parentId = 'parent';
      project.nodes[0].transform.scale = [-1, 2, 3];
      project.meshes[0].faces[1].materialId = project.meshes[1].faces[0].materialId;
      const original = structuredClone(project);
      const index = { x: 0, y: 1, z: 2 }[axis];
      const copyId = mirrorNode(project, 'a-node', axis, 'mirror');
      expect(copyId).toBe('mirror-node');
      expect(project.nodes.slice(0, 3)).toEqual(original.nodes);
      expect(project.meshes.slice(0, 2)).toEqual(original.meshes);
      expect(project.materials.slice(0, 2)).toEqual(original.materials);
      const copy = project.nodes.at(-1)!;
      expect(copy.parentId).toBe('parent');
      expect(copy.transform).toEqual(original.nodes[0].transform);
      const mesh = project.meshes.at(-1)!;
      const source = original.meshes[0];
      mesh.vertices.forEach((vertex, vertexIndex) => {
        expect(vertex.id).toBe(`mirror-v${vertexIndex}`);
        close(
          vertex.position,
          source.vertices[vertexIndex].position.map((value, axisIndex) =>
            axisIndex === index ? -value : value,
          ),
        );
      });
      mesh.faces.forEach((face, faceIndex) => {
        expect(face.id).toBe(`mirror-f${faceIndex}`);
        expect(face.uv).toEqual([...source.faces[faceIndex].uv!].reverse());
        expect(face.vertexIds).toEqual(
          [...source.faces[faceIndex].vertexIds]
            .reverse()
            .map((id) => `mirror-v${source.vertices.findIndex((v) => v.id === id)}`),
        );
        const normal = faceNormal(mesh, face);
        face.normals!.forEach((corner) => close(corner, normal));
        expect(face.normals).toEqual(
          [...source.faces[faceIndex].normals!]
            .reverse()
            .map((value) =>
              value.map((component, axisIndex) =>
                component === 0 ? 0 : axisIndex === index ? -component : component,
              ),
            ),
        );
        expect(face.materialId).not.toBe(source.faces[faceIndex].materialId);
      });
      expect(new Set(mesh.faces.map((face) => face.materialId)).size).toBe(2);
      mesh.vertices[0].position[0] += 9;
      project.materials.at(-1)!.baseColor[0] = 0.9;
      expect(project.meshes[0]).toEqual(original.meshes[0]);
      expect(project.materials.slice(0, 2)).toEqual(original.materials);
      validateProject(project);
    },
  );

  it('supports unbound shared sources by making independent copies, and preserves missing attributes', () => {
    const project = fixture();
    project.nodes[1].meshId = project.nodes[0].meshId;
    delete project.meshes[0].faces[0].uv;
    delete project.meshes[0].faces[0].normals;
    const original = structuredClone(project.meshes[0]);
    mirrorNode(project, 'a-node', 'x', 'mirror');
    expect(project.meshes[0]).toEqual(original);
    expect(project.nodes.at(-1)!.meshId).not.toBe(project.nodes[0].meshId);
    expect(project.meshes.at(-1)!.faces[0].uv).toBeUndefined();
    expect(project.meshes.at(-1)!.faces[0].normals).toBeUndefined();
  });

  it('rejects non-leaves, meshless nodes, invalid axes, and ID collisions without partial copies', () => {
    const project = fixture();
    expectUnchanged(project, () => mirrorNode(project, 'a-node', 'x', 'a'));
    expectUnchanged(project, () => mirrorNode(project, 'a-node', '?' as MirrorAxis, 'mirror'));
    addParent(project, 'child', 'a-node');
    expectUnchanged(project, () => mirrorNode(project, 'a-node', 'x', 'mirror'));
    expectUnchanged(project, () => mirrorNode(project, 'child', 'x', 'mirror'));
  });
});

describe('scene assembly reference and transaction safety', () => {
  it('refuses bound meshes and joint scopes without clearing skin or clip references', () => {
    const project = smallProject();
    expectUnchanged(project, () => reparentNodes(project, ['shape'], 'joint-a', 'keep-local'));
    expectUnchanged(project, () => groupNodes(project, ['shape'], 'group', null, 'keep-world'));
    expectUnchanged(project, () => relocatePivot(project, 'shape', [1, 0, 0]));
    expectUnchanged(project, () => mirrorNode(project, 'shape', 'x', 'mirror'));
    expectUnchanged(project, () => ungroupNode(project, 'joint-a', 'keep-world'));
  });

  it.each(['a-node', 'parent', 'child', 'destination'])(
    'refuses affected animation tracks on %s while keeping unrelated clips valid',
    (animatedId) => {
      const project = fixture();
      addParent(project, 'parent');
      addParent(project, 'child', 'a-node');
      addParent(project, 'destination');
      project.nodes[0].parentId = 'parent';
      project.clips.push({
        id: 'clip',
        name: 'clip',
        duration: 1,
        loop: false,
        tracks: [
          {
            nodeId: animatedId,
            property: 'translation',
            interpolation: 'LINEAR',
            keys: [{ time: 0, value: [0, 0, 0] }],
          },
        ],
      });
      expectUnchanged(project, () =>
        reparentNodes(project, ['a-node'], 'destination', 'keep-world'),
      );
      expectUnchanged(project, () =>
        groupNodes(project, ['a-node'], 'group', 'destination', 'keep-local'),
      );
      if (animatedId !== 'destination')
        expectUnchanged(project, () => relocatePivot(project, 'a-node', [1, 0, 0]));
      reparentNodes(project, ['b-node'], null, 'keep-local');
      expect(project.clips[0].tracks[0].nodeId).toBe(animatedId);
    },
  );

  it('executes each command as one reversible revision, restores backup and allows further editing', async () => {
    const history = new ProjectHistory(fixture());
    const initial = history.project;
    const changes = [
      (p: Project3D) => groupNodes(p, ['a-node', 'b-node'], 'group', null, 'keep-world'),
      (p: Project3D) => relocatePivot(p, 'group', [1, 2, 3]),
      (p: Project3D) => relocatePivot(p, 'a-node', [0.5, 0, 0]),
      (p: Project3D) => mirrorNode(p, 'a-node', 'x', 'mirror'),
      (p: Project3D) => ungroupNode(p, 'group', 'keep-world'),
    ];
    changes.forEach((change, index) => {
      history.execute(change);
      expect(history.revision).toBe(index + 1);
    });
    const completed = history.project;
    changes.forEach(() => expect(history.undo()).toBe(true));
    expect({ ...history.project, revision: initial.revision }).toEqual(initial);
    changes.forEach(() => expect(history.redo()).toBe(true));
    expect({ ...history.project, revision: completed.revision }).toEqual(completed);
    const beforeFailure = history.project;
    expect(() =>
      history.execute((p) => reparentNodes(p, ['a-node'], 'a-node', 'keep-local')),
    ).toThrow();
    expect(history.project).toEqual(beforeFailure);
    const restored = await importBackup(await exportBackup(history.project, new Map()));
    expect(restored.project).toEqual(history.project);
    const recovered = new ProjectHistory(restored.project);
    recovered.execute((p) =>
      groupNodes(p, ['a-node', 'mirror-node'], 'restored-group', null, 'keep-world'),
    );
    expect(recovered.project.nodes.some((item) => item.id === 'restored-group')).toBe(true);
    expect(recovered.project.schemaVersion).toBe('0.2.0');
    close(
      composeTransform(recovered.project.nodes.at(-1)!.transform),
      composeTransform(identityTransform()),
    );
  });
});
