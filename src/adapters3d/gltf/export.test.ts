import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import { assetIoFixture } from '../../core3d/fixtures/assetIo';
import { captureAssetSnapshot } from '../../core3d/export/snapshot';
import { buildAssetPackage } from '../../core3d/export/mapping';
import { preflightGlb } from '../../core3d/import/preflight';
import { exportGlb } from './export';
const validator = createRequire(import.meta.url)('gltf-validator') as {
  validateBytes: (
    bytes: Uint8Array,
    options: Record<string, unknown>,
  ) => Promise<{ issues: { numErrors: number; truncated: boolean; messages: unknown[] } }>;
};
it('emits independently valid actual GLB geometry/skin/keys including non-root-first palette', async () => {
  const p = assetIoFixture(),
    before = structuredClone(p),
    result = await exportGlb(
      captureAssetSnapshot(p, () => {
        throw Error('no blobs');
      }),
    );
  const report = await validator.validateBytes(result.bytes, { maxIssues: 1000 });
  expect(report.issues.numErrors, JSON.stringify(report.issues)).toBe(0);
  expect(report.issues.truncated).toBe(false);
  const f = preflightGlb(result.bytes);
  expect(f.json.skins![0].skeleton).toBeUndefined();
  expect(f.json.animations).toHaveLength(1);
  expect(f.read(f.json.animations![0].samplers[0].input).flat()).toEqual([0, 0.5, 1, 2]);
  const pkg = await buildAssetPackage(p, result.bytes, result.warnings);
  expect(pkg.zip.length).toBeGreaterThan(result.bytes.length);
  expect(JSON.parse(new TextDecoder().decode(pkg.sidecar)).clips).toHaveLength(2);
  expect(p).toEqual(before);
});
it('does not silently remove hidden nodes and rejects Float32 time collisions', async () => {
  const p = nativeBox();
  p.nodes[0].visible = false;
  const result = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  expect(preflightGlb(result.bytes).json.nodes).toHaveLength(1);
  p.clips = [
    {
      id: 'c',
      name: 'c',
      duration: 2,
      loop: false,
      tracks: [
        {
          nodeId: p.nodes[0].id,
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 1, value: [0, 0, 0] },
            { time: 1 + 1e-8, value: [1, 0, 0] },
          ],
        },
      ],
    },
  ];
  await expect(exportGlb(captureAssetSnapshot(p, () => new Uint8Array()))).rejects.toThrow(
    'collapse',
  );
});

it('adds a common identity root for independent joint roots and normalizes only an explicit derivative', async () => {
  const p = assetIoFixture();
  p.nodes.find((n) => n.id === 'tip')!.parentId = null;
  p.meshes[0].faces[0].normals = [
    [2, 0, 0],
    [2, 0, 0],
    [2, 0, 0],
  ];
  const before = structuredClone(p),
    result = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  const report = await validator.validateBytes(result.bytes, { maxIssues: 1000 });
  expect(report.issues.numErrors, JSON.stringify(report.issues)).toBe(0);
  expect(result.warnings.some((x) => x.includes('Normal'))).toBe(true);
  expect(p).toEqual(before);
});

it('rejects empty scenes explicitly rather than emitting invalid empty entities', async () => {
  const { createProject } = await import('../../core3d/model/project');
  await expect(
    exportGlb(captureAssetSnapshot(createProject('empty'), () => new Uint8Array())),
  ).rejects.toThrow('Empty project');
});

it('keeps RGBA source bytes, glTF top-left UV and legacy texture transparency explicit', async () => {
  const { assetIoPng } = await import('../../core3d/fixtures/assetIo');
  const { sha256 } = await import('../../core3d/export/snapshot');
  const p = nativeBox(),
    png = await assetIoPng(),
    hash = await sha256(png);
  p.blobIds = [hash];
  p.materials[0].textureBlobId = hash;
  p.materials[0].alphaMode = 'LEGACY_AUTO';
  p.meshes[0].faces.forEach((face) => {
    face.uv = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
  });
  const { bytes } = await exportGlb(captureAssetSnapshot(p, () => png)),
    f = preflightGlb(bytes),
    view = f.json.bufferViews![f.json.images![0].bufferView!];
  expect(f.binary.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)).toEqual(
    png,
  );
  expect(f.json.materials![0].alphaMode).toBe('BLEND');
  expect(f.read(f.json.meshes![0].primitives[0].attributes.TEXCOORD_0).slice(0, 3)).toEqual([
    [0, 1],
    [1, 1],
    [0, 0],
  ]);
  const report = await validator.validateBytes(bytes, { maxIssues: 1000 });
  expect(report.issues.numErrors, JSON.stringify(report.issues)).toBe(0);
});

it('rejects unsafe JSON rest transforms without changing their rescueable canonical source', async () => {
  const p = nativeBox();
  p.nodes[0].transform.translation = [1e100, 0, 0];
  const before = structuredClone(p);
  await expect(exportGlb(captureAssetSnapshot(p, () => new Uint8Array()))).rejects.toThrow(
    'Float32',
  );
  expect(p).toEqual(before);
});
