import { describe, expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import {
  buildInspectionReport,
  captureInspectionSnapshot,
  isInspectionStale,
  exportInspectionWarnings,
} from './report';
describe('detached quality inspection', () => {
  it('retains a revision snapshot and identifies newer revisions', async () => {
    const p = nativeBox('p');
    const snapshot = captureInspectionSnapshot(p, () => {
      throw Error('missing');
    });
    p.name = 'new';
    p.revision++;
    const report = await buildInspectionReport(snapshot);
    expect(snapshot.project.name).not.toBe(p.name);
    expect(isInspectionStale(report, p)).toBe(true);
    expect(isInspectionStale(report, snapshot.project)).toBe(false);
  });
  it('returns partial diagnostics for missing texture rather than failing capture', async () => {
    const p = nativeBox('p');
    const id = 'a'.repeat(64);
    p.blobIds = [id];
    p.materials[0].textureBlobId = id;
    const before = JSON.stringify(p);
    const report = await buildInspectionReport(
      captureInspectionSnapshot(p, () => {
        throw Error('unavailable');
      }),
    );
    expect(
      report.issues.some((i) => i.code === 'missing-texture' && i.target.kind === 'material'),
    ).toBe(true);
    expect(exportInspectionWarnings(report).some((x) => x.includes('missing-blob'))).toBe(true);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('names unsupported polygons and empty clips with stable targets', async () => {
    const p = nativeBox('p');
    const f = p.meshes[0].faces[0];
    f.vertexIds = [...new Set(p.meshes[0].vertices.slice(0, 4).map((v) => v.id))];
    delete f.uv;
    delete f.normals;
    p.clips = [{ id: 'empty', name: 'Empty', duration: 1, loop: false, tracks: [] }];
    const report = await buildInspectionReport(
      captureInspectionSnapshot(p, () => new Uint8Array()),
    );
    expect(report.issues.find((i) => i.code === 'non-triangle')?.target).toEqual({
      kind: 'mesh',
      meshId: p.meshes[0].id,
      element: { kind: 'face', id: f.id },
    });
    expect(report.issues.find((i) => i.code === 'empty-clip')?.target).toEqual({
      kind: 'clip',
      clipId: 'empty',
    });
  });
});

it('bounds warning generation and explicitly reports omitted issue counts', async () => {
  const p = nativeBox('many');
  p.nodes = Array.from({ length: 600 }, (_, i) => ({
    ...p.nodes[0],
    id: 'node-' + i,
    visible: false,
  }));
  const report = await buildInspectionReport(captureInspectionSnapshot(p, () => new Uint8Array()));
  expect(report.issues.length).toBe(513);
  expect(report.issues.at(-1)?.code).toBe('issue-limit');
  expect(report.issues.at(-1)?.message).toContain('89');
  expect(exportInspectionWarnings(report)[0]).toContain('materialId');
});
