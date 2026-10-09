import { describe, expect, it } from 'vitest';
import { createProject, cloneProject } from '../model/project';
import { addBox } from '../commands/box';
import { smallProject } from '../fixtures/project';
import {
  createClip,
  duplicateClip,
  updateClip,
  deleteClip,
  addKey,
  editKey,
  duplicateKey,
  deleteKey,
  setTrackInterpolation,
} from './authoring';
function fixture() {
  const p = createProject('animation');
  addBox(p, 'box');
  createClip(p, 'clip', 'Move', 2);
  return p;
}
describe('atomic native animation authoring', () => {
  it('creates, duplicates, renames and deletes independently cloned clips', () => {
    const p = fixture();
    addKey(p, 'clip', 'box-node', 'translation', 'LINEAR', 0, [0, 0, 0]);
    duplicateClip(p, 'clip', 'copy', 'Copy');
    editKey(p, 'copy', 'box-node', 'translation', 0, 0.5, [2, 0, 0]);
    expect(p.clips[0].tracks[0].keys[0].value).toEqual([0, 0, 0]);
    updateClip(p, 'copy', { name: 'Other', duration: 3, loop: true });
    expect(p.clips[1]).toMatchObject({ name: 'Other', duration: 3, loop: true });
    deleteClip(p, 'copy');
    expect(p.clips).toHaveLength(1);
  });
  it('adds sorted keys, moves, duplicates, edits interpolation and deletes', () => {
    const p = fixture();
    addKey(p, 'clip', 'box-node', 'translation', 'STEP', 1, [1, 0, 0]);
    addKey(p, 'clip', 'box-node', 'translation', 'STEP', 0, [0, 0, 0]);
    editKey(p, 'clip', 'box-node', 'translation', 1, 1.5, [3, 0, 0]);
    duplicateKey(p, 'clip', 'box-node', 'translation', 1.5, 2);
    setTrackInterpolation(p, 'clip', 'box-node', 'translation', 'LINEAR');
    expect(p.clips[0].tracks[0].keys.map((key) => key.time)).toEqual([0, 1.5, 2]);
    deleteKey(p, 'clip', 'box-node', 'translation', 1.5);
    expect(p.clips[0].tracks[0].keys).toHaveLength(2);
  });
  it.each([-1, 3, NaN, Infinity])('rejects invalid key time %s without mutation', (time) => {
    const p = fixture(),
      before = cloneProject(p);
    expect(() => addKey(p, 'clip', 'box-node', 'translation', 'LINEAR', time, [0, 0, 0])).toThrow();
    expect(p).toEqual(before);
  });
  it('rejects duplicate time and duration truncation without deleting keys', () => {
    const p = fixture();
    addKey(p, 'clip', 'box-node', 'translation', 'LINEAR', 1, [0, 0, 0]);
    const before = cloneProject(p);
    expect(() => addKey(p, 'clip', 'box-node', 'translation', 'LINEAR', 1, [2, 0, 0])).toThrow();
    expect(() => updateClip(p, 'clip', { name: 'Short', duration: 0.5, loop: false })).toThrow();
    expect(p).toEqual(before);
  });
  it('refuses unknown targets, malformed values, unnormalized rotation and implicit interpolation replacement', () => {
    const p = fixture();
    addKey(p, 'clip', 'box-node', 'translation', 'LINEAR', 0, [0, 0, 0]);
    const before = cloneProject(p);
    expect(() => addKey(p, 'clip', 'missing', 'translation', 'LINEAR', 0, [0, 0, 0])).toThrow();
    expect(() => addKey(p, 'clip', 'box-node', 'rotation', 'LINEAR', 0, [0, 0, 0, 2])).toThrow();
    expect(() => addKey(p, 'clip', 'box-node', 'scale', 'LINEAR', 0, [1, NaN, 1])).toThrow();
    expect(() => addKey(p, 'clip', 'box-node', 'translation', 'STEP', 1, [1, 0, 0])).toThrow();
    expect(p).toEqual(before);
  });
  it('guards locked nodes, their ancestors and joints affecting a locked skin instance', () => {
    const p = smallProject();
    p.nodes[0].locked = true;
    const before = cloneProject(p);
    expect(() => editKey(p, 'clip', 'joint-b', 'translation', 1, 1, [2, 0, 0])).toThrow();
    expect(p).toEqual(before);
    const q = fixture();
    q.nodes[0].locked = true;
    expect(() => addKey(q, 'clip', 'box-node', 'translation', 'LINEAR', 0, [0, 0, 0])).toThrow();
  });
  it('protects existing keys from deletes/moves using missing references', () => {
    const p = fixture(),
      before = cloneProject(p);
    expect(() => editKey(p, 'clip', 'box-node', 'translation', 0, 1, [1, 0, 0])).toThrow();
    expect(() => deleteKey(p, 'clip', 'box-node', 'translation', 0)).toThrow();
    expect(() => duplicateKey(p, 'clip', 'box-node', 'translation', 0, 1)).toThrow();
    expect(p).toEqual(before);
  });
  it('keeps schema version and canonical node rest unchanged', () => {
    const p = fixture(),
      nodes = structuredClone(p.nodes);
    addKey(p, 'clip', 'box-node', 'scale', 'LINEAR', 0, [2, 2, 2]);
    expect(p.nodes).toEqual(nodes);
    expect(p.schemaVersion).toBe('0.2.0');
    expect(p.revision).toBe(0);
  });
});

it('honors explicit looping when creating a clip', () => {
  const p = createProject('loop');
  createClip(p, 'loop', 'Loop', 0, true);
  expect(p.clips[0]).toMatchObject({ duration: 0, loop: true });
});
