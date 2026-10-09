import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../backup/backup';
import { smallProject } from '../fixtures/project';
import { transformPoint, worldMatrix } from '../model/coordinates';
import {
  createProject,
  identityTransform,
  validateProject,
  type Project3D,
  type Vec3,
} from '../model/project';
import { ProjectHistory } from './history';
import { rotationFromDegrees } from './objectEditing';
import { addPrimitive } from './primitives';
import { alignNodes, type AlignmentAnchor, type MirrorAxis } from './sceneAssembly';

function fixture() {
  const project = createProject('alignment');
  for (const prefix of ['a', 'b', 'c'])
    addPrimitive(project, prefix, { kind: 'box', width: 2, height: 3, depth: 4, segments: 1 });
  project.nodes[0].transform.translation = [7, -3, 2];
  project.nodes[1].transform.translation = [-2, 5, -6];
  project.nodes[2].transform.translation = [3, 2, 5];
  return project;
}
function group(project: Project3D, id: string, parentId: string | null = null) {
  const result = { id, name: id, parentId, transform: identityTransform() };
  project.nodes.push(result);
  return result;
}
function points(project: Project3D, id: string): Vec3[] {
  const item = project.nodes.find((entry) => entry.id === id)!;
  const mesh = project.meshes.find((entry) => entry.id === item.meshId)!;
  const used = new Set(mesh.faces.flatMap((face) => face.vertexIds));
  return mesh.vertices
    .filter((vertex) => used.has(vertex.id))
    .map((vertex) => transformPoint(worldMatrix(project, id), vertex.position));
}
function anchorValue(
  project: Project3D,
  ids: string[],
  component: number,
  anchor: AlignmentAnchor,
) {
  if (anchor === 'origin') return worldMatrix(project, ids[0])[12 + component];
  const values = ids.flatMap((id) => points(project, id).map((point) => point[component]));
  const min = Math.min(...values),
    max = Math.max(...values);
  return anchor === 'min' ? min : anchor === 'max' ? max : (min + max) / 2;
}
function unchanged(project: Project3D, operation: () => unknown, message?: RegExp) {
  const original = structuredClone(project);
  const nodes = project.nodes,
    meshes = project.meshes,
    materials = project.materials;
  expect(operation).toThrow(message);
  expect(project).toEqual(original);
  expect(project.nodes).toBe(nodes);
  expect(project.meshes).toBe(meshes);
  expect(project.materials).toBe(materials);
}

describe('native world-axis object alignment', () => {
  it.each(
    (['x', 'y', 'z'] as MirrorAxis[]).flatMap((axis) =>
      (['origin', 'min', 'center', 'max'] as AlignmentAnchor[]).map((anchor) => ({ axis, anchor })),
    ),
  )(
    'rejects repeated $axis/$anchor alignment roundoff without changing project or history',
    ({ axis, anchor }) => {
      const project = fixture();
      group(project, 'parent').transform = {
        translation: [10, -4, 8],
        rotation: rotationFromDegrees([25, -35, 47]),
        scale: [-2, 3, 0.5],
      };
      project.nodes[0].parentId = 'parent';
      const history = new ProjectHistory(project);
      history.execute((candidate) =>
        alignNodes(candidate, ['a-node', 'b-node'], 'b-node', axis, anchor),
      );
      const completed = history.project;
      const direct = history.project;
      unchanged(
        direct,
        () => alignNodes(direct, ['a-node', 'b-node'], 'b-node', axis, anchor),
        /すでに/,
      );
      expect(() =>
        history.execute((candidate) =>
          alignNodes(candidate, ['a-node', 'b-node'], 'b-node', axis, anchor),
        ),
      ).toThrow(/すでに/);
      expect(history.project).toEqual(completed);
      expect(history.revision).toBe(1);
      expect(history.canUndo).toBe(true);
      expect(history.canRedo).toBe(false);
      expect(history.undo()).toBe(true);
      expect({ ...history.project, revision: project.revision }).toEqual(project);
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(true);
    },
  );

  it.each([
    [0, 1e-20],
    [1, 1 + 1e-12],
    [1e8, 1e8 + 0.00001],
  ])('preserves meaningful small origin differences from %s to %s', (start, target) => {
    const project = createProject('small-displacement');
    group(project, 'a').transform.translation = [1e20, start, 0];
    group(project, 'b').transform.translation = [0, target, 0];
    alignNodes(project, ['a', 'b'], 'b', 'y', 'origin');
    expect(project.nodes[0].transform.translation).toEqual([1e20, target, 0]);
    unchanged(project, () => alignNodes(project, ['a', 'b'], 'b', 'y', 'origin'), /すでに/);
  });

  it.each<MirrorAxis>(['x', 'y', 'z'])(
    'aligns %s origins under rotated nonuniform negative-scale parents',
    (axis) => {
      const project = fixture();
      const parent = group(project, 'parent');
      parent.transform = {
        translation: [10, -4, 8],
        rotation: rotationFromDegrees([25, -35, 47]),
        scale: [-2, 3, 0.5],
      };
      project.nodes[0].parentId = parent.id;
      project.nodes[0].transform.rotation = rotationFromDegrees([17, 31, -12]);
      project.nodes[0].transform.scale = [-1, 2, 3];
      project.nodes[2].parentId = 'a-node';
      const original = structuredClone(project);
      const component = { x: 0, y: 1, z: 2 }[axis];
      const before = ['a-node', 'c-node'].map((id) => points(project, id));
      const delta =
        worldMatrix(project, 'b-node')[12 + component] -
        worldMatrix(project, 'a-node')[12 + component];
      alignNodes(project, ['a-node', 'b-node'], 'b-node', axis, 'origin');
      expect(worldMatrix(project, 'a-node')[12 + component]).toBeCloseTo(
        worldMatrix(project, 'b-node')[12 + component],
        10,
      );
      for (const [index, id] of ['a-node', 'c-node'].entries())
        points(project, id).forEach((point, vertex) =>
          point.forEach((value, coordinate) =>
            expect(value).toBeCloseTo(
              before[index][vertex][coordinate] + (coordinate === component ? delta : 0),
              10,
            ),
          ),
        );
      expect(project.nodes.slice(1)).toEqual(original.nodes.slice(1));
      expect(project.nodes[0]).toEqual({
        ...original.nodes[0],
        transform: {
          ...original.nodes[0].transform,
          translation: project.nodes[0].transform.translation,
        },
      });
      expect({ ...project, nodes: original.nodes }).toEqual(original);
      validateProject(project);
    },
  );

  it.each<AlignmentAnchor>(['min', 'center', 'max'])(
    'aligns %s actual world extrema, ignoring unused vertices and preserving shared geometry',
    (anchor) => {
      const project = fixture();
      project.nodes[0].transform.rotation = rotationFromDegrees([30, 20, 45]);
      project.nodes[0].transform.scale = [-2, 3, 1];
      project.nodes[1].transform.rotation = rotationFromDegrees([-10, 45, 20]);
      project.nodes[2].meshId = project.nodes[0].meshId;
      project.meshes[0].vertices.push({ id: 'unused', position: [-1000, 1000, 1000] });
      const original = structuredClone(project);
      const target = anchorValue(project, ['b-node'], 0, anchor);
      const oldValues = ['a-node', 'c-node'].map((id) => anchorValue(project, [id], 0, anchor));
      alignNodes(project, ['a-node', 'b-node', 'c-node'], 'b-node', 'x', anchor);
      for (const [index, id] of ['a-node', 'c-node'].entries()) {
        expect(anchorValue(project, [id], 0, anchor)).toBeCloseTo(target, 10);
        const nodeIndex = index === 0 ? 0 : 2;
        expect(project.nodes[nodeIndex].transform.translation[0]).toBeCloseTo(
          original.nodes[nodeIndex].transform.translation[0] + target - oldValues[index],
          10,
        );
        expect(project.nodes[nodeIndex].transform.translation.slice(1)).toEqual(
          original.nodes[nodeIndex].transform.translation.slice(1),
        );
      }
      expect(project.nodes[1]).toEqual(original.nodes[1]);
      expect(project.meshes).toEqual(original.meshes);
      expect(project.materials).toEqual(original.materials);
    },
  );

  it('translates a meshless group rigidly using all descendant drawable bounds', () => {
    const project = fixture();
    const root = group(project, 'group');
    root.transform = {
      translation: [4, 1, -2],
      rotation: rotationFromDegrees([20, 30, 15]),
      scale: [-2, 3, 1],
    };
    project.nodes[0].parentId = 'group';
    group(project, 'nested', 'group');
    project.nodes[2].parentId = 'nested';
    const original = structuredClone(project);
    const before = anchorValue(project, ['a-node', 'c-node'], 1, 'max');
    const target = anchorValue(project, ['b-node'], 1, 'max');
    alignNodes(project, ['group', 'b-node'], 'b-node', 'y', 'max');
    expect(anchorValue(project, ['a-node', 'c-node'], 1, 'max')).toBeCloseTo(target, 10);
    expect(project.nodes.find((item) => item.id === 'group')!.transform.translation).toEqual([
      4,
      1 + target - before,
      -2,
    ]);
    expect(project.nodes.filter((item) => item.id !== 'group')).toEqual(
      original.nodes.filter((item) => item.id !== 'group'),
    );
    expect(project.meshes).toEqual(original.meshes);
  });

  it('aligns meshless origins and preserves an already aligned member when another moves', () => {
    const project = createProject('origins');
    group(project, 'a').transform.translation = [2, 3, 4];
    group(project, 'b').transform.translation = [2, 7, 8];
    group(project, 'c').transform.translation = [5, 9, 10];
    const original = structuredClone(project.nodes);
    alignNodes(project, ['a', 'b', 'c'], 'b', 'x', 'origin');
    expect(project.nodes.slice(0, 2)).toEqual(original.slice(0, 2));
    expect(project.nodes[2].transform.translation).toEqual([2, 9, 10]);
  });

  it('rejects invalid selections, unsupported modes, and empty drawable bounds without publication', () => {
    const project = fixture();
    group(project, 'empty');
    group(project, 'child', 'a-node');
    for (const ids of [
      [],
      ['a-node'],
      ['a-node', 'a-node'],
      ['a-node', 'missing'],
      ['a-node', 'child', 'b-node'],
    ])
      unchanged(project, () => alignNodes(project, ids, 'a-node', 'x', 'origin'));
    unchanged(project, () => alignNodes(project, ['a-node', 'b-node'], 'c-node', 'x', 'origin'));
    unchanged(project, () => alignNodes(project, ['a-node', 'b-node'], 'missing', 'x', 'origin'));
    unchanged(project, () =>
      alignNodes(project, ['a-node', 'b-node'], 'b-node', '?' as MirrorAxis, 'origin'),
    );
    unchanged(project, () =>
      alignNodes(project, ['a-node', 'b-node'], 'b-node', 'x', '?' as AlignmentAnchor),
    );
    for (const anchor of ['min', 'center', 'max'] as AlignmentAnchor[])
      for (const reference of ['a-node', 'empty'])
        unchanged(
          project,
          () => alignNodes(project, ['a-node', 'empty'], reference, 'x', anchor),
          /面/,
        );
    project.meshes[0].faces = [];
    unchanged(project, () => alignNodes(project, ['a-node', 'b-node'], 'b-node', 'x', 'min'), /面/);
  });

  it.each(['a-node', 'b-node', 'parent', 'child'])(
    'rejects animation on selected branch or ancestor %s',
    (animatedId) => {
      const project = fixture();
      group(project, 'parent');
      group(project, 'child', 'a-node');
      project.nodes[0].parentId = 'parent';
      project.clips.push({
        id: 'animation',
        name: 'animation',
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
      unchanged(
        project,
        () => alignNodes(project, ['a-node', 'b-node'], 'b-node', 'x', 'origin'),
        /アニメーション/,
      );
    },
  );

  it('rejects bound mesh, joint descendants and joint ancestors; preserves unrelated rig and sources', () => {
    const project = smallProject();
    group(project, 'reference').transform.translation = [5, 6, 7];
    for (const id of ['shape', 'joint-a', 'joint-b'])
      unchanged(
        project,
        () => alignNodes(project, [id, 'reference'], 'reference', 'x', 'origin'),
        /リグ/,
      );
    group(project, 'joint-child', 'joint-b');
    unchanged(
      project,
      () => alignNodes(project, ['joint-child', 'reference'], 'reference', 'x', 'origin'),
      /リグ/,
    );
    group(project, 'unrelated').transform.translation = [-2, 3, 4];
    project.blobIds = ['a'.repeat(64)];
    project.sources.push({
      id: 'source',
      blobId: project.blobIds[0],
      mimeType: 'application/octet-stream',
      rights: { declared: 'test', embedded: 'test' },
    });
    const original = structuredClone(project);
    alignNodes(project, ['unrelated', 'reference'], 'reference', 'y', 'origin');
    expect(project.nodes.filter((item) => item.id !== 'unrelated')).toEqual(
      original.nodes.filter((item) => item.id !== 'unrelated'),
    );
    expect({ ...project, nodes: original.nodes }).toEqual(original);
  });

  it.each([0, 1e-50, 1e50])(
    'rejects singular or display-unrepresentable parent scale %s',
    (scale) => {
      const project = fixture();
      group(project, 'parent').transform.scale = [scale, 1, 1];
      project.nodes[0].parentId = 'parent';
      unchanged(project, () => alignNodes(project, ['a-node', 'b-node'], 'b-node', 'x', 'origin'));
    },
  );

  it('rejects local cancellation and world Float32 geometry loss atomically for all selected roots', () => {
    const project = fixture();
    group(project, 'parent').transform.translation = [0, 1e14, 0];
    project.nodes[0].parentId = 'parent';
    project.nodes[1].transform.translation = [1e8, 0.001, 0];
    unchanged(
      project,
      () => alignNodes(project, ['c-node', 'a-node', 'b-node'], 'b-node', 'y', 'origin'),
      /数値精度/,
    );
    const display = fixture();
    display.nodes[1].transform.translation[0] = 1e8;
    unchanged(
      display,
      () => alignNodes(display, ['a-node', 'b-node'], 'b-node', 'x', 'origin'),
      /表示精度/,
    );
  });

  it('does not introduce cancellation from a large unrelated parent translation', () => {
    const project = createProject('vector');
    group(project, 'parent').transform.translation = [1e20, 0, 0];
    group(project, 'a', 'parent').transform.translation = [0, 0.001, 0];
    group(project, 'b').transform.translation = [0, 0.002, 0];
    alignNodes(project, ['a', 'b'], 'b', 'y', 'origin');
    expect(project.nodes[1].transform.translation).toEqual([0, 0.002, 0]);
    expect(worldMatrix(project, 'a').slice(12, 15)).toEqual([1e20, 0.002, 0]);
  });

  it('rejects no-op and failed history operations without consuming Undo/Redo; roundtrips one successful revision', async () => {
    const history = new ProjectHistory(fixture());
    const initial = history.project;
    history.execute((project) =>
      alignNodes(project, ['a-node', 'b-node', 'c-node'], 'b-node', 'z', 'center'),
    );
    expect(history.revision).toBe(initial.revision + 1);
    const completed = history.project;
    expect(() =>
      history.execute((project) =>
        alignNodes(project, ['a-node', 'b-node', 'c-node'], 'b-node', 'z', 'center'),
      ),
    ).toThrow(/すでに/);
    expect(history.project).toEqual(completed);
    expect(history.undo()).toBe(true);
    expect({ ...history.project, revision: initial.revision }).toEqual(initial);
    expect(history.canUndo).toBe(false);
    const undone = history.project;
    expect(() =>
      history.execute((project) =>
        alignNodes(project, ['a-node', 'missing'], 'a-node', 'z', 'origin'),
      ),
    ).toThrow();
    expect(history.project).toEqual(undone);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toBe(true);
    expect({ ...history.project, revision: completed.revision }).toEqual(completed);
    expect(history.canRedo).toBe(false);
    const restored = await importBackup(await exportBackup(history.project, new Map()));
    expect(restored.project).toEqual(history.project);
    const recovered = new ProjectHistory(restored.project);
    recovered.execute((project) => alignNodes(project, ['a-node', 'b-node'], 'b-node', 'x', 'min'));
    expect(recovered.revision).toBe(history.revision + 1);
    expect(recovered.project.schemaVersion).toBe('0.3.0');
  });
});
