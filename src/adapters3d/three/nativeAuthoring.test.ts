import { describe, expect, it, vi } from 'vitest';
import { createProject, identityTransform } from '../../core3d/model/project';
import { addPrimitive } from '../../core3d/commands/primitives';
import { extrudeFace, moveVertices } from '../../core3d/commands/meshEditing';
import { updateMaterial } from '../../core3d/commands/objectEditing';
import { buildNativeGraph, checkNativeProfile } from './renderer';

describe('authored native data reaches renderer without changing its ownership', () => {
  it('expands edited corners and material groups under a mirrored nonuniform parent', () => {
    const p = createProject('authored');
    addPrimitive(p, 'shape', { kind: 'plane', width: 2, height: 1, depth: 3, segments: 1 });
    p.nodes.push({
      id: 'parent',
      name: 'Parent',
      parentId: null,
      transform: {
        ...identityTransform(),
        scale: [-2, 3, 0.5],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      },
    });
    p.nodes[0].parentId = 'parent';
    moveVertices(p, 'shape-mesh', [p.meshes[0].vertices[0].id], [0, 0.1, 0]);
    extrudeFace(p, 'shape-mesh', p.meshes[0].faces[0].id, 0.2, 'extrusion');
    p.materials.push({ id: 'accent', baseColor: [1, 0, 0, 1], metallic: 0, roughness: 1 });
    p.meshes[0].faces[1].materialId = 'accent';
    updateMaterial(p, p.materials[0].id, {
      baseColor: [0.2, 0.3, 0.4, 0.5],
      metallic: 0.6,
      roughness: 0.7,
      alphaMode: 'BLEND',
    });
    expect(checkNativeProfile(p).ok).toBe(true);
    const before = structuredClone(p),
      graph = buildNativeGraph(p),
      geometry = graph.geometries[0];
    const vertices = new Map(p.meshes[0].vertices.map((v) => [v.id, v.position]));
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(
      p.meshes[0].faces.flatMap((f) =>
        f.vertexIds.flatMap((id) => vertices.get(id)!.map(Math.fround)),
      ),
    );
    expect(Array.from(geometry.getAttribute('normal').array)).toEqual(
      p.meshes[0].faces.flatMap((f) => f.normals!.flatMap((n) => n.map(Math.fround))),
    );
    expect(Array.from(geometry.getAttribute('uv').array)).toEqual(
      p.meshes[0].faces.flatMap((f) => f.uv!.flatMap((uv) => uv.map(Math.fround))),
    );
    expect(geometry.groups.reduce((sum, g) => sum + g.count, 0)).toBe(p.meshes[0].faces.length * 3);
    expect(graph.materials).toHaveLength(2);
    expect(graph.materials[0].color.toArray()).toEqual([0.2, 0.3, 0.4]);
    expect(graph.materials[0]).toMatchObject({ metalness: 0.6, roughness: 0.7, opacity: 0.5 });
    const dispose = vi.spyOn(geometry, 'dispose');
    graph.dispose();
    graph.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(p).toEqual(before);
  });
});
