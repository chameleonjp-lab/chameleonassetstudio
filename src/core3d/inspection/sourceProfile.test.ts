import { afterEach, expect, it, vi } from 'vitest';
import { sha256 } from '../export/snapshot';
import { assetIoPng } from '../fixtures/assetIo';
import type { Source3D } from '../model/project';
import { ASSET_IO_PROFILE as P } from '../profile/assetIoProfile';
import { inspectSourceProfile } from './sourceProfile';

/** Analytic GLB envelope, intentionally independent of the production exporter. */
function glb(json: unknown, bin?: Uint8Array) {
  const text = new TextEncoder().encode(typeof json === 'string' ? json : JSON.stringify(json));
  const size = Math.ceil(text.length / 4) * 4;
  const binarySize = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const bytes = new Uint8Array(20 + size + (bin ? 8 + binarySize : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(text, 20);
  if (bin) {
    view.setUint32(20 + size, binarySize, true);
    view.setUint32(24 + size, 0x004e4942, true);
    bytes.set(bin, 28 + size);
  }
  return bytes;
}
async function source(bytes: Uint8Array, mimeType = 'model/gltf-binary'): Promise<Source3D> {
  return {
    id: 'original',
    blobId: await sha256(bytes),
    mimeType,
    rights: { declared: 'My declaration', embedded: 'Stored asset metadata' },
  };
}
afterEach(() => vi.unstubAllGlobals());

it('inspects required/optional and undeclared features without decoding accessors or fetching resources', async () => {
  const fetch = vi.fn(() => {
    throw new Error('Network must not be used');
  });
  vi.stubGlobal('fetch', fetch);
  const bytes = glb(
    {
      asset: { version: '2.0' },
      extensionsRequired: ['KHR_draco_mesh_compression'],
      extensionsUsed: ['KHR_texture_transform'],
      buffers: [{ uri: 'https://example.invalid/private', byteLength: 1 }],
      accessors: [{ count: Number.MAX_SAFE_INTEGER, sparse: { count: 1 } }],
      images: [{ uri: 'data:image/png;base64,secret', mimeType: 'image/webp' }],
      meshes: [
        {
          weights: [1],
          primitives: [
            {
              attributes: {
                POSITION: 999,
                TEXCOORD_1: 12,
                JOINTS_1: 14,
                WEIGHTS_1: 15,
                TANGENT: 3,
              },
              mode: 5,
              targets: [{ POSITION: 2 }],
              extensions: { EXT_unlisted: {} },
            },
          ],
        },
      ],
      materials: [
        {
          normalTexture: { index: 0 },
          pbrMetallicRoughness: { baseColorTexture: { texCoord: 1 } },
        },
      ],
      textures: [{ source: 0 }],
      samplers: [{}],
      animations: [
        {
          samplers: [{ interpolation: 'CUBICSPLINE' }],
          channels: [{ target: { path: 'weights' } }],
        },
      ],
    },
    new Uint8Array([0xff, 0xff, 0xff, 0xff]),
  );
  const original = bytes.slice();
  const result = await inspectSourceProfile(await source(bytes), bytes);
  expect(result.status).toBe('inspected');
  expect(result.hashVerified).toBe(true);
  expect(result.inspection).toBe('metadata-only');
  expect(result.extensionsRequired).toEqual(['KHR_draco_mesh_compression']);
  expect(result.sourceOnlyFeatures).toEqual(
    expect.arrayContaining([
      'KHR_draco_mesh_compression',
      'KHR_texture_transform',
      'EXT_unlisted',
      'sparse accessor',
      'external URI resource',
      'embedded URI resource',
      'TEXCOORD_1',
      'JOINTS_1',
      'WEIGHTS_1',
      'TANGENT',
      'non-triangle primitives',
      'morph targets',
      'additional material texture',
      'texture UV set',
      'CUBICSPLINE',
      'animation weights',
      'texture sampler default REPEAT',
      'texture sampler',
    ]),
  );
  expect(result.notices.join(' ')).toContain('rejected');
  expect(fetch).not.toHaveBeenCalled();
  expect(bytes).toEqual(original);
});

it('keeps original VRM terms separate from user declarations and preserves false permission values', async () => {
  const bytes = glb({
    asset: { version: '2.0', copyright: 'Original author' },
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        meta: {
          authors: ['A', 'B'],
          licenseUrl: 'https://example.invalid/license',
          allowRedistribution: false,
          commercialUsage: 'personalNonProfit',
          thirdPartyLicenses: 'Original third-party license text',
        },
      },
      VRM: {
        meta: { author: 'C', violentUssageName: 'Disallow', otherLicenseUrl: 'legacy-terms' },
      },
    },
  });
  const metadata = await source(bytes);
  const before = structuredClone(metadata);
  const result = await inspectSourceProfile(metadata, bytes);
  expect(result.declaredRights).toBe('My declaration');
  expect(result.storedEmbeddedRights).toBe('Stored asset metadata');
  expect(result.embeddedTerms).toContainEqual({
    path: 'extensions.VRMC_vrm.meta.allowRedistribution',
    value: false,
  });
  expect(result.embeddedTerms).toContainEqual({
    path: 'extensions.VRMC_vrm.meta.thirdPartyLicenses',
    value: 'Original third-party license text',
  });
  expect(result.embeddedTerms).toContainEqual({
    path: 'extensions.VRMC_vrm.meta.authors[1]',
    value: 'B',
  });
  expect(
    result.embeddedTerms.filter((term) => term.path.endsWith('.otherLicenseUrl')),
  ).toHaveLength(1);
  expect(result.vrmVersion).toBe('VRM 0.x / VRM 1.0');
  expect(result.notices.join(' ')).toContain(
    'differing text alone does not establish a rights conflict',
  );
  expect(metadata).toEqual(before);
});

it('makes truncated embedded-term display explicit and bounded', async () => {
  const bytes = glb({
    asset: { version: '2.0' },
    extensions: {
      VRMC_vrm: {
        meta: {
          authors: Array.from({ length: 100 }, (_, i) => 'Author ' + i),
          licenseUrl: 'x'.repeat(5000),
        },
      },
    },
  });
  const result = await inspectSourceProfile(await source(bytes), bytes);
  expect(result.status).toBe('inspected');
  expect(result.embeddedTerms.length).toBeLessThanOrEqual(64);
  expect(result.notices.join(' ')).toContain('truncated');
  expect(
    result.embeddedTerms.every(
      (term) => typeof term.value !== 'string' || term.value.length <= 4096,
    ),
  ).toBe(true);
});

it('does not substitute an empty supported result for unavailable, mismatched, or malformed bytes', async () => {
  const bytes = glb({ asset: { version: '2.0' } });
  const metadata = await source(bytes);
  const missing = await inspectSourceProfile(metadata);
  expect(missing.status).toBe('missing');
  expect(missing.bytes.status).toBe('unknown');
  const wrong = await inspectSourceProfile({ ...metadata, blobId: '0'.repeat(64) }, bytes);
  expect(wrong.status).toBe('invalid');
  expect(wrong.hashVerified).toBe(false);
  for (const malformed of [
    new Uint8Array(),
    bytes.subarray(0, bytes.length - 1),
    glb('not json'),
    glb('[]'),
    glb({ asset: null }),
  ]) {
    const result = await inspectSourceProfile(await source(malformed), malformed);
    expect(result.status).toBe('invalid');
    expect(result.notices.length).toBeGreaterThan(2);
  }
});

it('rejects unsafe keys, excessive depth/value count and metadata/output expansion', async () => {
  let nested: unknown = 0;
  for (let i = 0; i < 66; i++) nested = { child: nested };
  for (const raw of [
    '{"asset":{"version":"2.0"},"__proto__":{"bad":true}}',
    '{"asset":{"version":"2.0"},"extras":{"constructor":{}}}',
    { asset: { version: '2.0' }, extras: nested },
    { asset: { version: '2.0' }, extras: Array.from({ length: P.jsonValues }, () => 0) },
    {
      asset: { version: '2.0' },
      extensionsRequired: Array.from({ length: 257 }, (_, i) => 'X' + i),
    },
    { asset: { version: '2.0' }, extensions: { bad: null } },
  ]) {
    const bytes = glb(raw);
    expect((await inspectSourceProfile(await source(bytes), bytes)).status).toBe('invalid');
  }
  const oversized = new Uint8Array(P.sourceBytes + 1);
  const result = await inspectSourceProfile(
    {
      id: 'large',
      blobId: '0'.repeat(64),
      mimeType: 'model/gltf-binary',
      rights: { declared: '', embedded: '' },
    },
    oversized,
  );
  expect(result.status).toBe('invalid');
  expect(result.hashVerified).toBe(false);
  expect(result.notices.join(' ')).toContain('exceeds');
});

it('captures a nonzero-offset byte view before the asynchronous hash boundary', async () => {
  const bytes = glb({ asset: { version: '2.0' } });
  const container = new Uint8Array(bytes.length + 8);
  container.set(bytes, 4);
  const view = container.subarray(4, 4 + bytes.length);
  const metadata = await source(view);
  const originalHash = metadata.blobId;
  const pending = inspectSourceProfile(metadata, view);
  view.fill(0);
  metadata.blobId = '0'.repeat(64);
  metadata.mimeType = 'image/png';
  const result = await pending;
  expect(result.status).toBe('inspected');
  expect(result.blobId).toBe(originalHash);
  expect(result.hashVerified).toBe(true);
});

it('keeps extras and unknown extension payloads as arbitrary bounded JSON', async () => {
  const bytes = glb({
    asset: { version: '2.0', extras: { uri: 42, extensions: 'editor note' } },
    extensions: { EXT_custom: { uri: false, extensions: 'extension-owned note' } },
  });
  const result = await inspectSourceProfile(await source(bytes), bytes);
  expect(result.status).toBe('inspected');
  expect(result.sourceOnlyFeatures).toEqual(['EXT_custom']);
});

it('detects nodes outside a single selected scene and does not confuse reachable descendants', async () => {
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ children: [1] }, {}, {}],
  };
  let bytes = glb(json);
  expect((await inspectSourceProfile(await source(bytes), bytes)).sourceOnlyFeatures).toContain(
    'non-selected scene nodes retained hidden',
  );
  json.nodes.pop();
  bytes = glb(json);
  expect((await inspectSourceProfile(await source(bytes), bytes)).sourceOnlyFeatures).not.toContain(
    'non-selected scene nodes retained hidden',
  );
});

it('bounds feature lists even when malformed source classification stops early', async () => {
  const bytes = glb({
    asset: { version: '2.0' },
    meshes: [
      {
        primitives: [
          {
            attributes: Object.fromEntries(
              Array.from({ length: 300 }, (_, index) => ['CUSTOM_' + index, 0]),
            ),
          },
        ],
      },
    ],
  });
  const result = await inspectSourceProfile(await source(bytes), bytes);
  expect(result.status).toBe('invalid');
  expect(result.sourceOnlyFeatures).toHaveLength(256);
  expect(result.notices.join(' ')).toContain('Too many source-only features');
});

it('inspects retained images/JSON separately and never treats an unsupported container as verified', async () => {
  const png = await assetIoPng();
  expect((await inspectSourceProfile(await source(png, 'image/png'), png)).status).toBe(
    'inspected',
  );
  expect((await inspectSourceProfile(await source(png, 'image/jpeg'), png)).status).toBe('invalid');
  const json = new TextEncoder().encode('{"claims":"unverified"}');
  expect((await inspectSourceProfile(await source(json, 'application/json'), json)).status).toBe(
    'inspected',
  );
  const unknown = await inspectSourceProfile(await source(json, 'application/octet-stream'), json);
  expect(unknown.status).toBe('unsupported-container');
  expect(unknown.hashVerified).toBe(true); // Identity verified, not format/runtime support.
});
