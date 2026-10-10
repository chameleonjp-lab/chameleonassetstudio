import { expect, it } from 'vitest';
import { assetIoFixture } from '../fixtures/assetIo';
import { captureAssetSnapshot } from './snapshot';
import { buildAssetPackage, applySidecar } from './mapping';
import { exportGlb } from '../../adapters3d/gltf/export';
it('ties final stable IDs and metadata to model hash and rejects stale index mapping atomically', async () => {
  const p = assetIoFixture(),
    { bytes, warnings } = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array())),
    pkg = await buildAssetPackage(p, bytes, warnings);
  const meta = JSON.parse(new TextDecoder().decode(pkg.sidecar));
  meta.nodes[0].index = 999;
  const before = structuredClone(p);
  await expect(
    applySidecar(p, bytes, new TextEncoder().encode(JSON.stringify(meta))),
  ).rejects.toThrow('mapping');
  expect(p).toEqual(before);
});

it('rejects missing nonempty animation and mesh IDs instead of calling them empty clips', async () => {
  const { encodeGlb } = await import('../../adapters3d/gltf/export');
  const { preflightGlb } = await import('../import/preflight');
  const p = assetIoFixture(),
    { bytes } = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  const f = preflightGlb(bytes);
  delete f.json.animations;
  await expect(buildAssetPackage(p, encodeGlb(f.json, f.binary), [])).rejects.toThrow(
    'animation mapping',
  );
});

it('retains unverified rights through sidecar import, backup and subsequent distribution ancestry', async () => {
  const { importGlb } = await import('../../adapters3d/gltf/import');
  const { exportBackup, importBackup } = await import('../backup/backup');
  const { sha256 } = await import('./snapshot');
  const p = assetIoFixture(),
    data = new Uint8Array([2, 3]),
    hash = await sha256(data);
  p.blobIds = [hash];
  p.sources = [
    {
      id: 'original',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'Creator permits test use', embedded: 'Unverified attribution' },
    },
  ];
  const first = await exportGlb(captureAssetSnapshot(p, () => data)),
    pkg = await buildAssetPackage(p, first.bytes, first.warnings);
  const imported = await importGlb(pkg.glb, 'copy', false, pkg.sidecar),
    restored = await importBackup(await exportBackup(imported.project, imported.blobs));
  const next = await exportGlb(
      captureAssetSnapshot(restored.project, (id) => restored.blobs.get(id)!),
    ),
    pack = await buildAssetPackage(restored.project, next.bytes, next.warnings, restored.blobs);
  const meta = JSON.parse(new TextDecoder().decode(pack.sidecar));
  expect(meta.provenance.claims).toBe('user-declared-not-verified');
  expect(meta.provenance.ancestors[0].sources[0].rights.declared).toBe('Creator permits test use');
});
