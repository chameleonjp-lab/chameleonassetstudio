import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { createEmptyProject, createImageAsset } from '../model/factories';
import { exportCasproj, type CasprojBundle } from '../storage/casproj';
import {
  compareRevisions,
  readReferenceRevision,
  revisionJson,
  snapshotRevision,
} from './revisionReview';

function bundle(): CasprojBundle {
  const asset = createImageAsset({
    name: 'hero',
    size: { width: 16, height: 16 },
    sourceMimeType: 'image/png',
    sourceExtension: 'png',
  });
  const project = createEmptyProject('制作');
  project.assets = [
    { id: asset.id, name: asset.name, displayName: asset.displayName, assetType: asset.assetType },
  ];
  return {
    project,
    assets: [asset],
    files: asset.textures.map((texture) => ({
      path: `assets/${asset.id}/${texture.path}`,
      bytes: new Uint8Array([1, 2, 3]),
    })),
  };
}
async function diff(a: CasprojBundle, b: CasprojBundle) {
  return compareRevisions(await snapshotRevision(a), await snapshotRevision(b));
}

describe('revision review preserves meaning and finds real changes', () => {
  it('is stable across object key and file ordering without mutating inputs', async () => {
    const a = bundle();
    const saved = structuredClone(a);
    const b = structuredClone(a);
    b.files.reverse();
    b.assets[0].gameAttributes = { b: 2, a: 1 };
    a.assets[0].gameAttributes = { a: 1, b: 2 };
    expect((await diff(a, b)).assets[0].status).toBe('unchanged');
    expect(await snapshotRevision(a)).toEqual(await snapshotRevision(b));
    a.assets[0].gameAttributes = saved.assets[0].gameAttributes;
    expect(a).toEqual(saved);
  });
  it('detects bytes changed at the same path even when JSON and byte length stay identical', async () => {
    const a = bundle(),
      b = structuredClone(a);
    b.files[1].bytes[1] = 9;
    const result = await diff(a, b);
    expect(result.assets[0].fields).toEqual([]);
    expect(result.assets[0].files).toEqual([{ path: b.files[1].path, status: 'changed' }]);
    expect(result.current.fingerprint).not.toBe(result.baseline.fingerprint);
  });
  it('detects removed and added image files, including unknown attachments', async () => {
    const a = bundle(),
      b = structuredClone(a);
    b.files.pop();
    b.files.push({ path: 'notes/brief.txt', bytes: new Uint8Array([4]) });
    const result = await diff(a, b);
    expect(result.assets[0].files[0].status).toBe('removed');
    expect(result.otherFiles).toEqual([{ path: 'notes/brief.txt', status: 'added' }]);
  });
  it('never joins different IDs just because names match', async () => {
    const a = bundle(),
      b = bundle();
    const result = await diff(a, b);
    expect(result.sameProject).toBe(false);
    expect(result.assets.map((a) => a.status).sort()).toEqual(['added', 'removed']);
  });
  it('detects event payloads, repeated occurrences, timing and hidden collisions', async () => {
    const a = bundle();
    a.assets[0].frames = [{ id: 'f', name: 'f', durationMs: 120, layerStates: [] }];
    a.assets[0].animations = [
      {
        id: 'walk',
        name: 'walk',
        fps: 10,
        loop: true,
        frameIds: ['f', 'f'],
        events: [{ id: 'e', name: 'hit', frameId: 'f', payload: null }],
      },
    ];
    const b = structuredClone(a);
    b.assets[0].frames![0].durationMs = 200;
    b.assets[0].animations[0].events![0].payload = { damage: 3 };
    b.assets[0].animations[0].frameIds.pop();
    b.assets[0].colliders = [
      {
        id: 'hidden',
        name: 'hidden',
        purpose: 'body',
        visible: false,
        shape: 'rect',
        rect: { x: 0, y: 0, width: 4, height: 5 },
      },
    ];
    b.assets[0].origin.x += 2;
    const result = await diff(a, b);
    expect(result.assets[0].fields).toEqual(
      expect.arrayContaining(['frames', 'animations', 'origin', 'colliders']),
    );
    expect(a.assets[0].animations[0].frameIds).toHaveLength(2);
  });
  it('does not silently discard unknown metadata or array ordering', async () => {
    const a = bundle(),
      b = structuredClone(a);
    Object.assign(a.assets[0], { futureData: [1, 2] });
    Object.assign(b.assets[0], { futureData: [2, 1] });
    expect((await diff(a, b)).assets[0].fields).toContain('futureData');
  });
  it('reports project and output settings changes independently', async () => {
    const a = bundle(),
      b = structuredClone(a);
    b.project.name = '別の名前';
    b.exportPresets = {
      format: 'chameleon-export-presets',
      version: '0.1.0',
      presets: [],
    } as never;
    const result = await diff(a, b);
    expect(result.projectChanged).toBe(true);
    expect(result.settingsChanged).toBe(true);
    expect(result.assets[0].status).toBe('unchanged');
  });
  it('keeps required structural issues even for unchanged assets', async () => {
    const a = bundle();
    a.assets[0].layers[0].textureId = 'missing';
    expect(
      (await diff(a, a)).assets[0].issues.some(
        (issue) => issue.code === 'reference.layerTextureMissing',
      ),
    ).toBe(true);
  });
  it('rejects duplicate asset IDs and duplicate file paths', async () => {
    const a = bundle();
    a.assets.push(structuredClone(a.assets[0]));
    await expect(snapshotRevision(a)).rejects.toThrow('同じAsset ID');
    a.assets.pop();
    a.files.push(a.files[0]);
    await expect(snapshotRevision(a)).rejects.toThrow();
  });
  it('honors cancellation before hashing and reading an archive', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(snapshotRevision(bundle(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(readReferenceRevision(new Blob([]), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
  it('reads a genuine exported archive without requiring IndexedDB or committing it', async () => {
    const a = bundle();
    const archive = await exportCasproj(a);
    const reference = await readReferenceRevision(archive);
    expect(reference.projectId).toBe(a.project.id);
    expect(reference.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reference.fingerprint).toBe((await snapshotRevision(a)).fingerprint);
    expect(reference.assets).toEqual(a.assets);
  });
  it('rejects malformed archives rather than producing a success report', async () => {
    await expect(readReferenceRevision(new Blob(['not zip']))).rejects.toThrow();
    await expect(
      readReferenceRevision(new Blob([zipSync({ 'unknown.json': strToU8('{}') })])),
    ).rejects.toThrow('project.json');
  });
  it('preserves input safety path guards through the archive reader', async () => {
    const a = bundle();
    const bytes = zipSync({
      'project.json': strToU8(JSON.stringify(a.project)),
      '../evil': new Uint8Array([1]),
    });
    await expect(readReferenceRevision(new Blob([bytes]))).rejects.toThrow();
  });
  it('tracks custom bundled instructions without inventing changes for generated defaults', async () => {
    const a = bundle(),
      b = structuredClone(a);
    b.readme = 'Custom handoff';
    const result = await diff(a, b);
    expect(result.readmeChanged).toBe(true);
    expect(result.baseline.fingerprint).not.toBe(result.current.fingerprint);
  });
  it('rejects incomplete or inconsistent declared asset sets in reference archives', async () => {
    const a = bundle();
    const missing = zipSync({ 'project.json': strToU8(JSON.stringify(a.project)) });
    await expect(readReferenceRevision(new Blob([missing]))).rejects.toThrow(
      '参照するAssetがありません',
    );
    const bad = structuredClone(a);
    bad.project.assets[0].displayName = 'wrong summary';
    const archive = zipSync({
      'project.json': strToU8(JSON.stringify(bad.project)),
      [`assets/${a.assets[0].id}/asset.json`]: strToU8(JSON.stringify(a.assets[0])),
    });
    await expect(readReferenceRevision(new Blob([archive]))).rejects.toThrow('summary');
  });
  it('compares deletion of the final asset and exposes exact editing destinations', async () => {
    const a = bundle(),
      b = structuredClone(a);
    b.project.assets = [];
    b.assets = [];
    b.files = [];
    expect((await diff(a, b)).assets[0].status).toBe('removed');
    const c = structuredClone(a);
    c.assets[0].origin.x = 5;
    const change = (await diff(a, c)).assets[0].changes.find((change) => change.field === 'origin');
    expect(change?.panel).toBe('game-data');
    expect(change?.after).toContain('5');
  });
  it('shows the exact late-frame change rather than identical truncated prefixes', async () => {
    const a = bundle();
    a.assets[0].frames = Array.from({ length: 40 }, (_, i) => ({
      id: `f${i}`,
      name: `frame ${i}`,
      durationMs: 100,
      layerStates: [],
    }));
    const b = structuredClone(a);
    b.assets[0].frames![20].durationMs = 250;
    const change = (await diff(a, b)).assets[0].changes;
    expect(change).toEqual([
      {
        field: 'frames',
        path: 'frames[20].durationMs',
        before: '100',
        after: '250',
        panel: 'timeline',
      },
    ]);
  });
  it('locates edits within long strings, caps detail honestly and avoids fake editors', async () => {
    const a = bundle(),
      b = structuredClone(a);
    a.assets[0].gameAttributes = { long: 'a'.repeat(1000) + 'old' };
    b.assets[0].gameAttributes = { long: 'a'.repeat(1000) + 'new' };
    const change = (await diff(a, b)).assets[0].changes[0];
    expect(change.before).toContain('old');
    expect(change.after).toContain('new');
    Object.assign(b.assets[0], { future: { unknown: true } });
    b.assets[0].canvasSize.width += 1;
    const changes = (await diff(a, b)).assets[0].changes;
    expect(changes.find((change) => change.field === 'future')?.panel).toBeNull();
    expect(changes.find((change) => change.field === 'canvasSize')?.panel).toBe('layers');
    a.assets[0].gameAttributes = {};
    b.assets[0].gameAttributes = Object.fromEntries(
      Array.from({ length: 220 }, (_, i) => [String(i), i]),
    );
    const result = (await diff(a, b)).assets[0];
    expect(result.changes).toHaveLength(200);
    expect(result.changesTruncated).toBe(true);
  });
  it('distinguishes absent fields, null, zero and false', () => {
    expect(new Set([undefined, null, 0, false].map(revisionJson)).size).toBe(4);
  });
});
