import { validateProject, type Project3D } from '../model/project';
import { assertLocksPreserved, assertNodeEditable } from '../model/editability';

/** Hierarchy display and edit lock are canonical, undoable values, never panel-only state. */
export function setNodeFlags(
  project: Project3D,
  nodeId: string,
  flags: { visible?: boolean; locked?: boolean },
) {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error('対象の部品を選択してください。');
  if (flags.visible !== undefined) assertNodeEditable(project, nodeId, true);
  if (node.parentId !== null) assertNodeEditable(project, node.parentId);
  const candidate = structuredClone(project);
  Object.assign(
    candidate.nodes.find((item) => item.id === nodeId)!,
    flags,
  );
  validateProject(candidate);
  assertLocksPreserved(project, candidate);
  project.nodes = candidate.nodes;
}
