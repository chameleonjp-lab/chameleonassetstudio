import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import {
  hashBlob,
  openProjectRepository,
  type ProjectRepository,
} from '../../core3d/storage/repository';
import { resourceLedgerSnapshot } from '../../core3d/profile/resourceLedger';
import { openRecoveryCopy } from './projectLibrary';
import type { ProjectSession } from './projectSession';
const repositories: ProjectRepository[] = [];
const sessions: ProjectSession[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const session of sessions.splice(0)) await session.close();
  repositories.splice(0).forEach((repository) => repository.close());
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});
async function setup() {
  const repository = await openProjectRepository({ indexedDB: new IDBFactory() });
  repositories.push(repository);
  const project = nativeBox('original');
  const bytes = new Uint8Array([8, 3, 9]),
    hash = await hashBlob(bytes);
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'original-source',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'fixture', embedded: '' },
    },
  ];
  const lease = await repository.acquireWriter(project.id, 'original-owner');
  await repository.commit(await repository.importStaged(project, new Map([[hash, bytes]])), {
    expectedRevision: null,
    lease,
  });
  project.revision = 1;
  project.name = 'Latest';
  await repository.commit(await repository.importStaged(project, new Map([[hash, bytes]])), {
    expectedRevision: 0,
    lease,
  });
  await repository.releaseWriter(lease);
  const entry = (await repository.libraryEntries())[0];
  const selected = (await repository.recoveryPage(project.id)).entries[1];
  return { repository, project, entry, selected, bytes, hash };
}
it('opens an older retained version under a new identity without modifying the latest or original bytes', async () => {
  const { repository, project, entry, selected, bytes, hash } = await setup();
  const before = await repository.captureBackupSnapshot(project.id);
  const session = await openRecoveryCopy(repository, 'copy-owner', project.id, selected);
  sessions.push(session);
  expect(session.project.id).not.toBe(project.id);
  expect(session.project).toMatchObject({ name: 'Native box', revision: 0 });
  expect((await repository.libraryEntries()).find((item) => item.id === project.id)).toEqual(entry);
  expect((await repository.captureBackupSnapshot(project.id)).project).toEqual(before.project);
  const copy = await repository.captureBackupSnapshot(session.project.id);
  expect(copy.blobs.get(hash)).toEqual(bytes);
  expect(copy.project.sources).toEqual(project.sources);
});
it('can recover a trashed version but keeps the original trashed and all recovery versions', async () => {
  const { repository, project, entry, selected } = await setup();
  await repository.changeLibraryTrash(entry, true);
  const before = (await repository.libraryEntries())[0];
  const session = await openRecoveryCopy(repository, 'copy-owner', project.id, selected);
  sessions.push(session);
  expect((await repository.libraryEntries()).find((item) => item.id === project.id)).toEqual(
    before,
  );
  expect(await repository.listProjects()).toHaveLength(1);
  expect((await repository.recoveryPage(project.id)).total).toBe(2);
});
it('rejects altered preview tokens and unavailable candidates without creating a copy', async () => {
  const { repository, project, selected } = await setup();
  for (const invalid of [
    { ...selected, available: false },
    { ...selected, revision: 100 },
    { ...selected, contentHash: '0'.repeat(64) },
  ]) {
    await expect(openRecoveryCopy(repository, 'copy-owner', project.id, invalid)).rejects.toThrow();
  }
  expect(await repository.libraryEntries()).toHaveLength(1);
});
it('retains the original on restore failure and does not attempt to open an unsaved copy', async () => {
  const { repository, project, selected } = await setup();
  const before = await repository.captureBackupSnapshot(project.id);
  vi.spyOn(repository, 'restoreCopy').mockRejectedValue(
    new DOMException('Full', 'QuotaExceededError'),
  );
  await expect(openRecoveryCopy(repository, 'copy-owner', project.id, selected)).rejects.toThrow(
    'Full',
  );
  expect(await repository.libraryEntries()).toHaveLength(1);
  expect((await repository.captureBackupSnapshot(project.id)).project).toEqual(before.project);
});
it('releases the exact copy writer when opening fails after durable restore, while retaining the copy', async () => {
  const { repository, project, selected, bytes, hash } = await setup();
  const acquire = repository.acquireWriter.bind(repository);
  vi.spyOn(repository, 'acquireWriter').mockRejectedValueOnce(
    new DOMException('Transient full', 'QuotaExceededError'),
  );
  await expect(openRecoveryCopy(repository, 'copy-owner', project.id, selected)).rejects.toThrow(
    'Transient full',
  );
  const copy = (await repository.libraryEntries()).find((entry) => entry.id !== project.id)!;
  expect(copy).toBeDefined();
  const lease = await acquire(copy.id, 'different-owner');
  expect((await repository.captureBackupSnapshot(copy.id)).blobs.get(hash)).toEqual(bytes);
  await repository.releaseWriter(lease);
  await repository.changeLibraryTrash(copy, true);
});
