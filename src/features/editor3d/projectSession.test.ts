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
import { setNodeTransform, updateMaterial } from '../../core3d/commands/objectEditing';

let repository: ProjectRepository;
beforeEach(async () => {
  repository = await openProjectRepository({ indexedDB: new IDBFactory() });
});
afterEach(() => {
  vi.restoreAllMocks();
  repository.close();
});

describe('3D shell project sessions', () => {
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
