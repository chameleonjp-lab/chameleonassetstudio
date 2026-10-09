import { expect, it } from 'vitest';
import { assetIoFixture } from '../../core3d/fixtures/assetIo';
import { captureAssetSnapshot } from '../../core3d/export/snapshot';
import { buildAssetPackage } from '../../core3d/export/mapping';
import { evaluateClip } from '../../core3d/animation/evaluation';
import { worldMatrix } from '../../core3d/model/coordinates';
import { exportGlb } from './export';
import { importGlb } from './import';
it('reimports editable topology, bind spaces, sidecar metadata and empty clips without double transforms', async () => {
  const p = assetIoFixture(),
    encoded = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array())),
    pkg = await buildAssetPackage(p, encoded.bytes, encoded.warnings);
  const result = await importGlb(encoded.bytes, 'copy', false, pkg.sidecar),
    q = result.project;
  expect(q.meshes[0].vertices).toHaveLength(p.meshes[0].vertices.length);
  expect(q.game).toEqual(p.game);
  expect(q.clips).toHaveLength(2);
  expect(q.clips[0].loop).toBe(true);
  expect(q.skins[0].joints[0].inverseBind).toEqual(p.skins[0].joints[0].inverseBind);
  expect(worldMatrix(q, q.nodes[0].id)).toEqual(worldMatrix(p, p.nodes[0].id));
  expect(evaluateClip(q, 'move', 0.75)).toEqual(evaluateClip(p, 'move', 0.75));
  q.meshes[0].vertices[0].position[0] -= 0.25;
  const again = await exportGlb(captureAssetSnapshot(q, (id) => result.blobs.get(id)!));
  expect(again.bytes).not.toEqual(encoded.bytes);
  expect(result.blobs.get(result.sourceHash)).toEqual(encoded.bytes);
});
it('rejects a mismatched model/sidecar before mutating an imported project', async () => {
  const p = assetIoFixture(),
    a = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array())),
    pkg = await buildAssetPackage(p, a.bytes, a.warnings);
  p.nodes[0].name = 'different';
  const b = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  await expect(importGlb(b.bytes, 'copy', false, pkg.sidecar)).rejects.toThrow('match');
});

it('rejects duplicate supplied stable IDs without looping and materializes glTF defaults', async () => {
  const { preflightGlb } = await import('../../core3d/import/preflight');
  const { encodeGlb } = await import('./export');
  const p = assetIoFixture(),
    { bytes } = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  let f = preflightGlb(bytes);
  f.json.nodes![0].extras = { casId: 'node-1-1' };
  f.json.nodes![1].extras = { casId: 'node-1-1' };
  await expect(importGlb(encodeGlb(f.json, f.binary), 'copy')).rejects.toThrow('Duplicate stable');
  f = preflightGlb(bytes);
  delete f.json.materials;
  for (const m of f.json.meshes!) for (const primitive of m.primitives) delete primitive.material;
  const q = (await importGlb(encodeGlb(f.json, f.binary), 'copy')).project;
  const material = q.materials.find((m) => m.id === q.meshes[0].faces[0].materialId)!;
  expect(material.baseColor).toEqual([1, 1, 1, 1]);
  expect(material.metallic).toBe(1);
  expect(material.roughness).toBe(1);
});
it('preserves non-binary-exact duration via sidecar and native/glTF UV origins in both directions', async () => {
  const p = assetIoFixture();
  p.clips = [
    {
      id: 'short',
      name: 'short',
      duration: 0.1,
      loop: true,
      tracks: [
        {
          nodeId: 'tip',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 0, value: [0, 1, 0] },
            { time: 0.1, value: [0, 2, 0] },
          ],
        },
      ],
    },
  ];
  p.meshes[0].faces[0].uv = [
    [0, 0],
    [1, 0],
    [0, 1],
  ];
  const { bytes, warnings } = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  const { preflightGlb } = await import('../../core3d/import/preflight');
  const f = preflightGlb(bytes);
  expect(f.read(f.json.meshes![0].primitives[0].attributes.TEXCOORD_0).slice(0, 3)).toEqual([
    [0, 1],
    [1, 1],
    [0, 0],
  ]);
  const pkg = await buildAssetPackage(p, bytes, warnings),
    q = (await importGlb(bytes, 'copy', false, pkg.sidecar)).project;
  expect(q.clips[0].duration).toBe(0.1);
  expect(q.meshes[0].faces[0].uv).toEqual([
    [0, 0],
    [1, 0],
    [0, 1],
  ]);
});
