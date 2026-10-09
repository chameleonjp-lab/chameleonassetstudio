import { expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { captureAssetSnapshot, sha256, verifySnapshot } from './snapshot';
it('captures immutable revision and bytes before any await and verifies content hashes', async () => {
  const bytes = new Uint8Array([1, 2, 3]),
    hash = await sha256(bytes),
    p = nativeBox();
  p.blobIds = [hash];
  const s = captureAssetSnapshot(p, () => bytes);
  p.nodes[0].name = 'Later';
  bytes[0] = 9;
  expect(s.project.nodes[0].name).toBe('Box');
  expect(s.blobs.get(hash)![0]).toBe(1);
  await verifySnapshot(s);
  s.blobs.get(hash)![0] = 7;
  await expect(verifySnapshot(s)).rejects.toThrow('hash');
});
