import { createClip, addKey } from '../animation/authoring';
import { describe, it, expect } from 'vitest';
import { smallProject } from '../fixtures/project';
import { cloneProject, createProject, identityTransform } from './project';
import { assertLocksPreserved } from './editability';
describe('skin lock transaction boundary', () => {
  it.each(['mesh', 'joint'])('protects %s against raw skin changes and removal', (target) => {
    const before = smallProject();
    const id =
      target === 'mesh'
        ? before.nodes.find((n) => n.meshId === before.skins[0].meshId)!.id
        : before.skins[0].joints[0].nodeId;
    before.nodes.find((n) => n.id === id)!.locked = true;
    const after = cloneProject(before);
    after.skins[0].weights[0].values = [0.5, 0.5];
    expect(() => assertLocksPreserved(before, after)).toThrow();
    after.skins = [];
    expect(() => assertLocksPreserved(before, after)).toThrow();
  });
  it('protects locked meshes from newly introduced skin bindings', () => {
    const before = smallProject();
    const skin = before.skins[0];
    before.skins = [];
    before.nodes.find((n) => n.meshId === skin.meshId)!.locked = true;
    const after = cloneProject(before);
    after.skins.push(skin);
    expect(() => assertLocksPreserved(before, after)).toThrow();
  });
  it('rejects retargeting an existing skin onto a locked mesh', () => {
    const before = smallProject();
    const copied = structuredClone(before.meshes[0]);
    copied.id = 'locked-mesh';
    before.meshes.push(copied);
    const node = structuredClone(before.nodes.find((n) => n.meshId)!);
    node.id = 'locked-node';
    node.meshId = copied.id;
    node.locked = true;
    before.nodes.push(node);
    const after = cloneProject(before);
    after.skins[0].meshId = copied.id;
    expect(() => assertLocksPreserved(before, after)).toThrow();
  });
});

it('rejects new and retargeted animation tracks that affect a locked descendant', () => {
  const before = createProject('locked-animation');
  before.nodes.push(
    { id: 'parent', name: 'Parent', parentId: null, transform: identityTransform() },
    {
      id: 'child',
      name: 'Child',
      parentId: 'parent',
      locked: true,
      transform: identityTransform(),
    },
  );
  createClip(before, 'clip', 'Move');
  expect(() => addKey(before, 'clip', 'parent', 'translation', 'LINEAR', 0, [1, 0, 0])).toThrow();
  const after = structuredClone(before);
  after.clips[0].tracks.push({
    nodeId: 'child',
    property: 'translation',
    interpolation: 'STEP',
    keys: [{ time: 0, value: [1, 0, 0] }],
  });
  expect(() => assertLocksPreserved(before, after)).toThrow();
});

it('protects game attachments bound to locked nodes through the final transaction guard', async () => {
  const { nativeBox } = await import('../fixtures/nativeBox');
  const { identityTransform } = await import('./project');
  const p = nativeBox();
  p.game.anchors = [
    {
      id: 'a',
      name: 'A',
      purpose: 'socket',
      nodeId: p.nodes[0].id,
      transform: identityTransform(),
    },
  ];
  p.nodes[0].locked = true;
  const q = structuredClone(p);
  q.game.anchors[0].name = 'changed';
  expect(() => assertLocksPreserved(p, q)).toThrow();
});
