import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { nativeBox } from '../fixtures/nativeBox';
import {
  validateLegacyProject,
  validatePreviousProject,
  validateProject,
  type StoredProject3D,
} from '../model/project';
import { resourceLedgerSnapshot } from '../profile/resourceLedger';
import { exportBackup, importBackup } from './backup';
const versions = ['0.1.0', '0.2.0', '0.3.0'] as const;
async function fixture(version: (typeof versions)[number]) {
  const current = nativeBox('compatibility-source');
  const source = new Uint8Array([0, 255, 8, 3, 1]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  current.blobIds = [hash];
  current.sources = [
    {
      id: 'original',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'Original regression data', embedded: '' },
    },
  ];
  if (version === '0.3.0') return { project: current, source, hash };
  const { game: _game, ...previous } = current;
  void _game;
  return { project: { ...previous, schemaVersion: version } as StoredProject3D, source, hash };
}
describe('frozen schema reader and non-destructive backup compatibility matrix', () => {
  for (const version of versions) {
    it(`strict readers accept only their ${version} contract without rewriting the supplied project`, async () => {
      const { project } = await fixture(version);
      const before = structuredClone(project);
      const readers = {
        '0.1.0': validateLegacyProject,
        '0.2.0': validatePreviousProject,
        '0.3.0': validateProject,
      };
      for (const [readerVersion, validate] of Object.entries(readers)) {
        if (readerVersion === version) expect(() => validate(project)).not.toThrow();
        else expect(() => validate(project)).toThrow();
        expect(project).toEqual(before);
      }
    });
    it(`imports ${version} as a detached current copy while retaining exact original source and old archive`, async () => {
      const { project, source, hash } = await fixture(version),
        before = structuredClone(project),
        sourceBefore = source.slice();
      const ledger = resourceLedgerSnapshot();
      const archive = await exportBackup(project, new Map([[hash, source]])),
        archiveBefore = archive.slice();
      const restored = await importBackup(archive);
      expect(restored.project.schemaVersion).toBe('0.3.0');
      expect(restored.project.meshes).toEqual(project.meshes);
      expect(restored.project.sources).toEqual(project.sources);
      expect(restored.blobs.get(hash)).toEqual(source);
      expect(restored.blobs.get(hash)).not.toBe(source);
      if (version === '0.3.0') expect(restored.legacyBackup).toBeUndefined();
      else {
        expect(restored.legacyBackup).toEqual(archive);
        const oldFiles = unzipSync(restored.legacyBackup!);
        expect(JSON.parse(strFromU8(oldFiles['project.json']))).toEqual(project);
      }
      const next = await exportBackup(restored.project, restored.blobs);
      const nextProject = JSON.parse(strFromU8(unzipSync(next)['project.json']));
      expect(nextProject.schemaVersion).toBe('0.3.0');
      expect(() => validateLegacyProject(nextProject)).toThrow();
      expect(() => validatePreviousProject(nextProject)).toThrow();
      expect(project).toEqual(before);
      expect(source).toEqual(sourceBefore);
      expect(archive).toEqual(archiveBefore);
      expect(resourceLedgerSnapshot()).toEqual(ledger);
    });
  }
  it('rejects a future archive without stripping fields or modifying the original bytes', async () => {
    const { project, source, hash } = await fixture('0.3.0');
    const files = unzipSync(await exportBackup(project, new Map([[hash, source]])));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.version = '0.4.0';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const archive = zipSync(files, { level: 0 }),
      before = archive.slice(),
      ledger = resourceLedgerSnapshot();
    await expect(importBackup(archive)).rejects.toThrow();
    expect(archive).toEqual(before);
    expect(source).toEqual(new Uint8Array([0, 255, 8, 3, 1]));
    expect(resourceLedgerSnapshot()).toEqual(ledger);
  });
});
