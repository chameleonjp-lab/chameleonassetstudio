import { describe, expect, it, vi } from 'vitest';
import { smallProject } from '../fixtures/project';
import { identityTransform, validateProject, type Project3D } from '../model/project';
import { addBox } from './box';
import { HistoryBudgetError, ProjectHistory } from './history';
import { applyObjectDeletion, previewObjectDeletion } from './objectDeletion';

function fixture(): Project3D {
  const project = smallProject();
  addBox(project, 'other');
  project.meshes.push({ id: 'unrelated-mesh', vertices: [], faces: [] });
  const original = 'a'.repeat(64);
  const derived = 'b'.repeat(64);
  project.blobIds = [original, derived];
  project.materials[0].textureBlobId = derived;
  project.sources = [
    {
      id: 'source',
      blobId: original,
      mimeType: 'image/png',
      rights: { declared: '', embedded: '' },
    },
    {
      id: 'derived',
      blobId: derived,
      mimeType: 'image/png',
      rights: { declared: '', embedded: '' },
      derivedFrom: {
        sourceId: 'source',
        hash: original,
        operation: 'tint',
        version: '1',
        settings: '{}',
      },
    },
  ];
  project.clips[0].tracks.push(
    {
      nodeId: 'shape',
      property: 'translation',
      interpolation: 'LINEAR',
      keys: [{ time: 0, value: [0, 0, 0] }],
    },
    {
      nodeId: 'shape',
      property: 'scale',
      interpolation: 'STEP',
      keys: [{ time: 0, value: [1, 1, 1] }],
    },
  );
  project.clips.push({
    id: 'empty-after-deletion',
    name: 'Keep clip identity',
    duration: 5,
    loop: false,
    tracks: [structuredClone(project.clips[0].tracks[1])],
  });
  project.game.anchors = [
    {
      id: 'shape-anchor',
      nodeId: 'shape',
      name: 'Shape',
      purpose: 'grip',
      transform: identityTransform(),
    },
    {
      id: 'joint-anchor',
      nodeId: 'joint-b',
      name: 'Joint',
      purpose: 'grip',
      transform: identityTransform(),
    },
    {
      id: 'world-anchor',
      nodeId: null,
      name: 'World',
      purpose: 'spawn',
      transform: identityTransform(),
    },
  ];
  project.game.colliders = ['shape', 'other-node', null].map((nodeId, index) => ({
    id: `collider-${index}`,
    nodeId,
    name: 'Collider',
    purpose: 'body',
    transform: identityTransform(),
    shape: 'box',
    size: [1, 1, 1],
    radius: 0.5,
    height: 1,
  }));
  validateProject(project);
  return project;
}

describe('explicit native object deletion', () => {
  it('previews exact IDs and dependency counts without changing the source', () => {
    const project = fixture();
    const before = structuredClone(project);
    const selection = ['shape'];
    const preview = previewObjectDeletion(project, selection);
    expect(preview).toEqual({
      projectId: project.id,
      revision: 0,
      requestedNodeIds: ['shape'],
      includeDescendants: false,
      nodeIds: ['shape'],
      meshIds: ['mesh-one'],
      retainedMeshIds: [],
      skinIds: ['skin'],
      retainedSkinIds: [],
      clipIds: ['clip', 'empty-after-deletion'],
      tracks: [
        { clipId: 'clip', nodeId: 'shape', property: 'translation', keyCount: 1 },
        { clipId: 'clip', nodeId: 'shape', property: 'scale', keyCount: 1 },
        { clipId: 'empty-after-deletion', nodeId: 'shape', property: 'translation', keyCount: 1 },
      ],
      anchorIds: ['shape-anchor'],
      colliderIds: ['collider-0'],
      materialIds: ['mat'],
      counts: {
        nodes: 1,
        meshes: 1,
        retainedMeshes: 0,
        skins: 1,
        retainedSkins: 0,
        clips: 2,
        tracks: 3,
        keys: 3,
        anchors: 1,
        colliders: 1,
        materials: 1,
      },
      projectSnapshot: JSON.stringify(project),
    });
    expect(project).toEqual(before);
    selection.push('other-node');
    expect(preview.requestedNodeIds).toEqual(['shape']);
  });

  it('removes only previewed dependents, preserving clips, unrelated resources and source originals', () => {
    const project = fixture();
    const before = structuredClone(project);
    const materials = project.materials;
    const sources = project.sources;
    const blobs = project.blobIds;
    const preview = previewObjectDeletion(project, ['shape']);
    applyObjectDeletion(project, preview);
    validateProject(project);
    expect(project.nodes).toEqual(before.nodes.filter((node) => node.id !== 'shape'));
    expect(project.meshes).toEqual(before.meshes.filter((mesh) => mesh.id !== 'mesh-one'));
    expect(project.skins).toEqual([]);
    expect(project.clips[0]).toEqual({ ...before.clips[0], tracks: [before.clips[0].tracks[0]] });
    expect(project.clips[1]).toEqual({ ...before.clips[1], tracks: [] });
    expect(project.game.anchors).toEqual(before.game.anchors.slice(1));
    expect(project.game.colliders).toEqual(before.game.colliders.slice(1));
    expect(project.materials).toBe(materials);
    expect(project.materials).toEqual(before.materials);
    expect(project.sources).toBe(sources);
    expect(project.sources).toEqual(before.sources);
    expect(project.blobIds).toBe(blobs);
    expect(project.blobIds).toEqual(before.blobIds);
    expect(project.revision).toBe(0);
    expect(project.schemaVersion).toBe(before.schemaVersion);
  });

  it('requires explicit descendant inclusion even when both parent and child were selected', () => {
    const project = fixture();
    const before = structuredClone(project);
    for (const nodeIds of [['joint-a'], ['joint-a', 'joint-b']]) {
      expect(() => previewObjectDeletion(project, nodeIds)).toThrow('子オブジェクト');
      expect(() => previewObjectDeletion(project, nodeIds, { includeDescendants: false })).toThrow(
        '子オブジェクト',
      );
    }
    expect(project).toEqual(before);
  });

  it('deletes an explicit subtree atomically and counts overlapping roots only once', () => {
    const project = fixture();
    const preview = previewObjectDeletion(project, ['joint-a', 'shape', 'joint-b'], {
      includeDescendants: true,
    });
    expect(preview.nodeIds).toEqual(['shape', 'joint-a', 'joint-b']);
    expect(preview.counts.nodes).toBe(3);
    expect(preview.counts.tracks).toBe(4);
    expect(preview.counts.keys).toBe(5);
    expect(preview.anchorIds).toEqual(['shape-anchor', 'joint-anchor']);
    applyObjectDeletion(project, preview);
    validateProject(project);
    expect(project.nodes.map((node) => node.id)).toEqual(['other-node']);
    expect(project.clips.every((clip) => clip.tracks.length === 0)).toBe(true);
    expect(project.game.anchors.map((anchor) => anchor.id)).toEqual(['world-anchor']);
  });

  it('retains a mesh and its skin when another instance, even a locked one, survives', () => {
    const project = smallProject();
    project.nodes.push({ ...structuredClone(project.nodes[0]), id: 'shared', locked: true });
    const before = structuredClone(project);
    const preview = previewObjectDeletion(project, ['shape']);
    expect(preview.meshIds).toEqual([]);
    expect(preview.skinIds).toEqual([]);
    expect(preview.retainedMeshIds).toEqual(['mesh-one']);
    expect(preview.retainedSkinIds).toEqual(['skin']);
    expect(preview.counts).toMatchObject({ retainedMeshes: 1, retainedSkins: 1, materials: 1 });
    applyObjectDeletion(project, preview);
    expect(project.meshes).toEqual(before.meshes);
    expect(project.skins).toEqual(before.skins);
    expect(project.nodes.find((node) => node.id === 'shared')).toEqual(before.nodes[3]);
  });

  it('removes one shared mesh and skin once when all its instances are selected', () => {
    const project = smallProject();
    project.nodes.push({ ...structuredClone(project.nodes[0]), id: 'shared' });
    const preview = previewObjectDeletion(project, ['shape', 'shared']);
    expect(preview.counts).toMatchObject({ nodes: 2, meshes: 1, skins: 1, retainedMeshes: 0 });
    applyObjectDeletion(project, preview);
    expect(project.meshes).toEqual([]);
    expect(project.skins).toEqual([]);
    expect(project.materials).toHaveLength(1);
  });

  it('rejects deleting joints used by any retained skin, including an uninstanced skin', () => {
    const project = fixture();
    const before = structuredClone(project);
    expect(() => previewObjectDeletion(project, ['joint-b'])).toThrow('残るskin');
    expect(() => previewObjectDeletion(project, ['joint-a'], { includeDescendants: true })).toThrow(
      '残るskin',
    );
    expect(project).toEqual(before);
    project.nodes = project.nodes.filter((node) => node.id !== 'shape');
    project.clips = [];
    project.game.anchors = [];
    project.game.colliders = [];
    validateProject(project);
    expect(() => previewObjectDeletion(project, ['joint-b'])).toThrow('残るskin');
  });

  it.each([[], ['shape', 'shape'], ['missing'], ['shape', 'missing']])(
    'rejects an invalid selection %j without mutation',
    (...ids) => {
      // Vitest supplies each row's entries as positional parameters.
      const project = fixture();
      const before = structuredClone(project);
      expect(() => previewObjectDeletion(project, ids)).toThrow();
      expect(project).toEqual(before);
    },
  );

  it.each(['duplicate', 'cycle', 'missing-parent'] as const)(
    'rejects a malformed %s graph before walking or deleting it',
    (kind) => {
      const project = fixture();
      if (kind === 'duplicate') project.nodes.push(structuredClone(project.nodes[0]));
      if (kind === 'cycle') project.nodes[1].parentId = 'joint-b';
      if (kind === 'missing-parent') project.nodes[0].parentId = 'missing';
      const before = structuredClone(project);
      expect(() =>
        previewObjectDeletion(project, ['shape'], { includeDescendants: true }),
      ).toThrow();
      expect(project).toEqual(before);
    },
  );

  it.each(['self', 'ancestor', 'descendant', 'skin-joint', 'shared-clip'] as const)(
    'rejects a %s lock during preview rather than after confirmation',
    (kind) => {
      const project = fixture();
      let nodeIds = ['shape'];
      if (kind === 'self') project.nodes[0].locked = true;
      if (kind === 'ancestor') {
        project.nodes[0].parentId = 'other-node';
        project.nodes[3].locked = true;
      }
      if (kind === 'descendant') {
        project.nodes[2].locked = true;
        nodeIds = ['shape', 'joint-a'];
      }
      if (kind === 'skin-joint') project.nodes[2].locked = true;
      if (kind === 'shared-clip') {
        project.nodes[3].locked = true;
        project.clips[0].tracks.push({
          ...structuredClone(project.clips[0].tracks[1]),
          nodeId: 'other-node',
        });
      }
      const before = structuredClone(project);
      expect(() => previewObjectDeletion(project, nodeIds, { includeDescendants: true })).toThrow(
        'ロック',
      );
      expect(project).toEqual(before);
    },
  );

  it.each(['revision', 'identity', 'rename', 'geometry', 'dependency', 'lock'] as const)(
    'rejects a stale preview after %s changes without deleting anything',
    (kind) => {
      const project = fixture();
      const preview = previewObjectDeletion(project, ['shape']);
      if (kind === 'revision') project.revision++;
      if (kind === 'identity') project.id = 'different-project';
      if (kind === 'rename') project.nodes[0].name = 'Different target';
      if (kind === 'geometry') project.meshes[0].vertices[0].position[0] = 3;
      if (kind === 'dependency') project.game.anchors[2].nodeId = 'shape';
      if (kind === 'lock') project.nodes[0].locked = true;
      const changed = structuredClone(project);
      expect(() => applyObjectDeletion(project, preview)).toThrow('確認し直して');
      expect(project).toEqual(changed);
    },
  );

  it.each([
    'nodes',
    'meshes',
    'skins',
    'tracks',
    'anchors',
    'colliders',
    'materials',
    'counts',
  ] as const)(
    'rejects a tampered %s preview instead of silently expanding its stated impact',
    (kind) => {
      const project = fixture();
      const preview = previewObjectDeletion(project, ['shape']);
      if (kind === 'nodes') preview.nodeIds = ['other-node'];
      if (kind === 'meshes') preview.meshIds = [];
      if (kind === 'skins') preview.skinIds = [];
      if (kind === 'tracks') preview.tracks = [];
      if (kind === 'anchors') preview.anchorIds = [];
      if (kind === 'colliders') preview.colliderIds = [];
      if (kind === 'materials') preview.materialIds = [];
      if (kind === 'counts') preview.counts.nodes = 0;
      const before = structuredClone(project);
      expect(() => applyObjectDeletion(project, preview)).toThrow('確認し直して');
      expect(project).toEqual(before);
    },
  );

  it('publishes detached collections only and cannot reapply the same preview', () => {
    const project = fixture();
    const oldNodes = project.nodes;
    const oldMeshes = project.meshes;
    const oldClips = project.clips;
    const oldGame = project.game;
    const preview = previewObjectDeletion(project, ['shape']);
    applyObjectDeletion(project, structuredClone(preview));
    oldNodes[1].name = 'Stale external reference';
    oldMeshes[1].vertices[0].position[0] = 99;
    oldClips[0].tracks[0].keys[0].value[0] = 99;
    oldGame.anchors[1].name = 'Stale anchor';
    expect(project.nodes[0].name).toBe('A');
    expect(project.meshes[0].vertices[0].position[0]).not.toBe(99);
    expect(project.clips[0].tracks[0].keys[0].value[0]).toBe(0);
    expect(project.game.anchors[0].name).toBe('Joint');
    expect(() => applyObjectDeletion(project, preview)).toThrow('確認し直して');
  });

  it('records one Undo step and restores all dependencies, textures and source identities', () => {
    const original = fixture();
    const history = new ProjectHistory(original);
    const preview = previewObjectDeletion(history.project, ['shape']);
    expect(history.canUndo).toBe(false);
    history.execute((project) => applyObjectDeletion(project, preview));
    const deleted = history.project;
    expect(history.revision).toBe(1);
    expect(history.canUndo).toBe(true);
    expect(history.retainedBlobIds).toEqual(original.blobIds);
    expect(history.undo()).toBe(true);
    expect(history.project).toEqual({ ...original, revision: 2 });
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.project).toEqual({ ...deleted, revision: 3 });
    expect(history.undo()).toBe(true);
    expect(() => history.execute((project) => applyObjectDeletion(project, preview))).toThrow(
      '確認し直して',
    );
    expect(history.project).toEqual({ ...original, revision: 4 });
    expect(history.canRedo).toBe(true);
  });

  it('cancels deletion preview without changing history or revision', () => {
    const original = fixture();
    const history = new ProjectHistory(original);
    const preview = previewObjectDeletion(history.project, ['shape']);
    history.previewCommand((project) => applyObjectDeletion(project, preview));
    expect(history.preview.nodes.some((node) => node.id === 'shape')).toBe(false);
    expect(history.project).toEqual(original);
    expect(history.revision).toBe(0);
    expect(history.canUndo).toBe(false);
    history.cancelPreview();
    expect(history.preview).toEqual(original);
  });

  it('keeps the original and pending preview when deletion alone exceeds the Undo budget', () => {
    const original = fixture();
    const budget = new TextEncoder().encode(JSON.stringify(original)).byteLength;
    const history = new ProjectHistory(original, budget);
    history.previewCommand((project) => {
      project.name = 'Keep preview';
    });
    const before = history.preview;
    const preview = previewObjectDeletion(history.project, ['shape']);
    expect(() => history.execute((project) => applyObjectDeletion(project, preview))).toThrow(
      HistoryBudgetError,
    );
    expect(history.project).toEqual(original);
    expect(history.preview).toEqual(before);
    expect(history.revision).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it('rejects oversized metadata before a clone or JSON allocation on preview and apply', () => {
    const project = fixture();
    const preview = previewObjectDeletion(project, ['shape']);
    project.name = 'x'.repeat(64 * 1024 * 1024);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      expect(() => previewObjectDeletion(project, ['shape'])).toThrow('engineering profile');
      expect(() => applyObjectDeletion(project, preview)).toThrow('engineering profile');
      expect(clone).not.toHaveBeenCalled();
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
      stringify.mockRestore();
    }
    expect(project.nodes.some((node) => node.id === 'shape')).toBe(true);
  });

  it('preserves current content, redo and an existing preview when Undo capacity refuses deletion', () => {
    const original = fixture();
    const initialBytes = new TextEncoder().encode(JSON.stringify(original)).byteLength;
    const history = new ProjectHistory(original, initialBytes * 2 + 128);
    history.execute((project) => {
      project.name = 'Renamed';
    });
    history.undo();
    history.previewCommand((project) => {
      project.name = 'Keep preview';
    });
    const projectBefore = history.project;
    const previewBefore = history.preview;
    const deletion = previewObjectDeletion(projectBefore, ['shape']);
    // The named candidate is intentionally too large for the existing Undo budget;
    // deletion itself stays atomic while history refuses adopting that candidate.
    expect(() =>
      history.execute((project) => {
        applyObjectDeletion(project, deletion);
        project.name = 'x'.repeat(4096);
      }),
    ).toThrow(HistoryBudgetError);
    expect(history.project).toEqual(projectBefore);
    expect(history.preview).toEqual(previewBefore);
    expect(history.canRedo).toBe(true);
    expect(history.revision).toBe(2);
  });
});
