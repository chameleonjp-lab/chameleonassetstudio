import { assertLocksPreserved, assertNodeEditable } from '../model/editability';
import { cloneProject, validateProject, type Clip3D, type Project3D } from '../model/project';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';

export interface ObjectDeletionTrack {
  clipId: string;
  nodeId: string;
  property: Clip3D['tracks'][number]['property'];
  keyCount: number;
}

/** Transient confirmation data, never part of the saved project contract. */
export interface ObjectDeletionPreview {
  projectId: string;
  revision: number;
  requestedNodeIds: string[];
  includeDescendants: boolean;
  nodeIds: string[];
  /** Only meshes losing their last scene instance are removed. */
  meshIds: string[];
  retainedMeshIds: string[];
  skinIds: string[];
  retainedSkinIds: string[];
  /** These clips keep their identity and metadata, even when every track is removed. */
  clipIds: string[];
  tracks: ObjectDeletionTrack[];
  anchorIds: string[];
  colliderIds: string[];
  /** Referenced materials are reported but always retained, including textures. */
  materialIds: string[];
  counts: {
    nodes: number;
    meshes: number;
    retainedMeshes: number;
    skins: number;
    retainedSkins: number;
    clips: number;
    tracks: number;
    keys: number;
    anchors: number;
    colliders: number;
    materials: number;
  };
  /** Exact canonical baseline also rejects edits made without advancing revision.
   * Contains only canonical metadata, never source/blob bytes; do not persist it.
   */
  projectSnapshot: string;
}

function prepareDeletion(
  project: Project3D,
  nodeIds: readonly string[],
  options: { includeDescendants?: boolean },
): { preview: ObjectDeletionPreview; candidate: Project3D } {
  // Bound traversal/clone work before serialization or cloning. Like History.project
  // reads, the returned preview is caller-owned, not a persistent ledger owner.
  estimateCanonicalBytes(project);
  // Validate before walking the hierarchy: never try to repair cycles, duplicate
  // IDs or missing references as a side effect of a destructive operation.
  validateProject(project);
  if (!nodeIds.length || new Set(nodeIds).size !== nodeIds.length)
    throw new Error('重複しない削除対象オブジェクトを選択してください。');
  if (options.includeDescendants !== undefined && typeof options.includeDescendants !== 'boolean')
    throw new Error('子オブジェクトを含めるか指定してください。');
  const selected = new Set(nodeIds);
  for (const id of selected)
    if (!project.nodes.some((node) => node.id === id))
      throw new Error('削除対象オブジェクトがありません。選択し直してください。');
  const includeDescendants = options.includeDescendants === true;
  if (!includeDescendants && project.nodes.some((node) => selected.has(node.parentId ?? '')))
    throw new Error('子オブジェクトがあります。階層全体を削除する場合は明示的に含めてください。');
  const removedNodes = new Set(selected);
  if (includeDescendants)
    for (let changed = true; changed;) {
      changed = false;
      for (const node of project.nodes)
        if (
          node.parentId !== null &&
          removedNodes.has(node.parentId) &&
          !removedNodes.has(node.id)
        ) {
          removedNodes.add(node.id);
          changed = true;
        }
    }
  for (const id of removedNodes) assertNodeEditable(project, id);

  const affectedMeshes = new Set(
    project.nodes.flatMap((node) =>
      removedNodes.has(node.id) && node.meshId !== undefined ? [node.meshId] : [],
    ),
  );
  const retainedMeshes = new Set(
    project.nodes.flatMap((node) =>
      !removedNodes.has(node.id) && node.meshId !== undefined ? [node.meshId] : [],
    ),
  );
  const removedMeshes = new Set([...affectedMeshes].filter((id) => !retainedMeshes.has(id)));
  const removedSkins = project.skins.filter((skin) => removedMeshes.has(skin.meshId));
  if (
    project.skins.some(
      (skin) =>
        !removedMeshes.has(skin.meshId) &&
        skin.joints.some((joint) => removedNodes.has(joint.nodeId)),
    )
  )
    throw new Error('残るskinが使用するjointは削除できません。元の作品を保持しています。');

  const tracks = project.clips.flatMap((clip) =>
    clip.tracks
      .filter((track) => removedNodes.has(track.nodeId))
      .map((track) => ({
        clipId: clip.id,
        nodeId: track.nodeId,
        property: track.property,
        keyCount: track.keys.length,
      })),
  );
  const materialIds = new Set(
    project.meshes.flatMap((mesh) =>
      affectedMeshes.has(mesh.id)
        ? mesh.faces.flatMap((face) => (face.materialId === undefined ? [] : [face.materialId]))
        : [],
    ),
  );
  const dependencies = {
    nodeIds: project.nodes.filter((node) => removedNodes.has(node.id)).map((node) => node.id),
    meshIds: project.meshes.filter((mesh) => removedMeshes.has(mesh.id)).map((mesh) => mesh.id),
    retainedMeshIds: project.meshes
      .filter((mesh) => affectedMeshes.has(mesh.id) && retainedMeshes.has(mesh.id))
      .map((mesh) => mesh.id),
    skinIds: removedSkins.map((skin) => skin.id),
    retainedSkinIds: project.skins
      .filter((skin) => affectedMeshes.has(skin.meshId) && !removedMeshes.has(skin.meshId))
      .map((skin) => skin.id),
    clipIds: [...new Set(tracks.map((track) => track.clipId))],
    tracks,
    anchorIds: project.game.anchors
      .filter((anchor) => anchor.nodeId !== null && removedNodes.has(anchor.nodeId))
      .map((anchor) => anchor.id),
    colliderIds: project.game.colliders
      .filter((collider) => collider.nodeId !== null && removedNodes.has(collider.nodeId))
      .map((collider) => collider.id),
    materialIds: project.materials
      .filter((material) => materialIds.has(material.id))
      .map((material) => material.id),
  };
  const preview: ObjectDeletionPreview = {
    projectId: project.id,
    revision: project.revision,
    requestedNodeIds: [...nodeIds],
    includeDescendants,
    ...dependencies,
    counts: {
      nodes: dependencies.nodeIds.length,
      meshes: dependencies.meshIds.length,
      retainedMeshes: dependencies.retainedMeshIds.length,
      skins: dependencies.skinIds.length,
      retainedSkins: dependencies.retainedSkinIds.length,
      clips: dependencies.clipIds.length,
      tracks: tracks.length,
      keys: tracks.reduce((count, track) => count + track.keyCount, 0),
      anchors: dependencies.anchorIds.length,
      colliders: dependencies.colliderIds.length,
      materials: dependencies.materialIds.length,
    },
    projectSnapshot: JSON.stringify(project),
  };

  const candidate = cloneProject(project);
  candidate.nodes = candidate.nodes.filter((node) => !removedNodes.has(node.id));
  candidate.meshes = candidate.meshes.filter((mesh) => !removedMeshes.has(mesh.id));
  candidate.skins = candidate.skins.filter((skin) => !removedMeshes.has(skin.meshId));
  for (const clip of candidate.clips)
    clip.tracks = clip.tracks.filter((track) => !removedNodes.has(track.nodeId));
  candidate.game.anchors = candidate.game.anchors.filter(
    (anchor) => anchor.nodeId === null || !removedNodes.has(anchor.nodeId),
  );
  candidate.game.colliders = candidate.game.colliders.filter(
    (collider) => collider.nodeId === null || !removedNodes.has(collider.nodeId),
  );
  validateProject(candidate);
  // Includes effective ancestor locks, locked joints and a clip that also drives
  // locked objects. The preview must not offer an operation history would reject.
  assertLocksPreserved(project, candidate);
  return { preview, candidate };
}

/** Report the exact removal and retained dependencies without changing the project.
 * Children are never implicitly deleted or reparented. The caller presents this
 * preview, the reason/impact and Undo recovery before asking for confirmation.
 */
export function previewObjectDeletion(
  project: Project3D,
  nodeIds: readonly string[],
  options: { includeDescendants?: boolean } = {},
): ObjectDeletionPreview {
  return prepareDeletion(project, nodeIds, options).preview;
}

/** Apply only a current, unchanged preview, after caller confirmation.
 * Wrap exactly once in ProjectHistory.execute: history owns revision and Undo.
 * No IO, GC, source deletion or material pruning takes place in this command.
 */
export function applyObjectDeletion(project: Project3D, preview: ObjectDeletionPreview): void {
  const stale = () =>
    new Error('削除確認後に内容が変わりました。対象と依存を確認し直してください。');
  if (preview.projectId !== project.id || preview.revision !== project.revision) throw stale();
  estimateCanonicalBytes(project);
  if (preview.projectSnapshot !== JSON.stringify(project)) throw stale();
  const current = prepareDeletion(project, preview.requestedNodeIds, {
    includeDescendants: preview.includeDescendants,
  });
  // Do not serialize the full baseline again: that would allocate two additional
  // escaped copies of canonical metadata just to compare the small impact report.
  const { projectSnapshot: expectedSnapshot, ...expectedImpact } = preview;
  const { projectSnapshot: actualSnapshot, ...actualImpact } = current.preview;
  if (
    expectedSnapshot !== actualSnapshot ||
    JSON.stringify(expectedImpact) !== JSON.stringify(actualImpact)
  )
    throw stale();
  // Every check happens on detached data before publishing any collection.
  project.nodes = current.candidate.nodes;
  project.meshes = current.candidate.meshes;
  project.skins = current.candidate.skins;
  project.clips = current.candidate.clips;
  project.game = current.candidate.game;
}
