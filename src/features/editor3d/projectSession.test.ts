import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, importBackup } from '../../core3d/backup/backup';
import { smallProject } from '../../core3d/fixtures/project';
import { createProject } from '../../core3d/model/project';
import {
  hashBlob,
  openProjectRepository,
  type ProjectRepository,
} from '../../core3d/storage/repository';
import { ProjectSession, UnsavedProjectError } from './projectSession';
import { addBox } from '../../core3d/commands/box';
import type { NativeTransformEvaluator } from '../../core3d/ports/editPort';
import type { Vec3 } from '../../core3d/model/project';
import { setNodeTransform, updateMaterial } from '../../core3d/commands/objectEditing';

let repository: ProjectRepository;
beforeEach(async () => {
  repository = await openProjectRepository({ indexedDB: new IDBFactory() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  repository.close();
});

describe('3D shell project sessions', () => {
  it('rejects delayed authoring from an older rendered project before invoking the mutation', async () => {
    const session = await ProjectSession.create(repository, 'author', 'Work');
    const rendered = { id: session.project.id, revision: session.state.revision };
    session.executeAuthoring((p) => addBox(p, 'first'), rendered);
    const before = session.project;
    const stale = vi.fn((p) => addBox(p, 'stale'));
    expect(() => session.executeAuthoring(stale, rendered)).toThrow('作品が変わりました');
    expect(stale).not.toHaveBeenCalled();
    expect(session.project).toEqual(before);
    expect(() =>
      session.executeAuthoring(stale, { id: 'other', revision: session.state.revision }),
    ).toThrow();
    await session.save();
    await session.close();
  });
  it('commits authoring atomically, preserves it across backup, and edits an independent restore', async () => {
    const session = await ProjectSession.create(repository, 'author', 'Work');
    session.executeAuthoring((p) => addBox(p, 'shape'));
    session.executeAuthoring((p) => {
      setNodeTransform(p, 'shape-node', {
        translation: [2, 3, 4],
        rotation: [0, 0, 0, 1],
        scale: [1, 2, 1],
      });
      updateMaterial(p, 'shape-material', {
        baseColor: [0.2, 0.3, 0.4, 1],
        metallic: 0.5,
        roughness: 0.6,
      });
    });
    expect(session.state.revision).toBe(2);
    const original = session.project;
    expect(() =>
      session.executeAuthoring((p) => {
        p.name = 'must not commit';
        setNodeTransform(p, 'missing', {
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        });
      }),
    ).toThrow();
    expect(session.project).toEqual(original);
    session.undo();
    expect(session.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
    session.redo();
    await session.save();
    const backup = await session.backup();
    const separate = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const restored = await ProjectSession.restore(separate, 'restored', backup);
      expect(restored.project.meshes).toEqual(original.meshes);
      expect(restored.project.materials).toEqual(original.materials);
      expect(restored.project.nodes).toEqual(original.nodes);
      restored.executeAuthoring((p) =>
        updateMaterial(p, 'shape-material', { baseColor: [1, 0, 0, 1], metallic: 0, roughness: 1 }),
      );
      await restored.save();
      expect(session.project.materials).toEqual(original.materials);
      await restored.close();
    } finally {
      separate.close();
    }
    await session.close();
  });

  it('never accepts an authoring command through a read-only writer conflict', async () => {
    const session = await ProjectSession.create(repository, 'writer', 'Work');
    await session.save();
    const reader = await ProjectSession.open(repository, 'reader', session.project.id);
    const before = reader.project;
    expect(() => reader.executeAuthoring((p) => addBox(p, 'forbidden'))).toThrow('読み取り専用');
    expect(reader.project).toEqual(before);
    await reader.close();
    await session.close();
  });
  it('reads save status without cloning the project graph', async () => {
    const session = await ProjectSession.create(repository, 'tab-a', 'Status');
    await session.save();
    const clone = vi.spyOn(globalThis, 'structuredClone');
    for (let index = 0; index < 10; index++) {
      expect(session.state).toMatchObject({ dirty: false, persistedRevision: 0 });
    }
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    await session.close();
  });

  it('creates, saves, renames and persists Undo/Redo through monotonic revisions', async () => {
    const session = await ProjectSession.create(repository, 'tab-a', 'Original');
    expect(session.state).toMatchObject({ dirty: true, persistedRevision: null });
    await session.save();
    expect(session.state).toMatchObject({ dirty: false, revision: 0, persistedRevision: 0 });
    session.rename('Renamed');
    expect(session.state).toMatchObject({ dirty: true, canUndo: true });
    session.undo();
    expect(session.project).toMatchObject({ name: 'Original', revision: 2 });
    session.redo();
    await session.save();
    expect(session.project).toMatchObject({ name: 'Renamed', revision: 3 });
    const id = session.project.id;
    await session.close();
    const reopened = await ProjectSession.open(repository, 'tab-b', id);
    expect(reopened.state).toMatchObject({ dirty: false, readOnly: false, canUndo: false });
    expect(reopened.project.name).toBe('Renamed');
    await reopened.close();
  });

  it('backs up the current dirty revision and every tiny source byte without saving it', async () => {
    const project = smallProject();
    const bytes = new Uint8Array([2, 7, 11]);
    const hash = await hashBlob(bytes);
    project.blobIds = [hash];
    project.sources = [
      {
        id: 'source',
        blobId: hash,
        mimeType: 'application/octet-stream',
        rights: { declared: 'CC0', embedded: '' },
      },
    ];
    await repository.create(project, new Map([[hash, bytes]]), 'tab-a');
    const session = await ProjectSession.open(repository, 'tab-a', project.id);
    session.rename('Unsaved rescue');
    const archive = await session.backup();
    const restored = await importBackup(archive);
    expect(restored.project).toEqual(session.project);
    expect(restored.blobs.get(hash)).toEqual(bytes);
    expect(restored.project.meshes).toEqual(project.meshes);
    expect(restored.project.skins).toEqual(project.skins);
    expect(restored.project.clips).toEqual(project.clips);
    expect(session.state.dirty).toBe(true);
    const durable = await repository.readSnapshot(project.id);
    expect(durable.project.name).toBe(project.name);
    await durable.release();
    await session.close();
  });

  it('keeps failed saves dirty and retryable, and blocks closing until durable', async () => {
    const session = await ProjectSession.create(repository, 'tab-a', 'Initial');
    await session.save();
    session.rename('Keep this');
    const commit = vi
      .spyOn(repository, 'commit')
      .mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(session.save()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(session.state).toMatchObject({ dirty: true, status: 'error', readOnly: false });
    await expect(session.close()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect((await importBackup(await session.backup())).project.name).toBe('Keep this');
    commit.mockRestore();
    await session.save();
    expect(session.state).toMatchObject({ dirty: false, status: 'saved' });
    await session.close();
  });

  it('retains a newly created project for backup when its very first save fails', async () => {
    const commit = vi
      .spyOn(repository, 'commit')
      .mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    const session = await ProjectSession.create(repository, 'tab-a', 'First save');
    await expect(session.save()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(session.state).toMatchObject({ dirty: true, persistedRevision: null });
    expect((await importBackup(await session.backup())).project.name).toBe('First save');
    expect(await repository.listProjects()).toEqual([]);
    commit.mockRestore();
    await session.close();
  });

  it('opens an active writer as a reader and explicitly takes over latest stored content', async () => {
    const writer = await ProjectSession.create(repository, 'tab-a', 'Old');
    await writer.save();
    const reader = await ProjectSession.open(repository, 'tab-b', writer.project.id);
    expect(reader.state.readOnly).toBe(true);
    expect(() => reader.rename('Blocked')).toThrow('読み取り専用');
    writer.rename('Latest');
    await writer.save();
    const next = await reader.takeOver();
    expect(next.project.name).toBe('Latest');
    expect(next.state.readOnly).toBe(false);
    next.rename('New owner');
    await next.save();
    writer.rename('Fenced unsaved');
    await expect(writer.save()).rejects.toMatchObject({ name: 'StorageConflictError' });
    expect(writer.state).toMatchObject({ readOnly: true, dirty: true });
    await expect(writer.takeOver()).rejects.toBeInstanceOf(UnsavedProjectError);
    await expect(writer.close()).rejects.toBeInstanceOf(UnsavedProjectError);
    const backup = await importBackup(await writer.backup());
    expect(backup.project.name).toBe('Fenced unsaved');
    const copy = await writer.saveCopy();
    expect(copy.project.id).not.toBe(writer.project.id);
    expect(copy.project.name).toBe('Fenced unsaved');
    expect(copy.state.dirty).toBe(false);
    expect(next.project.name).toBe('New owner');
    expect(next.state.dirty).toBe(false);
    const durable = await repository.readSnapshot(next.project.id);
    expect(durable.project.name).toBe('New owner');
    await durable.release();
    await writer.close();
    await reader.close();
    await next.close();
    await copy.close();
  });

  it('restores a native backup to a separate identity and leaves the original untouched', async () => {
    const original = createProject('original', 'Original');
    await repository.create(original, new Map(), 'tab-a');
    const archive = await exportBackup(
      { ...original, name: 'Backup name', revision: 9 },
      new Map(),
    );
    const copy = await ProjectSession.restore(repository, 'tab-b', archive);
    expect(copy.project).toMatchObject({ name: 'Backup name', revision: 0 });
    expect(copy.project.id).not.toBe(original.id);
    const durable = await repository.readSnapshot(original.id);
    expect(durable.project).toEqual(original);
    await durable.release();
    copy.rename('Editable restored copy');
    await copy.close();
  });

  it('rejects invalid native backups without creating or overwriting projects', async () => {
    const session = await ProjectSession.create(repository, 'tab-a', 'Kept');
    await session.save();
    const before = await repository.listProjects();
    await expect(
      ProjectSession.restore(repository, 'tab-b', new Uint8Array([1, 2, 3])),
    ).rejects.toThrow();
    expect(await repository.listProjects()).toEqual(before);
    expect(session.project.name).toBe('Kept');
    await session.close();
  });

  it('does not clear newer edits when an earlier copy finishes saving', async () => {
    const session = await ProjectSession.create(repository, 'tab-a', 'First');
    await session.save();
    session.rename('Copy snapshot');
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const restore = repository.restoreCopy.bind(repository);
    vi.spyOn(repository, 'restoreCopy').mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return restore(...args);
    });
    const copying = session.saveCopy();
    await ready;
    session.rename('Newer edit');
    release();
    const copy = await copying;
    expect(copy.project.name).toBe('Copy snapshot');
    expect(session.project.name).toBe('Newer edit');
    const failure = vi
      .spyOn(repository, 'commit')
      .mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(session.close()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    failure.mockRestore();
    await session.close();
    await copy.close();
  });
});

it('adds an editable native box, saves it and restores it through backup', async () => {
  const session = await ProjectSession.create(repository, 'tab-box', 'Box');
  session.addBox();
  expect(session.project.meshes).toHaveLength(1);
  expect(session.sourcesComplete).toBe(true);
  const backup = await session.backup();
  session.undo();
  expect(session.project.meshes).toHaveLength(0);
  session.redo();
  await session.save();
  const copy = await ProjectSession.restore(repository, 'copy-box', backup);
  expect(copy.project.meshes).toEqual(session.project.meshes);
  expect(copy.project.nodes).toEqual(session.project.nodes);
  await copy.close();
  await session.close();
});

const plainEvaluator: NativeTransformEvaluator = {
  selectionFrame: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }),
  evaluateDelta: (project, context, _frame, delta) => {
    if (!delta.every(Number.isFinite)) throw new Error('Invalid sample');
    return context.selection.map((id) => ({
      id,
      transform: {
        ...structuredClone(project.nodes.find((node) => node.id === id)!.transform),
        translation: [...delta],
      },
    }));
  },
};
async function editableSession() {
  const session = await ProjectSession.create(repository, 'editor', 'Transforms');
  session.executeAuthoring((project) => addBox(project, 'shape'));
  await session.save();
  session.edit.setSelection(['shape-node']);
  session.edit.setEvaluator(plainEvaluator);
  return session;
}
function preview(session: ProjectSession, delta: Vec3 = [2, 0, 0]) {
  const started = session.edit.begin();
  if (!started.ok) throw new Error(started.reason);
  expect(session.edit.preview(started.token, delta)).toEqual({ ok: true });
  return started.token;
}

describe('native transform durable session integration', () => {
  it('reports a committed transform truthfully when a view observer throws during canonical reconciliation', async () => {
    const session = await editableSession();
    const token = preview(session, [6, 0, 0]);
    const broken = vi.fn().mockImplementationOnce(() => {
      throw new Error('view reconcile failed');
    });
    const healthy = vi.fn();
    session.edit.subscribe(broken);
    session.edit.subscribe(healthy);
    const result = session.edit.commit(token);
    expect({
      result,
      revision: session.state.revision,
      status: session.state.status,
      active: session.edit.state.active,
    }).toEqual({
      result: { ok: true, changed: true },
      revision: 2,
      status: 'pending',
      active: false,
    });
    expect(healthy).toHaveBeenCalledTimes(2);
    expect(session.edit.state.lastReason).toBe('committed');
    expect(session.edit.state.observerError).toBe('view reconcile failed');
    await session.save();
    const saved = await repository.readSnapshot(session.project.id);
    expect(saved.project.revision).toBe(2);
    expect(saved.project.nodes[0].transform.translation).toEqual([6, 0, 0]);
    await saved.release();
    await session.close();
  });

  it('accepts a lazily supplied numeric evaluator without constructing a renderer', async () => {
    const session = await ProjectSession.create(repository, 'numeric', 'No WebGL');
    session.executeAuthoring((project) => addBox(project, 'shape'));
    session.edit.setSelection(['shape-node']);
    expect(session.edit.state.evaluatorReady).toBe(false);
    expect(session.edit.begin().ok).toBe(false);
    session.edit.setEvaluator(plainEvaluator);
    const token = preview(session, [1, 2, 3]);
    expect(session.edit.commit(token)).toEqual({ ok: true, changed: true });
    await session.save();
    const id = session.project.id;
    await session.close();
    const restored = await ProjectSession.open(repository, 'reopen', id);
    expect(restored.project.nodes[0].transform.translation).toEqual([1, 2, 3]);
    expect(restored.edit.state).toMatchObject({
      active: false,
      evaluatorReady: false,
      context: { selection: [], activeId: null },
    });
    await restored.close();
  });

  it('never schedules preview, cancel, invalid samples or no-ops, then debounces one real commit', async () => {
    const session = await editableSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const commit = vi.spyOn(repository, 'commit');
    preview(session);
    await vi.advanceTimersByTimeAsync(6000);
    expect(commit).not.toHaveBeenCalled();
    expect(session.state).toMatchObject({ dirty: false, revision: 1, status: 'saved' });
    session.edit.cancel();
    const zero = preview(session, [0, 0, 0]);
    expect(session.edit.commit(zero)).toEqual({ ok: true, changed: false });
    const invalid = preview(session);
    session.edit.preview(invalid, [NaN, 0, 0]);
    expect(session.edit.commit(invalid).ok).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(commit).not.toHaveBeenCalled();
    const changed = preview(session, [4, 5, 6]);
    expect(session.edit.commit(changed)).toEqual({ ok: true, changed: true });
    expect(session.state).toMatchObject({ dirty: true, revision: 2, status: 'pending' });
    await vi.advanceTimersByTimeAsync(799);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(session.state.status).toBe('saved'));
    expect(commit).toHaveBeenCalledOnce();
    expect(session.state).toMatchObject({ dirty: false, persistedRevision: 2 });
    const saved = await repository.readSnapshot(session.project.id);
    expect(saved.project.nodes[0].transform.translation).toEqual([4, 5, 6]);
    await saved.release();
    await session.close();
  });

  it('autosaves the committed snapshot while a newer same-revision preview remains active', async () => {
    const session = await editableSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    session.rename('Committed rename');
    preview(session, [20, 0, 0]);
    await vi.advanceTimersByTimeAsync(800);
    await vi.waitFor(() => expect(session.state.status).toBe('saved'));
    expect(session.edit.state.active).toBe(true);
    const saved = await repository.readSnapshot(session.project.id);
    expect(saved.project.name).toBe('Committed rename');
    expect(saved.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
    expect(session.edit.state.preview!.updates[0].transform.translation).toEqual([20, 0, 0]);
    await saved.release();
    await session.close();
  });

  it.each(['save', 'backup', 'saveCopy', 'close', 'takeOver'] as const)(
    'cancels before explicit %s, retaining only canonical data',
    async (operation) => {
      const session = await editableSession();
      const canonical = session.project;
      const token = preview(session);
      const result = session[operation]();
      expect(session.edit.state).toMatchObject({ active: false, preview: null });
      const returned = await result;
      expect(session.project).toEqual(canonical);
      expect(session.edit.commit(token).ok).toBe(false);
      if (returned instanceof Uint8Array) {
        const backup = await importBackup(returned);
        expect(backup.project.nodes).toEqual(canonical.nodes);
        expect(backup.project).not.toHaveProperty('selection');
        expect(backup.project).not.toHaveProperty('preview');
      }
      if (returned instanceof ProjectSession) {
        expect(returned.project.nodes).toEqual(canonical.nodes);
        expect(returned.edit.state.context.selection).toEqual([]);
        await returned.close();
      }
      await session.close();
    },
  );

  it('cancels before ordinary commands and Undo/Redo, preserving redo on no-op and clearing it on new commit', async () => {
    const session = await editableSession();
    let token = preview(session);
    session.rename('Renamed');
    expect(session.edit.commit(token).ok).toBe(false);
    token = preview(session);
    session.undo();
    expect(session.edit.commit(token).ok).toBe(false);
    expect(session.state.canRedo).toBe(true);
    token = preview(session, [0, 0, 0]);
    expect(session.edit.commit(token)).toEqual({ ok: true, changed: false });
    expect(session.state.canRedo).toBe(true);
    token = preview(session);
    session.redo();
    expect(session.edit.commit(token).ok).toBe(false);
    session.undo();
    token = preview(session, [3, 0, 0]);
    expect(session.edit.commit(token)).toEqual({ ok: true, changed: true });
    expect(session.state.canRedo).toBe(false);
    expect(session.project.nodes[0].transform.translation).toEqual([3, 0, 0]);
    await session.close();
  });

  it('reconciles shared selection immediately when Undo removes a newly created object', async () => {
    const session = await editableSession();
    preview(session);
    session.undo();
    expect(session.edit.state).toMatchObject({
      active: false,
      context: { selection: [], activeId: null },
    });
    session.redo();
    expect(session.edit.state.context.selection).toEqual([]);
    expect(session.project.nodes).toHaveLength(1);
    await session.close();
  });

  it('notifies known fencing immediately, cancels the active preview and preserves dirty rescue for an independent copy', async () => {
    const session = await editableSession();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const other = await repository.acquireWriter(session.project.id, 'other', { takeover: true });
    // Until a durable write checks the lease, this session cannot know ownership changed.
    expect(session.state.readOnly).toBe(false);
    session.rename('Dirty rescue');
    preview(session, [9, 0, 0]);
    const seen: { readOnly: boolean; active: boolean }[] = [];
    const unsubscribe = session.edit.subscribe(() =>
      seen.push({
        readOnly: session.edit.state.context.readOnly,
        active: session.edit.state.active,
      }),
    );
    await vi.advanceTimersByTimeAsync(800);
    await vi.waitFor(() => expect(session.state.status).toBe('error'));
    expect(seen).toContainEqual({ readOnly: true, active: false });
    expect(session.state).toMatchObject({ dirty: true, readOnly: true });
    expect(session.edit.begin().ok).toBe(false);
    const archive = await importBackup(await session.backup());
    expect(archive.project.name).toBe('Dirty rescue');
    expect(archive.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
    const saved = await repository.readSnapshot(session.project.id);
    expect(saved.project.name).toBe('Transforms');
    await saved.release();
    const copy = await session.saveCopy();
    expect(copy.project.name).toBe('Dirty rescue');
    expect(copy.state.dirty).toBe(false);
    unsubscribe();
    await session.close();
    await copy.close();
    await repository.releaseWriter(other);
  });

  it('rejects stale PNG guards on canonical authoring and read-only changes, then allows numeric use after a local renderer cancellation', async () => {
    const session = await editableSession();
    const capture = session.edit.beginCapture();
    expect(session.edit.begin().ok).toBe(false);
    session.rename('Changed during encode');
    expect(capture.isCurrent()).toBe(false);
    capture.release();
    preview(session);
    session.edit.cancel('renderer unavailable');
    const token = preview(session, [8, 0, 0]);
    expect(session.edit.commit(token)).toEqual({ ok: true, changed: true });
    expect(session.project.nodes[0].transform.translation).toEqual([8, 0, 0]);
    const closingCapture = session.edit.beginCapture();
    await session.close();
    expect(closingCapture.isCurrent()).toBe(false);
    closingCapture.release();
    expect(session.edit.state.context.readOnly).toBe(true);
    expect(session.edit.begin().ok).toBe(false);
  });
});
