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
