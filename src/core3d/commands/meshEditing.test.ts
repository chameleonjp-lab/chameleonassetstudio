import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../backup/backup';
import {
  createProject,
  identityTransform,
  validateProject,
  type Project3D,
  type Vec3,
} from '../model/project';
import { ProjectHistory } from './history';
import {
  deleteFaces,
  extrudeFace,
  listMeshEdges,
  moveVertices,
  recalculateNormals,
} from './meshEditing';

/** Small authored crease, with different material and UV values on the shared edge. */
function fixture(): Project3D {
  const project = createProject('editing-fixture');
  project.nodes = [
    { id: 'shape', name: 'Crease', parentId: null, transform: identityTransform(), meshId: 'mesh' },
  ];
  project.meshes = [
    {
      id: 'mesh',
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [0, 1, 0] },
        { id: 'd', position: [0, 0, -1] },
      ],
      faces: [
        {
          id: 'front',
          vertexIds: ['a', 'b', 'c'],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          materialId: 'red',
        },
        {
          id: 'side',
          vertexIds: ['b', 'a', 'd'],
          uv: [
            [0.8, 0.2],
            [0.3, 0.4],
            [0.7, 0.9],
          ],
          materialId: 'blue',
        },
      ],
    },
  ];
  project.materials = [
    { id: 'red', baseColor: [1, 0, 0, 1], metallic: 0, roughness: 0.5 },
    { id: 'blue', baseColor: [0, 0, 1, 1], metallic: 0, roughness: 1 },
  ];
  return project;
}

function face(project: Project3D, id: string) {
  return project.meshes[0].faces.find((item) => item.id === id)!;
}

function expectNormal(actual: Vec3, expected: Vec3) {
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 12));
  expect(Math.hypot(...actual)).toBeCloseTo(1, 12);
}

function expectFiniteTriangles(project: Project3D) {
  validateProject(project);
  for (const mesh of project.meshes) {
    expect(mesh.vertices.every((vertex) => vertex.position.every(Number.isFinite))).toBe(true);
    for (const triangle of mesh.faces) {
      expect(triangle.vertexIds).toHaveLength(3);
      expect(triangle.normals).toHaveLength(3);
      for (const normal of triangle.normals!) {
        expect(normal.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
      }
    }
  }
}

function addClip(project: Project3D, nodeId: string) {
  project.clips.push({
    id: 'motion',
    name: 'Motion',
    duration: 1,
    loop: true,
    tracks: [
      {
        nodeId,
        property: 'translation',
        interpolation: 'LINEAR',
        keys: [
          { time: 0, value: [0, 0, 0] },
          { time: 1, value: [0, 1, 0] },
        ],
      },
    ],
  });
}

describe('native mesh commands', () => {
  it('moves stable selected vertex IDs once, preserving UV seams, materials and project identity', () => {
    const project = fixture();
    const before = structuredClone(project);
    moveVertices(project, 'mesh', ['a', 'b', 'a'], [0, 0, 0.25]);
    expect(project.meshes[0].vertices.map((vertex) => vertex.position)).toEqual([
      [0, 0, 0.25],
      [1, 0, 0.25],
      [0, 1, 0],
      [0, 0, -1],
    ]);
    expect(
      project.meshes[0].faces.map(({ id, vertexIds, uv, materialId }) => ({
        id,
        vertexIds,
        uv,
        materialId,
      })),
    ).toEqual(before.meshes[0].faces);
    expectNormal(face(project, 'front').normals![0], [0, 1 / Math.sqrt(17), 4 / Math.sqrt(17)]);
    expectNormal(face(project, 'side').normals![0], [0, -1, 0]);
    expect({ ...project, meshes: [] }).toEqual({ ...before, meshes: [] });
    expectFiniteTriangles(project);
  });

  it('lists stable ordered edges independent of face/corner order and allows edge/face movement', () => {
    const project = fixture();
    const edges = listMeshEdges(project.meshes[0]);
    expect(edges).toEqual([
      { id: 'a:b', vertexIds: ['a', 'b'], faceIds: ['front', 'side'] },
      { id: 'a:c', vertexIds: ['a', 'c'], faceIds: ['front'] },
      { id: 'a:d', vertexIds: ['a', 'd'], faceIds: ['side'] },
      { id: 'b:c', vertexIds: ['b', 'c'], faceIds: ['front'] },
      { id: 'b:d', vertexIds: ['b', 'd'], faceIds: ['side'] },
    ]);
    const reordered = structuredClone(project.meshes[0]);
    reordered.faces.reverse().forEach((item) => item.vertexIds.reverse());
    expect(listMeshEdges(reordered)).toEqual(edges);
    moveVertices(project, 'mesh', edges[0].vertexIds, [0.25, 0, 0]);
    moveVertices(project, 'mesh', face(project, 'front').vertexIds, [0, 0.25, 0]);
    expect(project.meshes[0].vertices[0].position).toEqual([0.25, 0.25, 0]);
    expect(project.meshes[0].vertices[3].position).toEqual([0, 0, -1]);
  });

  it.each([0.5, -0.5])(
    'extrudes a triangle by %s, keeps cap UV/material and allocates separate side UVs',
    (distance) => {
      const project = fixture();
      const original = structuredClone(project.meshes[0]);
      const capId = extrudeFace(project, 'mesh', 'front', distance, 'edit');
      expect(capId).toBe('edit-cap');
      expect(project.meshes[0].vertices.slice(0, 4)).toEqual(original.vertices);
      expect(project.meshes[0].vertices.slice(4)).toEqual([
        { id: 'edit-v0', position: [0, 0, distance] },
        { id: 'edit-v1', position: [1, 0, distance] },
        { id: 'edit-v2', position: [0, 1, distance] },
      ]);
      expect(project.meshes[0].faces).toHaveLength(8);
      expect(face(project, 'front')).toBeUndefined();
      const cap = face(project, capId);
      expect(cap.vertexIds).toEqual(['edit-v0', 'edit-v1', 'edit-v2']);
      expect(cap.uv).toEqual(original.faces[0].uv);
      expect(cap.materialId).toBe('red');
      expectNormal(cap.normals![0], [0, 0, 1]);
      expect(face(project, 'side')).toMatchObject(original.faces[1]);
      const sides = project.meshes[0].faces.filter((item) => item.id.startsWith('edit-side'));
      expect(sides.map((item) => item.materialId)).toEqual(Array(6).fill('red'));
      expect(sides[0].uv).toEqual([
        [0, 0],
        [1, 0],
        [1, 1],
      ]);
      expect(sides[1].uv).toEqual([
        [0, 0],
        [1, 1],
        [0, 1],
      ]);
      expect(sides[0].uv![0]).not.toBe(sides[1].uv![0]);
      expectNormal(sides[0].normals![0], [0, -Math.sign(distance), 0]);
      expect(listMeshEdges(project.meshes[0]).every((edge) => edge.faceIds.length <= 2)).toBe(true);
      expect(new Set(project.meshes[0].faces.map((item) => item.id)).size).toBe(8);
      expectFiniteTriangles(project);
    },
  );

  it('extrudes a UV-less open triangle without fabricating cap UVs', () => {
    const project = fixture();
    project.meshes[0].faces = [face(project, 'front')];
    delete project.meshes[0].faces[0].uv;
    extrudeFace(project, 'mesh', 'front', 1, 'open');
    expect(face(project, 'open-cap').uv).toBeUndefined();
    expect(project.meshes[0].faces.filter((item) => item.uv)).toHaveLength(6);
    expect(
      listMeshEdges(project.meshes[0])
        .filter((edge) => edge.faceIds.length === 1)
        .map((edge) => edge.id),
    ).toEqual(['a:b', 'a:c', 'b:c']);
  });

  it('deletes faces into an open surface or empty mesh without losing surviving vertex IDs', () => {
    const project = fixture();
    const vertices = structuredClone(project.meshes[0].vertices);
    deleteFaces(project, 'mesh', ['front', 'front']);
    expect(project.meshes[0].faces.map((item) => item.id)).toEqual(['side']);
    expect(listMeshEdges(project.meshes[0]).every((edge) => edge.faceIds.length === 1)).toBe(true);
    deleteFaces(project, 'mesh', ['side']);
    expect(project.meshes[0].faces).toEqual([]);
    expect(project.meshes[0].vertices).toEqual(vertices);
    validateProject(project);
  });

  it('recalculates flat and angle-weighted smooth corner normals without welding UV/material seams', () => {
    const project = fixture();
    const attributes = structuredClone(project.meshes[0].faces);
    recalculateNormals(project, 'mesh', 'flat');
    expectNormal(face(project, 'front').normals![0], [0, 0, 1]);
    expectNormal(face(project, 'side').normals![1], [0, -1, 0]);
    recalculateNormals(project, 'mesh', 'smooth');
    expectNormal(face(project, 'front').normals![0], [0, -Math.SQRT1_2, Math.SQRT1_2]);
    expectNormal(face(project, 'side').normals![1], [0, -Math.SQRT1_2, Math.SQRT1_2]);
    expectNormal(face(project, 'front').normals![2], [0, 0, 1]);
    expectNormal(face(project, 'side').normals![2], [0, -1, 0]);
    expect(
      project.meshes[0].faces.map(({ id, vertexIds, uv, materialId }) => ({
        id,
        vertexIds,
        uv,
        materialId,
      })),
    ).toEqual(attributes);
    moveVertices(project, 'mesh', ['a', 'b', 'c', 'd'], [0.1, 0, 0]);
    expectNormal(face(project, 'front').normals![0], [0, 0, 1]);
    expectNormal(face(project, 'side').normals![1], [0, -1, 0]);
  });

  it('uses corner angle weighting so triangulation density does not dominate smooth shading', () => {
    const project = fixture();
    project.meshes[0].vertices.push({ id: 'mid', position: [0.5, 0.5, 0] });
    project.meshes[0].faces = [
      { id: 'split-a', vertexIds: ['a', 'b', 'mid'] },
      { id: 'split-b', vertexIds: ['a', 'mid', 'c'] },
      face(project, 'side'),
    ];
    recalculateNormals(project, 'mesh', 'smooth');
    expectNormal(face(project, 'split-a').normals![0], [0, -Math.SQRT1_2, Math.SQRT1_2]);
    expectNormal(face(project, 'split-b').normals![0], [0, -Math.SQRT1_2, Math.SQRT1_2]);
  });

  it('recomputes from mirrored geometry winding, including an explicitly reversed mirror cap', () => {
    const project = fixture();
    project.meshes[0].faces = [face(project, 'front')];
    for (const vertex of project.meshes[0].vertices) vertex.position[0] *= -1;
    recalculateNormals(project, 'mesh', 'flat');
    expectNormal(face(project, 'front').normals![0], [0, 0, -1]);
    extrudeFace(project, 'mesh', 'front', 0.5, 'negative');
    expect(
      project.meshes[0].vertices.find((vertex) => vertex.id === 'negative-v1')!.position,
    ).toEqual([-1, 0, -0.5]);
    const cap = face(project, 'negative-cap');
    cap.vertexIds.reverse();
    cap.uv!.reverse();
    recalculateNormals(project, 'mesh', 'flat');
    expectNormal(cap.normals![0], [0, 0, -1]); // Previously returned objects remain detached.
    expectNormal(face(project, 'negative-cap').normals![0], [0, 0, 1]);
    expectFiniteTriangles(project);
  });

  it.each([1e-30, 1e30])(
    'normalizes displayable geometry at scale %s without numerical overflow',
    (scale) => {
      const project = fixture();
      for (const vertex of project.meshes[0].vertices)
        vertex.position = vertex.position.map((value) => value * scale) as Vec3;
      recalculateNormals(project, 'mesh', 'smooth');
      expectNormal(face(project, 'front').normals![0], [0, -Math.SQRT1_2, Math.SQRT1_2]);
      expectFiniteTriangles(project);
    },
  );

  it('rejects operations on shared meshes before affecting either instance', () => {
    const project = fixture();
    project.nodes.push({ ...structuredClone(project.nodes[0]), id: 'instance' });
    const before = structuredClone(project);
    const operations = [
      () => moveVertices(project, 'mesh', ['a'], [0, 0, 0.1]),
      () => extrudeFace(project, 'mesh', 'front', 1, 'blocked'),
      () => deleteFaces(project, 'mesh', ['front']),
      () => recalculateNormals(project, 'mesh', 'smooth'),
    ];
    operations.forEach((operation) => expect(operation).toThrow('共有メッシュ'));
    expect(project).toEqual(before);
  });

  it('refuses bound topology/rest edits while normal-only edits retain skin and clips', () => {
    const project = fixture();
    project.nodes.push({
      id: 'joint',
      name: 'Joint',
      parentId: null,
      transform: identityTransform(),
    });
    project.skins = [
      {
        id: 'binding',
        meshId: 'mesh',
        joints: [
          { nodeId: 'joint', inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
        ],
        weights: project.meshes[0].vertices.map((vertex) => ({
          vertexId: vertex.id,
          jointIds: ['joint'],
          values: [1],
        })),
      },
    ];
    addClip(project, 'joint');
    const before = structuredClone(project);
    const history = new ProjectHistory(project);
    for (const operation of [
      (p: Project3D) => moveVertices(p, 'mesh', ['a'], [0, 0, 0.1]),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', 1, 'blocked'),
      (p: Project3D) => deleteFaces(p, 'mesh', ['front']),
    ])
      expect(() => history.execute(operation)).toThrow('bind済み');
    expect(history.project).toEqual(before);
    history.execute((p) => recalculateNormals(p, 'mesh', 'smooth'));
    expect(history.project.skins).toEqual(before.skins);
    expect(history.project.clips).toEqual(before.clips);
    expect(history.project.meshes[0].vertices).toEqual(before.meshes[0].vertices);
    expectFiniteTriangles(history.project);
  });

  it.each(['shape', 'parent'])(
    'refuses rest edits animated through %s without blocking unrelated clips',
    (animatedNode) => {
      const project = fixture();
      project.nodes[0].parentId = 'parent';
      project.nodes.push({
        id: 'parent',
        name: 'Parent',
        parentId: null,
        transform: identityTransform(),
      });
      addClip(project, animatedNode);
      const before = structuredClone(project);
      expect(() => moveVertices(project, 'mesh', ['a'], [0, 0, 0.2])).toThrow('アニメーション対象');
      expect(() => deleteFaces(project, 'mesh', ['front'])).toThrow('アニメーション対象');
      expect(() => extrudeFace(project, 'mesh', 'front', 1, 'blocked')).toThrow(
        'アニメーション対象',
      );
      expect(project).toEqual(before);
      project.nodes.push({
        id: 'unrelated',
        name: 'Other',
        parentId: null,
        transform: identityTransform(),
      });
      project.clips[0].tracks[0].nodeId = 'unrelated';
      moveVertices(project, 'mesh', ['a', 'b'], [0, 0, 0.2]);
      expect(project.clips[0].tracks[0].nodeId).toBe('unrelated');
    },
  );

  it('rejects ambiguous extrusion connectivity locally but permits unrelated non-manifold faces', () => {
    const project = fixture();
    project.meshes[0].vertices.push({ id: 'e', position: [0, -1, 0] });
    project.meshes[0].faces.push({ id: 'third', vertexIds: ['a', 'b', 'e'] });
    const before = structuredClone(project);
    expect(() => extrudeFace(project, 'mesh', 'front', 1, 'blocked')).toThrow('3面以上');
    expect(project).toEqual(before);
    project.meshes[0].vertices.push(
      { id: 'p', position: [3, 0, 0] },
      { id: 'q', position: [4, 0, 0] },
      { id: 'r', position: [3, 1, 0] },
    );
    project.meshes[0].faces.push({ id: 'separate', vertexIds: ['p', 'q', 'r'] });
    extrudeFace(project, 'mesh', 'separate', 1, 'allowed');
    expect(face(project, 'allowed-cap')).toBeDefined();
  });

  it('rejects inconsistent adjacent winding before extrusion', () => {
    const project = fixture();
    face(project, 'side').vertexIds.reverse();
    const before = structuredClone(project);
    expect(() => extrudeFace(project, 'mesh', 'front', 1, 'blocked')).toThrow('面の向き');
    expect(project).toEqual(before);
  });

  it('rejects cancellation of smooth normals while allowing flat normals on open overlapping faces', () => {
    const project = fixture();
    project.meshes[0].faces = [
      { id: 'up', vertexIds: ['a', 'b', 'c'] },
      { id: 'down', vertexIds: ['c', 'b', 'a'] },
    ];
    const before = structuredClone(project);
    expect(() => recalculateNormals(project, 'mesh', 'smooth')).toThrow('法線が相殺');
    expect(project).toEqual(before);
    recalculateNormals(project, 'mesh', 'flat');
    expectNormal(face(project, 'up').normals![0], [0, 0, 1]);
    expectNormal(face(project, 'down').normals![0], [0, 0, -1]);
  });

  it('rejects degeneracy atomically and lets users remove a degenerate face', () => {
    const project = fixture();
    project.meshes[0].vertices[2].position = [2, 0, 0];
    const before = structuredClone(project);
    expect(() => recalculateNormals(project, 'mesh', 'flat')).toThrow('退化');
    expect(() => extrudeFace(project, 'mesh', 'front', 1, 'blocked')).toThrow('退化');
    expect(project).toEqual(before);
    deleteFaces(project, 'mesh', ['front']);
    expect(project.meshes[0].faces.map((item) => item.id)).toEqual(['side']);
    expectFiniteTriangles(project);
  });

  it('failed selections, dimensions, ID collisions, overflow and unsupported faces retain history/preview', () => {
    const history = new ProjectHistory(fixture(), undefined, true);
    history.execute((p) => moveVertices(p, 'mesh', ['a', 'b', 'c', 'd'], [0, 0, 0.1]));
    history.undo();
    history.previewCommand((p) => moveVertices(p, 'mesh', ['a', 'b', 'c', 'd'], [0.1, 0, 0]));
    const before = history.project,
      preview = history.preview;
    const operations = [
      (p: Project3D) => moveVertices(p, 'mesh', [], [1, 0, 0]),
      (p: Project3D) => moveVertices(p, 'mesh', ['a', 'missing'], [1, 0, 0]),
      (p: Project3D) => moveVertices(p, 'missing', ['a'], [1, 0, 0]),
      (p: Project3D) => moveVertices(p, 'mesh', ['a'], [Number.NaN, 0, 0]),
      (p: Project3D) => moveVertices(p, 'mesh', ['a'], [1e40, 0, 0]),
      (p: Project3D) => moveVertices(p, 'mesh', ['a', 'b', 'c', 'd'], [1e20, 0, 0]),
      (p: Project3D) => moveVertices(p, 'mesh', ['a'], [1, 0, 0]),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', 0, 'edit'),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', Infinity, 'edit'),
      (p: Project3D) => extrudeFace(p, 'mesh', 'missing', 1, 'edit'),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', 1, 'bad prefix'),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', 1, 'a'.repeat(128)),
      (p: Project3D) => deleteFaces(p, 'mesh', ['front', 'missing']),
      (p: Project3D) => {
        extrudeFace(p, 'mesh', 'front', 1, 'edit');
        extrudeFace(p, 'mesh', 'edit-cap', 1, 'edit');
      },
      (p: Project3D) => {
        p.meshes[0].vertices[0].position[0] = Number.MAX_VALUE;
        moveVertices(p, 'mesh', ['a'], [Number.MAX_VALUE, 0, 0]);
      },
      (p: Project3D) => {
        face(p, 'front').vertexIds.push('d');
        moveVertices(p, 'mesh', ['a'], [0, 0, 0.1]);
      },
    ];
    for (const operation of operations) {
      expect(() => history.execute(operation)).toThrow();
      expect(history.project).toEqual(before);
      expect(history.preview).toEqual(preview);
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(true);
    }
  });

  it('records each operation once, supports preview cancel and undo/redo, and edits a restored backup', async () => {
    const history = new ProjectHistory(fixture(), undefined, true);
    history.previewCommand((p) => moveVertices(p, 'mesh', ['c'], [0, 0.25, 0]));
    expect(history.revision).toBe(0);
    expect(history.dirty).toBe(false);
    history.cancelPreview();
    expect(history.preview).toEqual(fixture());
    const snapshots = [history.project];
    const operations = [
      (p: Project3D) => moveVertices(p, 'mesh', ['c'], [0, 0.25, 0]),
      (p: Project3D) => extrudeFace(p, 'mesh', 'front', 0.5, 'raised'),
      (p: Project3D) => deleteFaces(p, 'mesh', ['side']),
      (p: Project3D) => recalculateNormals(p, 'mesh', 'smooth'),
    ];
    for (const operation of operations) {
      history.execute(operation);
      snapshots.push(history.project);
    }
    expect(history.revision).toBe(4);
    for (let index = 3; index >= 0; index--) {
      expect(history.undo()).toBe(true);
      expect({ ...history.project, revision: snapshots[index].revision }).toEqual(snapshots[index]);
    }
    for (let index = 1; index <= 4; index++) {
      expect(history.redo()).toBe(true);
      expect({ ...history.project, revision: snapshots[index].revision }).toEqual(snapshots[index]);
    }
    expect(history.revision).toBe(12);
    const restored = await importBackup(await exportBackup(history.project, new Map()));
    expect(restored.project).toEqual(history.project);
    const reopened = new ProjectHistory(restored.project);
    reopened.execute((p) => moveVertices(p, 'mesh', face(p, 'raised-cap').vertexIds, [0, 0, 0.25]));
    expect(
      reopened.project.meshes[0].vertices.find((vertex) => vertex.id === 'raised-v0')!.position[2],
    ).toBe(0.75);
    expectFiniteTriangles(reopened.project);
    reopened.undo();
    expect(reopened.project.meshes).toEqual(restored.project.meshes);
  });
});
