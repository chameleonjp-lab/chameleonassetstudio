import { describe, expect, it, vi } from 'vitest';
import { evaluateClip } from '../animation/evaluation';
import { smallProject } from '../fixtures/project';
import { worldMatrix } from '../model/coordinates';
import {
  createProject,
  identityTransform,
  validateProject,
  type Project3D,
} from '../model/project';
import { addBox } from './box';
import { HistoryBudgetError, ProjectHistory } from './history';
import {
  applyHierarchyClone,
  previewHierarchyClone,
  type HierarchyCloneId,
  type HierarchyClonePreview,
} from './hierarchyClone';
import { rotationFromDegrees } from './objectEditing';

function fixture(): Project3D {
  const project = smallProject();
  project.nodes[0].parentId = 'root';
  project.nodes[1].parentId = 'root';
  project.nodes.unshift(
    {
      id: 'ancestor',
      name: 'Animated ancestor',
      parentId: null,
      transform: {
        translation: [2, 3, 4],
        rotation: rotationFromDegrees([15, 25, 35]),
        scale: [2, 3, 4],
      },
    },
    {
      id: 'root',
      name: 'Assembly',
      parentId: 'ancestor',
      transform: {
        translation: [1, 2, 3],
        rotation: rotationFromDegrees([20, 30, 40]),
        scale: [1.25, 0.75, 2],
      },
      visible: false,
      locked: false,
    },
  );
  project.nodes.push(
    {
      id: 'shared-instance',
      name: 'Same mesh',
      parentId: 'root',
      transform: identityTransform(),
      meshId: 'mesh-one',
    },
    {
      id: 'second-shape',
      name: 'Other mesh, same material and local vertex IDs',
      parentId: 'root',
      transform: identityTransform(),
      meshId: 'second-mesh',
    },
  );
  project.meshes[0].faces[0].normals = [
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ];
  project.meshes.push({ ...structuredClone(project.meshes[0]), id: 'second-mesh' });
  addBox(project, 'other');
  const externalMesh = project.meshes.find((mesh) => mesh.id === 'other-mesh')!;
  project.skins.push({
    id: 'external-skin',
    meshId: externalMesh.id,
    joints: [structuredClone(project.skins[0].joints[0])],
    weights: externalMesh.vertices.map((vertex) => ({
      vertexId: vertex.id,
      jointIds: ['joint-a'],
      values: [1],
    })),
  });
  const original = 'a'.repeat(64);
  const derived = 'b'.repeat(64);
  project.blobIds = [original, derived];
  Object.assign(project.materials[0], {
    textureBlobId: derived,
    emissiveColor: [0.1, 0.2, 0.3],
    alphaMode: 'MASK',
    alphaCutoff: 0.2,
    doubleSided: true,
  });
  project.sources = [
    {
      id: 'source',
      blobId: original,
      mimeType: 'image/png',
      rights: { declared: 'CC0', embedded: 'Original author' },
    },
    {
      id: 'derived',
      blobId: derived,
      mimeType: 'image/png',
      rights: { declared: 'CC0', embedded: 'Original author' },
      derivedFrom: {
        sourceId: 'source',
        hash: original,
        operation: 'tint',
        version: '1',
        settings: '{"color":"blue"}',
      },
    },
  ];
  project.clips[0].tracks.push(
    {
      nodeId: 'root',
      property: 'translation',
      interpolation: 'LINEAR',
      keys: [
        { time: 0, value: [1, 2, 3] },
        { time: 1, value: [2, 4, 6] },
      ],
    },
    {
      nodeId: 'shape',
      property: 'scale',
      interpolation: 'STEP',
      keys: [{ time: 0, value: [1, 1.5, 2] }],
    },
    {
      nodeId: 'ancestor',
      property: 'translation',
      interpolation: 'LINEAR',
      keys: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [1, 2, 3] },
      ],
    },
    {
      nodeId: 'other-node',
      property: 'rotation',
      interpolation: 'LINEAR',
      keys: [{ time: 0, value: [0, 0, 0, 1] }],
    },
  );
  project.clips.push(
    {
      id: 'second-clip',
      name: 'Keep duration and interpolation',
      duration: 5,
      loop: false,
      tracks: [
        { nodeId: 'joint-a', property: 'rotation', interpolation: 'LINEAR', keys: [] },
        {
          nodeId: 'shape',
          property: 'rotation',
          interpolation: 'STEP',
          keys: [
            { time: 0, value: [0, 0, 0, 1] },
            { time: 5, value: rotationFromDegrees([15, 45, 90]) },
          ],
        },
      ],
    },
    { id: 'empty-clip', name: 'Empty', duration: 0, loop: true, tracks: [] },
    {
      id: 'ancestor-only',
      name: 'Inherited motion',
      duration: 2,
      loop: true,
      tracks: [
        {
          nodeId: 'ancestor',
          property: 'scale',
          interpolation: 'LINEAR',
          keys: [{ time: 0, value: [2, 2, 2] }],
        },
      ],
    },
  );
  project.game.anchors = ['root', 'joint-b', 'other-node', null].map((nodeId, index) => ({
    id: `anchor-${index}`,
    name: `Anchor ${index}`,
    purpose: 'grip',
    nodeId,
    transform: { ...identityTransform(), translation: [1, 2, 3] },
  }));
  project.game.colliders = ['shape', 'other-node', null].map((nodeId, index) => ({
    id: `collider-${index}`,
    name: `Collider ${index}`,
    purpose: 'body',
    nodeId,
    transform: identityTransform(),
    shape: 'capsule',
    size: [2, 3, 4],
    radius: 0.75,
    height: 2,
  }));
  validateProject(project);
  return project;
}

const mapped = (entries: HierarchyCloneId[], id: string) =>
  entries.find((entry) => entry.sourceId === id)!.clonedId;
const preview = (project: Project3D) => previewHierarchyClone(project, 'root', 'copy');

describe('confirmed full-subtree cloning', () => {
  it('previews all added dependencies and retained sources without changing any collection', () => {
    const project = fixture();
    const before = structuredClone(project);
    const references = { ...project };
    const result = preview(project);
    expect(result).toMatchObject({
      projectId: project.id,
      revision: 0,
      rootNodeId: 'root',
      prefix: 'copy',
      clonedRootId: 'copy-node-0',
      parentId: 'ancestor',
      nodeIds: ['root', 'shape', 'joint-a', 'joint-b', 'shared-instance', 'second-shape'],
      meshIds: ['mesh-one', 'second-mesh'],
      materialIds: ['mat'],
      skinIds: ['skin'],
      anchorIds: ['anchor-0', 'anchor-1'],
      colliderIds: ['collider-0'],
      clipIds: ['clip', 'second-clip'],
      retainedAncestorIds: ['ancestor'],
      retainedExternalSkinIds: ['external-skin'],
      retainedSourceIds: ['source', 'derived'],
      retainedBlobIds: before.blobIds,
      sharedTextureBlobIds: ['b'.repeat(64)],
      counts: {
        nodes: 6,
        meshes: 2,
        vertices: 6,
        faces: 2,
        materials: 1,
        skins: 1,
        joints: 2,
        weights: 3,
        influences: 6,
        clips: 2,
        tracks: 5,
        keys: 7,
        anchors: 2,
        colliders: 1,
        inheritedTracks: 2,
        inheritedKeys: 3,
        retainedExternalSkins: 1,
        retainedSources: 2,
        retainedBlobs: 2,
        sharedTextureBlobs: 1,
      },
      projectSnapshot: JSON.stringify(before),
    });
    expect(result.tracks).toEqual([
      { clipId: 'clip', nodeId: 'joint-b', property: 'translation', keyCount: 2 },
      { clipId: 'clip', nodeId: 'root', property: 'translation', keyCount: 2 },
      { clipId: 'clip', nodeId: 'shape', property: 'scale', keyCount: 1 },
      { clipId: 'second-clip', nodeId: 'joint-a', property: 'rotation', keyCount: 0 },
      { clipId: 'second-clip', nodeId: 'shape', property: 'rotation', keyCount: 2 },
    ]);
    expect(result.inheritedTracks).toEqual([
      { clipId: 'clip', nodeId: 'ancestor', property: 'translation', keyCount: 2 },
      { clipId: 'ancestor-only', nodeId: 'ancestor', property: 'scale', keyCount: 1 },
    ]);
    expect(project).toEqual(before);
    for (const key of [
      'nodes',
      'meshes',
      'materials',
      'skins',
      'clips',
      'game',
      'sources',
      'blobIds',
    ] as const)
      expect(project[key]).toBe(references[key]);
    result.retainedBlobIds.push('c'.repeat(64));
    expect(project.blobIds).toEqual(before.blobIds);
  });

  it('remaps the full subtree, geometry, skin joints and each weighted vertex exactly once', () => {
    const project = fixture();
    const before = structuredClone(project);
    const result = preview(project);
    expect(applyHierarchyClone(project, result)).toBe(result.clonedRootId);
    validateProject(project);
    for (const { sourceId, clonedId } of result.idRemap.nodes) {
      const source = before.nodes.find((node) => node.id === sourceId)!;
      const copy = project.nodes.find((node) => node.id === clonedId)!;
      expect(copy).toEqual({
        ...source,
        id: clonedId,
        name: source.id === 'root' ? 'Assembly コピー' : source.name,
        parentId:
          source.id === 'root' ? 'ancestor' : mapped(result.idRemap.nodes, source.parentId!),
        ...(source.meshId ? { meshId: mapped(result.idRemap.meshes, source.meshId) } : {}),
      });
      expect(copy.transform).not.toBe(
        project.nodes.find((node) => node.id === sourceId)!.transform,
      );
      expect(worldMatrix(project, clonedId)).toEqual(worldMatrix(before, sourceId));
    }
    for (const { sourceId, clonedId } of result.idRemap.meshes) {
      const source = before.meshes.find((mesh) => mesh.id === sourceId)!;
      const copy = project.meshes.find((mesh) => mesh.id === clonedId)!;
      const geometry = result.idRemap.geometry.find((item) => item.meshId === sourceId)!;
      expect(copy.vertices).toEqual(
        source.vertices.map((vertex) => ({ ...vertex, id: mapped(geometry.vertices, vertex.id) })),
      );
      expect(copy.faces).toEqual(
        source.faces.map((face) => ({
          ...face,
          id: mapped(geometry.faces, face.id),
          vertexIds: face.vertexIds.map((id) => mapped(geometry.vertices, id)),
          materialId: mapped(result.idRemap.materials, face.materialId!),
        })),
      );
    }
    const originalSkin = before.skins[0];
    const copySkin = project.skins.find(
      (skin) => skin.id === mapped(result.idRemap.skins, 'skin'),
    )!;
    const vertices = result.idRemap.geometry[0].vertices;
    expect(copySkin).toEqual({
      id: mapped(result.idRemap.skins, 'skin'),
      meshId: mapped(result.idRemap.meshes, originalSkin.meshId),
      joints: originalSkin.joints.map((joint) => ({
        ...joint,
        nodeId: mapped(result.idRemap.nodes, joint.nodeId),
      })),
      weights: originalSkin.weights.map((weight) => ({
        ...weight,
        vertexId: mapped(vertices, weight.vertexId),
        jointIds: weight.jointIds.map((id) => mapped(result.idRemap.nodes, id)),
      })),
    });
    expect(project.skins.find((skin) => skin.id === 'external-skin')).toEqual(before.skins[1]);
    expect(project.revision).toBe(before.revision);
    expect(project.schemaVersion).toBe(before.schemaVersion);
  });

  it('preserves intra-copy mesh/material sharing while separating every editable copy from originals', () => {
    const project = fixture();
    project.nodes.push({
      ...structuredClone(project.nodes[2]),
      id: 'outside-instance',
      parentId: null,
    });
    const before = structuredClone(project);
    const result = preview(project);
    applyHierarchyClone(project, result);
    const shape = project.nodes.find((node) => node.id === mapped(result.idRemap.nodes, 'shape'))!;
    const shared = project.nodes.find(
      (node) => node.id === mapped(result.idRemap.nodes, 'shared-instance'),
    )!;
    const second = project.nodes.find(
      (node) => node.id === mapped(result.idRemap.nodes, 'second-shape'),
    )!;
    expect(shape.meshId).toBe(shared.meshId);
    expect(second.meshId).not.toBe(shape.meshId);
    const firstMesh = project.meshes.find((mesh) => mesh.id === shape.meshId)!;
    const secondMesh = project.meshes.find((mesh) => mesh.id === second.meshId)!;
    expect(firstMesh.faces[0].materialId).toBe(secondMesh.faces[0].materialId);
    expect(firstMesh.vertices[0].id).not.toBe(secondMesh.vertices[0].id);
    const material = project.materials.find((item) => item.id === firstMesh.faces[0].materialId)!;
    expect(material).toEqual({
      ...before.materials[0],
      id: mapped(result.idRemap.materials, 'mat'),
    });
    shape.transform.translation[0] = 17;
    firstMesh.vertices[0].position[0] = 23;
    firstMesh.faces[0].uv![0][0] = 0.8;
    firstMesh.faces[0].normals![0][0] = 0.8;
    material.baseColor[0] = 0.8;
    material.emissiveColor![0] = 0.8;
    const skin = project.skins.at(-1)!;
    skin.joints[0].inverseBind[0] = 7;
    skin.weights[0].values[0] = 0.5;
    for (const key of ['nodes', 'meshes', 'materials', 'skins'] as const)
      expect(project[key].slice(0, before[key].length)).toEqual(before[key]);
  });

  it('appends only copied node tracks to existing clips and keeps the animated ancestor shared', () => {
    const project = fixture();
    const before = structuredClone(project);
    const result = preview(project);
    applyHierarchyClone(project, result);
    expect(project.clips).toHaveLength(before.clips.length);
    for (let index = 0; index < project.clips.length; index++) {
      const original = before.clips[index];
      const copy = project.clips[index];
      const tracks = original.tracks
        .filter((track) => result.nodeIds.includes(track.nodeId))
        .map((track) => ({ ...track, nodeId: mapped(result.idRemap.nodes, track.nodeId) }));
      expect(copy).toEqual({ ...original, tracks: [...original.tracks, ...tracks] });
    }
    for (const clip of project.clips)
      for (const time of [0, clip.duration / 2, clip.duration]) {
        const posed = structuredClone(project);
        for (const update of evaluateClip(project, clip.id, time))
          posed.nodes.find((node) => node.id === update.nodeId)!.transform = update.transform;
        for (const { sourceId, clonedId } of result.idRemap.nodes)
          expect(worldMatrix(posed, clonedId)).toEqual(worldMatrix(posed, sourceId));
      }
    project.clips[0].tracks[before.clips[0].tracks.length].keys[0].value[0] = 99;
    expect(project.clips[0].tracks.slice(0, before.clips[0].tracks.length)).toEqual(
      before.clips[0].tracks,
    );
  });

  it('duplicates node-local attachments and keeps global attachments, game metadata, sources and hashes', () => {
    const project = fixture();
    const before = structuredClone(project);
    const sources = project.sources;
    const blobs = project.blobIds;
    const result = preview(project);
    applyHierarchyClone(project, result);
    for (const kind of ['anchors', 'colliders'] as const) {
      expect(project.game[kind].slice(0, before.game[kind].length)).toEqual(before.game[kind]);
      for (const { sourceId, clonedId } of result.idRemap[kind]) {
        const source = before.game[kind].find((item) => item.id === sourceId)!;
        const copy = project.game[kind].find((item) => item.id === clonedId)!;
        expect(copy).toEqual({
          ...source,
          id: clonedId,
          nodeId: mapped(result.idRemap.nodes, source.nodeId!),
        });
        expect(copy.transform).not.toBe(
          project.game[kind].find((item) => item.id === sourceId)!.transform,
        );
      }
      expect(project.game[kind].filter((item) => item.nodeId === null)).toEqual(
        before.game[kind].filter((item) => item.nodeId === null),
      );
    }
    expect({ ...project.game, anchors: [], colliders: [] }).toEqual({
      ...before.game,
      anchors: [],
      colliders: [],
    });
    expect(project.sources).toBe(sources);
    expect(project.sources).toEqual(before.sources);
    expect(project.blobIds).toBe(blobs);
    expect(project.blobIds).toEqual(before.blobIds);
  });

  it('handles a meshless root, detached leaf, out-of-order hierarchy and 128-character source IDs', () => {
    const project = createProject('minimal');
    const id = 'a'.repeat(128);
    project.nodes = [
      { id: 'child', name: 'Child', parentId: id, transform: identityTransform() },
      { id, name: 'R'.repeat(4096), parentId: null, transform: identityTransform() },
    ];
    const result = previewHierarchyClone(project, id, 'p'.repeat(64));
    expect(result.nodeIds).toEqual(['child', id]);
    expect(result.clonedRootId).toBe(`${'p'.repeat(64)}-node-1`);
    expect(result.counts).toMatchObject({ nodes: 2, meshes: 0, materials: 0, skins: 0, tracks: 0 });
    applyHierarchyClone(project, result);
    expect(project.nodes[2].parentId).toBe(result.clonedRootId);
    expect(project.nodes[3].parentId).toBe(null);
    expect(project.nodes[3].name).toHaveLength(4096);
    const leaf = previewHierarchyClone(project, 'child', 'leaf');
    applyHierarchyClone(project, leaf);
    expect(project.nodes.at(-1)!.parentId).toBe(id);
    validateProject(project);
  });

  it('copies every skin bound to a copied mesh and keeps unreferenced resources unchanged', () => {
    const project = fixture();
    project.skins.push({ ...structuredClone(project.skins[0]), id: 'second-skin' });
    project.meshes.push({ id: 'unused-mesh', vertices: [], faces: [] });
    project.skins.push({ id: 'unused-skin', meshId: 'unused-mesh', joints: [], weights: [] });
    const before = structuredClone(project);
    const result = preview(project);
    expect(result.skinIds).toEqual(['skin', 'second-skin']);
    applyHierarchyClone(project, result);
    expect(project.skins).toHaveLength(before.skins.length + 2);
    expect(project.meshes.find((mesh) => mesh.id === 'unused-mesh')).toEqual(before.meshes.at(-1));
    expect(project.skins.find((skin) => skin.id === 'unused-skin')).toEqual(before.skins.at(-1));
    validateProject(project);
  });

  it('rejects a copied skin with any joint outside the subtree, even an unused influence', () => {
    const project = fixture();
    for (const weightsUsed of [true, false]) {
      const candidate = structuredClone(project);
      if (weightsUsed) candidate.nodes.find((node) => node.id === 'joint-a')!.parentId = null;
      else
        candidate.skins[0].joints.push({
          nodeId: 'ancestor',
          inverseBind: [...candidate.skins[0].joints[0].inverseBind],
        });
      validateProject(candidate);
      const before = structuredClone(candidate);
      expect(() => preview(candidate)).toThrow('全joint');
      expect(candidate).toEqual(before);
    }
  });

  it.each([
    'self',
    'ancestor',
    'descendant',
    'joint',
    'shared-clip',
    'protected-joint-clip',
  ] as const)('rejects a %s lock during preview without changing originals', (kind) => {
    const project = fixture();
    if (kind === 'self') project.nodes.find((node) => node.id === 'root')!.locked = true;
    if (kind === 'ancestor') project.nodes.find((node) => node.id === 'ancestor')!.locked = true;
    if (kind === 'descendant')
      project.nodes.find((node) => node.id === 'second-shape')!.locked = true;
    if (kind === 'joint') project.nodes.find((node) => node.id === 'joint-b')!.locked = true;
    if (kind === 'shared-clip' || kind === 'protected-joint-clip') {
      project.nodes.find((node) => node.id === 'other-node')!.locked = true;
      if (kind === 'protected-joint-clip')
        project.clips[0].tracks = project.clips[0].tracks.filter(
          (track) => track.nodeId !== 'other-node',
        );
    }
    const before = structuredClone(project);
    expect(() => preview(project)).toThrow('ロック');
    expect(project).toEqual(before);
  });

  it('permits static copying of shared resources used by an unrelated locked object without editing them', () => {
    const project = fixture();
    project.clips = [];
    project.nodes.push({
      ...structuredClone(project.nodes[2]),
      id: 'locked-shared',
      parentId: null,
      locked: true,
    });
    project.nodes.find((node) => node.id === 'other-node')!.locked = true;
    const before = structuredClone(project);
    const result = preview(project);
    applyHierarchyClone(project, result);
    for (const key of ['nodes', 'meshes', 'materials', 'skins'] as const)
      expect(project[key].slice(0, before[key].length)).toEqual(before[key]);
  });

  it.each(['', ' ', '-bad', '_bad', 'bad space', '日本語', 'x'.repeat(65)])(
    'rejects invalid prefix %j atomically',
    (prefix) => {
      const project = fixture();
      const before = structuredClone(project);
      expect(() => previewHierarchyClone(project, 'root', prefix)).toThrow('複製ID');
      expect(project).toEqual(before);
    },
  );

  it.each([
    'node',
    'mesh',
    'material',
    'skin',
    'anchor',
    'collider',
    'vertex',
    'face',
    'source',
  ] as const)('rejects a generated %s ID collision before publishing any change', (kind) => {
    const project = fixture();
    const id = kind === 'vertex' || kind === 'face' ? `copy-mesh-0-${kind}-0` : `copy-${kind}-0`;
    // An unrelated, valid object owns the would-be generated ID in any namespace.
    // Source IDs are not generated; make a source reserve the new node ID instead.
    if (kind === 'source')
      project.sources.push({ ...structuredClone(project.sources[0]), id: 'copy-node-0' });
    else
      project.nodes.push({ id, name: 'Occupied', parentId: null, transform: identityTransform() });
    const before = structuredClone(project);
    expect(() => preview(project)).toThrow('重複');
    expect(project).toEqual(before);
  });

  it.each([
    'missing',
    'empty',
    'duplicate-node',
    'cycle',
    'missing-parent',
    'missing-vertex',
    'invalid-weight',
    'unknown-field',
  ] as const)(
    'rejects invalid canonical input or %s selection before attempting a copy',
    (kind) => {
      const project = fixture();
      if (kind === 'duplicate-node') project.nodes.push(structuredClone(project.nodes[0]));
      if (kind === 'cycle') project.nodes[0].parentId = 'joint-b';
      if (kind === 'missing-parent') project.nodes[0].parentId = 'absent';
      if (kind === 'missing-vertex') project.meshes[0].faces[0].vertexIds[0] = 'absent';
      if (kind === 'invalid-weight') project.skins[0].weights[0].values[0] = 2;
      if (kind === 'unknown-field') Object.assign(project.nodes[0], { ignored: true });
      const before = structuredClone(project);
      const rootId = kind === 'missing' ? 'missing' : kind === 'empty' ? '' : 'root';
      const clone = vi.spyOn(globalThis, 'structuredClone');
      try {
        expect(() => previewHierarchyClone(project, rootId, 'copy')).toThrow();
        expect(clone).not.toHaveBeenCalled();
      } finally {
        clone.mockRestore();
      }
      expect(project).toEqual(before);
    },
  );

  it.each([
    'revision',
    'identity',
    'rename',
    'geometry',
    'weight',
    'key',
    'dependency',
    'source',
    'lock',
  ] as const)(
    'rejects a stale preview after %s changes, including same-revision mutations',
    (kind) => {
      const project = fixture();
      const result = preview(project);
      if (kind === 'revision') project.revision++;
      if (kind === 'identity') project.id = 'other-project';
      if (kind === 'rename') project.nodes[1].name = 'Changed';
      if (kind === 'geometry') project.meshes[0].vertices[0].position[0] = 99;
      if (kind === 'weight') project.skins[0].weights[0].values = [0.5, 0.5];
      if (kind === 'key') project.clips[0].tracks[0].keys[0].value[0] = 7;
      if (kind === 'dependency') project.game.anchors[3].nodeId = 'root';
      if (kind === 'source') project.sources[0].rights.declared = 'Changed';
      if (kind === 'lock') project.nodes[1].locked = true;
      const before = structuredClone(project);
      expect(() => applyHierarchyClone(project, result)).toThrow('確認し直して');
      expect(project).toEqual(before);
    },
  );

  it.each([
    'nodeIds',
    'meshIds',
    'materialIds',
    'skinIds',
    'clipIds',
    'tracks',
    'anchorIds',
    'colliderIds',
    'inheritedTracks',
    'retainedExternalSkinIds',
    'retainedSourceIds',
    'retainedBlobIds',
    'sharedTextureBlobIds',
    'idRemap',
    'counts',
    'clonedRootId',
    'parentId',
  ] as const)(
    'rejects a tampered %s impact report rather than silently changing the confirmation',
    (kind) => {
      const project = fixture();
      const result = preview(project);
      if (kind === 'counts') result.counts.nodes = 0;
      else if (kind === 'idRemap') result.idRemap.nodes[0].clonedId = 'different';
      else if (kind === 'clonedRootId') result.clonedRootId = 'different';
      else if (kind === 'parentId') result.parentId = null;
      else result[kind] = [];
      const before = structuredClone(project);
      expect(() => applyHierarchyClone(project, result)).toThrow('確認し直して');
      expect(project).toEqual(before);
    },
  );

  it('rejects candidate attachment overflow without exposing any partial changes', () => {
    const project = fixture();
    project.game.anchors = Array.from({ length: 256 }, (_, index) => ({
      ...structuredClone(project.game.anchors[0]),
      id: `many-${index}`,
    }));
    validateProject(project);
    const before = structuredClone(project);
    expect(() => preview(project)).toThrow('attachment count');
    expect(project).toEqual(before);
  });

  it('publishes detached editable collections and cannot reapply the same preview', () => {
    const project = fixture();
    const before = { ...project };
    const result = preview(project);
    applyHierarchyClone(project, structuredClone(result));
    before.nodes[1].name = 'Stale node reference';
    before.meshes[0].vertices[0].position[0] = 99;
    before.materials[0].baseColor[0] = 0.9;
    before.skins[0].weights[0].values[0] = 99;
    before.clips[0].tracks[0].keys[0].value[0] = 99;
    before.game.anchors[0].name = 'Stale anchor reference';
    expect(project.nodes[1].name).toBe('Assembly');
    expect(project.meshes[0].vertices[0].position[0]).toBe(0);
    expect(project.materials[0].baseColor[0]).toBe(0.2);
    expect(project.skins[0].weights[0].values[0]).toBe(0.25);
    expect(project.clips[0].tracks[0].keys[0].value[0]).toBe(0);
    expect(project.game.anchors[0].name).toBe('Anchor 0');
    const current = structuredClone(project);
    expect(() => applyHierarchyClone(project, result)).toThrow('確認し直して');
    expect(project).toEqual(current);
  });

  it('records one history transaction, preserves blob ownership and restores the entire copy on Redo', () => {
    const original = fixture();
    const history = new ProjectHistory(original);
    const result = preview(history.project);
    expect(history.canUndo).toBe(false);
    history.execute((project) => {
      applyHierarchyClone(project, result);
    });
    const copied = history.project;
    expect(history.revision).toBe(1);
    expect(history.retainedBlobIds).toEqual(original.blobIds);
    expect(history.undo()).toBe(true);
    expect(history.project).toEqual({ ...original, revision: 2 });
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.project).toEqual({ ...copied, revision: 3 });
    history.undo();
    expect(() =>
      history.execute((project) => {
        applyHierarchyClone(project, result);
      }),
    ).toThrow('確認し直して');
    expect(history.canRedo).toBe(true);
    expect(history.project).toEqual({ ...original, revision: 4 });
  });

  it('cancels a temporary copy without advancing revision or consuming Undo', () => {
    const original = fixture();
    const history = new ProjectHistory(original);
    const result = preview(history.project);
    history.previewCommand((project) => {
      applyHierarchyClone(project, result);
    });
    expect(history.preview.nodes).toHaveLength(original.nodes.length + result.counts.nodes);
    expect(history.project).toEqual(original);
    expect(history.revision).toBe(0);
    expect(history.canUndo).toBe(false);
    history.cancelPreview();
    expect(history.preview).toEqual(original);
  });

  it('preserves the project, Redo and pending preview when Undo capacity refuses the copy', () => {
    const original = fixture();
    const bytes = new TextEncoder().encode(JSON.stringify(original)).byteLength;
    const history = new ProjectHistory(original, bytes * 2 + 128);
    history.execute((project) => {
      project.name = 'Renamed';
    });
    history.undo();
    history.previewCommand((project) => {
      project.name = 'Keep pending';
    });
    const before = history.project;
    const pending = history.preview;
    const result = preview(before);
    expect(() =>
      history.execute((project) => {
        applyHierarchyClone(project, result);
      }),
    ).toThrow(HistoryBudgetError);
    expect(history.project).toEqual(before);
    expect(history.preview).toEqual(pending);
    expect(history.revision).toBe(2);
    expect(history.canRedo).toBe(true);
  });

  it('bounds oversized input before cloning or serializing on preview and apply', () => {
    const project = fixture();
    const result = preview(project);
    project.name = 'x'.repeat(64 * 1024 * 1024);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      expect(() => preview(project)).toThrow('engineering profile');
      expect(() => applyHierarchyClone(project, result)).toThrow('engineering profile');
      expect(clone).not.toHaveBeenCalled();
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
      stringify.mockRestore();
    }
    expect(project.nodes).toHaveLength(8);
  });

  it('bounds caller-owned impact metadata before preparing or serializing the report', () => {
    const project = fixture();
    const result: HierarchyClonePreview = preview(project);
    result.nodeIds = ['x'.repeat(64 * 1024 * 1024)];
    const before = structuredClone(project);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(() => applyHierarchyClone(project, result)).toThrow('engineering profile');
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
    expect(project).toEqual(before);
  });

  it('rejects same-revision negative-zero edits that plain JSON would lose', () => {
    const project = fixture();
    project.meshes[0].vertices[0].position[0] = -0;
    const result = preview(project);
    const ordinarySnapshot = JSON.stringify(project);
    project.meshes[0].vertices[0].position[0] = 0;
    expect(JSON.stringify(project)).toBe(ordinarySnapshot);
    const before = structuredClone(project);
    expect(() => applyHierarchyClone(project, result)).toThrow('確認し直して');
    expect(project).toEqual(before);
  });

  it('bounds the larger planned candidate before deep cloning or serialization', () => {
    const project = createProject('large');
    project.nodes = [{ id: 'root', name: 'Root', parentId: null, transform: identityTransform() }];
    const name = 'x'.repeat(4096);
    for (let index = 0; index < 8200; index++)
      project.nodes.push({
        id: `n-${index}`,
        name,
        parentId: 'root',
        transform: identityTransform(),
      });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      expect(() => preview(project)).toThrow('engineering profile');
      expect(clone).not.toHaveBeenCalled();
      expect(stringify).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
      stringify.mockRestore();
    }
    expect(project.nodes).toHaveLength(8201);
    expect(project.revision).toBe(0);
  });
});
