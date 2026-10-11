import { IDBFactory } from 'fake-indexeddb';
import { expect, it, vi } from 'vitest';
import { openProjectRepository } from '../../core3d/storage/repository';
import { assetIoFixture, assetIoPng } from '../../core3d/fixtures/assetIo';
import { captureAssetSnapshot, sha256 } from '../../core3d/export/snapshot';
import { exportGlb } from '../../adapters3d/gltf/export';
import { exportBackup, importBackup } from '../../core3d/backup/backup';
import { ProjectSession } from './projectSession';
import {
  adoptEditorSession,
  preserveSessionForRescue,
  releaseEditorResources,
} from './sessionLifetime';
import { assetIoReservedBytes } from '../../core3d/profile/assetIoProfile';
import { nativeTextureReservedBytes } from '../../core3d/model/textureResources';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function fixture() {
  const repository = await openProjectRepository({ indexedDB: new IDBFactory() }),
    project = assetIoFixture();
  const png = await assetIoPng(),
    imageHash = await sha256(png);
  project.blobIds = [imageHash];
  project.materials[0].textureBlobId = imageHash;
  project.meshes[0].faces.forEach(
    (face) =>
      (face.uv = [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
  );
  project.sources = [
    {
      id: 'image-original',
      blobId: imageHash,
      mimeType: 'image/png',
      rights: { declared: 'Original fixture', embedded: '' },
    },
  ];
  const glb = (await exportGlb(captureAssetSnapshot(project, () => png))).bytes,
    glbHash = await sha256(glb);
  project.blobIds.push(glbHash);
  project.sources.push({
    id: 'glb-original',
    blobId: glbHash,
    mimeType: 'model/gltf-binary',
    rights: { declared: 'Original fixture', embedded: '' },
  });
  const blobs = new Map([
    [imageHash, png],
    [glbHash, glb],
  ]);
  const session = await ProjectSession.restore(
    repository,
    'owner',
    await exportBackup(project, blobs),
  );
  return { repository, session, blobs };
}
it('child teardown preserves image and GLB originals, skin and clips for repeated rescue', async () => {
  const { repository, session, blobs } = await fixture();
  await preserveSessionForRescue(session);
  for (let i = 0; i < 2; i++) {
    const archive = await importBackup(await session.backup());
    expect(archive.blobs).toEqual(blobs);
    expect(archive.project.skins).toHaveLength(1);
    expect(archive.project.clips).toHaveLength(2);
  }
  await releaseEditorResources(session, [repository]);
  expect(assetIoReservedBytes()).toBe(0);
  expect(nativeTextureReservedBytes()).toBe(0);
});
it('a failed unmount save preserves dirty rescue and prevents forced repository release', async () => {
  const { repository, session, blobs } = await fixture();
  session.rename('Unsaved binary rescue');
  const commit = vi
    .spyOn(repository, 'commit')
    .mockRejectedValue(new DOMException('quota', 'QuotaExceededError'));
  const close = vi.spyOn(repository, 'close');
  await expect(preserveSessionForRescue(session)).rejects.toThrow();
  await expect(releaseEditorResources(session, [repository])).rejects.toThrow();
  expect(close).not.toHaveBeenCalled();
  const rescued = await importBackup(await session.backup());
  expect(rescued.project.name).toBe('Unsaved binary rescue');
  expect(rescued.blobs).toEqual(blobs);
  commit.mockRestore();
  await releaseEditorResources(session, [repository]);
  expect(close).toHaveBeenCalledOnce();
  close.mockRestore();
  expect(assetIoReservedBytes()).toBe(0);
  expect(nativeTextureReservedBytes()).toBe(0);
});

it('rejects late open after child failure without touching the rescue session', async () => {
  const { repository, session, blobs } = await fixture();
  const next = await ProjectSession.create(repository, 'other', 'Next');
  const ref = { current: session };
  await preserveSessionForRescue(session);
  expect(await adoptEditorSession(ref, next, () => false)).toBe(false);
  expect(ref.current).toBe(session);
  expect((await importBackup(await session.backup())).blobs).toEqual(blobs);
  await releaseEditorResources(session, [repository]);
});
it('retains rescue originals when owner expires during asynchronous close', async () => {
  const { repository, session, blobs } = await fixture();
  const next = await ProjectSession.create(repository, 'other', 'Next');
  const ref = { current: session };
  let valid = true;
  const release = repository.releaseWriter.bind(repository);
  const wait = deferred();
  const entered = deferred();
  const spy = vi.spyOn(repository, 'releaseWriter').mockImplementationOnce(async (lease) => {
    entered.resolve();
    await wait.promise;
    return release(lease);
  });
  const adoption = adoptEditorSession(ref, next, () => valid);
  await entered.promise;
  valid = false;
  wait.resolve();
  expect(await adoption).toBe(false);
  expect(ref.current).toBe(session);
  expect((await importBackup(await session.backup())).blobs).toEqual(blobs);
  spy.mockRestore();
  await releaseEditorResources(session, [repository]);
});
it('adopts a current owner and releases old resident resources', async () => {
  const { repository, session } = await fixture();
  const next = await ProjectSession.create(repository, 'other', 'Next');
  const ref = { current: session };
  expect(await adoptEditorSession(ref, next, () => true)).toBe(true);
  expect(ref.current).toBe(next);
  await releaseEditorResources(next, [repository]);
  expect(assetIoReservedBytes()).toBe(0);
  expect(nativeTextureReservedBytes()).toBe(0);
});

it('transfers rescue ownership before the close promise continuation can be delayed', async () => {
  const { repository, session, blobs } = await fixture();
  const next = await ProjectSession.create(repository, 'other', 'Next');
  const ref = { current: session };
  const close = session.close.bind(session);
  const gate = deferred();
  const released = deferred();
  let valid = true;
  vi.spyOn(session, 'close').mockImplementationOnce(async (...args) => {
    const result = await close(...args);
    released.resolve();
    await gate.promise;
    return result;
  });
  const adoption = adoptEditorSession(ref, next, () => valid);
  await released.promise;
  // The old resident bytes are already released; rescue must already point to next.
  expect(ref.current).toBe(next);
  valid = false;
  expect((await importBackup(await ref.current.backup())).project.id).toBe(next.project.id);
  gate.resolve();
  expect(await adoption).toBe(true);
  expect(ref.current).toBe(next);
  expect(blobs.size).toBe(2);
  await releaseEditorResources(next, [repository]);
});
