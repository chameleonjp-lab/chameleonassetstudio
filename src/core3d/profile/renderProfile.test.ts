import { expect, it } from 'vitest';
import { createProject } from '../model/project';
import { addBox } from '../commands/box';
import {
  NATIVE_RENDER_PROFILE as P,
  renderTargetBudget,
  estimateNativeGeometryBytes,
} from './renderProfile';
it('bounds actual drawing-buffer pixels and edges for ordinary, near-limit, and extreme layouts', () => {
  for (const [w, h, dpr] of [
    [640, 480, 1],
    [2000, 2000, 1],
    [2001, 2000, 1],
    [4000, 4000, 4],
    [1_000_000, 1, 10],
    [1, 1, 0.1],
  ]) {
    const r = renderTargetBudget(w, h, dpr);
    expect(r.bufferWidth * r.bufferHeight).toBeLessThanOrEqual(P.maxBufferPixels);
    expect(Math.max(r.bufferWidth, r.bufferHeight)).toBeLessThanOrEqual(P.maxBufferEdge);
    expect(r.estimatedBytes).toBe(r.bufferWidth * r.bufferHeight * 32);
    expect(r.cssWidth).toBe(w);
  }
  expect(renderTargetBudget(640, 480, 1).pixelRatio).toBe(1);
  expect(renderTargetBudget(4000, 4000, 4).pixelRatio).toBe(0.5);
  for (const args of [
    [Infinity, 1, 1],
    [1e308, 1, 1],
    [1, NaN, 1],
    [1, 1, 0],
    [1, 1, -1],
  ])
    expect(() => renderTargetBudget(...(args as [number, number, number]))).toThrow();
});
it('counts expanded attribute copies and shared meshes without changing canonical data', () => {
  const p = createProject('estimate', 'Estimate');
  addBox(p, 'box');
  const before = structuredClone(p),
    one = estimateNativeGeometryBytes(p);
  expect(one).toBeGreaterThan(36 * 128);
  p.nodes.push({ ...structuredClone(p.nodes[0]), id: 'instance' });
  expect(estimateNativeGeometryBytes(p) - one).toBe(4096);
  p.nodes.pop();
  expect(p).toEqual(before);
});
