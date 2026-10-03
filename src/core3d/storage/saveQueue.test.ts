import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/project';
import { openStorageDatabase, requestResult } from './db';
import {
  hashBlob,
  openProjectRepository,
  type ProjectRepository,
  type WriterLease,
} from './repository';
import { SaveQueue } from './saveQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let factory: IDBFactory;
let repository: ProjectRepository;
let lease: WriterLease;
beforeEach(async () => {
  factory = new IDBFactory();
  repository = await openProjectRepository({ indexedDB: factory });
  await repository.create(createProject('project'), new Map(), 'tab-a');
  lease = await repository.acquireWriter('project', 'tab-a');
});
afterEach(() => {
  vi.restoreAllMocks();
  repository.close();
});

describe('revision-aware 3D save queue', () => {
  it('keeps B dirty when A succeeds late and serializes the subsequent B save', async () => {
    const entered = deferred();
    const reply = deferred();
    const commit = repository.commit.bind(repository);
    const spy = vi.spyOn(repository, 'commit').mockImplementationOnce(async (...args) => {
      const result = await commit(...args);
      entered.resolve();
      await reply.promise;
      return result;
    });
    const queue = new SaveQueue(repository, lease, 0);
    const a = { ...createProject('project'), revision: 1, name: 'A' };
    const savingA = queue.save(a, new Map());
    await entered.promise;
    queue.noteEdited(2);
    const savingB = queue.save({ ...a, revision: 2, name: 'B' }, new Map());
    expect(spy).toHaveBeenCalledTimes(1);
    reply.resolve();
    expect((await savingA).revision).toBe(1);
    expect(queue.persistedRevision).toBe(1);
    expect(queue.dirty).toBe(true);
    expect((await savingB).revision).toBe(2);
    await queue.flush();
    expect(queue.persistedRevision).toBe(2);
    expect(queue.dirty).toBe(false);
    const snapshot = await repository.readSnapshot('project');
    expect(snapshot.project.name).toBe('B');
    await snapshot.release();
  });

  it('captures project, bytes and history at enqueue time before asynchronous work', async () => {
    const queue = new SaveQueue(repository, lease, 0);
    const bytes = new Uint8Array([4, 5, 6]);
    const id = await hashBlob(bytes);
    const project = { ...createProject('project'), revision: 1, name: 'Before', blobIds: [id] };
    const refs = { revision: 1, undoBlobIds: [id], redoBlobIds: [] as string[] };
    const saving = queue.save(project, new Map([[id, bytes]]), refs);
    project.name = 'After';
    bytes.fill(0);
    refs.undoBlobIds.length = 0;
    await saving;
    const snapshot = await repository.readSnapshot('project');
    expect(snapshot.project.name).toBe('Before');
    expect(snapshot.blobs.get(id)).toEqual(new Uint8Array([4, 5, 6]));
    await snapshot.release();
    // Remove the current reference without replacing the captured history reference.
    await queue.save({ ...createProject('project'), revision: 2 }, new Map());
    await repository.pruneRecovery(lease, 0);
    expect((await repository.markGarbage()).blobIds).not.toContain(id);
  });

  it('keeps failure dirty, cleans failed staging and allows a subsequent successful retry', async () => {
    const queue = new SaveQueue(repository, lease, 0);
    const bytes = new Uint8Array([7]);
    const id = await hashBlob(bytes);
    const project = { ...createProject('project'), revision: 1, blobIds: [id] };
    const failed = vi
      .spyOn(repository, 'commit')
      .mockRejectedValueOnce(new DOMException('No space', 'QuotaExceededError'));
    await expect(queue.save(project, new Map([[id, bytes]]))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(queue.persistedRevision).toBe(0);
    expect(queue.dirty).toBe(true);
    expect((await repository.markGarbage()).blobIds).toEqual([id]);
    const db = await openStorageDatabase({ indexedDB: factory });
    expect(await requestResult(db.transaction(['staging']).objectStore('staging').count())).toBe(0);
    db.close();
    failed.mockRestore();
    await queue.save(project, new Map([[id, bytes]]));
    expect(queue.persistedRevision).toBe(1);
    expect(queue.dirty).toBe(false);
  });

  it('accepts repeated manual saves of the durable revision without creating recovery duplicates', async () => {
    const queue = new SaveQueue(repository, lease, 0);
    const first = await queue.save(createProject('project'), new Map());
    const second = await queue.save(createProject('project'), new Map());
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(queue.dirty).toBe(false);
    expect(await repository.recoverySnapshots('project')).toEqual([]);
  });

  it('does not overwrite another queue and keeps the stale queue dirty', async () => {
    const stale = new SaveQueue(repository, lease, 0);
    const current = new SaveQueue(repository, lease, 0);
    await current.save({ ...createProject('project'), revision: 2, name: 'Current' }, new Map());
    await expect(
      stale.save({ ...createProject('project'), revision: 1, name: 'Stale' }, new Map()),
    ).rejects.toMatchObject({ reason: 'revision' });
    expect(stale.persistedRevision).toBe(0);
    expect(stale.dirty).toBe(true);
    const snapshot = await repository.readSnapshot('project');
    expect(snapshot.project.name).toBe('Current');
    await snapshot.release();
  });
});
