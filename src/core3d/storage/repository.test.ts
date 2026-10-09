import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, type Project3D } from '../model/project';
import { openStorageDatabase, PROJECT_3D_DB_NAME, requestResult, STORAGE_STORES } from './db';
import {
  hashBlob,
  openProjectRepository,
  type ProjectRepository,
  type WriterLease,
} from './repository';

let factory: IDBFactory;
let repository: ProjectRepository;
let other: ProjectRepository | undefined;
let lease: WriterLease;

beforeEach(async () => {
  factory = new IDBFactory();
  repository = await openProjectRepository({ indexedDB: factory });
  lease = await repository.acquireWriter('project', 'tab-a');
});
afterEach(() => {
  vi.restoreAllMocks();
  repository.close();
  other?.close();
  other = undefined;
});

async function withSource() {
  const bytes = new Uint8Array([10, 20, 30]);
  const id = await hashBlob(bytes);
  const project = createProject('project');
  project.blobIds = [id];
  project.sources = [
    {
      id: 'source',
      blobId: id,
      mimeType: 'application/octet-stream',
      rights: { declared: '', embedded: '' },
    },
  ];
  return { project, bytes, id, blobs: new Map([[id, bytes]]) };
}
async function save(
  project: Project3D,
  expectedRevision: number | null,
  blobs = new Map<string, Uint8Array>(),
) {
  const stage = await repository.importStaged(project, blobs);
  return repository.commit(stage, { expectedRevision, lease });
}
async function readRevision() {
  const read = await repository.readSnapshot('project');
  await read.release();
  return read.revision;
}

describe('isolated 3D project repository', () => {
  it('opens the separate v1 stores and leaves an existing 2D database untouched', async () => {
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('chameleon-asset-studio', 2);
      request.onupgradeneeded = () => request.result.createObjectStore('two-dimensional');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openStorageDatabase({ indexedDB: factory });
    expect(db.name).toBe(PROJECT_3D_DB_NAME);
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual([...STORAGE_STORES].sort());
    expect([...old.objectStoreNames]).toEqual(['two-dimensional']);
    expect(old.version).toBe(2);
    db.close();
    old.close();
  });

  it('captures immutable input and returns a complete, independently mutable snapshot', async () => {
    const data = await withSource();
    const pending = repository.importStaged(data.project, data.blobs);
    data.project.name = 'Later edit';
    data.bytes.fill(99);
    const stage = await pending;
    const committed = await repository.commit(stage, { expectedRevision: null, lease });
    expect(committed).toMatchObject({ revision: 0, validation: { valid: true } });
    const read = await repository.readSnapshot('project');
    expect(read.project.name).toBe('新しい3Dプロジェクト');
    expect(read.blobs.get(data.id)).toEqual(new Uint8Array([10, 20, 30]));
    read.project.name = 'A caller mutation';
    read.blobs.get(data.id)!.fill(1);
    const again = await repository.readSnapshot('project');
    expect(again.project.name).toBe('新しい3Dプロジェクト');
    expect(again.blobs.get(data.id)).toEqual(new Uint8Array([10, 20, 30]));
    await Promise.all([read.release(), again.release()]);
  });

  it('rejects a missing or mismatched blob without publishing a root', async () => {
    const data = await withSource();
    await expect(repository.importStaged(data.project, new Map())).rejects.toThrow(
      'Missing 3D blob',
    );
    await expect(
      repository.importStaged(data.project, new Map([[data.id, new Uint8Array([1])]])),
    ).rejects.toThrow('hash mismatch');
    await expect(repository.readSnapshot('project')).rejects.toThrow('not available');
    expect((await repository.markGarbage()).blobIds).toEqual([]);
  });

  it('requires exact expected durable revision and never lets an old save roll back the root', async () => {
    const project = createProject('project');
    await save(project, null);
    const a = await repository.importStaged({ ...project, revision: 1, name: 'A' }, new Map());
    const b = await repository.importStaged({ ...project, revision: 2, name: 'B' }, new Map());
    await repository.commit(b, { expectedRevision: 0, lease });
    await expect(repository.commit(a, { expectedRevision: 0, lease })).rejects.toMatchObject({
      reason: 'revision',
    });
    await expect(repository.commit(a, { expectedRevision: 2, lease })).rejects.toMatchObject({
      reason: 'revision',
    });
    expect(await readRevision()).toBe(2);
  });

  it('coalesces the same revision only when its canonical content is identical', async () => {
    const project = createProject('project');
    const first = await save(project, null);
    const reordered = Object.fromEntries(Object.entries(project).reverse()) as unknown as Project3D;
    expect(await save(reordered, 0)).toEqual(first);
    expect(await repository.recoverySnapshots('project')).toEqual([]);
    await expect(save({ ...project, name: 'Changed without revision' }, 0)).rejects.toMatchObject({
      reason: 'revision',
    });
    expect(await readRevision()).toBe(0);
  });

  it('arbitrates simultaneous CAS attempts in the database transaction', async () => {
    const project = createProject('project');
    await save(project, null);
    const stages = await Promise.all(
      [1, 2].map((revision) => repository.importStaged({ ...project, revision }, new Map())),
    );
    const results = await Promise.allSettled(
      stages.map((stage) => repository.commit(stage, { expectedRevision: 0, lease })),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((result) => result.status === 'fulfilled');
    expect(await readRevision()).toBe(winner!.value.revision);
  });

  it('requires explicit takeover and fences both old commits and old lease release', async () => {
    await save(createProject('project'), null);
    other = await openProjectRepository({ indexedDB: factory });
    await expect(other.acquireWriter('project', 'tab-b')).rejects.toMatchObject({
      reason: 'writer',
    });
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
    await expect(other.acquireWriter('project', 'tab-b')).rejects.toMatchObject({
      reason: 'writer',
    });
    const newLease = await other.acquireWriter('project', 'tab-b', { takeover: true });
    expect(newLease.token).toBeGreaterThan(lease.token);
    const stage = await repository.importStaged(
      { ...createProject('project'), revision: 1 },
      new Map(),
    );
    await expect(repository.commit(stage, { expectedRevision: 0, lease })).rejects.toMatchObject({
      reason: 'writer',
    });
    await expect(repository.releaseWriter(lease)).rejects.toMatchObject({ reason: 'writer' });
    await other.commit(stage, { expectedRevision: 0, lease: newLease });
    expect(await readRevision()).toBe(1);
  });

  it('increments a released writer token so an old same-owner handle cannot resume writing', async () => {
    await repository.releaseWriter(lease);
    const current = await repository.acquireWriter('project', 'tab-a');
    expect(current.token).toBe(lease.token + 1);
    const stage = await repository.importStaged(createProject('project'), new Map());
    await expect(repository.commit(stage, { expectedRevision: null, lease })).rejects.toMatchObject(
      { reason: 'writer' },
    );
  });

  it('rolls back root, snapshot, staging adoption and history on quota failure, then permits retry', async () => {
    await save(createProject('project'), null);
    const data = await withSource();
    data.project.revision = 1;
    const stage = await repository.importStaged(data.project, data.blobs);
    const original = IDBObjectStore.prototype.put;
    const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      if (this.name === 'roots') throw new DOMException('No space', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(
      repository.commit(stage, {
        expectedRevision: 0,
        lease,
        history: { revision: 1, undoBlobIds: [data.id], redoBlobIds: [] },
      }),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
    fail.mockRestore();
    expect(await readRevision()).toBe(0);
    expect(await repository.recoverySnapshots('project')).toEqual([]);
    await repository.commit(stage, { expectedRevision: 0, lease });
    expect(await readRevision()).toBe(1);
    // If failed history had escaped its transaction, it would retain this byte after pruning.
    await save({ ...createProject('project'), revision: 2 }, 1);
    await repository.pruneRecovery(lease, 0);
    expect((await repository.markGarbage()).blobIds).toContain(data.id);
  });

  it('aborts a transaction after the root write without acknowledging or replacing the prior root', async () => {
    await save(createProject('project'), null);
    const stage = await repository.importStaged(
      { ...createProject('project'), revision: 1 },
      new Map(),
    );
    const controller = new AbortController();
    const original = IDBObjectStore.prototype.put;
    const abort = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      const request = original.call(this, value, key);
      if (this.name === 'roots') controller.abort();
      return request;
    });
    await expect(
      repository.commit(stage, { expectedRevision: 0, lease, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    abort.mockRestore();
    expect(await readRevision()).toBe(0);
    await repository.commit(stage, { expectedRevision: 0, lease });
    expect(await readRevision()).toBe(1);
  });

  it('checks hashes again on read and releases the failed read pin', async () => {
    const data = await withSource();
    await save(data.project, null, data.blobs);
    const db = await openStorageDatabase({ indexedDB: factory });
    const tx = db.transaction(['blobs'], 'readwrite');
    await requestResult(tx.objectStore('blobs').put({ id: data.id, bytes: new Uint8Array([2]) }));
    await expect(repository.readSnapshot('project')).rejects.toThrow('hash mismatch');
    const pins = await requestResult(db.transaction(['pins']).objectStore('pins').getAll());
    expect(pins).toEqual([]);
    db.close();
  });

  it('restores a separate copy and rejects both source ID and existing target ID collisions', async () => {
    const data = await withSource();
    await save(data.project, null, data.blobs);
    const copy = await repository.restoreCopy(data.project, data.blobs, 'rescued', 'tab-a');
    expect(copy).toMatchObject({ projectId: 'rescued', revision: 0 });
    await expect(
      repository.restoreCopy(data.project, data.blobs, 'project', 'tab-a'),
    ).rejects.toMatchObject({ reason: 'exists' });
    await expect(
      repository.restoreCopy(
        { ...data.project, name: 'Replacement' },
        data.blobs,
        'rescued',
        'tab-a',
      ),
    ).rejects.toMatchObject({ reason: 'exists' });
    const restored = await repository.readSnapshot('rescued');
    expect(restored.project.name).toBe(data.project.name);
    expect(restored.blobs.get(data.id)).toEqual(data.bytes);
    await restored.release();
    expect(await readRevision()).toBe(0);
  });

  it('releases failed create staging on both duplicate ID and occupied writer conflicts', async () => {
    await save(createProject('project'), null);
    const data = await withSource();
    await expect(repository.create(data.project, data.blobs, 'tab-a')).rejects.toMatchObject({
      reason: 'exists',
    });
    await expect(repository.create(data.project, data.blobs, 'tab-b')).rejects.toMatchObject({
      reason: 'writer',
    });
    expect((await repository.markGarbage()).blobIds).toEqual([data.id]);
    const db = await openStorageDatabase({ indexedDB: factory });
    expect(await requestResult(db.transaction(['staging']).objectStore('staging').count())).toBe(0);
    db.close();
    expect(data.project.blobIds).toEqual([data.id]);
    expect(data.bytes).toEqual(new Uint8Array([10, 20, 30]));
  });
});

describe('3D reference lifetime and GC', () => {
  it('keeps a previous root available for recovery and keeps trash recoverable', async () => {
    const data = await withSource();
    const original = await save(data.project, null, data.blobs);
    await save({ ...createProject('project'), revision: 1 }, 0);
    expect(await repository.recoverySnapshots('project')).toEqual([original.snapshotId]);
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    const read = await repository.readSnapshot('project', { snapshotId: original.snapshotId });
    expect(read.revision).toBe(0);
    await read.release();
    await repository.setTrashed(lease, 1, true);
    await expect(repository.readSnapshot('project')).rejects.toThrow('not available');
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    const trashed = await repository.readSnapshot('project', { includeTrashed: true });
    await trashed.release();
    await repository.setTrashed(lease, 1, false);
    expect(await readRevision()).toBe(1);
  });

  it('retains Undo-only and Redo-only bytes until both histories release them', async () => {
    const data = await withSource();
    await save(data.project, null, data.blobs);
    const stage = await repository.importStaged(
      { ...createProject('project'), revision: 1 },
      new Map(),
    );
    await repository.commit(stage, {
      expectedRevision: 0,
      lease,
      history: { revision: 1, undoBlobIds: [data.id], redoBlobIds: [] },
    });
    await repository.pruneRecovery(lease, 0);
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    await repository.setHistoryReferences(lease, {
      revision: 2,
      undoBlobIds: [],
      redoBlobIds: [data.id],
    });
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    await repository.setHistoryReferences(lease, { revision: 3, undoBlobIds: [], redoBlobIds: [] });
    const collected = await repository.collectGarbage(await repository.markGarbage());
    expect(collected.deletedBlobIds).toEqual([data.id]);
    expect(await readRevision()).toBe(1);
  });

  it.each(['read', 'backup', 'export'] as const)(
    'holds %s snapshot bytes during later saves and GC',
    async (kind) => {
      const data = await withSource();
      const original = await save(data.project, null, data.blobs);
      const read = await repository.readSnapshot('project', { kind });
      await save({ ...createProject('project'), revision: 1 }, 0);
      await repository.pruneRecovery(lease, 0);
      const protectedMark = await repository.markGarbage();
      expect(protectedMark.blobIds).not.toContain(data.id);
      expect(protectedMark.snapshotIds).not.toContain(original.snapshotId);
      await repository.collectGarbage(protectedMark);
      expect(read.blobs.get(data.id)).toEqual(data.bytes);
      await read.release();
      const collected = await repository.collectGarbage(await repository.markGarbage());
      expect(collected.deletedBlobIds).toEqual([data.id]);
      expect(collected.deletedSnapshotIds).toEqual([original.snapshotId]);
    },
  );

  it('pins staged bytes for unsaved history before the staging owner releases them', async () => {
    const data = await withSource();
    const stage = await repository.importStaged(createProject('project'), data.blobs);
    expect((await repository.markGarbage()).blobIds).toEqual([]);
    const pin = await repository.pinBlobs(lease, [data.id], 'undo');
    await repository.discardStaged(stage);
    expect((await repository.markGarbage()).blobIds).toEqual([]);
    await pin.release();
    expect(
      (await repository.collectGarbage(await repository.markGarbage())).deletedBlobIds,
    ).toEqual([data.id]);
  });

  it('keeps newer unsaved history when an older staged save finally commits', async () => {
    const data = await withSource();
    await save(createProject('project'), null);
    const delayed = await repository.importStaged(
      { ...createProject('project'), revision: 1 },
      new Map(),
    );
    // Unsaved B introduced the source, then C removed it; only Undo retains it.
    const unsaved = await repository.importStaged(createProject('project'), data.blobs);
    await repository.setHistoryReferences(lease, {
      revision: 3,
      undoBlobIds: [data.id],
      redoBlobIds: [],
    });
    await repository.discardStaged(unsaved);
    await repository.commit(delayed, {
      expectedRevision: 0,
      lease,
      history: { revision: 1, undoBlobIds: [], redoBlobIds: [] },
    });
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    await expect(
      repository.setHistoryReferences(lease, { revision: 2, undoBlobIds: [], redoBlobIds: [] }),
    ).rejects.toMatchObject({ reason: 'revision' });
    // A same-revision delayed clear is conservative and cannot remove these references.
    await repository.setHistoryReferences(lease, { revision: 3, undoBlobIds: [], redoBlobIds: [] });
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    await repository.setHistoryReferences(lease, { revision: 4, undoBlobIds: [], redoBlobIds: [] });
    expect(
      (await repository.collectGarbage(await repository.markGarbage())).deletedBlobIds,
    ).toEqual([data.id]);
    expect(await readRevision()).toBe(1);
  });

  it('retains the fenced tab history until that session explicitly releases it', async () => {
    const data = await withSource();
    await save(createProject('project'), null);
    const staged = await repository.importStaged(createProject('project'), data.blobs);
    await repository.setHistoryReferences(lease, {
      revision: 2,
      undoBlobIds: [data.id],
      redoBlobIds: [],
    });
    await repository.discardStaged(staged);
    const replacement = await repository.acquireWriter('project', 'tab-b', { takeover: true });
    const saved = await repository.importStaged(
      { ...createProject('project'), revision: 3 },
      new Map(),
    );
    await repository.commit(saved, {
      expectedRevision: 0,
      lease: replacement,
      history: { revision: 3, undoBlobIds: [], redoBlobIds: [] },
    });
    expect((await repository.markGarbage()).blobIds).not.toContain(data.id);
    await repository.releaseHistoryReferences(lease);
    expect(
      (await repository.collectGarbage(await repository.markGarbage())).deletedBlobIds,
    ).toEqual([data.id]);
  });

  it('compares history revisions within each writer, so a new writer can register its own Undo', async () => {
    const data = await withSource();
    await save(createProject('project'), null);
    const first = await repository.importStaged(createProject('project'), data.blobs);
    await repository.setHistoryReferences(lease, {
      revision: 100,
      undoBlobIds: [data.id],
      redoBlobIds: [],
    });
    await repository.discardStaged(first);
    const replacement = await repository.acquireWriter('project', 'tab-b', { takeover: true });
    const bytes = new Uint8Array([40]);
    const id = await hashBlob(bytes);
    const second = await repository.importStaged(createProject('project'), new Map([[id, bytes]]));
    await repository.setHistoryReferences(replacement, {
      revision: 1,
      undoBlobIds: [id],
      redoBlobIds: [],
    });
    await repository.discardStaged(second);
    expect((await repository.markGarbage()).blobIds).toEqual([]);
    await repository.releaseHistoryReferences(lease);
    const collected = await repository.collectGarbage(await repository.markGarbage());
    expect(collected.deletedBlobIds).toEqual([data.id]);
    expect((await repository.markGarbage()).blobIds).not.toContain(id);
  });

  it('rejects an old GC mark when a concurrent stage re-references its candidate', async () => {
    const data = await withSource();
    const unused = await repository.importStaged(createProject('project'), data.blobs);
    await repository.discardStaged(unused);
    const mark = await repository.markGarbage();
    expect(mark.blobIds).toEqual([data.id]);
    const adopted = await repository.importStaged(data.project, new Map());
    expect(await repository.collectGarbage(mark)).toEqual({
      stale: true,
      deletedBlobIds: [],
      deletedSnapshotIds: [],
    });
    await repository.commit(adopted, { expectedRevision: null, lease });
    const read = await repository.readSnapshot('project');
    expect(read.blobs.get(data.id)).toEqual(data.bytes);
    await read.release();
  });

  it('rechecks references in the delete transaction even when the supplied mark lists a live blob', async () => {
    const data = await withSource();
    const committed = await save(data.project, null, data.blobs);
    const mark = await repository.markGarbage();
    const result = await repository.collectGarbage({
      ...mark,
      blobIds: [data.id],
      snapshotIds: [committed.snapshotId],
    });
    expect(result).toEqual({ stale: false, deletedBlobIds: [], deletedSnapshotIds: [] });
    expect(await readRevision()).toBe(0);
  });
});

it('lists only root metadata and hides recoverable trash by default', async () => {
  const project = createProject('project', 'Saved name');
  await save(project, null);
  const get = vi.spyOn(IDBObjectStore.prototype, 'get');
  expect(await repository.listProjects()).toEqual([
    { id: 'project', name: 'Saved name', revision: 0, trashed: false },
  ]);
  expect(get).not.toHaveBeenCalled();
  get.mockRestore();
  await repository.setTrashed(lease, 0, true);
  expect(await repository.listProjects()).toEqual([]);
  expect(await repository.listProjects({ includeTrashed: true })).toEqual([
    { id: 'project', name: 'Saved name', revision: 0, trashed: true },
  ]);
});

it('refuses write access to both preserved pre-0.3 namespaces', async () => {
  const { LEGACY_PROJECT_3D_DB_NAME, PREVIOUS_PROJECT_3D_DB_NAME, openStorageDatabase } =
    await import('./db');
  for (const name of [LEGACY_PROJECT_3D_DB_NAME, PREVIOUS_PROJECT_3D_DB_NAME])
    await expect(openStorageDatabase({ name })).rejects.toThrow('read-only');
});
