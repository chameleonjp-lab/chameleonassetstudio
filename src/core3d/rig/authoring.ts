import { worldMatrix } from '../model/coordinates';
import { assertMeshEditable, assertNodeEditable, assertLocksPreserved } from '../model/editability';
import {
  cloneProject,
  validateProject,
  type Project3D,
  type Skin3D,
  type Transform3D,
} from '../model/project';
import { assertFiniteAuthoringCoordinates } from '../commands/objectEditing';
import { inverseAffineMatrix } from './math';
import { validateSkinProfile } from './profile';

export type VertexWeights = Skin3D['weights'];

function node(project: Project3D, id: string) {
  const found = project.nodes.find((item) => item.id === id);
  if (!found) throw new Error(`Joint/node does not exist: ${id}`);
  return found;
}
function skin(project: Project3D, id: string) {
  const found = project.skins.find((item) => item.id === id);
  if (!found) throw new Error(`Skin does not exist: ${id}`);
  return found;
}
function descendants(project: Project3D, id: string) {
  const result = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const item of project.nodes)
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
  }
  return result;
}
function assertSkinEditable(project: Project3D, value: Skin3D) {
  assertMeshEditable(project, value.meshId);
  value.joints.forEach((joint) => assertNodeEditable(project, joint.nodeId));
}
function checkSkin(project: Project3D, value: Skin3D) {
  const mesh = project.meshes.find((item) => item.id === value.meshId);
  validateSkinProfile(value, mesh, project.nodes);
  // A mesh may have multiple instances, but only one canonical skin assignment.
  if (project.skins.filter((item) => item.meshId === value.meshId).length !== 1)
    throw new Error('A mesh must have exactly one skin assignment');
  const instances = project.nodes.filter((item) => item.meshId === value.meshId);
  if (!instances.length) throw new Error('Skin mesh must have a scene node');
  for (const item of instances) inverseAffineMatrix(worldMatrix(project, item.id));
  for (const joint of value.joints) inverseAffineMatrix(worldMatrix(project, joint.nodeId));
}
function updateInverseBind(project: Project3D, value: Skin3D) {
  value.joints = value.joints.map(({ nodeId }) => ({
    nodeId,
    inverseBind: inverseAffineMatrix(worldMatrix(project, nodeId)).map((value) =>
      value === 0 ? 0 : value,
    ),
  }));
}
/** Validate a detached candidate before publishing either mutable collection.
 * The caller owns history/revision and must wrap one operation in ProjectHistory.execute.
 */
function atomic(project: Project3D, operation: (candidate: Project3D) => string[]) {
  validateProject(project);
  const candidate = cloneProject(project);
  const changedSkins = operation(candidate);
  validateProject(candidate);
  assertFiniteAuthoringCoordinates(candidate);
  for (const id of changedSkins) checkSkin(candidate, skin(candidate, id));
  assertLocksPreserved(project, candidate);
  project.nodes = candidate.nodes;
  project.skins = candidate.skins;
}

/** Creates a plain canonical node used as a joint; no renderer or persisted pose state. */
export function addRigJoint(
  project: Project3D,
  id: string,
  name: string,
  parentId: string | null,
  transform: Transform3D,
) {
  atomic(project, (candidate) => {
    if (!name.trim() || name.length > 4096) throw new Error('Joint name must be nonempty');
    if (parentId !== null) {
      node(candidate, parentId);
      assertNodeEditable(candidate, parentId);
    }
    candidate.nodes.push({ id, name, parentId, transform: structuredClone(transform) });
    return [];
  });
}

/** Every vertex must be explicitly assigned. No nearest-joint fallback or silent normalization. */
export function bindSkin(
  project: Project3D,
  id: string,
  meshId: string,
  jointIds: readonly string[],
  weights: VertexWeights,
) {
  atomic(project, (candidate) => {
    if (candidate.skins.some((item) => item.meshId === meshId))
      throw new Error('Mesh is already bound; use explicit rebind');
    const value: Skin3D = {
      id,
      meshId,
      joints: jointIds.map((nodeId) => ({ nodeId, inverseBind: [] })),
      weights: structuredClone(weights),
    };
    assertSkinEditable(candidate, value);
    updateInverseBind(candidate, value);
    candidate.skins.push(value);
    return [id];
  });
}

/** Replace only named vertex assignments. Explicit normalization is a separate option. */
export function setSkinWeights(
  project: Project3D,
  skinId: string,
  assignments: VertexWeights,
  options: { normalize?: boolean } = {},
) {
  atomic(project, (candidate) => {
    const value = skin(candidate, skinId);
    assertSkinEditable(candidate, value);
    const seen = new Set<string>();
    const replacements = new Map<string, VertexWeights[number]>();
    if (!assignments.length) throw new Error('Select at least one vertex assignment');
    for (const input of assignments) {
      if (seen.has(input.vertexId)) throw new Error('Duplicate vertex assignment');
      seen.add(input.vertexId);
      if (!value.weights.some((entry) => entry.vertexId === input.vertexId))
        throw new Error('Unknown skin vertex');
      const replacement = structuredClone(input);
      if (options.normalize) {
        if (replacement.values.some((weight) => !Number.isFinite(weight) || weight < 0))
          throw new Error('Weights must be finite and nonnegative');
        const maximum = Math.max(...replacement.values);
        if (!(maximum > 0)) throw new Error('Cannot normalize zero weights');
        // Scale first: a finite input vector may otherwise overflow while summing.
        const scaled = replacement.values.map((weight) => weight / maximum);
        const sum = scaled.reduce((total, weight) => total + weight, 0);
        replacement.values = scaled.map((weight) => weight / sum);
      }
      replacements.set(input.vertexId, replacement);
    }
    value.weights = value.weights.map((entry) => replacements.get(entry.vertexId) ?? entry);
    return [skinId];
  });
}

/** Recompute bind data from the current canonical rest transforms, preserving weights. */
export function rebindSkin(project: Project3D, skinId: string) {
  atomic(project, (candidate) => {
    const value = skin(candidate, skinId);
    assertSkinEditable(candidate, value);
    updateInverseBind(candidate, value);
    return [skinId];
  });
}

/** Rest editing affects descendants and every skin using those joints, atomically.
 * Animated descendants are refused until an explicit animation-aware conversion exists.
 */
function editRest(project: Project3D, jointId: string, operation: (candidate: Project3D) => void) {
  atomic(project, (candidate) => {
    const target = node(candidate, jointId);
    if (target.meshId !== undefined)
      throw new Error('Rest joint editing requires a joint-only node');
    assertNodeEditable(candidate, jointId, true);
    const affected = descendants(candidate, jointId);
    const impacted = candidate.skins.filter(
      (value) =>
        value.joints.some((joint) => affected.has(joint.nodeId)) ||
        candidate.nodes.some((item) => affected.has(item.id) && item.meshId === value.meshId),
    );
    impacted.forEach((value) => assertSkinEditable(candidate, value));
    const animationScope = new Set(affected);
    const includeAncestors = (id: string) => {
      let current: string | null = id;
      while (current !== null) {
        animationScope.add(current);
        current = node(candidate, current).parentId;
      }
    };
    includeAncestors(jointId);
    for (const value of impacted) {
      value.joints.forEach((joint) => includeAncestors(joint.nodeId));
      candidate.nodes
        .filter((item) => item.meshId === value.meshId)
        .forEach((item) => includeAncestors(item.id));
    }
    operation(candidate);
    // Check cycles/references before recursively calculating world transforms.
    validateProject(candidate);
    includeAncestors(jointId);
    if (
      candidate.clips.some((clip) => clip.tracks.some((track) => animationScope.has(track.nodeId)))
    )
      throw new Error('Animated rest changes require an explicit conversion');
    impacted.forEach((value) => updateInverseBind(candidate, value));
    return impacted.map((value) => value.id);
  });
}
export function fitRigJoint(project: Project3D, jointId: string, transform: Transform3D) {
  editRest(project, jointId, (candidate) => {
    node(candidate, jointId).transform = structuredClone(transform);
  });
}
/** Reparent keeps the supplied local rest TRS; callers must explicitly choose this local transform. */
export function reparentRigJoint(
  project: Project3D,
  jointId: string,
  parentId: string | null,
  localRest: Transform3D,
) {
  editRest(project, jointId, (candidate) => {
    if (parentId !== null) {
      node(candidate, parentId);
      assertNodeEditable(candidate, parentId);
    }
    const target = node(candidate, jointId);
    target.parentId = parentId;
    target.transform = structuredClone(localRest);
  });
}

/** Small self-authored guide skeleton. It never binds or estimates weights automatically. */
export function addHumanoidRig(project: Project3D, prefix: string): string[] {
  const result: string[] = [];
  atomic(project, (candidate) => {
    const definitions: [string, string | null, [number, number, number]][] = [
      ['hips', null, [0, 0, 0]],
      ['spine', 'hips', [0, 0.5, 0]],
      ['head', 'spine', [0, 0.5, 0]],
      ['left-arm', 'spine', [-0.4, 0.2, 0]],
      ['right-arm', 'spine', [0.4, 0.2, 0]],
      ['left-leg', 'hips', [-0.15, -0.5, 0]],
      ['right-leg', 'hips', [0.15, -0.5, 0]],
    ];
    for (const [name, parent, translation] of definitions) {
      const id = `${prefix}-${name}`;
      candidate.nodes.push({
        id,
        name,
        parentId: parent === null ? null : `${prefix}-${parent}`,
        transform: { translation, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      });
      result.push(id);
    }
    return [];
  });
  return result;
}

/** Joint removal is allowed only when it cannot orphan hierarchy, skin or clip references. */
export function removeUnusedRigJoint(project: Project3D, jointId: string) {
  atomic(project, (candidate) => {
    const target = node(candidate, jointId);
    assertNodeEditable(candidate, jointId);
    if (
      target.meshId !== undefined ||
      candidate.nodes.some((item) => item.parentId === jointId) ||
      candidate.skins.some((value) => value.joints.some((joint) => joint.nodeId === jointId)) ||
      candidate.clips.some((clip) => clip.tracks.some((track) => track.nodeId === jointId))
    )
      throw new Error(
        'Referenced joints cannot be removed. Keep the skin, clips and children intact.',
      );
    candidate.nodes = candidate.nodes.filter((item) => item.id !== jointId);
    return [];
  });
}

/** Explicitly extend the skin palette without changing any existing vertex weights or binds. */
export function extendSkinJoints(project: Project3D, skinId: string, jointIds: readonly string[]) {
  atomic(project, (candidate) => {
    const value = skin(candidate, skinId);
    assertSkinEditable(candidate, value);
    if (!jointIds.length || new Set(jointIds).size !== jointIds.length)
      throw new Error('Select unique palette joints');
    for (const nodeId of jointIds) {
      node(candidate, nodeId);
      assertNodeEditable(candidate, nodeId);
      if (!value.joints.some((joint) => joint.nodeId === nodeId))
        value.joints.push({
          nodeId,
          inverseBind: inverseAffineMatrix(worldMatrix(candidate, nodeId)).map((entry) =>
            entry === 0 ? 0 : entry,
          ),
        });
    }
    return [skinId];
  });
}
