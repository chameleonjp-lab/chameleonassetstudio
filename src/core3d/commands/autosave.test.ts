import {
  resourceLedgerSnapshot,
  reserveResourceBytes,
  RESOURCE_ESTIMATE_CAP_BYTES,
} from '../profile/resourceLedger';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createProject } from '../model/project';
import { openProjectRepository } from '../storage/repository';
import { SaveQueue } from '../storage/saveQueue';
import { ProjectAutosave } from './autosave';
afterEach(() => vi.useRealTimers());
describe('project-local autosave', () => {
  it('drains edits scheduled between an active cycle and its finalization', async () => {
    let complete!: () => void;
    const deferred = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let persisted = 0;
    const queue = {
      noteEdited: vi.fn(),
      save: vi.fn(async (project: ReturnType<typeof createProject>) => {
        if (project.revision === 1) await deferred;
        persisted = project.revision;
        return {
          projectId: project.id,
          revision: project.revision,
          snapshotId: 'snapshot',
          validation: { valid: true },
        };
      }),
      get dirty() {
        return persisted !== 2;
      },
      get persistedRevision() {
        return persisted;
      },
    } as unknown as SaveQueue;
    const autosave = new ProjectAutosave(queue);
    const a = createProject('p');
    a.revision = 1;
    const b = createProject('p');
    b.revision = 2;
    autosave.schedule(a, new Map());
    const flushA = autosave.flush();
    await Promise.resolve();
    let flushB: Promise<void> | undefined;
    deferred.then(() =>
      queueMicrotask(() => {
        autosave.schedule(b, new Map());
        flushB = autosave.flush();
      }),
    );
    complete();
    await flushA;
    await flushB;
    expect(queue.save).toHaveBeenCalledTimes(2);
    expect(autosave.state.persistedRevision).toBe(2);
    expect(autosave.state.status).toBe('saved');
  });
  it('coalesces repeated editing but saves within maximum wait', async () => {
    const repo = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const p = createProject('p');
      await repo.create(p, new Map(), 'tab');
      const lease = await repo.acquireWriter('p', 'tab');
      const autosave = new ProjectAutosave(new SaveQueue(repo, lease, 0), {
        delayMs: 100,
        maxWaitMs: 250,
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      for (let i = 1; i <= 3; i++) {
        p.revision = i;
        p.name = String(i);
        autosave.schedule(p, new Map());
        await vi.advanceTimersByTimeAsync(80);
      }
      expect(autosave.state.dirty).toBe(true);
      await vi.advanceTimersByTimeAsync(10);
      await autosave.flush();
      expect(autosave.state.persistedRevision).toBe(3);
      expect(autosave.state.dirty).toBe(false);
      const read = await repo.readSnapshot('p');
      expect(read.project.name).toBe('3');
      await read.release();
    } finally {
      repo.close();
    }
  });
  it('retains failed data for explicit retry while newer edits may supersede it', async () => {
    const repo = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const p = createProject('p');
      await repo.create(p, new Map(), 'tab');
      const lease = await repo.acquireWriter('p', 'tab');
      const autosave = new ProjectAutosave(new SaveQueue(repo, lease, 0));
      const spy = vi
        .spyOn(repo, 'commit')
        .mockRejectedValueOnce(new Error('temporary save failure'));
      p.revision = 1;
      p.name = 'retained';
      autosave.schedule(p, new Map());
      await expect(autosave.flush()).rejects.toThrow('temporary');
      expect(autosave.state.status).toBe('error');
      expect(autosave.state.dirty).toBe(true);
      await autosave.retry();
      expect(autosave.state.status).toBe('saved');
      expect(autosave.state.persistedRevision).toBe(1);
      spy.mockRestore();
    } finally {
      repo.close();
    }
  });
});

it('retains failed owned copies until exact saved-copy proof or a successful retry', async () => {
  const repo = await openProjectRepository({ indexedDB: new IDBFactory() });
  const baseline = resourceLedgerSnapshot();
  const p = createProject('owned');
  await repo.create(p, new Map(), 'owner');
  const lease = await repo.acquireWriter('owned', 'owner');
  const queue = new SaveQueue(repo, lease, 0),
    autosave = new ProjectAutosave(queue);
  p.revision = 1;
  const fail = vi.spyOn(repo, 'commit').mockRejectedValue(new Error('quota'));
  autosave.schedule(p, new Map());
  const captured = resourceLedgerSnapshot().byCategory.storage;
  expect(captured).toBeGreaterThan(baseline.byCategory.storage);
  await expect(autosave.flush()).rejects.toThrow('quota');
  expect(resourceLedgerSnapshot().byCategory.storage).toBe(captured);
  expect(() => autosave.releaseAfterClose(null)).toThrow('unpreserved');
  expect(() => autosave.releaseAfterClose(0)).toThrow('unpreserved');
  fail.mockRestore();
  await autosave.retry();
  autosave.releaseAfterClose(null);
  expect(resourceLedgerSnapshot()).toEqual(baseline);
  repo.close();
});
it('rejects replacement before cloning, preserves an older pending owner, and flags explicit retry capture', async () => {
  const repo = await openProjectRepository({ indexedDB: new IDBFactory() });
  const baseline = resourceLedgerSnapshot();
  const p = createProject('reschedule');
  await repo.create(p, new Map(), 'owner');
  const lease = await repo.acquireWriter(p.id, 'owner');
  const autosave = new ProjectAutosave(new SaveQueue(repo, lease, 0));
  p.revision = 1;
  autosave.schedule(p, new Map());
  const before = resourceLedgerSnapshot();
  const release = reserveResourceBytes('geometry', RESOURCE_ESTIMATE_CAP_BYTES - before.totalBytes);
  p.revision = 2;
  expect(() => autosave.schedule(p, new Map())).toThrow();
  expect(autosave.state).toMatchObject({ dirty: true, needsReschedule: true });
  expect(resourceLedgerSnapshot().byCategory.storage).toBe(before.byCategory.storage);
  release();
  autosave.schedule(p, new Map());
  expect(autosave.state.needsReschedule).toBe(false);
  await autosave.flush();
  expect(autosave.state.persistedRevision).toBe(2);
  expect(resourceLedgerSnapshot()).toEqual(baseline);
  repo.close();
});
