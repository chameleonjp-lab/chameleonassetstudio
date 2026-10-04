import { nativeBox } from '../../src/core3d/fixtures/nativeBox';
import { identityTransform } from '../../src/core3d/model/project';

/** Self-authored native boxes and an empty group; no file loader or network asset. */
export function editFixture(id = 'native-edit-evaluation') {
  const project = nativeBox(id);
  project.nodes[0].transform.translation = [-1.25, 0, 0];
  project.nodes.push({
    id: 'group-node',
    name: 'Group',
    parentId: null,
    transform: identityTransform(),
  });
  project.nodes.push({
    id: 'right-node',
    name: 'Right box',
    parentId: 'group-node',
    meshId: 'box-mesh',
    transform: { ...identityTransform(), translation: [1.25, 0, 0] },
  });
  return project;
}
