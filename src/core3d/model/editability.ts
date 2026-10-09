import type { Project3D } from './project';
import { worldMatrix } from './coordinates';

export function isNodeLocked(project: Project3D, id: string): boolean {
  let node = project.nodes.find((item) => item.id === id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.locked) return true;
    seen.add(node.id);
    node = project.nodes.find((item) => item.id === node!.parentId);
  }
  return false;
}
export function isNodeVisible(project: Project3D, id: string): boolean {
  let node = project.nodes.find((item) => item.id === id);
  if (!node) return false;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    if (node.visible === false) return false;
    seen.add(node.id);
    node = project.nodes.find((item) => item.id === node!.parentId);
  }
  return true;
}
const lockedError = () =>
  new Error('編集ロック中の部品または共有資源に影響します。先に対象のロックを解除してください。');
export function assertNodeEditable(project: Project3D, id: string, descendants = false) {
  const ids = new Set([id]);
  if (descendants)
    for (let changed = true; changed;) {
      changed = false;
      for (const node of project.nodes)
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
    }
  if ([...ids].some((target) => isNodeLocked(project, target))) throw lockedError();
}
export function assertMeshEditable(project: Project3D, meshId: string) {
  for (const node of project.nodes)
    if (node.meshId === meshId) assertNodeEditable(project, node.id);
}
export function assertMaterialEditable(project: Project3D, materialId: string) {
  for (const mesh of project.meshes)
    if (mesh.faces.some((face) => face.materialId === materialId))
      assertMeshEditable(project, mesh.id);
}
/** Final transaction guard: commands cannot bypass locks via shared resources or parent edits. */
export function assertLocksPreserved(before: Project3D, after: Project3D) {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const skin of before.skins) {
    const protectedSkin =
      before.nodes.some((node) => node.meshId === skin.meshId && isNodeLocked(before, node.id)) ||
      skin.joints.some((joint) => isNodeLocked(before, joint.nodeId));
    if (
      protectedSkin &&
      !equal(
        skin,
        after.skins.find((item) => item.id === skin.id),
      )
    )
      throw lockedError();
  }
  for (const skin of after.skins) {
    if (
      !equal(
        before.skins.find((item) => item.id === skin.id),
        skin,
      ) &&
      (before.nodes.some((node) => node.meshId === skin.meshId && isNodeLocked(before, node.id)) ||
        skin.joints.some((joint) => isNodeLocked(before, joint.nodeId)))
    )
      throw lockedError();
  }
  for (const node of before.nodes) {
    if (!isNodeLocked(before, node.id)) continue;
    const next = after.nodes.find((item) => item.id === node.id);
    if (!next) throw lockedError();
    // A self-lock may be toggled, but unlocking never authorizes another edit in the same command.
    if (!equal({ ...node, locked: false }, { ...next, locked: false })) throw lockedError();
    if (node.parentId && isNodeLocked(before, node.parentId) && node.locked !== next.locked)
      throw lockedError();
    if (
      !equal(worldMatrix(before, node.id), worldMatrix(after, node.id)) ||
      isNodeVisible(before, node.id) !== isNodeVisible(after, node.id)
    )
      throw lockedError();
    if (
      !equal(
        before.nodes.filter((item) => item.parentId === node.id).map((item) => item.id),
        after.nodes.filter((item) => item.parentId === node.id).map((item) => item.id),
      )
    )
      throw lockedError();
    if (node.meshId) {
      const mesh = before.meshes.find((item) => item.id === node.meshId);
      if (
        !equal(
          mesh,
          after.meshes.find((item) => item.id === node.meshId),
        )
      )
        throw lockedError();
      for (const face of mesh?.faces ?? [])
        if (
          face.materialId &&
          !equal(
            before.materials.find((item) => item.id === face.materialId),
            after.materials.find((item) => item.id === face.materialId),
          )
        )
          throw lockedError();
    }
  }
}
