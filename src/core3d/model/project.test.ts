import { describe, it, expect } from 'vitest';
import { smallProject } from '../fixtures/project';
import { createProject, validateProject, cloneProject, identityTransform } from './project';
import { worldMatrix, transformPoint } from './coordinates';

describe('native 3D project contract', () => {
  it('rejects unsupported bound-skin scales in both rest transforms and keys', () => {
    const p = smallProject();
    p.nodes[1].transform.scale = [0, 1, 1];
    expect(() => validateProject(p)).toThrow('positive scale');
    const q = smallProject();
    q.clips[0].tracks.push({
      nodeId: 'joint-a',
      property: 'scale',
      interpolation: 'LINEAR',
      keys: [{ time: 0, value: [-1, 1, 1] }],
    });
    expect(() => validateProject(q)).toThrow('positive animated scale');
  });
  it('creates an independent empty project and preserves a tiny editable skin/clip fixture', () => {
    expect(createProject('empty').format).toBe('chameleon-project-3d');
    const p = smallProject();
    expect(() => validateProject(p)).not.toThrow();
    const copy = cloneProject(p);
    copy.meshes[0].vertices[0].position[0] = 2;
    expect(p.meshes[0].vertices[0].position[0]).toBe(0);
  });
  it('rejects future versions and wrong domains before normalization', () => {
    expect(() => validateProject({ ...smallProject(), schemaVersion: '0.2.0' })).toThrow(
      'format/version',
    );
    expect(() => validateProject({ ...smallProject(), format: 'chameleon-project' })).toThrow(
      'format/version',
    );
  });
  it('checks references and rejects an incomplete skin instead of inventing weights', () => {
    const p = smallProject();
    p.skins[0].weights.pop();
    expect(() => validateProject(p)).toThrow('Unassigned');
    const q = smallProject();
    q.nodes[0].meshId = 'missing';
    expect(() => validateProject(q)).toThrow('reference');
  });
  it('keeps corner attributes and animation timing meaningful', () => {
    const p = smallProject();
    p.meshes[0].faces[0].uv!.pop();
    expect(() => validateProject(p)).toThrow('Corner count');
    const q = smallProject();
    q.clips[0].tracks[0].keys[1].time = 0;
    expect(() => validateProject(q)).toThrow('key time');
    expect(q.clips[0].tracks[0].keys).toHaveLength(2);
  });
  it('uses column vectors and parent times local without changing the canonical data', () => {
    const p = createProject('coords');
    const parent = identityTransform();
    parent.translation = [10, 0, 0];
    parent.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const child = identityTransform();
    child.translation = [2, 0, 0];
    p.nodes = [
      { id: 'parent', name: 'Parent', parentId: null, transform: parent },
      { id: 'child', name: 'Child', parentId: 'parent', transform: child },
    ];
    validateProject(p);
    const result = transformPoint(worldMatrix(p, 'child'), [1, 0, 0]);
    expect(result[0]).toBeCloseTo(10, 10);
    expect(result[1]).toBeCloseTo(3, 10);
    expect(result[2]).toBe(0);
    expect(p.nodes[1].transform.translation).toEqual([2, 0, 0]);
  });
});
