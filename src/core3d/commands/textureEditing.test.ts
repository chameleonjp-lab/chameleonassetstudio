import { describe, expect, it } from 'vitest';
import { createProject, type Source3D } from '../model/project';
import { addPrimitive } from './primitives';
import { ProjectHistory } from './history';
import {
  applyDerivedBaseColorTexture,
  assignBaseColorTexture,
  removeBaseColorTexture,
  restoreOriginalBaseColorTexture,
} from './textureEditing';

const hash = '1'.repeat(64),
  derivedHash = '2'.repeat(64),
  nextHash = '3'.repeat(64);
const source: Source3D = {
  id: 'original',
  blobId: hash,
  mimeType: 'image/jpeg',
  rights: { declared: 'My photograph', embedded: 'Original embedded terms' },
};
const derived = {
  id: 'adjusted',
  blobId: derivedHash,
  operation: 'baseColor-adjust',
  version: '1',
  settings: '{"brightness":0.1}',
};
function fixture() {
  const project = createProject('texture-project');
  addPrimitive(project, 'shape', { kind: 'box', width: 1, height: 1, depth: 1, segments: 1 });
  return project;
}
describe('native baseColor texture commands', () => {
  it('imports, replaces and detaches without altering source metadata, factors, UVs or topology', () => {
    const project = fixture(),
      original = structuredClone(project);
    assignBaseColorTexture(project, 'shape-material', source);
    const replacement = { ...structuredClone(source), id: 'replacement', blobId: nextHash };
    assignBaseColorTexture(project, 'shape-material', replacement);
    expect(project.sources).toEqual([source, replacement]);
    expect(project.blobIds).toEqual([hash, nextHash]);
    expect(project.meshes).toEqual(original.meshes);
    expect(project.materials[0]).toEqual({ ...original.materials[0], textureBlobId: nextHash });
    removeBaseColorTexture(project, 'shape-material');
    expect(project.materials).toEqual(original.materials);
    expect(project.sources).toEqual([source, replacement]);
    expect(project.blobIds).toEqual([hash, nextHash]);
  });

  it('preserves the full source chain and rights, then restores its root with Undo/Redo', () => {
    const history = new ProjectHistory(fixture());
    history.execute((p) => assignBaseColorTexture(p, 'shape-material', source));
    history.execute((p) => applyDerivedBaseColorTexture(p, 'shape-material', 'original', derived));
    history.execute((p) =>
      applyDerivedBaseColorTexture(p, 'shape-material', 'adjusted', {
        ...derived,
        id: 'adjusted-again',
        blobId: nextHash,
      }),
    );
    const adjusted = history.project;
    expect(adjusted.sources[1]).toEqual({
      id: 'adjusted',
      blobId: derivedHash,
      mimeType: 'image/png',
      rights: source.rights,
      derivedFrom: {
        sourceId: source.id,
        hash,
        operation: derived.operation,
        version: derived.version,
        settings: derived.settings,
      },
    });
    expect(adjusted.sources[2].derivedFrom?.sourceId).toBe('adjusted');
    history.execute((p) => restoreOriginalBaseColorTexture(p, 'shape-material', 'adjusted-again'));
    expect(history.project.materials[0].textureBlobId).toBe(hash);
    expect(history.project.sources).toEqual(adjusted.sources);
    expect(history.project.meshes).toEqual(adjusted.meshes);
    history.undo();
    expect(history.project.materials[0].textureBlobId).toBe(nextHash);
    history.redo();
    expect(history.project.materials[0].textureBlobId).toBe(hash);
  });

  it('uses the explicitly chosen source when two original records share bytes', () => {
    const project = fixture();
    assignBaseColorTexture(project, 'shape-material', source);
    const other = {
      ...structuredClone(source),
      id: 'other-original',
      rights: { declared: 'Different declaration', embedded: 'Other embedded terms' },
    };
    assignBaseColorTexture(project, 'shape-material', other);
    applyDerivedBaseColorTexture(project, 'shape-material', other.id, derived);
    expect(project.sources[2].derivedFrom?.sourceId).toBe(other.id);
    expect(project.sources[2].rights).toEqual(other.rights);
    expect(project.sources[0]).toEqual(source);
  });

  it('rejects stale sources, unsupported images, duplicate lineage IDs and missing UV atomically', () => {
    const project = fixture();
    assignBaseColorTexture(project, 'shape-material', source);
    const before = structuredClone(project);
    expect(() =>
      applyDerivedBaseColorTexture(project, 'shape-material', 'missing', derived),
    ).toThrow();
    expect(() =>
      applyDerivedBaseColorTexture(project, 'shape-material', source.id, {
        ...derived,
        id: source.id,
      }),
    ).toThrow();
    expect(() =>
      assignBaseColorTexture(project, 'shape-material', { ...source, mimeType: 'image/gif' }),
    ).toThrow();
    expect(() =>
      assignBaseColorTexture(project, 'shape-material', { ...source, blobId: nextHash }),
    ).toThrow();
    expect(project).toEqual(before);
    delete project.meshes[0].faces[0].uv;
    const noUv = structuredClone(project);
    expect(() => assignBaseColorTexture(project, 'shape-material', source)).toThrow('UV');
    expect(project).toEqual(noUv);
    removeBaseColorTexture(project, 'shape-material');
    expect(project.materials[0].textureBlobId).toBeUndefined();
  });

  it('allows unassigned materials and leaves other map-independent data unchanged', () => {
    const project = fixture();
    project.materials.push({ id: 'unused', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1 });
    const existing = structuredClone(project.materials[0]);
    assignBaseColorTexture(project, 'unused', source);
    expect(project.materials[0]).toEqual(existing);
    expect(project.materials[1].textureBlobId).toBe(hash);
  });
});
