import { describe, expect, it } from 'vitest';
import { createProject } from '../model/project';
import { addPrimitive } from './primitives';
import { ProjectHistory } from './history';
import { addMaterial, assignMaterial, duplicateMaterial } from './materialEditing';
const factors = {
  baseColor: [0.2, 0.3, 0.4, 1] as [number, number, number, number],
  metallic: 0.5,
  roughness: 0.6,
};
function fixture() {
  const p = createProject('work');
  addPrimitive(p, 'shape', { kind: 'box', width: 1, height: 1, depth: 1, segments: 1 });
  return p;
}
describe('native material creation and assignment', () => {
  it('creates a distinct unused material and duplicates all source fields without aliasing', () => {
    const p = fixture();
    addMaterial(p, 'new', factors);
    duplicateMaterial(p, 'new', 'copy');
    p.materials[2].baseColor[0] = 0.9;
    expect(p.materials[1].baseColor[0]).toBe(0.2);
    expect(p.meshes[0].faces.every((f) => f.materialId === 'shape-material')).toBe(true);
  });
  it('rejects duplicate IDs and invalid factors atomically', () => {
    const p = fixture(),
      before = structuredClone(p);
    expect(() => addMaterial(p, 'shape-material', factors)).toThrow();
    expect(() => addMaterial(p, 'invalid', { ...factors, metallic: 2 })).toThrow();
    expect(p).toEqual(before);
  });
  it('assigns selected faces while preserving their UVs, normals, topology and other materials', () => {
    const h = new ProjectHistory(fixture());
    h.execute((p) => addMaterial(p, 'new', factors));
    const before = h.project;
    const target = before.meshes[0].faces[0].id;
    h.execute((p) => assignMaterial(p, 'shape-mesh', [target, target], 'new'));
    const after = h.project;
    expect(after.meshes[0].faces[0]).toEqual({ ...before.meshes[0].faces[0], materialId: 'new' });
    expect(after.meshes[0].faces.slice(1)).toEqual(before.meshes[0].faces.slice(1));
    h.undo();
    expect(h.project.meshes).toEqual(before.meshes);
    h.redo();
    expect(h.project.meshes).toEqual(after.meshes);
  });
  it('refuses shared mesh and stale selection without a partial assignment', () => {
    const p = fixture();
    addMaterial(p, 'new', factors);
    const before = structuredClone(p);
    expect(() =>
      assignMaterial(p, 'shape-mesh', [p.meshes[0].faces[0].id, 'missing'], 'new'),
    ).toThrow();
    expect(p).toEqual(before);
    p.nodes.push({ ...structuredClone(p.nodes[0]), id: 'instance' });
    const shared = structuredClone(p);
    expect(() => assignMaterial(p, 'shape-mesh', [p.meshes[0].faces[0].id], 'new')).toThrow();
    expect(p).toEqual(shared);
  });
});
