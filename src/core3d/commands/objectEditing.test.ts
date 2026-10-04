import { describe, expect, it } from 'vitest';
import { createProject, identityTransform, validateProject } from '../model/project';
import { addBox } from './box';
import { ProjectHistory } from './history';
import {
  cloneNode,
  renameNode,
  setNodeTransform,
  updateMaterial,
  rotationFromDegrees,
  rotationToDegrees,
} from './objectEditing';
import { composeTransform, transformPoint } from '../model/coordinates';

function fixture() {
  const p = createProject('test');
  addBox(p, 'box');
  return p;
}
describe('native object authoring', () => {
  it('converts user degree angles into canonical rotation and recovers the same pose', () => {
    for (const angles of [
      [20, 30, -70],
      [0, 90, 40],
      [0, -90, 40],
      [370, 0, 0],
    ] as [number, number, number][]) {
      const rotation = rotationFromDegrees(angles);
      const recovered = rotationFromDegrees(rotationToDegrees(rotation));
      const a = composeTransform({ ...identityTransform(), rotation });
      const b = composeTransform({ ...identityTransform(), rotation: recovered });
      a.forEach((value, index) => expect(b[index]).toBeCloseTo(value, 10));
    }
    const pose = composeTransform({
      ...identityTransform(),
      rotation: rotationFromDegrees([0, 90, 0]),
    });
    const point = transformPoint(pose, [0, 0, 1]);
    expect(point[0]).toBeCloseTo(1, 12);
    expect(point[2]).toBeCloseTo(0, 12);
    expect(() => rotationFromDegrees([NaN, 0, 0])).toThrow();
  });
  it('applies local TRS once and reverses through history', () => {
    const history = new ProjectHistory(fixture());
    const transform = {
      translation: [2, 3, 4] as [number, number, number],
      rotation: [0, 1, 0, 0] as [number, number, number, number],
      scale: [-2, 1, 3] as [number, number, number],
    };
    history.execute((p) => setNodeTransform(p, 'box-node', transform));
    expect(history.project.nodes[0].transform).toEqual(transform);
    expect(history.revision).toBe(1);
    history.undo();
    expect(history.project.nodes[0].transform).toEqual(identityTransform());
    history.redo();
    expect(history.project.nodes[0].transform).toEqual(transform);
  });
  it.each([0, Infinity, NaN, 1e100, 1e-50, -1e-50, 1e-40])(
    'rejects unsupported scale %s without committing',
    (scale) => {
      const h = new ProjectHistory(fixture());
      const original = h.project;
      expect(() =>
        h.execute((p) =>
          setNodeTransform(p, 'box-node', { ...identityTransform(), scale: [scale, 1, 1] }),
        ),
      ).toThrow();
      expect(h.project).toEqual(original);
      expect(h.canUndo).toBe(false);
    },
  );
  it('duplicates an independent mesh with remapped IDs and materials', () => {
    const p = fixture();
    cloneNode(p, 'box-node', 'copy');
    validateProject(p);
    expect(p.nodes[1].meshId).toBe('copy-mesh');
    expect(p.meshes[1].vertices[0].id).toBe('copy-v0');
    expect(p.meshes[1].faces[0].materialId).toBe('copy-m0');
    p.meshes[1].vertices[0].position[0] = 9;
    p.materials[1].baseColor[0] = 1;
    expect(p.meshes[0].vertices[0].position[0]).toBe(-0.5);
    expect(p.materials[0].baseColor[0]).toBe(0.15);
  });
  it('rejects a parent-child transform that becomes singular in Float32 despite nonzero columns', () => {
    const p = fixture();
    p.nodes.push({
      id: 'parent',
      name: 'Parent',
      parentId: null,
      transform: {
        ...identityTransform(),
        rotation: rotationFromDegrees([0, 0, 45]),
        scale: [1, 1e-10, 1],
      },
    });
    p.nodes[0].parentId = 'parent';
    const before = structuredClone(p);
    expect(() =>
      setNodeTransform(p, 'box-node', {
        ...identityTransform(),
        rotation: rotationFromDegrees([0, 0, 45]),
      }),
    ).toThrow();
    expect(p).toEqual(before);
    setNodeTransform(p, 'box-node', { ...identityTransform(), scale: [-1, 2, 3] });
    validateProject(p);
  });
  it('does not partially duplicate when identifiers collide', () => {
    const p = fixture(),
      original = structuredClone(p);
    expect(() => cloneNode(p, 'box-node', 'box')).toThrow();
    expect(p).toEqual(original);
  });
  it('keeps local transform and parent when copying a leaf', () => {
    const p = fixture();
    p.nodes.push({ id: 'parent', name: 'Parent', parentId: null, transform: identityTransform() });
    p.nodes[0].parentId = 'parent';
    cloneNode(p, 'box-node', 'copy');
    expect(p.nodes.at(-1)?.parentId).toBe('parent');
    expect(() => cloneNode(p, 'parent', 'group')).toThrow();
  });
  it('rejects edits of an animated parent and preserves tracks', () => {
    const p = fixture();
    p.clips.push({
      id: 'clip',
      name: 'clip',
      duration: 1,
      loop: false,
      tracks: [
        {
          nodeId: 'box-node',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [{ time: 0, value: [0, 0, 0] }],
        },
      ],
    });
    const original = structuredClone(p);
    expect(() => setNodeTransform(p, 'box-node', identityTransform())).toThrow();
    expect(() => cloneNode(p, 'box-node', 'copy')).toThrow();
    expect(p).toEqual(original);
  });
  it('changes shared material factors explicitly, or copies for one mesh', () => {
    const p = fixture();
    addBox(p, 'other');
    p.meshes[1].faces.forEach((f) => {
      f.materialId = 'box-material';
    });
    const factors = {
      baseColor: [1, 0, 0, 1] as [number, number, number, number],
      metallic: 0.4,
      roughness: 0.8,
    };
    updateMaterial(p, 'box-material', factors, 'box-mesh');
    validateProject(p);
    expect(p.meshes[1].faces[0].materialId).toBe('box-material');
    expect(p.materials[0].baseColor[0]).toBe(0.15);
    expect(p.materials.at(-1)?.baseColor).toEqual(factors.baseColor);
    updateMaterial(p, 'box-material', factors);
    expect(p.materials[0].metallic).toBe(0.4);
  });
  it('rejects invalid factors and ambiguous shared mesh copies', () => {
    const p = fixture();
    p.nodes.push({ ...structuredClone(p.nodes[0]), id: 'instance' });
    const factors = {
      baseColor: [1, 1, 1, 1] as [number, number, number, number],
      metallic: 0,
      roughness: 1,
    };
    expect(() => updateMaterial(p, 'box-material', factors, 'box-mesh')).toThrow();
    expect(() => updateMaterial(p, 'box-material', { ...factors, roughness: NaN })).toThrow();
  });
  it('renames with explicit nonempty text', () => {
    const p = fixture();
    renameNode(p, 'box-node', '柱');
    expect(p.nodes[0].name).toBe('柱');
    expect(() => renameNode(p, 'box-node', ' ')).toThrow();
  });
});
