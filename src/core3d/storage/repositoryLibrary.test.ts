import { IDBDatabase as FakeDatabase, IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { openProjectRepository, hashBlob, type ProjectRepository } from './repository';
import { openStorageDatabase, inTransaction, requestResult } from './db';
const repositories: ProjectRepository[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  repositories.splice(0).forEach((repository) => repository.close());
});
async function setup() {
  const factory = new IDBFactory();
  const repository = await openProjectRepository({ indexedDB: factory });
  repositories.push(repository);
  const project = nativeBox('library');
  const bytes = new Uint8Array([2, 8, 4]),
    hash = await hashBlob(bytes);
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'source',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'fixture', embedded: '' },
    },
  ];
  const lease = await repository.acquireWriter(project.id, 'editor');
  const save = async (expectedRevision: number | null) =>
    repository.commit(await repository.importStaged(project, new Map([[hash, bytes]])), {
      expectedRevision,
      lease,
    });
  await save(null);
  return { factory, repository, project, bytes, hash, lease, save };
}
it('shows dated paged recovery candidates separately from the latest normal snapshot', async () => {
  let time = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => ++time);
  const { repository, project, save } = await setup();
  for (let revision = 1; revision <= 12; revision++) {
    project.revision = revision;
    project.name = `Revision ${revision}`;
    await save(revision - 1);
  }
  const first = await repository.recoveryPage(project.id),
    second = await repository.recoveryPage(project.id, 10);
  expect(first.total).toBe(13);
  expect(first.entries.map((entry) => entry.revision)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  expect(first.entries[0]).toMatchObject({
    kind: 'latest',
    available: true,
    difference: { contentChanged: false, renamed: false },
  });
  expect(first.entries[1]).toMatchObject({
    kind: 'recovery',
    available: true,
    difference: { contentChanged: true, renamed: true, counts: { nodes: 0 } },
  });
  expect(first.entries[0].savedAt).toBeGreaterThan(first.entries[1].savedAt!);
  expect(second.entries.map((entry) => entry.revision)).toEqual([2, 1, 0]);
  for (const [offset, limit] of [
    [-1, 10],
    [0, 11],
    [0, 0],
  ])
    await expect(repository.recoveryPage(project.id, offset, limit)).rejects.toThrow();
});
it('old timestamp-less snapshots are unknown and a missing candidate does not hide other retained versions', async () => {
  const { factory, repository, project, save } = await setup();
  const original = (await repository.libraryEntries())[0];
  project.revision++;
  await save(0);
  const db = await openStorageDatabase({ indexedDB: factory });
  await inTransaction(db, ['roots', 'snapshots'], 'readwrite', async (tx) => {
    const root = await requestResult(tx.objectStore('roots').get(project.id));
    delete root.savedAt;
    await requestResult(tx.objectStore('roots').put(root));
    const latest = await requestResult(tx.objectStore('snapshots').get(root.snapshotId));
    delete latest.savedAt;
    await requestResult(tx.objectStore('snapshots').put(latest));
    await requestResult(tx.objectStore('snapshots').delete(original.snapshotId));
  });
  db.close();
  const page = await repository.recoveryPage(project.id);
  expect(page.entries[0]).toMatchObject({ available: true, savedAt: null });
  expect(page.entries[1]).toMatchObject({ available: false, revision: null });
  expect((await repository.libraryEntries())[0].savedAt).toBeNull();
});
it('rejects trashing an active editor; closed-project trash/restore retains snapshots and source bytes', async () => {
  const { repository, project, lease, bytes, hash } = await setup();
  const entry = (await repository.libraryEntries())[0];
  await expect(repository.changeLibraryTrash(entry, true)).rejects.toThrow();
  expect(await repository.listProjects()).toHaveLength(1);
  await repository.releaseWriter(lease);
  await repository.changeLibraryTrash(entry, true);
  const trashed = (await repository.libraryEntries())[0];
  expect(trashed.trashed).toBe(true);
  expect(trashed.trashedAt).not.toBeNull();
  expect(await repository.listProjects()).toEqual([]);
  await expect(repository.readSnapshot(project.id)).rejects.toThrow();
  const backup = await repository.captureBackupSnapshot(project.id, { includeTrashed: true });
  expect(backup.blobs.get(hash)).toEqual(bytes);
  expect(backup.project).toEqual(project);
  const garbage = await repository.markGarbage();
  expect(garbage.blobIds).not.toContain(hash);
  expect(garbage.snapshotIds).not.toContain(entry.snapshotId);
  await repository.changeLibraryTrash(trashed, false);
  const restored = (await repository.libraryEntries())[0];
  expect(restored.trashed).toBe(false);
  expect(restored.trashedAt).toBeNull();
  expect(restored.snapshotId).toBe(entry.snapshotId);
  expect((await repository.captureBackupSnapshot(project.id)).blobs.get(hash)).toEqual(bytes);
});
it('rejects stale revision or changed trash state atomically and exposes metadata under write quota', async () => {
  const { repository, project, lease, save } = await setup();
  const stale = (await repository.libraryEntries())[0];
  project.revision++;
  await save(0);
  await repository.releaseWriter(lease);
  await expect(repository.changeLibraryTrash(stale, true)).rejects.toThrow();
  const entry = (await repository.libraryEntries())[0];
  const transaction = FakeDatabase.prototype.transaction;
  vi.spyOn(FakeDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<typeof transaction>
  ) {
    if (args[1] === 'readwrite') throw new DOMException('quota fixture', 'QuotaExceededError');
    return transaction.apply(this, args);
  });
  await expect(repository.changeLibraryTrash(entry, true)).rejects.toThrow();
  expect(await repository.libraryEntries()).toEqual([entry]);
  expect((await repository.recoveryPage(project.id)).entries[0].revision).toBe(1);
  vi.restoreAllMocks();
  await repository.changeLibraryTrash(entry, true);
  await expect(repository.changeLibraryTrash(entry, true)).rejects.toThrow();
  expect((await repository.libraryEntries())[0].trashed).toBe(true);
});
