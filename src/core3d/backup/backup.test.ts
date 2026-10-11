import { createProject, identityTransform } from '../model/project';
import {
  resourceLedgerSnapshot,
  reserveResourceBytes,
  RESOURCE_ESTIMATE_CAP_BYTES,
} from '../profile/resourceLedger';
import { describe, it, expect, vi } from 'vitest';
import { smallProject } from '../fixtures/project';
import { ProjectHistory } from '../commands/history';
import { exportBackup, importBackup } from './backup';
async function fixture() {
  const p = smallProject();
  const bytes = new Uint8Array([8, 5, 3, 1]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
  p.blobIds = [hash];
  p.sources = [
    {
      id: 'source',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'CC0 self-authored fixture', embedded: '' },
    },
  ];
  return { p, bytes, hash };
}
function expectZipEntriesAtEpoch(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const localSignature = 0x04034b50;
  const centralSignature = 0x02014b50;
  const endSignature = 0x06054b50;
  let offset = 0;
  let localEntries = 0;
  while (offset + 30 <= view.byteLength && view.getUint32(offset, true) === localSignature) {
    expect(view.getUint16(offset + 10, true)).toBe(0);
    expect(view.getUint16(offset + 12, true)).toBe(0x21);
    const compressedBytes = view.getUint32(offset + 18, true);
    const filenameBytes = view.getUint16(offset + 26, true);
    const extraBytes = view.getUint16(offset + 28, true);
    offset += 30 + filenameBytes + extraBytes + compressedBytes;
    localEntries += 1;
  }
  expect(localEntries).toBeGreaterThan(0);

  let centralEntries = 0;
  while (offset + 46 <= view.byteLength && view.getUint32(offset, true) === centralSignature) {
    expect(view.getUint16(offset + 12, true)).toBe(0);
    expect(view.getUint16(offset + 14, true)).toBe(0x21);
    const filenameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const commentBytes = view.getUint16(offset + 32, true);
    offset += 46 + filenameBytes + extraBytes + commentBytes;
    centralEntries += 1;
  }
  expect(centralEntries).toBe(localEntries);
  expect(view.getUint32(offset, true)).toBe(endSignature);
}

describe('resident native backup', () => {
  it('restores mesh, source bytes, mixed skin and keys without renderer, network, or original storage', async () => {
    const { p, bytes, hash } = await fixture();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      const archive = await exportBackup(p, new Map([[hash, bytes]]));
      const restored = await importBackup(archive);
      expect(restored.project).toEqual(p);
      expect(restored.blobs.get(hash)).toEqual(bytes);
      expect(fetchSpy).not.toHaveBeenCalled();
      const h = new ProjectHistory(restored.project);
      h.execute((q) => {
        q.meshes[0].vertices[0].position[0] = 0.5;
        q.clips[0].tracks[0].keys[1].value = [0, 2, 0];
      });
      expect(h.project.meshes[0].vertices[0].position[0]).toBe(0.5);
      expect(p.meshes[0].vertices[0].position[0]).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('writes the DOS ZIP epoch consistently in local and central directory headers', async () => {
    const { p, bytes, hash } = await fixture();
    expectZipEntriesAtEpoch(await exportBackup(p, new Map([[hash, bytes]])));
  });
  it('captures data before awaiting and does not export later caller mutations', async () => {
    const { p, bytes, hash } = await fixture();
    const pending = exportBackup(p, new Map([[hash, bytes]]));
    p.name = 'later';
    bytes[0] = 99;
    const result = await importBackup(await pending);
    expect(result.project.name).toBe('Tiny editable fixture');
    expect(result.blobs.get(hash)![0]).toBe(8);
  });
  it('refuses missing or wrong source bytes without modifying the project', async () => {
    const { p, hash } = await fixture();
    const before = structuredClone(p);
    await expect(exportBackup(p, new Map())).rejects.toThrow('Missing blob');
    await expect(exportBackup(p, new Map([[hash, new Uint8Array([1])]]))).rejects.toThrow(
      'hash mismatch',
    );
    expect(p).toEqual(before);
  });
});

describe('versioned backup rejection and original retention', () => {
  it.each(['future', 'legacy-new-field', 'version-mismatch', 'invalid-alpha', 'unknown-manifest'])(
    'rejects %s without mutating archive bytes',
    async (kind) => {
      const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate');
      const { hashBlob } = await import('../storage/repository');
      const { p, hash, bytes } = await fixture();
      const files = unzipSync(await exportBackup(p, new Map([[hash, bytes]])));
      const project = JSON.parse(strFromU8(files['project.json']));
      const manifest = JSON.parse(strFromU8(files['manifest.json']));
      if (kind === 'future') {
        project.schemaVersion = '0.4.0';
        manifest.version = '0.4.0';
      }
      if (kind === 'legacy-new-field') {
        project.schemaVersion = '0.1.0';
        manifest.version = '0.1.0';
        project.nodes[0].locked = false;
      }
      if (kind === 'version-mismatch') manifest.version = '0.1.0';
      if (kind === 'invalid-alpha') project.materials[0].alphaMode = 'AUTO';
      if (kind === 'unknown-manifest') manifest.extra = true;
      files['project.json'] = strToU8(JSON.stringify(project));
      manifest.projectHash = await hashBlob(files['project.json']);
      files['manifest.json'] = strToU8(JSON.stringify(manifest));
      const archive = zipSync(files, { level: 0 });
      const before = archive.slice();
      await expect(importBackup(archive)).rejects.toThrow();
      expect(archive).toEqual(before);
    },
  );
});

it('retains the exact 0.2 archive and upgrades without resetting visibility or material values', async () => {
  const { nativeBox } = await import('../fixtures/nativeBox');
  const { game: _game, ...base } = nativeBox('v2');
  void _game;
  const old = { ...base, schemaVersion: '0.2.0' as const };
  old.nodes[0].visible = false;
  old.nodes[0].locked = true;
  old.materials[0].alphaMode = 'BLEND';
  const archive = await exportBackup(old, new Map());
  const restored = await importBackup(archive);
  expect(restored.legacyBackup).toEqual(archive);
  expect(restored.project.schemaVersion).toBe('0.3.0');
  expect(restored.project.nodes).toEqual(old.nodes);
  expect(restored.project.materials).toEqual(old.materials);
});

it('backup resource admission rejects without mutation and releases all temporary estimates', async () => {
  const { p, bytes, hash } = await fixture(),
    source = new Map([[hash, bytes]]);
  const original = structuredClone(p),
    before = resourceLedgerSnapshot();
  const hold = reserveResourceBytes(
    'geometry',
    RESOURCE_ESTIMATE_CAP_BYTES - before.totalBytes - 1,
  );
  await expect(exportBackup(p, source)).rejects.toThrow();
  expect(p).toEqual(original);
  expect(source.get(hash)).toEqual(bytes);
  hold();
  const archive = await exportBackup(p, source);
  expect(resourceLedgerSnapshot()).toEqual(before);
  const imported = await importBackup(archive);
  expect(imported.blobs.get(hash)).toEqual(bytes);
  expect(resourceLedgerSnapshot()).toEqual(before);
  await expect(importBackup(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  expect(resourceLedgerSnapshot()).toEqual(before);
});

it('round-trips UTF-8-heavy exporter-accepted projects under an otherwise empty shared budget', async () => {
  const p = smallProject();
  p.blobIds = [];
  p.sources = [];
  p.meshes = [];
  p.materials = [];
  p.skins = [];
  p.clips = [];
  p.nodes = Array.from({ length: 1000 }, (_, i) => ({
    id: 'node-' + i,
    name: '日'.repeat(2000),
    parentId: null,
    transform: {
      translation: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    },
    visible: true,
    locked: false,
  }));
  const baseline = resourceLedgerSnapshot();
  const archive = await exportBackup(p, new Map());
  const restored = await importBackup(archive);
  expect(restored.project).toEqual(p);
  expect(resourceLedgerSnapshot()).toEqual(baseline);
});

it('round-trips an accepted large native mesh across semantic-value and JSON-key token accounting', async () => {
  const p = createProject('token-roundtrip');
  p.nodes = [
    { id: 'node', name: 'Mesh', parentId: null, meshId: 'mesh', transform: identityTransform() },
  ];
  p.meshes = [
    {
      id: 'mesh',
      vertices: Array.from({ length: 62500 }, (_, i) => ({
        id: 'v' + i,
        position: [0, i % 2, Math.floor(i / 2)] as [number, number, number],
      })),
      faces: Array.from({ length: 62500 }, (_, i) => ({
        id: 'f' + i,
        vertexIds: ['v0', 'v1', 'v2'],
      })),
    },
  ];
  const baseline = resourceLedgerSnapshot();
  const archive = await exportBackup(p, new Map());
  const restored = await importBackup(archive);
  expect(restored.project.meshes[0].vertices).toHaveLength(62500);
  expect(restored.project.meshes[0].faces).toHaveLength(62500);
  expect(restored.project).toEqual(p);
  expect(resourceLedgerSnapshot()).toEqual(baseline);
});
