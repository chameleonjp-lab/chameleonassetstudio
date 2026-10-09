import {
  validateProject,
  type Project3D,
  type Game3D,
  type GameAttachment3D,
} from '../model/project';
import { assertLocksPreserved, assertNodeEditable } from '../model/editability';
function edit(project: Project3D, operation: (draft: Project3D) => void) {
  validateProject(project);
  const draft = structuredClone(project);
  operation(draft);
  validateProject(draft);
  assertLocksPreserved(project, draft);
  Object.assign(project, draft);
}
export function updateGame(
  project: Project3D,
  settings: Pick<
    Game3D,
    'assetId' | 'assetKind' | 'originMode' | 'unitMeters' | 'forward' | 'origin'
  >,
) {
  edit(project, (draft) => Object.assign(draft.game, structuredClone(settings)));
}
export function putAttachment(
  project: Project3D,
  kind: 'anchors' | 'colliders',
  attachment: GameAttachment3D | Game3D['colliders'][number],
) {
  edit(project, (draft) => {
    const previous = draft.game[kind].find((x) => x.id === attachment.id);
    if (previous?.nodeId) assertNodeEditable(project, previous.nodeId);
    if (attachment.nodeId) assertNodeEditable(project, attachment.nodeId);
    const items = draft.game[kind] as GameAttachment3D[];
    const index = items.findIndex((x) => x.id === attachment.id);
    if (index < 0) items.push(structuredClone(attachment));
    else items[index] = structuredClone(attachment);
  });
}
export function deleteAttachment(project: Project3D, kind: 'anchors' | 'colliders', id: string) {
  edit(project, (draft) => {
    const items = draft.game[kind],
      index = items.findIndex((x) => x.id === id);
    if (index < 0) throw new Error('Attachment does not exist');
    if (items[index].nodeId) assertNodeEditable(project, items[index].nodeId!);
    items.splice(index, 1);
  });
}
