import { describe, expect, it } from 'vitest';
import { createProject, cloneProject } from '../model/project';
import { smallProject } from '../fixtures/project';
import { addBox } from '../commands/box';
import { createClip, addKey } from './authoring';
import { clipTime, evaluateClip, prepareClipEvaluation } from './evaluation';
function fixture(interpolation: 'LINEAR' | 'STEP' = 'LINEAR') {
  const p = createProject('animation');
  addBox(p, 'box');
  createClip(p, 'clip', 'Move', 2);
  addKey(p, 'clip', 'box-node', 'translation', interpolation, 0.5, [0, 0, 0]);
  addKey(p, 'clip', 'box-node', 'translation', interpolation, 1.5, [2, 0, 0]);
  return p;
}
describe('native clip evaluation', () => {
  it('samples endpoints, midpoints and clamps sparse leading/trailing key intervals', () => {
    const p = fixture(),
      before = cloneProject(p);
    for (const [time, x] of [
      [0, 0],
      [0.5, 0],
      [1, 1],
      [1.5, 2],
      [2, 2],
    ])
      expect(evaluateClip(p, 'clip', time)[0].transform.translation).toEqual([x, 0, 0]);
    expect(p).toEqual(before);
  });
  it('uses STEP until the exact next key', () => {
    const p = fixture('STEP');
    expect(evaluateClip(p, 'clip', 1.49)[0].transform.translation[0]).toBe(0);
    expect(evaluateClip(p, 'clip', 1.5)[0].transform.translation[0]).toBe(2);
  });
  it('handles empty and single-key tracks without invented channels', () => {
    const p = createProject('empty');
    addBox(p, 'box');
    createClip(p, 'clip', 'Empty');
    expect(evaluateClip(p, 'clip', 0)).toEqual([]);
    addKey(p, 'clip', 'box-node', 'scale', 'LINEAR', 0.5, [2, 3, 4]);
    const value = evaluateClip(p, 'clip', 0)[0].transform;
    expect(value.scale).toEqual([2, 3, 4]);
    expect(value.translation).toEqual([0, 0, 0]);
  });
  it('uses shortest-arc normalized quaternion interpolation including opposite signs', () => {
    const p = fixture();
    addKey(p, 'clip', 'box-node', 'rotation', 'LINEAR', 0, [0, 0, 0, 1]);
    addKey(p, 'clip', 'box-node', 'rotation', 'LINEAR', 2, [0, 0, 0, -1]);
    expect(evaluateClip(p, 'clip', 1)[0].transform.rotation).toEqual([0, 0, 0, 1]);
    p.clips[0].tracks[1].keys[1].value = [0, 0, 1, 0];
    const q = evaluateClip(p, 'clip', 1)[0].transform.rotation;
    expect(q[2]).toBeCloseTo(Math.SQRT1_2);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2);
  });
  it('starts another clip from canonical rest, not preceding sampled values', () => {
    const p = fixture();
    createClip(p, 'other', 'Scale');
    addKey(p, 'other', 'box-node', 'scale', 'STEP', 0, [2, 2, 2]);
    evaluateClip(p, 'clip', 2);
    expect(evaluateClip(p, 'other', 0)[0].transform.translation).toEqual([0, 0, 0]);
  });
  it.each([-1, 3, NaN, Infinity])('rejects invalid scrub time %s', (time) => {
    expect(() => evaluateClip(fixture(), 'clip', time)).toThrow();
  });
  it('allows playback of locked skin data without weakening manual authoring', () => {
    const p = smallProject();
    p.nodes[0].locked = true;
    p.nodes[1].locked = true;
    expect(evaluateClip(p, 'clip', 0.5)[0].transform.translation).toEqual([0, 0.5, 0]);
  });
  it('rejects Float32 overflow and singular intermediate poses', () => {
    const p = fixture();
    p.clips[0].tracks[0].keys[1].value = [3.5e38, 0, 0];
    expect(() => evaluateClip(p, 'clip', 2)).toThrow();
    const q = fixture();
    addKey(q, 'clip', 'box-node', 'scale', 'LINEAR', 0, [1, 1, 1]);
    addKey(q, 'clip', 'box-node', 'scale', 'LINEAR', 2, [-1, 1, 1]);
    expect(() => evaluateClip(q, 'clip', 1)).toThrow();
  });
  it('defines large jumps, loop seam, negative wrapping and zero-duration without division by zero', () => {
    expect(clipTime(1000000.25, 1, true)).toBe(0.25);
    expect(clipTime(1, 1, true)).toBe(0);
    expect(clipTime(-0.25, 1, true)).toBe(0.75);
    expect(clipTime(100, 1, false)).toBe(1);
    expect(clipTime(100, 0, true)).toBe(0);
    expect(() => clipTime(Infinity, 1, true)).toThrow();
  });
});

it('keeps subsecond loop times with huge finite durations and avoids overflow', () => {
  expect(clipTime(0.25, 1e20, true)).toBe(0.25);
  expect(clipTime(1e308, 1.7e308, true)).toBe(1e308);
});
it('owns a revision snapshot and ignores later source mutations', () => {
  const p = fixture(),
    evaluate = prepareClipEvaluation(p);
  p.clips[0].tracks[0].keys[1].value = [100, 0, 0];
  expect(evaluate('clip', 1)[0].transform.translation).toEqual([1, 0, 0]);
});

it('rejects world-normal overflow on unskinned animated objects', () => {
  const p = fixture();
  p.meshes[0].faces.forEach((face) => {
    face.normals = face.vertexIds.map(() => [1e30, 0, 0]);
  });
  addKey(p, 'clip', 'box-node', 'scale', 'LINEAR', 0, [1e-20, 1e-20, 1e-20]);
  expect(() => prepareClipEvaluation(p)('clip', 0)).toThrow('Float32');
});
