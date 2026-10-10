import { assertLocksPreserved, assertNodeEditable } from '../model/editability';
import { cloneProject, validateProject, type Clip3D, type Project3D } from '../model/project';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';

export interface HierarchyCloneId {
  sourceId: string;
  clonedId: string;
}
export interface HierarchyCloneTrack {
  clipId: string;
  nodeId: string;
  property: Clip3D['tracks'][number]['property'];
  keyCount: number;
}

/** Caller-owned confirmation data. Never persist this baseline in the project. */
export interface HierarchyClonePreview {
  projectId: string;
  revision: number;
  rootNodeId: string;
  prefix: string;
  clonedRootId: string;
  /** The copy stays under this same parent, preserving local TRS and world rest pose. */
  parentId: string | null;
  nodeIds: string[];
  meshIds: string[];
  materialIds: string[];
  skinIds: string[];
  anchorIds: string[];
  colliderIds: string[];
  /** Existing clips receiving appended tracks; clip identities/metadata are retained. */
  clipIds: string[];
  tracks: HierarchyCloneTrack[];
  /** External ancestors and their tracks stay shared; no ancestor track is duplicated. */
  retainedAncestorIds: string[];
  inheritedTracks: HierarchyCloneTrack[];
  /** Uncopied skins using an original joint stay completely unchanged. */
  retainedExternalSkinIds: string[];
  /** Every original source/lineage/hash and blob reference is retained, without IO. */
  retainedSourceIds: string[];
  retainedBlobIds: string[];
  sharedTextureBlobIds: string[];
  idRemap: {
    nodes: HierarchyCloneId[];
    meshes: HierarchyCloneId[];
    materials: HierarchyCloneId[];
    skins: HierarchyCloneId[];
    anchors: HierarchyCloneId[];
    colliders: HierarchyCloneId[];
    /** Vertex/face IDs are scoped by their source mesh, not assumed globally unique. */
    geometry: { meshId: string; vertices: HierarchyCloneId[]; faces: HierarchyCloneId[] }[];
  };
  counts: {
    nodes: number;
    meshes: number;
    vertices: number;
    faces: number;
    materials: number;
    skins: number;
    joints: number;
    weights: number;
    influences: number;
    clips: number;
    tracks: number;
    keys: number;
    anchors: number;
    colliders: number;
    inheritedTracks: number;
    inheritedKeys: number;
    retainedExternalSkins: number;
    retainedSources: number;
    retainedBlobs: number;
    sharedTextureBlobs: number;
  };
  /** Exact canonical baseline, including edits made without advancing revision. */
  projectSnapshot: string;
}

function describeTracks(project: Project3D, nodeIds: ReadonlySet<string>): HierarchyCloneTrack[] {
  return project.clips.flatMap((clip) =>
    clip.tracks
      .filter((track) => nodeIds.has(track.nodeId))
      .map((track) => ({
        clipId: clip.id,
        nodeId: track.nodeId,
        property: track.property,
        keyCount: track.keys.length,
      })),
  );
}

function snapshotProject(project: Project3D): string {
  // JSON alone erases -0, even though it is a valid canonical coordinate. Preserve
  // that distinction so a same-revision numeric edit cannot reuse a confirmation.
  return JSON.stringify(project, (_key, value: unknown) =>
    Object.is(value, -0) ? { negativeZero: true } : value,
  );
}

function prepareClone(
  project: Project3D,
  rootNodeId: string,
  prefix: string,
): { preview: HierarchyClonePreview; candidate: Project3D } {
  // Bound the input before hierarchy traversal, serialization or any deep clone.
  estimateCanonicalBytes(project);
  validateProject(project);
  if (typeof prefix !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(prefix))
    throw new Error('複製IDには英数字で始まる1〜64文字の英数字・_・-を指定してください。');
  const byNode = new Map(project.nodes.map((node) => [node.id, node]));
  const root = byNode.get(rootNodeId);
  if (!root) throw new Error('複製する階層の先頭オブジェクトを1つ選択してください。');
  const children = new Map<string, string[]>();
  for (const node of project.nodes)
    if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node.id);
      children.set(node.parentId, siblings);
    }
  const subtree = new Set<string>();
  const pending = [rootNodeId];
  while (pending.length) {
    const id = pending.pop()!;
    subtree.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  for (const id of subtree) assertNodeEditable(project, id);
  const ancestors = new Set<string>();
  let parentId = root.parentId;
  while (parentId !== null) {
    ancestors.add(parentId);
    parentId = byNode.get(parentId)!.parentId;
  }

  const nodes = project.nodes.filter((node) => subtree.has(node.id));
  const meshIds = new Set(nodes.flatMap((node) => (node.meshId ? [node.meshId] : [])));
  const meshes = project.meshes.filter((mesh) => meshIds.has(mesh.id));
  const materialIds = new Set(
    meshes.flatMap((mesh) =>
      mesh.faces.flatMap((face) => (face.materialId ? [face.materialId] : [])),
    ),
  );
  const materials = project.materials.filter((material) => materialIds.has(material.id));
  const skins = project.skins.filter((skin) => meshIds.has(skin.meshId));
  if (skins.some((skin) => skin.joints.some((joint) => !subtree.has(joint.nodeId))))
    throw new Error(
      '複製するskinの全jointを含む階層を選択してください。元の作品は変更していません。',
    );
  const anchors = project.game.anchors.filter(
    (anchor) => anchor.nodeId !== null && subtree.has(anchor.nodeId),
  );
  const colliders = project.game.colliders.filter(
    (collider) => collider.nodeId !== null && subtree.has(collider.nodeId),
  );

  // Source IDs can be 128 characters or repeat across namespaces/meshes. Typed
  // counters give a total, unambiguous remap without truncation or fuzzy matching.
  const occupied = new Set([
    project.id,
    project.game.assetId,
    ...project.nodes.map((item) => item.id),
    ...project.meshes.map((item) => item.id),
    ...project.materials.map((item) => item.id),
    ...project.skins.map((item) => item.id),
    ...project.clips.map((item) => item.id),
    ...project.sources.map((item) => item.id),
    ...project.game.anchors.map((item) => item.id),
    ...project.game.colliders.map((item) => item.id),
  ]);
  for (const mesh of project.meshes) {
    for (const vertex of mesh.vertices) occupied.add(vertex.id);
    for (const face of mesh.faces) occupied.add(face.id);
  }
  const remap = (items: readonly { id: string }[], kind: string): HierarchyCloneId[] =>
    items.map((item, index) => {
      const clonedId = `${prefix}-${kind}-${index}`;
      if (clonedId.length > 128 || occupied.has(clonedId))
        throw new Error('複製IDが既存データと重複します。別の複製IDで確認し直してください。');
      occupied.add(clonedId);
      return { sourceId: item.id, clonedId };
    });
  const idRemap: HierarchyClonePreview['idRemap'] = {
    nodes: remap(nodes, 'node'),
    meshes: remap(meshes, 'mesh'),
    materials: remap(materials, 'material'),
    skins: remap(skins, 'skin'),
    anchors: remap(anchors, 'anchor'),
    colliders: remap(colliders, 'collider'),
    geometry: meshes.map((mesh, index) => ({
      meshId: mesh.id,
      vertices: remap(mesh.vertices, `mesh-${index}-vertex`),
      faces: remap(mesh.faces, `mesh-${index}-face`),
    })),
  };
  const lookup = (entries: HierarchyCloneId[]) =>
    new Map(entries.map(({ sourceId, clonedId }) => [sourceId, clonedId]));
  const nodeMap = lookup(idRemap.nodes);
  const meshMap = lookup(idRemap.meshes);
  const materialMap = lookup(idRemap.materials);
  const vertexMaps = new Map(
    idRemap.geometry.map((geometry) => [geometry.meshId, lookup(geometry.vertices)]),
  );

  // Plan only IDs and reference-bearing structures. Large vectors/key values stay
  // read-only references until the complete projected candidate has been bounded.
  const additions = {
    nodes: nodes.map((node, index) => ({
      ...node,
      id: idRemap.nodes[index].clonedId,
      name: node.id === rootNodeId ? `${node.name} コピー`.slice(0, 4096) : node.name,
      parentId: node.id === rootNodeId ? node.parentId : nodeMap.get(node.parentId!)!,
      ...(node.meshId === undefined ? {} : { meshId: meshMap.get(node.meshId)! }),
    })),
    meshes: meshes.map((mesh, index) => ({
      id: idRemap.meshes[index].clonedId,
      vertices: mesh.vertices.map((vertex, vertexIndex) => ({
        ...vertex,
        id: idRemap.geometry[index].vertices[vertexIndex].clonedId,
      })),
      faces: mesh.faces.map((face, faceIndex) => ({
        ...face,
        id: idRemap.geometry[index].faces[faceIndex].clonedId,
        vertexIds: face.vertexIds.map((id) => vertexMaps.get(mesh.id)!.get(id)!),
        ...(face.materialId === undefined ? {} : { materialId: materialMap.get(face.materialId)! }),
      })),
    })),
    materials: materials.map((material, index) => ({
      ...material,
      id: idRemap.materials[index].clonedId,
    })),
    skins: skins.map((skin, index) => ({
      ...skin,
      id: idRemap.skins[index].clonedId,
      meshId: meshMap.get(skin.meshId)!,
      joints: skin.joints.map((joint) => ({ ...joint, nodeId: nodeMap.get(joint.nodeId)! })),
      weights: skin.weights.map((weight) => ({
        ...weight,
        vertexId: vertexMaps.get(skin.meshId)!.get(weight.vertexId)!,
        jointIds: weight.jointIds.map((id) => nodeMap.get(id)!),
      })),
    })),
    tracks: project.clips.map((clip) =>
      clip.tracks
        .filter((track) => subtree.has(track.nodeId))
        .map((track) => ({ ...track, nodeId: nodeMap.get(track.nodeId)! })),
    ),
    anchors: anchors.map((anchor, index) => ({
      ...anchor,
      id: idRemap.anchors[index].clonedId,
      nodeId: nodeMap.get(anchor.nodeId!)!,
    })),
    colliders: colliders.map((collider, index) => ({
      ...collider,
      id: idRemap.colliders[index].clonedId,
      nodeId: nodeMap.get(collider.nodeId!)!,
    })),
  };
  // A compact source can grow substantially through new IDs. Estimate the actual
  // planned structure, not merely a multiple of input size, before deep cloning.
  estimateCanonicalBytes({
    ...project,
    nodes: [...project.nodes, ...additions.nodes],
    meshes: [...project.meshes, ...additions.meshes],
    materials: [...project.materials, ...additions.materials],
    skins: [...project.skins, ...additions.skins],
    clips: project.clips.map((clip, index) => ({
      ...clip,
      tracks: [...clip.tracks, ...additions.tracks[index]],
    })),
    game: {
      ...project.game,
      anchors: [...project.game.anchors, ...additions.anchors],
      colliders: [...project.game.colliders, ...additions.colliders],
    },
  });
  // Separate clones intentionally break every reference from copied values to
  // originals. Shared mesh/material relationships inside the copy remain ID-based.
  const candidate = cloneProject(project);
  const copies = structuredClone(additions);
  candidate.nodes = [...candidate.nodes, ...copies.nodes];
  candidate.meshes = [...candidate.meshes, ...copies.meshes];
  candidate.materials = [...candidate.materials, ...copies.materials];
  candidate.skins = [...candidate.skins, ...copies.skins];
  candidate.clips.forEach((clip, index) => {
    clip.tracks = [...clip.tracks, ...copies.tracks[index]];
  });
  candidate.game.anchors = [...candidate.game.anchors, ...copies.anchors];
  candidate.game.colliders = [...candidate.game.colliders, ...copies.colliders];
  validateProject(candidate);
  // In particular, appending to a clip with an unrelated protected target is
  // rejected here. Copying must not weaken the existing whole-clip lock contract.
  assertLocksPreserved(project, candidate);

  const tracks = describeTracks(project, subtree);
  const inheritedTracks = describeTracks(project, ancestors);
  const retainedExternalSkinIds = project.skins
    .filter((skin) => !meshIds.has(skin.meshId) && skin.joints.some((j) => subtree.has(j.nodeId)))
    .map((skin) => skin.id);
  const sharedTextureBlobIds = [
    ...new Set(materials.flatMap((material) => material.textureBlobId ?? [])),
  ];
  const clipIds = [...new Set(tracks.map((track) => track.clipId))];
  const preview: HierarchyClonePreview = {
    projectId: project.id,
    revision: project.revision,
    rootNodeId,
    prefix,
    clonedRootId: nodeMap.get(rootNodeId)!,
    parentId: root.parentId,
    nodeIds: nodes.map((node) => node.id),
    meshIds: meshes.map((mesh) => mesh.id),
    materialIds: materials.map((material) => material.id),
    skinIds: skins.map((skin) => skin.id),
    anchorIds: anchors.map((anchor) => anchor.id),
    colliderIds: colliders.map((collider) => collider.id),
    clipIds,
    tracks,
    retainedAncestorIds: [...ancestors],
    inheritedTracks,
    retainedExternalSkinIds,
    retainedSourceIds: project.sources.map((source) => source.id),
    retainedBlobIds: [...project.blobIds],
    sharedTextureBlobIds,
    idRemap,
    counts: {
      nodes: nodes.length,
      meshes: meshes.length,
      vertices: meshes.reduce((sum, mesh) => sum + mesh.vertices.length, 0),
      faces: meshes.reduce((sum, mesh) => sum + mesh.faces.length, 0),
      materials: materials.length,
      skins: skins.length,
      joints: skins.reduce((sum, skin) => sum + skin.joints.length, 0),
      weights: skins.reduce((sum, skin) => sum + skin.weights.length, 0),
      influences: skins.reduce(
        (sum, skin) =>
          sum + skin.weights.reduce((count, weight) => count + weight.values.length, 0),
        0,
      ),
      clips: clipIds.length,
      tracks: tracks.length,
      keys: tracks.reduce((sum, track) => sum + track.keyCount, 0),
      anchors: anchors.length,
      colliders: colliders.length,
      inheritedTracks: inheritedTracks.length,
      inheritedKeys: inheritedTracks.reduce((sum, track) => sum + track.keyCount, 0),
      retainedExternalSkins: retainedExternalSkinIds.length,
      retainedSources: project.sources.length,
      retainedBlobs: project.blobIds.length,
      sharedTextureBlobs: sharedTextureBlobIds.length,
    },
    projectSnapshot: snapshotProject(project),
  };
  return { preview, candidate };
}

/** Preview one complete subtree without mutation. The caller presents dependencies,
 * same-parent/local/world preservation, source sharing and Undo before confirmation.
 */
export function previewHierarchyClone(
  project: Project3D,
  rootNodeId: string,
  prefix: string,
): HierarchyClonePreview {
  return prepareClone(project, rootNodeId, prefix).preview;
}

/** Apply only the exact, current confirmed preview. Wrap once in ProjectHistory.execute;
 * history owns revision and Undo. No IO, source copy, blob allocation or GC occurs here.
 */
export function applyHierarchyClone(project: Project3D, preview: HierarchyClonePreview): string {
  const stale = () =>
    new Error('複製確認後に内容が変わりました。対象と依存を確認し直してください。');
  if (preview.projectId !== project.id || preview.revision !== project.revision) throw stale();
  estimateCanonicalBytes(project);
  if (preview.projectSnapshot !== snapshotProject(project)) throw stale();
  const { projectSnapshot: expectedSnapshot, ...expectedImpact } = preview;
  // Preview is caller-owned and may be tampered with. Bound its impact report before
  // serialization, without creating another escaped copy of the large baseline.
  estimateCanonicalBytes(expectedImpact);
  const current = prepareClone(project, preview.rootNodeId, preview.prefix);
  const { projectSnapshot: actualSnapshot, ...actualImpact } = current.preview;
  if (
    expectedSnapshot !== actualSnapshot ||
    JSON.stringify(expectedImpact) !== JSON.stringify(actualImpact)
  )
    throw stale();
  project.nodes = current.candidate.nodes;
  project.meshes = current.candidate.meshes;
  project.materials = current.candidate.materials;
  project.skins = current.candidate.skins;
  project.clips = current.candidate.clips;
  project.game = current.candidate.game;
  return current.preview.clonedRootId;
}
