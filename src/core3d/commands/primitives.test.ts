import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../backup/backup';
import { createProject, validateProject, type Mesh3D, type Vec3 } from '../model/project';
import { HistoryBudgetError, ProjectHistory } from './history';
import {
  addPrimitive,
  PRIMITIVE_LIMITS,
  type PrimitiveKind,
  type PrimitiveOptions,
} from './primitives';

const kinds: PrimitiveKind[] = ['box', 'plane', 'sphere', 'cylinder', 'cone'];
const options = (kind: PrimitiveKind, segments = 3): PrimitiveOptions => ({
  kind,
  width: 2,
  height: 3,
  depth: 4,
  segments,
});
function make(kind: PrimitiveKind, segments = 3) {
  const project = createProject('primitives');
  const nodeId = addPrimitive(project, 'shape', options(kind, segments));
  return { project, mesh: project.meshes[0], nodeId };
}
function dot(a: Vec3, b: Vec3) {
  return a.reduce((sum, value, axis) => sum + value * b[axis], 0);
}
function surface(mesh: Mesh3D, face: Mesh3D['faces'][number]) {
  const positions = face.vertexIds.map((id) => mesh.vertices.find((v) => v.id === id)!.position);
  const [a, b, c] = positions;
  const ab = b.map((value, axis) => value - a[axis]);
  const ac = c.map((value, axis) => value - a[axis]);
  const cross: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...cross);
  const normal = cross.map((value) => value / length) as Vec3;
  const centroid = a.map((value, axis) => (value + b[axis] + c[axis]) / 3) as Vec3;
  return { normal, centroid, length, positions };
}
function cornerValues(mesh: Mesh3D, vertexId: string) {
  return mesh.faces.flatMap((face) =>
    face.vertexIds.flatMap((id, index) =>
      id === vertexId ? [{ uv: face.uv![index], normal: face.normals![index] }] : [],
    ),
  );
}

describe('native primitive generation', () => {
  it.each(kinds)(
    'creates a valid, outward, centered %s with exact dimensions and corner attributes',
    (kind) => {
      const { project, mesh, nodeId } = make(kind);
      expect(nodeId).toBe('shape-node');
      expect(() => validateProject(project)).not.toThrow();
      expect(project.schemaVersion).toBe('0.2.0');
      expect(project.nodes[0].meshId).toBe('shape-mesh');
      expect(project.nodes[0].transform).toEqual({
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      });
      for (let axis = 0; axis < 3; axis++) {
        const extent = kind === 'plane' && axis === 1 ? 0 : [1, 1.5, 2][axis];
        const values = mesh.vertices.map((v) => v.position[axis]);
        expect(Math.min(...values)).toBeCloseTo(-extent, 12);
        expect(Math.max(...values)).toBeCloseTo(extent, 12);
      }
      const edges = new Map<string, number>();
      for (const face of mesh.faces) {
        expect(face.vertexIds).toHaveLength(3);
        expect(new Set(face.vertexIds).size).toBe(3);
        expect(face.materialId).toBe('shape-material');
        expect(face.uv).toHaveLength(3);
        expect(face.normals).toHaveLength(3);
        const { normal, centroid, length } = surface(mesh, face);
        expect(Number.isFinite(length) && length > 0).toBe(true);
        expect(kind === 'plane' ? normal[1] : dot(normal, centroid)).toBeGreaterThan(0);
        for (const cornerNormal of face.normals!) {
          expect(Math.hypot(...cornerNormal)).toBeCloseTo(1, 12);
          expect(dot(normal, cornerNormal)).toBeGreaterThan(0);
        }
        for (const coordinate of face.uv!.flat()) {
          expect(Number.isFinite(coordinate)).toBe(true);
          expect(coordinate).toBeGreaterThanOrEqual(0);
          expect(coordinate).toBeLessThanOrEqual(1);
        }
        for (let side = 0; side < 3; side++) {
          const edge = [face.vertexIds[side], face.vertexIds[(side + 1) % 3]].sort().join(':');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      if (kind === 'plane') {
        expect([...edges.values()].filter((count) => count === 1)).toHaveLength(12);
        expect([...edges.values()].every((count) => count === 1 || count === 2)).toBe(true);
      } else {
        expect([...edges.values()].every((count) => count === 2)).toBe(true);
        expect(mesh.vertices.length - edges.size + mesh.faces.length).toBe(2);
      }
      expect(new Set(mesh.vertices.map((vertex) => vertex.position.join(','))).size).toBe(
        mesh.vertices.length,
      );
    },
  );

  it.each(kinds)('uses segments meaningfully for %s and accepts its bounded maximum', (kind) => {
    const low = make(kind, 1).mesh;
    const high = make(kind, 2).mesh;
    expect(high.vertices.length).toBeGreaterThan(low.vertices.length);
    expect(high.faces.length).toBeGreaterThan(low.faces.length);
    for (const face of low.faces) expect(surface(low, face).length).toBeGreaterThan(0);
    const n = PRIMITIVE_LIMITS.maxSegments[kind];
    const largest = make(kind, n);
    const expectedFaces = {
      box: 12 * n * n,
      plane: 2 * n * n,
      sphere: 8 * n * (2 * n - 1),
      cylinder: 16 * n,
      cone: 8 * n,
    };
    expect(largest.mesh.faces).toHaveLength(expectedFaces[kind]);
    expect(largest.mesh.faces.length).toBeLessThanOrEqual(8192);
    expect(() => validateProject(largest.project)).not.toThrow();
  });

  it('gives a plane an open +Y XZ grid and does not use height for its geometry', () => {
    const first = make('plane').project;
    const second = createProject('primitives');
    addPrimitive(second, 'shape', { ...options('plane'), height: 20 });
    expect(second.meshes).toEqual(first.meshes);
    expect(first.meshes[0].vertices).toHaveLength(16);
    expect(first.meshes[0].faces).toHaveLength(18);
    expect(first.meshes[0].faces.every((face) => face.normals!.every((n) => n[1] === 1))).toBe(
      true,
    );
  });

  it('shares subdivided box edge vertices while retaining hard corner normals', () => {
    const { mesh } = make('box', 2);
    expect(mesh.vertices).toHaveLength(26);
    expect(mesh.faces).toHaveLength(48);
    const corner = mesh.vertices.find((v) => v.position.join(',') === '1,1.5,2')!;
    const normals = new Set(cornerValues(mesh, corner.id).map((c) => c.normal.join(',')));
    expect([...normals].sort()).toEqual(['0,0,1', '0,1,0', '1,0,0']);
  });

  it('uses ellipsoid gradient normals, unique poles and UV corners across the sphere seam', () => {
    const { mesh } = make('sphere');
    expect(mesh.vertices).toHaveLength(62);
    expect(mesh.faces).toHaveLength(120);
    expect(mesh.vertices.filter((v) => Math.abs(v.position[1]) === 1.5)).toHaveLength(2);
    for (const face of mesh.faces)
      for (let corner = 0; corner < 3; corner++) {
        const position = mesh.vertices.find(
          (vertex) => vertex.id === face.vertexIds[corner],
        )!.position;
        const gradient: Vec3 = [position[0], position[1] / 2.25, position[2] / 4];
        const size = Math.hypot(...gradient);
        face.normals![corner].forEach((value, axis) =>
          expect(value).toBeCloseTo(gradient[axis] / size, 12),
        );
      }
    const seam = mesh.vertices.find((v) => v.position.join(',') === '1,0,0')!;
    const corners = cornerValues(mesh, seam.id);
    expect(new Set(corners.map((c) => c.uv[0]))).toEqual(new Set([0, 1]));
    expect(new Set(corners.map((c) => c.normal.join(','))).size).toBe(1);
  });

  it.each(['cylinder', 'cone'] as const)(
    'keeps %s side normals separate from cap normals at shared vertices',
    (kind) => {
      const { mesh } = make(kind);
      const rim = mesh.vertices.find((v) => v.position.join(',') === '1,-1.5,0')!;
      const corners = cornerValues(mesh, rim.id);
      expect(corners.some((c) => c.normal.join(',') === '0,-1,0')).toBe(true);
      const curved = corners.filter((c) => c.normal[0] > 0);
      expect(new Set(curved.map((c) => c.uv[0]))).toEqual(new Set([0, 1]));
      for (const corner of curved) {
        expect(corner.normal[2]).toBe(0);
        expect(corner.normal[1] / corner.normal[0]).toBeCloseTo(kind === 'cone' ? 1 / 3 : 0, 12);
      }
      if (kind === 'cone') {
        const apex = mesh.vertices.filter((v) => v.position[1] === 1.5);
        expect(apex).toHaveLength(1);
        expect(new Set(cornerValues(mesh, apex[0].id).map((c) => c.normal.join(','))).size).toBe(
          12,
        );
      }
    },
  );

  it.each(kinds)(
    'assigns deterministic valid stable IDs to %s and no generation metadata',
    (kind) => {
      expect(make(kind).project).toEqual(make(kind).project);
      const { project, mesh } = make(kind);
      expect(Object.keys(mesh).sort()).toEqual(['faces', 'id', 'vertices']);
      expect(Object.keys(project.nodes[0]).sort()).toEqual([
        'id',
        'locked',
        'meshId',
        'name',
        'parentId',
        'transform',
        'visible',
      ]);
      expect(new Set(mesh.vertices.map((v) => v.id)).size).toBe(mesh.vertices.length);
      expect(new Set(mesh.faces.map((f) => f.id)).size).toBe(mesh.faces.length);
      const longest = createProject('longest');
      addPrimitive(longest, 'p'.repeat(119), options(kind, 1));
      expect(() => validateProject(longest)).not.toThrow();
      expect(longest.materials[0].id).toHaveLength(128);
    },
  );

  it.each(kinds)('keeps %s numerically finite at anisotropic dimension limits', (kind) => {
    const project = createProject('extreme');
    addPrimitive(project, 'shape', {
      ...options(kind, 1),
      width: PRIMITIVE_LIMITS.minDimension,
      height: PRIMITIVE_LIMITS.maxDimension,
      depth: PRIMITIVE_LIMITS.minDimension,
    });
    expect(() => validateProject(project)).not.toThrow();
    for (const face of project.meshes[0].faces) {
      const { length, normal } = surface(project.meshes[0], face);
      expect(Number.isFinite(length) && length > 0).toBe(true);
      for (const cornerNormal of face.normals!) {
        expect(Math.hypot(...cornerNormal)).toBeCloseTo(1, 12);
        expect(dot(normal, cornerNormal)).toBeGreaterThan(0);
      }
    }
  });

  it('rejects invalid dimensions, segments, kinds and IDs before mutating the candidate', () => {
    const project = createProject('invalid');
    const before = structuredClone(project);
    for (const field of ['width', 'height', 'depth'] as const)
      for (const value of [0, -1, NaN, Infinity, -Infinity, 0.00001, 10_001])
        expect(() => addPrimitive(project, 'shape', { ...options('box'), [field]: value })).toThrow(
          '寸法',
        );
    for (const kind of kinds)
      for (const segments of [
        0,
        -1,
        1.1,
        NaN,
        Infinity,
        1e10,
        PRIMITIVE_LIMITS.maxSegments[kind] + 1,
      ])
        expect(() => addPrimitive(project, 'shape', options(kind, segments))).toThrow('分割数');
    expect(() =>
      addPrimitive(project, 'shape', { ...options('box'), kind: 'torus' as PrimitiveKind }),
    ).toThrow('kind');
    for (const id of ['', '_wrong', 'space here', 'p'.repeat(120)])
      expect(() => addPrimitive(project, id, options('box'))).toThrow('ID');
    expect(project).toEqual(before);
  });

  it.each(['nodes', 'meshes', 'materials'] as const)(
    'rejects an existing %s ID without any partial addition',
    (field) => {
      const project = make('box').project;
      if (field !== 'nodes') project.nodes = [];
      if (field !== 'meshes') project.meshes = [];
      if (field !== 'materials') project.materials = [];
      const before = structuredClone(project);
      expect(() => addPrimitive(project, 'shape', options('sphere'))).toThrow('already exist');
      expect(project).toEqual(before);
    },
  );

  it('commits each primitive once, preserving stable topology across undo/redo and failed commands', () => {
    const history = new ProjectHistory(createProject('history'));
    for (const kind of kinds)
      history.execute((project) => addPrimitive(project, kind, options(kind)));
    const made = history.project;
    expect(history.revision).toBe(5);
    expect(history.undo()).toBe(true);
    const before = history.project;
    expect(history.canRedo).toBe(true);
    expect(() =>
      history.execute((project) => addPrimitive(project, 'box', options('box'))),
    ).toThrow('already exist');
    expect(() =>
      history.execute((project) => addPrimitive(project, 'invalid', options('sphere', 1e8))),
    ).toThrow('分割数');
    expect(history.project).toEqual(before);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toBe(true);
    expect(history.project.meshes).toEqual(made.meshes);
    expect(history.revision).toBe(7);
  });

  it('retains the original project when history refuses the generated candidate budget', () => {
    const history = new ProjectHistory(createProject('budget'), 1024);
    const before = history.project;
    expect(() =>
      history.execute((project) => addPrimitive(project, 'shape', options('sphere'))),
    ).toThrow(HistoryBudgetError);
    expect(history.project).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it('round-trips all primitives through the existing independent native backup and permits further edits', async () => {
    const history = new ProjectHistory(createProject('backup'));
    for (const kind of kinds)
      history.execute((project) => addPrimitive(project, kind, options(kind)));
    const original = history.project;
    const restored = await importBackup(await exportBackup(original, new Map()));
    expect(restored.project).toEqual(original);
    expect(restored.blobs.size).toBe(0);
    const reopened = new ProjectHistory(restored.project);
    reopened.execute((project) => {
      project.meshes[0].vertices[0].position[0] += 0.25;
    });
    expect(reopened.project.meshes[0].vertices[0].position[0]).toBe(
      original.meshes[0].vertices[0].position[0] + 0.25,
    );
    expect(reopened.undo()).toBe(true);
    expect(reopened.project.meshes).toEqual(original.meshes);
  });
});
