import { expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { identityTransform, validateProject } from '../model/project';
import { deleteAttachment, putAttachment, updateGame } from './authoring';
it('authors persistent game settings and node-bound anchors atomically', () => {
  const p = nativeBox();
  updateGame(p, {
    assetId: 'asset',
    assetKind: 'prop',
    originMode: 'custom',
    unitMeters: 0.01,
    forward: '-Z',
    origin: [1, 2, 3],
  });
  putAttachment(p, 'anchors', {
    id: 'grip',
    purpose: 'fixture',
    name: 'Grip',
    nodeId: p.nodes[0].id,
    transform: identityTransform(),
  });
  validateProject(p);
  expect(p.game.anchors).toHaveLength(1);
  const before = structuredClone(p);
  expect(() =>
    putAttachment(p, 'anchors', {
      id: 'bad',
      purpose: 'fixture',
      name: '',
      nodeId: 'missing',
      transform: identityTransform(),
    }),
  ).toThrow();
  expect(p).toEqual(before);
  deleteAttachment(p, 'anchors', 'grip');
  expect(p.game.anchors).toEqual([]);
});
it('rejects invalid collider and locked-target changes without partial writes', () => {
  const p = nativeBox(),
    before = structuredClone(p);
  expect(() =>
    putAttachment(p, 'colliders', {
      id: 'hit',
      purpose: 'fixture',
      name: '',
      nodeId: null,
      transform: identityTransform(),
      shape: 'sphere',
      size: [1, 1, 1],
      radius: -1,
      height: 0,
    }),
  ).toThrow();
  expect(p).toEqual(before);
  p.nodes[0].locked = true;
  expect(() =>
    putAttachment(p, 'anchors', {
      id: 'locked',
      purpose: 'fixture',
      name: '',
      nodeId: p.nodes[0].id,
      transform: identityTransform(),
    }),
  ).toThrow();
});
