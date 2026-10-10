import { expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { captureAssetSnapshot } from '../export/snapshot';
import { exportGlb, encodeGlb } from '../../adapters3d/gltf/export';
import { preflightGlb } from './preflight';
it('rejects URI, required extensions, unsafe accessor ranges and truncated chunks before decoding', async () => {
  const { bytes } = await exportGlb(captureAssetSnapshot(nativeBox(), () => new Uint8Array()));
  for (const mutate of [
    (f: ReturnType<typeof preflightGlb>) => {
      f.json.buffers![0].uri = 'https://example.invalid/private';
    },
    (f: ReturnType<typeof preflightGlb>) => {
      f.json.extensionsRequired = ['UNKNOWN'];
    },
    (f: ReturnType<typeof preflightGlb>) => {
      f.json.accessors![0].count = Number.MAX_SAFE_INTEGER;
    },
    (f: ReturnType<typeof preflightGlb>) => {
      f.json.accessors![0].byteOffset = 9999999;
    },
  ]) {
    const f = preflightGlb(bytes);
    mutate(f);
    expect(() => preflightGlb(encodeGlb(f.json, f.binary))).toThrow();
  }
  expect(() => preflightGlb(bytes.slice(0, -1))).toThrow();
  const f = preflightGlb(bytes);
  f.json.extensionsUsed = ['UNKNOWN'];
  expect(preflightGlb(encodeGlb(f.json, f.binary)).losses).toContain('UNKNOWN');
});

it('budgets canonical skin-instance expansion and rejects projective inverse binds', async () => {
  const { assetIoFixture } = await import('../fixtures/assetIo');
  const { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  let f = preflightGlb(bytes);
  f.json.meshes![0].primitives.push(
    ...structuredClone(f.json.meshes![0].primitives),
    ...structuredClone(f.json.meshes![0].primitives),
  );
  const original = f.json.nodes![0];
  for (let i = 0; i < 4090; i++)
    f.json.nodes!.push({ ...original, extras: { casId: 'extra-' + i } });
  f.json.scenes![0].nodes = Array.from({ length: f.json.nodes!.length }, (_, i) => i).filter(
    (i) => !f.json.nodes!.some((n) => n.children?.includes(i)),
  );
  expect(() => preflightGlb(encodeGlb(f.json, f.binary))).toThrow();
  f = preflightGlb(bytes);
  const a = f.json.accessors![f.json.skins![0].inverseBindMatrices!],
    v = f.json.bufferViews![a.bufferView!];
  new DataView(f.binary.buffer).setFloat32(
    (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + 12,
    0.25,
    true,
  );
  expect(() => preflightGlb(encodeGlb(f.json, f.binary))).toThrow('affine');
});
