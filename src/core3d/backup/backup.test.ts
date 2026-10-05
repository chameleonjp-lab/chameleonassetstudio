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
        project.schemaVersion = '0.3.0';
        manifest.version = '0.3.0';
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
