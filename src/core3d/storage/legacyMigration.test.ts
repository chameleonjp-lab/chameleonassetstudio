import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { nativeBox } from '../fixtures/nativeBox';
import { type LegacyProject3D } from '../model/project';
import { exportBackup, importBackup } from '../backup/backup';
import { ProjectSession } from '../../features/editor3d/projectSession';
import { hashBlob, hashProject, openProjectRepository } from './repository';
import { copyLegacyProject, listLegacyProjects, readLegacyProject } from './legacyMigration';
import { LEGACY_PROJECT_3D_DB_NAME, PROJECT_3D_DB_NAME, STORAGE_STORES, requestResult } from './db';

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((close) => close());
});
async function seed(factory: IDBFactory) {
  const bytes = new Uint8Array([2, 3, 5, 7]);
  const hash = await hashBlob(bytes);
  const p: LegacyProject3D = { ...nativeBox('old-project'), schemaVersion: '0.1.0', revision: 7 };
  p.blobIds = [hash];
  p.sources = [
    {
      id: 'source',
      blobId: hash,
      mimeType: 'application/octet-stream',
      rights: { declared: 'fixture', embedded: '' },
    },
  ];
  const digest = await hashProject(p);
  const open = factory.open(LEGACY_PROJECT_3D_DB_NAME, 1);
  open.onupgradeneeded = () =>
    STORAGE_STORES.filter((name) => name !== 'legacyBackups').forEach((name) =>
      open.result.createObjectStore(name, { keyPath: 'id' }),
    );
  const db = await requestResult(open);
  cleanups.push(() => db.close());
  const tx = db.transaction(['roots', 'snapshots', 'blobs', 'pins', 'leases'], 'readwrite');
  await requestResult(
    tx.objectStore('roots').add({
      id: p.id,
      name: p.name,
      revision: 7,
      snapshotId: 'old-snapshot',
      recoverySnapshotIds: [],
      trashed: false,
    }),
  );
  await requestResult(
    tx.objectStore('snapshots').add({ id: 'old-snapshot', project: p, contentHash: digest }),
  );
  await requestResult(tx.objectStore('blobs').add({ id: hash, bytes }));
  await requestResult(
    tx
      .objectStore('leases')
      .add({ id: p.id, ownerId: 'old-open-tab', projectId: p.id, token: 12, active: true }),
  );
  await requestResult(
    tx.objectStore('pins').add({
      id: 'old-pin',
      projectId: p.id,
      snapshotIds: ['old-snapshot'],
      blobIds: [hash],
      kind: 'read',
    }),
  );
  return { db, project: p, hash, bytes };
}
async function dump(db: IDBDatabase) {
  const tx = db.transaction([...db.objectStoreNames], 'readonly');
  return Promise.all(
    [...db.objectStoreNames].map(async (name) => [
      name,
      await requestResult(tx.objectStore(name).getAll()),
    ]),
  );
}
async function setup() {
  const indexedDB = new IDBFactory();
  const original = await seed(indexedDB);
  const repository = await openProjectRepository({ indexedDB });
  cleanups.push(() => repository.close());
  const originalContents = await dump(original.db);
  return { indexedDB, repository, original, originalContents };
}
describe('readonly legacy migration and atomic new namespace copy', () => {
  it('does not create an absent legacy database while listing', async () => {
    const indexedDB = new IDBFactory();
    expect(await listLegacyProjects({ indexedDB })).toEqual([]);
    expect(await indexedDB.databases()).toEqual([]);
  });
  it('keeps all original stores unchanged, retains exact legacy values and reopens an independent editable copy', async () => {
    const { indexedDB, repository, original, originalContents } = await setup();
    expect(await listLegacyProjects({ indexedDB })).toEqual([
      { id: original.project.id, name: original.project.name, revision: 7 },
    ]);
    const copied = await copyLegacyProject(repository, original.project.id, 'new-tab', {
      indexedDB,
      newProjectId: 'copy',
    });
    expect(copied.projectId).toBe('copy');
    const snapshot = await repository.readSnapshot('copy');
    expect(snapshot.project).toMatchObject({ schemaVersion: '0.2.0', id: 'copy', revision: 0 });
    expect(snapshot.project.materials[0].alphaMode).toBe('LEGACY_AUTO');
    expect(snapshot.blobs.get(original.hash)).toEqual(original.bytes);
    await snapshot.release();
    expect(await repository.hasLegacyBackup('copy')).toBe(true);
    const archive = (await repository.readLegacyBackup('copy'))!;
    const raw = unzipSync(archive);
    expect(JSON.parse(strFromU8(raw['project.json']))).toEqual(original.project);
    expect(JSON.parse(strFromU8(raw['manifest.json'])).version).toBe('0.1.0');
    expect(raw[`blobs/${original.hash}`]).toEqual(original.bytes);
    const session = await ProjectSession.open(repository, 'new-tab', 'copy');
    session.rename('Edited new copy');
    await session.save();
    await session.close();
    expect(await repository.readLegacyBackup('copy')).toEqual(archive);
    expect(await dump(original.db)).toEqual(originalContents);
    expect((await indexedDB.databases()).map((db) => db.name).sort()).toEqual(
      [LEGACY_PROJECT_3D_DB_NAME, PROJECT_3D_DB_NAME].sort(),
    );
  });
  it.each(['blobs', 'legacyBackups', 'snapshots', 'roots'])(
    'rolls back every destination record on %s quota failure',
    async (store) => {
      const { indexedDB, repository, original, originalContents } = await setup();
      const add = IDBObjectStore.prototype.add;
      vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        if (this.transaction.db.name === PROJECT_3D_DB_NAME && this.name === store)
          throw new DOMException('Full', 'QuotaExceededError');
        return add.apply(this, args);
      });
      await expect(
        copyLegacyProject(repository, original.project.id, 'new-tab', {
          indexedDB,
          newProjectId: 'copy',
        }),
      ).rejects.toThrow('Full');
      expect(await repository.listProjects()).toEqual([]);
      expect(await repository.hasLegacyBackup('copy')).toBe(false);
      const db = await requestResult(indexedDB.open(PROJECT_3D_DB_NAME));
      expect(
        (await dump(db)).every(([, records]) => Array.isArray(records) && records.length === 0),
      ).toBe(true);
      db.close();
      expect(await dump(original.db)).toEqual(originalContents);
    },
  );
  it('aborts during destination writes and can then retry without stale roots, leases or archives', async () => {
    const { indexedDB, repository, original, originalContents } = await setup();
    const controller = new AbortController();
    const add = IDBObjectStore.prototype.add;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = add.apply(this, args);
      if (this.name === 'legacyBackups') controller.abort();
      return request;
    });
    await expect(
      copyLegacyProject(repository, original.project.id, 'new-tab', {
        indexedDB,
        newProjectId: 'copy',
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(await repository.listProjects()).toEqual([]);
    expect(await repository.hasLegacyBackup('copy')).toBe(false);
    spy.mockRestore();
    await copyLegacyProject(repository, original.project.id, 'new-tab', {
      indexedDB,
      newProjectId: 'copy',
    });
    expect(await repository.listProjects()).toHaveLength(1);
    expect(await dump(original.db)).toEqual(originalContents);
  });
  it('rejects early cancellation and identity conflicts without touching either original', async () => {
    const { indexedDB, repository, original, originalContents } = await setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      copyLegacyProject(repository, original.project.id, 'new-tab', {
        indexedDB,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    await copyLegacyProject(repository, original.project.id, 'new-tab', {
      indexedDB,
      newProjectId: 'copy',
    });
    const before = await repository.readLegacyBackup('copy');
    await expect(
      copyLegacyProject(repository, original.project.id, 'other-tab', {
        indexedDB,
        newProjectId: 'copy',
      }),
    ).rejects.toThrow('exists');
    expect(await repository.readLegacyBackup('copy')).toEqual(before);
    expect(await dump(original.db)).toEqual(originalContents);
  });
  it.each(['unknown-field', 'future-version', 'snapshot-hash', 'blob-hash', 'missing-blob'])(
    'rejects %s with no destination copy',
    async (corruption) => {
      const { indexedDB, repository, original } = await setup();
      const p = structuredClone(original.project);
      if (corruption === 'unknown-field') Object.assign(p.nodes[0], { locked: false });
      if (corruption === 'future-version') Object.assign(p, { schemaVersion: '9.0.0' });
      const digest = corruption === 'snapshot-hash' ? '0'.repeat(64) : await hashProject(p);
      const tx = original.db.transaction(['snapshots', 'blobs'], 'readwrite');
      await requestResult(
        tx.objectStore('snapshots').put({ id: 'old-snapshot', project: p, contentHash: digest }),
      );
      if (corruption === 'blob-hash')
        await requestResult(
          tx.objectStore('blobs').put({ id: original.hash, bytes: new Uint8Array([99]) }),
        );
      if (corruption === 'missing-blob')
        await requestResult(tx.objectStore('blobs').delete(original.hash));
      const before = await dump(original.db);
      await expect(copyLegacyProject(repository, p.id, 'new-tab', { indexedDB })).rejects.toThrow();
      expect(await repository.listProjects()).toEqual([]);
      expect(await dump(original.db)).toEqual(before);
    },
  );
  it('retains a legacy uploaded archive exactly and restores current backups without migration', async () => {
    const { repository, original } = await setup();
    const archive = await exportBackup(
      original.project,
      new Map([[original.hash, original.bytes]]),
    );
    const session = await ProjectSession.restore(repository, 'upload-tab', archive);
    expect(await repository.readLegacyBackup(session.project.id)).toEqual(archive);
    const currentArchive = await session.backup();
    const current = await importBackup(currentArchive);
    expect(current.legacyBackup).toBeUndefined();
    expect(current.project.schemaVersion).toBe('0.2.0');
    await session.close();
  });
  it('captures legacy root and bytes without touching a writer lease or pins', async () => {
    const { indexedDB, original, originalContents } = await setup();
    const read = await readLegacyProject(original.project.id, { indexedDB });
    expect(read.project).toEqual(original.project);
    expect(read.blobs.get(original.hash)).toEqual(original.bytes);
    expect(await dump(original.db)).toEqual(originalContents);
  });
});

describe('namespace and last-write protection', () => {
  it('prevents the current writer from opening the legacy namespace', async () => {
    const { indexedDB, original, originalContents } = await setup();
    await expect(
      openProjectRepository({ indexedDB, name: LEGACY_PROJECT_3D_DB_NAME }),
    ).rejects.toThrow('read-only');
    expect(await dump(original.db)).toEqual(originalContents);
  });
  it.each(['leases', 'meta'])(
    'rolls back a complete-looking copy if the final %s write fails',
    async (store) => {
      const { indexedDB, repository, original, originalContents } = await setup();
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        if (this.transaction.db.name === PROJECT_3D_DB_NAME && this.name === store)
          throw new DOMException('Final write quota', 'QuotaExceededError');
        return put.apply(this, args);
      });
      await expect(
        copyLegacyProject(repository, original.project.id, 'new-tab', {
          indexedDB,
          newProjectId: 'copy',
        }),
      ).rejects.toThrow('Final write quota');
      const db = await requestResult(indexedDB.open(PROJECT_3D_DB_NAME));
      expect(
        (await dump(db)).every(([, records]) => Array.isArray(records) && records.length === 0),
      ).toBe(true);
      db.close();
      expect(await dump(original.db)).toEqual(originalContents);
    },
  );
  it('refuses an unsupported legacy database version without upgrading it', async () => {
    const indexedDB = new IDBFactory();
    const original = await seed(indexedDB);
    original.db.close();
    const db = await requestResult(indexedDB.open(LEGACY_PROJECT_3D_DB_NAME, 2));
    const before = await dump(db);
    await expect(listLegacyProjects({ indexedDB })).rejects.toThrow('database version');
    expect(db.version).toBe(2);
    expect(await dump(db)).toEqual(before);
    db.close();
  });
});
