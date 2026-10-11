import { afterEach, describe, expect, it } from 'vitest';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import { assetIoFixture } from '../../core3d/fixtures/assetIo';
import { captureAssetSnapshot } from '../../core3d/export/snapshot';
import { buildAssetPackage } from '../../core3d/export/mapping';
import { exportGlb } from '../../adapters3d/gltf/export';
import { importGlb } from '../../adapters3d/gltf/import';
import type { AssetImport } from '../../core3d/ports/assetIoPort';
import { ASSET_IO_PROFILE } from '../../core3d/profile/assetIoProfile';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  reserveResourceBytes,
  resourceLedgerSnapshot,
} from '../../core3d/profile/resourceLedger';
import {
  createNativeImportReview,
  createNativeImportConfirmation,
  type NativeImportReview,
} from './importReview';

const hash = 'a'.repeat(64);
const origin = { session: {}, projectId: 'original', revision: 4 };
const reviews: NativeImportReview[] = [];
const releases: (() => void)[] = [];
function fixture(): AssetImport {
  const project = nativeBox('copy');
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'original-glb',
      blobId: hash,
      mimeType: 'model/gltf-binary',
      rights: { declared: '', embedded: '' },
    },
  ];
  return {
    project,
    blobs: new Map([[hash, new Uint8Array([1, 2, 3])]]),
    losses: [],
    sourceHash: hash,
  };
}
function own(result = fixture(), extra = 0) {
  const review = createNativeImportReview(result, origin, extra);
  reviews.push(review);
  return review;
}
afterEach(() => {
  for (const review of reviews.splice(0)) review.dispose();
  for (const release of releases.splice(0)) release();
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

describe('unsaved native import review ownership', () => {
  it('admits a real GLB export/import with paired sidecar, skin, clips and retained source bytes', async () => {
    const source = assetIoFixture();
    const glb = await exportGlb(captureAssetSnapshot(source, () => new Uint8Array()));
    const exported = await buildAssetPackage(source, glb.bytes, glb.warnings);
    const input = await importGlb(glb.bytes, 'new-copy', false, exported.sidecar);
    const review = own(input, glb.bytes.length + exported.sidecar.length);
    const lease = review.borrow();
    releases.push(lease.release);
    expect(review.summary).toMatchObject({ projectId: 'new-copy', sourceCount: 2, clipCount: 2 });
    expect(review.summary.totalBlobBytes).toBe(glb.bytes.length + exported.sidecar.length);
    expect(lease.result.project.skins).toHaveLength(source.skins.length);
    expect(lease.result.blobs.get(input.sourceHash)).toEqual(glb.bytes);
    expect(lease.result.project.game).toEqual(source.game);
    expect(lease.result.project.revision).toBe(0);
    review.dispose();
    expect(lease.result.blobs.get(input.sourceHash)).toEqual(glb.bytes);
    lease.release();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('accounts for UTF-8 JSON strings and escapes without a full serialized allocation', () => {
    const first = fixture();
    const second = fixture();
    second.project.name = '日本語 😀 \\ " \n \u0000 \ud800';
    const firstReview = own(first);
    const secondReview = own(second);
    const jsonLength = (input: AssetImport) =>
      new TextEncoder().encode(JSON.stringify(input.project)).length;
    expect(secondReview.summary.estimatedBytes - firstReview.summary.estimatedBytes).toBe(
      (jsonLength(second) - jsonLength(first)) * 4,
    );
  });

  it('holds the source and estimate until the final asynchronous borrower really releases', async () => {
    const input = fixture();
    const before = structuredClone(input);
    const review = own(input, 17);
    const first = review.borrow();
    const second = review.borrow();
    releases.push(first.release, second.release);
    const estimate = review.summary.estimatedBytes;
    expect(resourceLedgerSnapshot().byCategory['asset-io']).toBe(estimate);
    expect(estimate).toBeGreaterThan(
      new TextEncoder().encode(JSON.stringify(input.project)).length * 4,
    );
    review.dispose();
    review.dispose();
    expect(review.disposed).toBe(true);
    expect(() => review.borrow()).toThrow('終了');
    first.release();
    first.release();
    expect(() => first.result).toThrow('終了');
    await Promise.resolve();
    expect(second.result).toBe(input);
    expect(second.result.blobs.get(hash)).toEqual(new Uint8Array([1, 2, 3]));
    expect(resourceLedgerSnapshot().byCategory['asset-io']).toBe(estimate);
    second.release();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    expect(input).toEqual(before);
  });

  it('keeps a frozen detached summary after disposal without exposing a result getter', () => {
    const input = fixture();
    input.losses = ['texture sampler'];
    const review = own(input);
    expect(review.summary).toMatchObject({
      projectId: 'copy',
      projectName: 'Native box',
      sourceHash: hash,
      nodeCount: 1,
      meshCount: 1,
      materialCount: 1,
      clipCount: 0,
      sourceCount: 1,
      losses: ['texture sampler'],
      totalBlobBytes: 3,
    });
    expect(Object.isFrozen(review.origin)).toBe(true);
    expect(Object.isFrozen(review.summary)).toBe(true);
    expect(Object.isFrozen(review.summary.losses)).toBe(true);
    review.dispose();
    input.losses.push('changed external alias');
    expect(review.summary.losses).toEqual(['texture sampler']);
    expect('result' in review).toBe(false);
    expect(() => createNativeImportReview(input, origin)).toThrow('再利用');
  });

  it('rejects changed session identity, project, revision, closed or read-only state', () => {
    const review = own();
    const current = () => review.assertCurrent(origin.session, origin.projectId, origin.revision);
    expect(current).not.toThrow();
    expect(() => review.assertCurrent({}, origin.projectId, origin.revision)).toThrow('変わり');
    expect(() => review.assertCurrent(origin.session, 'other', origin.revision)).toThrow('変わり');
    expect(() => review.assertCurrent(origin.session, origin.projectId, 5)).toThrow('変わり');
    expect(() => review.assertCurrent(origin.session, origin.projectId, 4, true)).toThrow('変わり');
    expect(() => review.assertCurrent(origin.session, origin.projectId, 4, false, true)).toThrow(
      '変わり',
    );
    review.dispose();
    expect(current).toThrow('変わり');
  });

  it.each([
    [
      'bad source hash',
      (input: AssetImport) => {
        input.sourceHash = 'bad';
      },
    ],
    [
      'missing original bytes',
      (input: AssetImport) => {
        input.blobs.clear();
      },
    ],
    [
      'unknown map reference',
      (input: AssetImport) => {
        input.blobs.set('b'.repeat(64), new Uint8Array([1]));
      },
    ],
    [
      'unknown project reference',
      (input: AssetImport) => {
        input.project.materials[0].textureBlobId = 'b'.repeat(64);
      },
    ],
    [
      'empty original',
      (input: AssetImport) => {
        input.blobs.set(hash, new Uint8Array());
      },
    ],
    [
      'wrong source type',
      (input: AssetImport) => {
        input.project.sources[0].mimeType = 'application/json';
      },
    ],
    [
      'oversized losses',
      (input: AssetImport) => {
        input.losses = Array(257).fill('loss');
      },
    ],
    [
      'non-string loss',
      (input: AssetImport) => {
        input.losses = [5 as unknown as string];
      },
    ],
    [
      'noncanonical geometry',
      (input: AssetImport) => {
        input.project.meshes[0].vertices[0].position[0] = NaN;
      },
    ],
    [
      'same project identity',
      (input: AssetImport) => {
        input.project.id = origin.projectId;
      },
    ],
  ])('rejects %s without leaking or clearing the worker result', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    const before = structuredClone(input);
    expect(() => createNativeImportReview(input, origin)).toThrow();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    expect(input).toEqual(before);
  });

  it('bounds cyclic, oversized and accessor-bearing project values before canonical traversal', () => {
    const cyclic = fixture();
    Object.assign(cyclic.project, { cycle: cyclic.project });
    expect(() => createNativeImportReview(cyclic, origin)).toThrow('循環');
    const oversized = fixture();
    oversized.project.name = 'x'.repeat(ASSET_IO_PROFILE.jsonBytes + 1);
    expect(() => createNativeImportReview(oversized, origin)).toThrow('JSON');
    const accessor = fixture();
    Object.defineProperty(accessor.project, 'name', {
      enumerable: true,
      get() {
        throw new Error('Must not read getter');
      },
    });
    expect(() => createNativeImportReview(accessor, origin)).toThrow('プロパティ');
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('counts retained backing buffers, not only tiny views', () => {
    const regular = own();
    const input = fixture();
    input.blobs.set(hash, new Uint8Array(new ArrayBuffer(1024), 12, 3));
    const view = own(input);
    expect(view.summary.totalBlobBytes).toBe(3);
    expect(view.summary.estimatedBytes - regular.summary.estimatedBytes).toBe((1024 - 3) * 4);
  });

  it('does not evict existing owners on reservation refusal or mark failed admission adopted', () => {
    const release = reserveResourceBytes('history', RESOURCE_ESTIMATE_CAP_BYTES - 1);
    releases.push(release);
    const input = fixture();
    expect(() => createNativeImportReview(input, origin)).toThrow('cap');
    expect(resourceLedgerSnapshot().byCategory.history).toBe(RESOURCE_ESTIMATE_CAP_BYTES - 1);
    expect(resourceLedgerSnapshot().byCategory['asset-io']).toBe(0);
    release();
    expect(own(input).summary.totalBlobBytes).toBe(3);
  });

  it('returns to the original resource baseline through 20 owner/borrower cancellation cycles', () => {
    const release = reserveResourceBytes('history', 71);
    releases.push(release);
    for (let cycle = 0; cycle < 20; cycle++) {
      const review = own();
      const lease = review.borrow();
      releases.push(lease.release);
      review.dispose();
      expect(resourceLedgerSnapshot().totalBytes).toBe(71 + review.summary.estimatedBytes);
      lease.release();
      expect(resourceLedgerSnapshot().totalBytes).toBe(71);
    }
  });
});

describe('synchronous import confirmation admission', () => {
  it('rejects a save immediately after context failure before a UI render, and needs fresh acknowledgement after recovery', () => {
    const gate = createNativeImportConfirmation(),
      review = own();
    expect(gate.acknowledge(review, true)).toBe(false);
    gate.updateReady(review, true);
    expect(gate.acknowledge(review, true)).toBe(true);
    expect(gate.allows(review)).toBe(true);
    gate.updateReady(review, false);
    expect(gate.allows(review)).toBe(false);
    expect(gate.acknowledge(review, true)).toBe(false);
    gate.updateReady(review, true);
    expect(gate.allows(review)).toBe(false);
    expect(gate.acknowledge(review, true)).toBe(true);
    expect(gate.allows(review)).toBe(true);
  });
  it('does not carry acknowledgement across exact candidate identities', () => {
    const gate = createNativeImportConfirmation(),
      first = own(),
      second = own();
    gate.updateReady(first, true);
    gate.acknowledge(first, true);
    gate.updateReady(second, true);
    expect(gate.allows(first)).toBe(false);
    expect(gate.allows(second)).toBe(false);
    gate.updateReady(first, false);
    gate.acknowledge(second, true);
    expect(gate.allows(second)).toBe(true);
  });
  it('clears synchronously and never revives old consent on another ready notification', () => {
    const gate = createNativeImportConfirmation(),
      review = own();
    gate.updateReady(review, true);
    gate.acknowledge(review, true);
    gate.clear();
    expect(gate.allows(review)).toBe(false);
    gate.updateReady(review, true);
    expect(gate.allows(review)).toBe(false);
    gate.acknowledge(review, true);
    gate.acknowledge(review, false);
    expect(gate.allows(review)).toBe(false);
  });
  it('rejects an already disposed review even when the previous UI would still show consent', () => {
    const gate = createNativeImportConfirmation(),
      review = own();
    gate.updateReady(review, true);
    gate.acknowledge(review, true);
    review.dispose();
    expect(gate.allows(review)).toBe(false);
    gate.updateReady(review, true);
    expect(gate.acknowledge(review, true)).toBe(false);
  });
});
