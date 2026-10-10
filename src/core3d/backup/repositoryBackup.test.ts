import { IDBDatabase as FakeIDBDatabase, IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi } from 'vitest';
import { smallProject } from '../fixtures/project';
import { ProjectHistory } from '../commands/history';
import { openProjectRepository, hashBlob } from '../storage/repository';
import { SaveQueue } from '../storage/saveQueue';
import { inTransaction, openStorageDatabase, requestResult, STORAGE_STORES } from '../storage/db';
import { importBackup } from './backup';
import { exportStoredBackup, restoreBackupCopy } from './repositoryBackup';

describe('native project persistence and independent rescue', () => {
  it('exports a source-backed saved project when every write transaction is rejected', async () => {
    const factory = new IDBFactory();
    const source = await openProjectRepository({ indexedDB: factory });
    const target = await openProjectRepository({ indexedDB: new IDBFactory() });
    const db = await openStorageDatabase({ indexedDB: factory });
    const project = smallProject();
    const bytes = new Uint8Array([2, 3, 5, 7]);
    const blobId = await hashBlob(bytes);
    project.blobIds = [blobId];
    project.sources = [
      {
        id: 'original',
        blobId,
        mimeType: 'application/octet-stream',
        rights: { declared: 'CC0', embedded: '' },
      },
    ];
    await source.create(project, new Map([[blobId, bytes]]), 'owner');
    const records = () =>
      inTransaction(db, STORAGE_STORES, 'readonly', (transaction) =>
        Promise.all(
          STORAGE_STORES.map((store) => requestResult(transaction.objectStore(store).getAll())),
        ),
      );
    const before = await records();
    const original = FakeIDBDatabase.prototype.transaction;
    const fail = vi.spyOn(FakeIDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      names,
      mode,
      options,
    ) {
      if (mode === 'readwrite') throw new DOMException('No writes available', 'QuotaExceededError');
      return original.call(this, names, mode, options);
    });
    try {
      await expect(source.readSnapshot(project.id)).rejects.toMatchObject({
        name: 'QuotaExceededError',
      });
      const archive = await exportStoredBackup(source, project.id);
      const decoded = await importBackup(archive);
      expect(decoded.project).toEqual(project);
      expect(decoded.blobs.get(blobId)).toEqual(bytes);
      expect(await records()).toEqual(before);
      fail.mockRestore();
      await restoreBackupCopy(target, archive, 'quota-rescue', 'new-owner');
      const restored = await target.captureBackupSnapshot('quota-rescue');
      expect(restored.project.meshes).toEqual(project.meshes);
      expect(restored.project.skins).toEqual(project.skins);
      expect(restored.project.clips).toEqual(project.clips);
      expect(restored.blobs.get(blobId)).toEqual(bytes);
    } finally {
      fail.mockRestore();
      db.close();
      target.close();
      source.close();
    }
  });
  it('creates, edits, saves, backs up, restores into unrelated storage, and edits again', async () => {
    const source = await openProjectRepository({ indexedDB: new IDBFactory() });
    const target = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const project = smallProject();
      const bytes = new Uint8Array([2, 3, 5, 7]);
      const blobId = await hashBlob(bytes);
      project.blobIds = [blobId];
      project.sources = [
        {
          id: 'original',
          blobId,
          mimeType: 'application/octet-stream',
          rights: { declared: 'self-authored CC0', embedded: '' },
        },
      ];
      const blobs = new Map([[blobId, bytes]]);
      await source.create(project, blobs, 'tab-source');
      const lease = await source.acquireWriter(project.id, 'tab-source');
      const history = new ProjectHistory(project, undefined, true);
      history.execute((p) => {
        p.meshes[0].vertices[1].position = [2, 0, 0];
      });
      const queue = new SaveQueue(source, lease, 0);
      const saved = await queue.save(history.project, blobs, history.historyBlobIds);
      history.acknowledgeSaved(project.id, saved.revision);
      expect(history.dirty).toBe(false);
      const archive = await exportStoredBackup(source, project.id);
      source.close();
      await restoreBackupCopy(target, archive, 'restored', 'tab-target');
      const read = await target.readSnapshot('restored');
      expect(read.project.meshes[0].vertices[1].position).toEqual([2, 0, 0]);
      expect(read.project.skins[0].weights[0].values).toEqual([0.25, 0.75]);
      expect(read.project.clips[0].tracks[0].keys).toHaveLength(2);
      expect(read.blobs.get(blobId)).toEqual(bytes);
      const resumed = new ProjectHistory(read.project, undefined, true);
      resumed.execute((p) => {
        p.clips[0].tracks[0].keys[1].value = [0, 3, 0];
      });
      const restoredLease = await target.acquireWriter('restored', 'tab-target');
      await new SaveQueue(target, restoredLease, 0).save(
        resumed.project,
        read.blobs,
        resumed.historyBlobIds,
      );
      await read.release();
      const final = await target.readSnapshot('restored');
      expect(final.project.clips[0].tracks[0].keys[1].value).toEqual([0, 3, 0]);
      await final.release();
      await expect(restoreBackupCopy(target, archive, 'restored', 'another-tab')).rejects.toThrow();
      const after = await target.readSnapshot('restored');
      expect(after.project.revision).toBe(1);
      await after.release();
    } finally {
      source.close();
      target.close();
    }
  });
});
