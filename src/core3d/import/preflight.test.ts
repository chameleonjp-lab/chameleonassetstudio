import { describe, expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { captureAssetSnapshot } from '../export/snapshot';
import { exportGlb, encodeGlb } from '../../adapters3d/gltf/export';
import { importGlb } from '../../adapters3d/gltf/import';
import { ASSET_IO_PROFILE as P } from '../profile/assetIoProfile';
import { preflightGlb } from './preflight';

describe('bounded extension declarations', () => {
  const fields = ['extensionsUsed', 'extensionsRequired'] as const;
  const invalidValues: { label: string; value: unknown }[] = [
    { label: 'empty array', value: [] },
    { label: 'null', value: null },
    { label: 'empty string', value: '' },
    { label: 'string', value: 'VENDOR_optional' },
    { label: 'number', value: 0 },
    { label: 'boolean', value: false },
    { label: 'object', value: {} },
    { label: 'array-like object', value: { 0: 'VENDOR_optional', length: 1 } },
    { label: 'empty name', value: [''] },
    { label: 'null name', value: [null] },
    { label: 'object name', value: [{}] },
    { label: 'nested array', value: [['VENDOR_optional']] },
    { label: 'mixed values', value: ['VENDOR_optional', 1] },
    { label: 'duplicate names', value: ['VENDOR_optional', 'VENDOR_optional'] },
  ];
  const declarations = (field: (typeof fields)[number], value: unknown) =>
    encodeGlb({ asset: { version: '2.0' }, [field]: value }, new Uint8Array());

  it('accepts absent declaration fields without introducing metadata or changing input bytes', () => {
    const bytes = encodeGlb({ asset: { version: '2.0' } }, new Uint8Array());
    const original = bytes.slice();
    const result = preflightGlb(bytes);
    expect(result.json).not.toHaveProperty('extensionsUsed');
    expect(result.json).not.toHaveProperty('extensionsRequired');
    expect(result.losses).toEqual([]);
    expect(bytes).toEqual(original);
    expect(P.extensionDeclarations).toBe(64);
    expect(P.extensionNameChars).toBe(128);
    expect(P.id).toBe('cas3d-basic-gltf2-v1');
  });

  describe.each(fields)('%s', (field) => {
    it.each(invalidValues)(
      'rejects $label before loss handling, even with approval',
      async ({ value }) => {
        const bytes = declarations(field, value);
        const original = bytes.slice();
        const error = new Error('Invalid ' + field + ' declarations');
        expect(() => preflightGlb(bytes)).toThrow(error);
        await expect(importGlb(bytes, 'invalid-declarations', true)).rejects.toThrow(error);
        expect(bytes).toEqual(original);
      },
    );

    it.each([63, 64])('admits %i unique declarations to the existing feature policy', (count) => {
      const names = Array.from({ length: count }, (_, i) => 'VENDOR_optional_' + i);
      const bytes = declarations(field, names);
      const original = bytes.slice();
      if (field === 'extensionsUsed') {
        const result = preflightGlb(bytes);
        expect(result.json.extensionsUsed).toEqual(names);
        expect(result.losses).toEqual(names);
      } else expect(() => preflightGlb(bytes)).toThrow('Unsupported required extension');
      expect(bytes).toEqual(original);
    });

    it('rejects 65 declarations as a profile limit before feature policy', async () => {
      const names = Array.from({ length: 65 }, (_, i) => 'VENDOR_optional_' + i);
      const bytes = declarations(field, names);
      const original = bytes.slice();
      const error = new Error(field + ' declarations exceeds ' + P.id);
      expect(() => preflightGlb(bytes)).toThrow(error);
      await expect(importGlb(bytes, 'excess-declarations', true)).rejects.toThrow(error);
      expect(bytes).toEqual(original);
    });

    it.each(['x'.repeat(127), 'x'.repeat(128), '🦎'.repeat(64)])(
      'admits a name within 128 UTF-16 code units without normalizing it: %s',
      (name) => {
        const bytes = declarations(field, [name]);
        const original = bytes.slice();
        if (field === 'extensionsUsed') {
          const result = preflightGlb(bytes);
          expect(result.json.extensionsUsed).toEqual([name]);
          expect(result.losses).toEqual([name]);
        } else expect(() => preflightGlb(bytes)).toThrow('Unsupported required extension');
        expect(bytes).toEqual(original);
      },
    );

    it.each(['x'.repeat(129), '🦎'.repeat(64) + 'x'])(
      'rejects a name over 128 UTF-16 code units as a profile limit: %s',
      async (name) => {
        const bytes = declarations(field, [name]);
        const original = bytes.slice();
        const error = new Error(field + ' name exceeds ' + P.id);
        expect(() => preflightGlb(bytes)).toThrow(error);
        await expect(importGlb(bytes, 'excess-name', true)).rejects.toThrow(error);
        expect(bytes).toEqual(original);
      },
    );
  });

  it('checks optional declarations before rejecting a valid required extension', () => {
    const bytes = encodeGlb(
      {
        asset: { version: '2.0' },
        extensionsUsed: [],
        extensionsRequired: ['VENDOR_required'],
      },
      new Uint8Array(),
    );
    expect(() => preflightGlb(bytes)).toThrow('Invalid extensionsUsed declarations');
  });

  it('never permits valid required extensions through explicit optional-loss approval', async () => {
    const bytes = encodeGlb(
      {
        asset: { version: '2.0' },
        extensionsUsed: ['VENDOR_required'],
        extensionsRequired: ['VENDOR_required'],
      },
      new Uint8Array(),
    );
    const original = bytes.slice();
    for (const allowLoss of [false, true])
      await expect(importGlb(bytes, 'required-extension', allowLoss)).rejects.toThrow(
        'Unsupported required extension',
      );
    expect(bytes).toEqual(original);
  });

  it('retains exact optional names, requires explicit loss approval and preserves source bytes', async () => {
    const { bytes } = await exportGlb(captureAssetSnapshot(nativeBox(), () => new Uint8Array()));
    const fixture = preflightGlb(bytes);
    const names = [
      'VENDOR_optional',
      'vendor_optional',
      ' 拡張_🦎\n',
      'é',
      'e\u0301',
      'VENDOR_foo, ',
      'VENDOR_foo, bar',
    ];
    fixture.json.extensionsUsed = names;
    fixture.json.extras = { retained: 'source metadata' };
    const input = encodeGlb(fixture.json, fixture.binary);
    const original = input.slice();
    const result = preflightGlb(input);
    expect(result.json.extensionsUsed).toEqual(names);
    expect(result.json.extras).toEqual(fixture.json.extras);
    expect(result.losses).toEqual(names);
    await expect(importGlb(input, 'optional-extension')).rejects.toThrow(
      'Source-only features require explicit loss approval: ' + JSON.stringify(names),
    );
    const imported = await importGlb(input, 'optional-extension', true);
    expect(imported.losses).toEqual(names);
    expect(imported.blobs.get(imported.sourceHash)).toEqual(original);
    expect(input).toEqual(original);
  });
});

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
