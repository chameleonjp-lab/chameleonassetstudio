import { createClip, addKey, editKey } from '../../core3d/animation/authoring';
import { addRigJoint, bindSkin } from '../../core3d/rig/authoring';
import { identityTransform } from '../../core3d/model/project';
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
import { ProjectHistory } from '../../core3d/commands/history';
import type { NativeTransformEvaluator } from '../../core3d/ports/editPort';
import type { Vec3 } from '../../core3d/model/project';
import { setNodeTransform, updateMaterial } from '../../core3d/commands/objectEditing';
import { addPrimitive } from '../../core3d/commands/primitives';
import {
  assignBaseColorTexture,
  applyDerivedBaseColorTexture,
  removeBaseColorTexture,
} from '../../core3d/commands/textureEditing';
import { estimateCanonicalBytes } from '../../core3d/profile/resourceEstimates';
import * as resourceEstimates from '../../core3d/profile/resourceEstimates';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  reserveResourceBytes,
  resourceLedgerSnapshot,
} from '../../core3d/profile/resourceLedger';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import {
  nativeTextureReservedBytes,
  reserveNativeTextureBytes,
} from '../../core3d/model/textureResources';

let repository: ProjectRepository;
beforeEach(async () => {
  repository = await openProjectRepository({ indexedDB: new IDBFactory() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  repository.close();
  expect(nativeTextureReservedBytes()).toBe(0);
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

/** Header-only native PNG metadata; these tests never allocate the declared pixels or decode. */
function textureBytes(width = 2, height = 1, variant = 0): Uint8Array {
  const bytes = new Uint8Array(58),
    view = new DataView(bytes.buffer),
    encode = new TextEncoder();
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(8, 13);
  bytes.set(encode.encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  view.setUint32(33, 1);
  bytes.set(encode.encode('IDAT'), 37);
  bytes[41] = variant;
  bytes.set(encode.encode('IEND'), 50);
  return bytes;
}

async function imageFixture() {
  const session = await ProjectSession.create(repository, 'image-author', 'Images');
  session.executeAuthoring((p) =>
    addPrimitive(p, 'shape', {
      kind: 'plane',
      width: 1,
      height: 1,
      depth: 1,
      segments: 1,
    }),
  );
  await session.save();
  const bytes = textureBytes();
  const hash = await hashBlob(bytes);
  const source = {
    id: 'image',
    blobId: hash,
    mimeType: 'image/png',
    rights: { declared: 'CC0 fixture', embedded: '' },
  };
  return { session, bytes, hash, source };
}

describe('session history metadata', () => {
  it('forwards frozen detached counts and estimates through successful, rejected and cleared edits', async () => {
    const session = await ProjectSession.create(repository, 'history-metadata', 'Initial');
    await session.save();
    const initial = session.state.history;
    expect(initial).toEqual({
      undoCount: 0,
      redoCount: 0,
      hasPreview: false,
      serializedCommitBudgetBytes: 32 * 1024 * 1024,
      ownershipEstimateBytes: estimateCanonicalBytes(session.project),
    });
    expect(Object.getPrototypeOf(initial)).toBe(Object.prototype);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Reflect.set(initial, 'undoCount', 42)).toBe(false);
    const forwarding = vi.spyOn(ProjectHistory.prototype, 'metadata', 'get');
    expect(session.state.history).toEqual(initial);
    expect(forwarding).toHaveBeenCalledOnce();
    forwarding.mockRestore();
    session.rename('Edited');
    expect(session.state).toMatchObject({
      revision: 1,
      dirty: true,
      canUndo: true,
      history: { undoCount: 1, redoCount: 0, hasPreview: false },
    });
    expect(initial.undoCount).toBe(0);
    expect(session.state.history).not.toBe(initial);
    expect(session.state.history.ownershipEstimateBytes).toBe(
      resourceLedgerSnapshot().byCategory.history,
    );
    const before = session.state,
      project = session.project;
    expect(() =>
      session.executeAuthoring((p) => {
        p.id = 'invalid-identity';
      }),
    ).toThrow('identity');
    expect(session.state).toEqual(before);
    expect(session.project).toEqual(project);
    session.undo();
    expect(session.state.history).toMatchObject({ undoCount: 0, redoCount: 1 });
    session.redo();
    expect(session.state.history).toEqual(before.history);
    session.undo();
    session.rename('New branch');
    expect(session.state.history).toMatchObject({ undoCount: 1, redoCount: 0 });
    session.clearHistory();
    expect(session.state).toMatchObject({
      revision: 6,
      dirty: true,
      history: { undoCount: 0, redoCount: 0, hasPreview: false },
    });
    expect(session.state.history.ownershipEstimateBytes).toBe(
      estimateCanonicalBytes(session.project),
    );
    expect(session.project.name).toBe('New branch');
    await session.close();
    expect(session.state.history).toMatchObject({
      undoCount: 0,
      redoCount: 0,
      hasPreview: false,
      ownershipEstimateBytes: 0,
    });
  });

  it('reads metadata without cloning, serializing, re-estimating or changing stored content and originals', async () => {
    const project = createProject('metadata-originals', 'Originals'),
      bytes = textureBytes(),
      hash = await hashBlob(bytes);
    project.blobIds = [hash];
    project.sources = [
      {
        id: 'original',
        blobId: hash,
        mimeType: 'image/png',
        rights: { declared: 'CC0 fixture', embedded: '' },
      },
    ];
    await repository.create(project, new Map([[hash, bytes]]), 'metadata-reader');
    const session = await ProjectSession.open(repository, 'metadata-reader', project.id);
    const before = session.state,
      ledger = resourceLedgerSnapshot();
    const clone = vi.spyOn(globalThis, 'structuredClone'),
      serialize = vi.spyOn(JSON, 'stringify'),
      encode = vi.spyOn(TextEncoder.prototype, 'encode'),
      estimate = vi.spyOn(resourceEstimates, 'estimateCanonicalBytes'),
      commit = vi.spyOn(repository, 'commit'),
      stage = vi.spyOn(repository, 'importStaged');
    for (let read = 0; read < 10; read++) expect(session.state).toEqual(before);
    expect(clone).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(estimate).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
    expect(resourceLedgerSnapshot()).toEqual(ledger);
    vi.restoreAllMocks();
    expect(session.project).toEqual(project);
    expect(session.readBlob(hash)).toEqual(bytes);
    expect(session.state).toMatchObject({ dirty: false, revision: 0 });
    const stored = await repository.readSnapshot(project.id);
    expect(stored.project).toEqual(project);
    expect(stored.blobs.get(hash)).toEqual(bytes);
    await stored.release();
    const backup = await importBackup(await session.backup());
    expect(backup.project).toEqual(project);
    expect(backup.blobs.get(hash)).toEqual(bytes);
    expect(backup.project).not.toHaveProperty('history');
    await session.close();
  });
});

describe('native binary authoring sessions', () => {
  it('reserves reopened unassigned original sources before returning a preprocessing context', async () => {
    const project = createProject('retained-original'),
      bytes = textureBytes(),
      hash = await hashBlob(bytes);
    project.blobIds = [hash];
    project.sources = [
      {
        id: 'original',
        blobId: hash,
        mimeType: 'image/png',
        rights: { declared: 'CC0 fixture', embedded: '' },
      },
    ];
    await repository.create(project, new Map([[hash, bytes]]), 'original-reader');
    const session = await ProjectSession.open(repository, 'original-reader', project.id);
    expect(nativeTextureReservedBytes()).toBe(0);
    const release = reserveNativeTextureBytes(
      'other live image owner',
      NATIVE_TEXTURE_PROFILE.maxOperationBytes - bytes.byteLength * 7 + 1,
    );
    const baseline = nativeTextureReservedBytes(),
      before = session.project;
    try {
      expect(() => session.captureBinaryContext()).toThrow('メモリ見積り');
      expect(session.project).toEqual(before);
      expect(nativeTextureReservedBytes()).toBe(baseline);
    } finally {
      release();
    }
    const context = session.captureBinaryContext();
    expect(context).toMatchObject({ id: project.id, revision: project.revision });
    expect(nativeTextureReservedBytes()).toBe(bytes.byteLength * 7);
    await session.close();
    expect(nativeTextureReservedBytes()).toBe(0);
  });

  it('rejects save-pipeline ledger growth before committing and releases temporary reservations', async () => {
    const { session, bytes, hash, source } = await imageFixture(),
      before = session.project;
    // Numeric ledger pressure only; no large arrays, image decode, GPU or browser allocation.
    const release = reserveNativeTextureBytes(
      'other live image owner',
      NATIVE_TEXTURE_PROFILE.maxOperationBytes - bytes.byteLength * 10 + 1,
    );
    const baseline = nativeTextureReservedBytes();
    try {
      await expect(
        session.executeBinaryAuthoring(
          (p) => assignBaseColorTexture(p, 'shape-material', source),
          new Map([[hash, bytes]]),
          session.captureBinaryContext(),
        ),
      ).rejects.toThrow('メモリ見積り');
      expect(session.project).toEqual(before);
      expect(() => session.readBlob(hash)).toThrow();
      expect(nativeTextureReservedBytes()).toBe(baseline);
    } finally {
      release();
      await session.close();
    }
  });

  it('checks the default read bound before copying a restored oversized blob', async () => {
    const project = createProject('large-restored'),
      bytes = textureBytes(),
      hash = await hashBlob(bytes);
    project.blobIds.push(hash);
    await repository.create(project, new Map([[hash, bytes]]), 'restore-reader');
    const readSnapshot = repository.readSnapshot.bind(repository);
    vi.spyOn(repository, 'readSnapshot').mockImplementationOnce(async (...args) => {
      const snapshot = await readSnapshot(...args);
      // A metadata-only stand-in for a source loaded from a 64MiB native backup.
      Object.defineProperty(snapshot.blobs.get(hash)!, 'byteLength', {
        value: NATIVE_TEXTURE_PROFILE.maxFileBytes + 1,
      });
      return snapshot;
    });
    const session = await ProjectSession.open(repository, 'restore-reader', project.id);
    expect(() => session.readBlob(hash)).toThrow('読取上限');
    expect(() => session.readBlob(hash, -1)).toThrow('上限');
    await session.close();
  });

  it('counts unique metadata pixels before committing, including unassigned materials', async () => {
    const { session, source } = await imageFixture();
    const bytes = textureBytes(2048, 2048),
      hash = await hashBlob(bytes);
    await session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', { ...source, blobId: hash }),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    session.executeAuthoring((p) => {
      p.materials.push({ ...p.materials[0], id: 'unassigned' });
    });
    // Same hash on two materials counts once; a distinct second image exceeds 8m pixels.
    await session.executeBinaryAuthoring(() => {}, new Map(), session.captureBinaryContext());
    const other = textureBytes(2048, 2048, 1),
      otherHash = await hashBlob(other),
      before = session.project;
    await expect(
      session.executeBinaryAuthoring(
        (p) =>
          assignBaseColorTexture(p, 'unassigned', {
            ...source,
            id: 'other',
            blobId: otherHash,
          }),
        new Map([[otherHash, other]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('合計pixel');
    expect(session.project).toEqual(before);
    expect(() => session.readBlob(otherHash)).toThrow();
    await session.close();
  });

  it('rejects malformed texture metadata at the binary commit boundary without adding bytes', async () => {
    const { session, source } = await imageFixture();
    const bytes = new Uint8Array([2, 3, 5]),
      hash = await hashBlob(bytes),
      before = session.project;
    await expect(
      session.executeBinaryAuthoring(
        (p) =>
          assignBaseColorTexture(p, 'shape-material', {
            ...source,
            blobId: hash,
          }),
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('3D画像');
    expect(session.project).toEqual(before);
    expect(() => session.readBlob(hash)).toThrow();
    await session.close();
  });

  it('prunes an abandoned redo branch without changing an in-flight saved snapshot', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    await session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', source),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    const original = repository.importStaged.bind(repository);
    let finish!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let snapshotId = '';
    vi.spyOn(repository, 'importStaged').mockImplementationOnce(async (...args) => {
      const stage = await original(...args);
      snapshotId = stage.id;
      entered();
      await gate;
      return stage;
    });
    const saving = session.save();
    await ready;
    session.undo();
    expect(session.readBlob(hash)).toEqual(bytes);
    const highWater = nativeTextureReservedBytes();
    session.rename('New branch');
    expect(session.state.canRedo).toBe(false);
    expect(() => session.readBlob(hash)).toThrow();
    expect(nativeTextureReservedBytes()).toBe(highWater);
    finish();
    await saving;
    const retained = await repository.readSnapshot(session.project.id, { snapshotId });
    expect(retained.project.materials[0].textureBlobId).toBe(hash);
    expect(retained.blobs.get(hash)).toEqual(bytes);
    await retained.release();
    await session.close();
    expect(nativeTextureReservedBytes()).toBe(0);
  });

  it('explicit history cleanup prunes only unreachable bytes and keeps canonical original sources', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const apply = () =>
      session.executeBinaryAuthoring(
        (p) => assignBaseColorTexture(p, 'shape-material', source),
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      );
    await apply();
    session.undo();
    session.clearHistory();
    expect(() => session.readBlob(hash)).toThrow();
    expect(session.state).toMatchObject({ canUndo: false, canRedo: false });
    await apply();
    session.executeAuthoring((p) => removeBaseColorTexture(p, 'shape-material'));
    session.clearHistory();
    expect(session.readBlob(hash)).toEqual(bytes);
    expect(session.project.sources).toEqual([source]);
    await session.close();
  });

  it('keeps binary edits rescuable after a failed save and retains redo bytes through durable GC', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    await session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', source),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    const commit = vi
      .spyOn(repository, 'commit')
      .mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(session.save()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(session.state).toMatchObject({ dirty: true, status: 'error' });
    const held = nativeTextureReservedBytes();
    await expect(session.close()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(nativeTextureReservedBytes()).toBe(held);
    const rescue = await importBackup(await session.backup());
    expect(rescue.blobs.get(hash)).toEqual(bytes);
    expect(rescue.project.materials[0].textureBlobId).toBe(hash);
    commit.mockRestore();
    // Undo before a successful durable commit requires staging the redo-only bytes as well.
    session.undo();
    await session.save();
    const mark = await repository.markGarbage();
    expect(mark.blobIds).not.toContain(hash);
    await repository.collectGarbage(mark);
    session.redo();
    await session.save();
    const stored = await repository.readSnapshot(session.project.id);
    expect(stored.blobs.get(hash)).toEqual(bytes);
    expect(stored.project.materials[0].textureBlobId).toBe(hash);
    await stored.release();
    await session.close();
  });

  it('commits detached immutable bytes once and retains originals and derivatives in an independent backup', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const before = session.state.revision;
    const pending = session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', source),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    bytes[0] = 255;
    await pending;
    expect(session.state.revision).toBe(before + 1);
    expect(session.readBlob(hash)).toEqual(textureBytes());
    const detached = session.readBlob(hash);
    detached[1] = 255;
    expect(session.readBlob(hash)[1]).toBe(80);
    const derived = textureBytes(2, 1, 1),
      derivedHash = await hashBlob(derived);
    await session.executeBinaryAuthoring(
      (p) =>
        applyDerivedBaseColorTexture(p, 'shape-material', source.id, {
          id: 'derived',
          blobId: derivedHash,
          operation: 'test-adjust',
          version: '1',
          settings: '{}',
        }),
      new Map([[derivedHash, derived]]),
      session.captureBinaryContext(),
    );
    const project = session.project;
    session.executeAuthoring((p) => removeBaseColorTexture(p, 'shape-material'));
    session.undo();
    expect(session.project.materials[0].textureBlobId).toBe(derivedHash);
    await session.save();
    const separate = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const restored = await ProjectSession.restore(
        separate,
        'restored-images',
        await session.backup(),
      );
      expect(restored.project.sources).toEqual(project.sources);
      expect(restored.project.meshes).toEqual(project.meshes);
      expect(restored.readBlob(hash)).toEqual(textureBytes());
      expect(restored.readBlob(derivedHash)).toEqual(derived);
      await restored.close();
    } finally {
      separate.close();
    }
    await session.close();
  });

  it('rejects invalid hashes and failed candidate mutations without leaking bytes or creating history', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const before = session.project;
    const operation = vi.fn((p) => assignBaseColorTexture(p, 'shape-material', source));
    await expect(
      session.executeBinaryAuthoring(
        operation,
        new Map([[hash, new Uint8Array([9])]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('hash');
    expect(operation).not.toHaveBeenCalled();
    await expect(
      session.executeBinaryAuthoring(
        (p) => {
          operation(p);
          throw new Error('cancel candidate');
        },
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('cancel candidate');
    await expect(
      session.executeBinaryAuthoring(
        (p) => {
          p.name = 'unreferenced';
        },
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('参照');
    expect(session.project).toEqual(before);
    expect(() => session.readBlob(hash)).toThrow();
    await session.close();
  });

  it('copies Buffer inputs instead of retaining their shared slice view', async () => {
    const { session, hash, source } = await imageFixture();
    const bytes = Buffer.from(textureBytes());
    const pending = session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', source),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    bytes.fill(255);
    await pending;
    expect(session.readBlob(hash)).toEqual(textureBytes());
    await session.close();
  });

  it('keeps superseded hashing reservations until it settles, using tiny byte fixtures', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      await gate;
      return digest(...args);
    });
    // Advertise the upper-bound reservation without allocating that payload.
    Object.defineProperty(bytes, 'byteLength', {
      value: NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes,
    });
    const command = (p: ReturnType<typeof createProject>) =>
      assignBaseColorTexture(p, 'shape-material', source);
    const first = session.executeBinaryAuthoring(
      command,
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    await expect(
      session.executeBinaryAuthoring(
        command,
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('別の画像処理');
    finish();
    await expect(first).rejects.toThrow('変わりました');
    await session.executeBinaryAuthoring(
      command,
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    expect(session.readBlob(hash)).toEqual(textureBytes());
    await session.close();
  });

  it('invalidates preprocessing across same-revision backup, save, and no-op undo boundaries', async () => {
    const session = await ProjectSession.create(repository, 'image-preparation', 'Unchanged');
    await session.save();
    for (const boundary of [() => session.backup(), () => session.save(), () => session.undo()]) {
      const context = session.captureBinaryContext(),
        mutate = vi.fn();
      expect(Object.isFrozen(context)).toBe(true);
      await boundary();
      expect(session.state.revision).toBe(context.revision);
      await expect(session.executeBinaryAuthoring(mutate, new Map(), context)).rejects.toThrow(
        '変わりました',
      );
      expect(mutate).not.toHaveBeenCalled();
    }
    await session.close();
  });

  it('invalidates delayed hashing on backup and editor selection changes without committing', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    for (const boundary of [
      () => session.backup(),
      () => session.edit.setSelection(['shape-node']),
    ]) {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
        await gate;
        return digest(...args);
      });
      const before = session.project;
      const pending = session.executeBinaryAuthoring(
        (p) => assignBaseColorTexture(p, 'shape-material', source),
        new Map([[hash, bytes]]),
        session.captureBinaryContext(),
      );
      await boundary();
      finish();
      await expect(pending).rejects.toThrow('変わりました');
      expect(session.project).toEqual(before);
      expect(() => session.readBlob(hash)).toThrow();
      spy.mockRestore();
    }
    await session.close();
  });

  it('rejects an abort, a newer preparation and a closed session without accepting the supplied bytes', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    const context = session.captureBinaryContext();
    const controller = new AbortController();
    controller.abort();
    const operation = (p: ReturnType<typeof createProject>) =>
      assignBaseColorTexture(p, 'shape-material', source);
    await expect(
      session.executeBinaryAuthoring(operation, new Map([[hash, bytes]]), context, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    session.captureBinaryContext();
    await expect(
      session.executeBinaryAuthoring(operation, new Map([[hash, bytes]]), context),
    ).rejects.toThrow('変わりました');
    const current = session.captureBinaryContext();
    await session.close();
    await expect(
      session.executeBinaryAuthoring(operation, new Map([[hash, bytes]]), current),
    ).rejects.toThrow('読み取り専用');
    expect(() => session.readBlob(hash)).toThrow();
  });

  it('counts aggregate encoded originals and history before making copies, with tiny metadata-only fixtures', async () => {
    const { session, bytes, hash, source } = await imageFixture();
    await session.executeBinaryAuthoring(
      (p) => assignBaseColorTexture(p, 'shape-material', source),
      new Map([[hash, bytes]]),
      session.captureBinaryContext(),
    );
    session.undo(); // The original remains owned by redo/history even though the current model omits it.
    const claimed = new Uint8Array([1]);
    Object.defineProperty(claimed, 'byteLength', {
      value: NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes,
    });
    const digest = vi.spyOn(crypto.subtle, 'digest'),
      before = session.project;
    await expect(
      session.executeBinaryAuthoring(
        () => {},
        new Map([['f'.repeat(64), claimed]]),
        session.captureBinaryContext(),
      ),
    ).rejects.toThrow('容量');
    expect(digest).not.toHaveBeenCalled();
    expect(session.project).toEqual(before);
    expect(session.readBlob(hash)).toEqual(bytes);
    await session.close();
  });
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
    const history = session.state.history;
    preview(session);
    // Native transform overlays are separate from ProjectHistory-owned preview snapshots.
    expect(session.state.history).toEqual(history);
    await vi.advanceTimersByTimeAsync(6000);
    expect(commit).not.toHaveBeenCalled();
    expect(session.state).toMatchObject({ dirty: false, revision: 1, status: 'saved' });
    session.edit.cancel();
    expect(session.state.history).toEqual(history);
    const zero = preview(session, [0, 0, 0]);
    expect(session.edit.commit(zero)).toEqual({ ok: true, changed: false });
    const invalid = preview(session);
    session.edit.preview(invalid, [NaN, 0, 0]);
    expect(session.edit.commit(invalid).ok).toBe(false);
    expect(session.state.history).toEqual(history);
    await vi.advanceTimersByTimeAsync(6000);
    expect(commit).not.toHaveBeenCalled();
    const changed = preview(session, [4, 5, 6]);
    expect(session.edit.commit(changed)).toEqual({ ok: true, changed: true });
    expect(session.state.history).toMatchObject({
      undoCount: history.undoCount + 1,
      redoCount: 0,
      hasPreview: false,
    });
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
      if (operation === 'close') {
        expect(() => session.project).toThrow('closed');
        expect(session.state).toMatchObject({
          readOnly: true,
          dirty: false,
          revision: canonical.revision,
        });
      } else expect(session.project).toEqual(canonical);
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

describe('session rig pose boundaries', () => {
  it('never saves preview transforms and clears pose for save/backup/undo/close', async () => {
    const session = await ProjectSession.create(repository, 'rig-tab', 'Rig');
    session.addBox();
    session.executeAuthoring((p) => {
      addRigJoint(p, 'joint', 'Joint', null, identityTransform());
      bindSkin(
        p,
        'skin',
        p.meshes[0].id,
        ['joint'],
        p.meshes[0].vertices.map((v) => ({ vertexId: v.id, jointIds: ['joint'], values: [1] })),
      );
    });
    const apply = () =>
      session.rigPose.preview(session.rigPose.begin(), [
        { nodeId: 'joint', transform: { ...identityTransform(), translation: [1, 0, 0] } },
      ]);
    expect(apply().ok).toBe(true);
    await session.save();
    expect(session.rigPose.state.active).toBe(false);
    const snapshot = await repository.readSnapshot(session.project.id);
    expect(snapshot.project.nodes.find((n) => n.id === 'joint')!.transform.translation).toEqual([
      0, 0, 0,
    ]);
    await snapshot.release();
    expect(apply().ok).toBe(true);
    const backup = await importBackup(await session.backup());
    expect(session.rigPose.state.active).toBe(false);
    expect(backup.project.nodes.find((n) => n.id === 'joint')!.transform.translation).toEqual([
      0, 0, 0,
    ]);
    expect(apply().ok).toBe(true);
    session.undo();
    expect(session.rigPose.state.active).toBe(false);
    session.redo();
    expect(apply().ok).toBe(true);
    await session.close();
    expect(session.rigPose.state.active).toBe(false);
    expect(() => session.rigPose.begin()).toThrow();
  });
});

describe('native clip persistence and history', () => {
  it('saves rest and editable clips, cancels preview on boundaries, restores and branches history', async () => {
    const session = await ProjectSession.create(repository, 'animation-tab', 'Animation');
    session.addBox();
    const nodeId = session.project.nodes[0].id;
    session.executeAuthoring((p) => {
      createClip(p, 'clip', 'Move');
      addKey(p, 'clip', nodeId, 'translation', 'LINEAR', 0, [0, 0, 0]);
      addKey(p, 'clip', nodeId, 'translation', 'LINEAR', 1, [1, 0, 0]);
    });
    session.animation.select('clip');
    session.animation.seek(0.5);
    const bytes = await session.backup();
    expect(session.animation.state.active).toBe(false);
    const backup = await importBackup(bytes);
    expect(backup.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
    expect(backup.project.clips[0].tracks[0].keys[1].value).toEqual([1, 0, 0]);
    const restored = await ProjectSession.restore(repository, 'restored-animation', bytes);
    restored.executeAuthoring((p) => editKey(p, 'clip', nodeId, 'translation', 1, 1, [2, 0, 0]));
    restored.undo();
    expect(restored.project.clips[0].tracks[0].keys[1].value).toEqual([1, 0, 0]);
    restored.executeAuthoring((p) => editKey(p, 'clip', nodeId, 'translation', 1, 1, [3, 0, 0]));
    restored.redo();
    expect(restored.project.clips[0].tracks[0].keys[1].value).toEqual([3, 0, 0]);
    restored.animation.select('clip');
    restored.animation.play();
    await restored.save();
    expect(restored.animation.state.playing).toBe(false);
    await restored.close();
    await session.close();
  });
});

it('opens and backs up schema-valid unsupported animation sources without compiling a native preview', async () => {
  const source = smallProject();
  source.skins[0].joints[0].inverseBind[3] = 0.1;
  const bytes = await exportBackup(source, new Map());
  const session = await ProjectSession.restore(repository, 'unsupported-animation', bytes);
  expect(session.animation.select('clip').ok).toBe(false);
  const saved = await importBackup(await session.backup());
  expect(saved.project.skins[0].joints[0].inverseBind[3]).toBe(0.1);
  await session.close();
});

it('keeps large GLB source bytes separate from the image budget and releases source reservations', async () => {
  const { assetIoReservedBytes } = await import('../../core3d/profile/assetIoProfile');
  const bytes = new Uint8Array(17 * 1024 * 1024),
    hash = await hashBlob(bytes),
    project = createProject('glb-source');
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'source',
      blobId: hash,
      mimeType: 'model/gltf-binary',
      rights: { declared: '', embedded: '' },
    },
  ];
  await repository.restoreCopy(project, new Map([[hash, bytes]]), 'copy', 'seed');
  const session = await ProjectSession.open(repository, 'reader', 'copy');
  expect(() => session.readBlob(hash)).toThrow('上限');
  expect(session.readBlob(hash, 32 * 1024 * 1024).length).toBe(bytes.length);
  expect(assetIoReservedBytes()).toBe(bytes.length * 2);
  await session.close();
  expect(assetIoReservedBytes()).toBe(0);
});

describe('bounded session history lifetime', () => {
  it('returns history and storage ownership to baseline across 20 real edit/save/open/close cycles', async () => {
    const baseline = resourceLedgerSnapshot();
    for (let cycle = 0; cycle < 20; cycle++) {
      const session = await ProjectSession.create(repository, `cycle-${cycle}`, 'Owned');
      const original = session.project;
      expect(resourceLedgerSnapshot().byCategory.history).toBe(estimateCanonicalBytes(original));
      session.rename('Edited');
      session.undo();
      session.redo();
      session.clearHistory();
      expect(resourceLedgerSnapshot().byCategory.history).toBe(
        estimateCanonicalBytes(session.project),
      );
      await session.save();
      const saved = session.project;
      const revision = session.state.revision;
      session.edit.setBlocked('shell-operation', true);
      const capture = session.edit.beginCapture();
      const notifications: boolean[] = [];
      const unsubscribe = session.edit.subscribe(() => {
        notifications.push(session.edit.state.context.readOnly);
        expect(session.state.revision).toBe(revision);
      });
      await expect(session.close()).resolves.toBe(true);
      expect(resourceLedgerSnapshot()).toEqual(baseline);
      expect(() => session.project).toThrow('closed');
      expect(() => session.edit.getProject()).toThrow('closed');
      expect(session.state).toMatchObject({
        readOnly: true,
        closed: true,
        dirty: false,
        revision,
        canUndo: false,
        canRedo: false,
      });
      expect(() => session.edit.setBlocked('shell-operation', false)).not.toThrow();
      expect(() => capture.release()).not.toThrow();
      expect(session.edit.state.observerError).toBeNull();
      expect(session.edit.state.context.readOnly).toBe(true);
      expect(session.edit.begin().ok).toBe(false);
      expect(notifications).toContain(true);
      unsubscribe();
      await expect(session.close()).resolves.toBe(true);
      const reopened = await ProjectSession.open(repository, `reopen-${cycle}`, saved.id);
      expect(reopened.project).toEqual(saved);
      expect(resourceLedgerSnapshot().byCategory.history).toBe(estimateCanonicalBytes(saved));
      await reopened.close();
      expect(resourceLedgerSnapshot()).toEqual(baseline);
    }
  });

  it('keeps canonical history and tickets after quota failure, then releases only after successful close', async () => {
    const session = await ProjectSession.create(repository, 'quota-history', 'Initial');
    await session.save();
    session.rename('Unsaved rescue');
    const before = session.project;
    const historyBytes = resourceLedgerSnapshot().byCategory.history;
    const fail = vi
      .spyOn(repository, 'commit')
      .mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    await expect(session.close()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(session.project).toEqual(before);
    expect(session.state).toMatchObject({ readOnly: false, dirty: true, canUndo: true });
    expect(resourceLedgerSnapshot().byCategory.history).toBe(historyBytes);
    const failed = resourceLedgerSnapshot();
    await expect(session.close()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(resourceLedgerSnapshot()).toEqual(failed);
    session.undo();
    expect(session.project.name).toBe('Initial');
    session.redo();
    expect(session.project.name).toBe('Unsaved rescue');
    fail.mockRestore();
    await session.close();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('preserves project/undo ownership when admission fails during a real session edit', async () => {
    const session = await ProjectSession.create(repository, 'budget-history', 'Initial');
    session.rename('Undo retained');
    await session.save();
    const before = session.project;
    const history = session.state.history;
    const release = reserveResourceBytes(
      'geometry',
      RESOURCE_ESTIMATE_CAP_BYTES - resourceLedgerSnapshot().totalBytes,
    );
    const full = resourceLedgerSnapshot();
    try {
      expect(() => session.rename('Rejected')).toThrow('cap');
      expect(session.project).toEqual(before);
      expect(session.state).toMatchObject({ dirty: false, canUndo: true });
      expect(session.state.history).toEqual(history);
      expect(resourceLedgerSnapshot()).toEqual(full);
    } finally {
      release();
    }
    session.undo();
    expect(session.project.name).toBe('Initial');
    await session.close();
  });

  it.each(['before-close', 'after-writer-release', 'after-snapshot-release'] as const)(
    'retains owned history when the close guard expires %s',
    async (boundary) => {
      const created = await ProjectSession.create(repository, 'guard-history', 'Original');
      const id = created.project.id;
      await created.close();
      let valid = true;
      if (boundary === 'after-snapshot-release') {
        const read = repository.readSnapshot.bind(repository);
        vi.spyOn(repository, 'readSnapshot').mockImplementationOnce(async (...args) => {
          const snapshot = await read(...args);
          return {
            ...snapshot,
            release: async () => {
              await snapshot.release();
              valid = false;
            },
          };
        });
      }
      const session = await ProjectSession.open(repository, 'guard-history', id);
      session.rename('Keep history');
      await session.save();
      const before = session.project;
      const owned = resourceLedgerSnapshot();
      if (boundary === 'before-close') valid = false;
      if (boundary === 'after-writer-release') {
        const release = repository.releaseWriter.bind(repository);
        vi.spyOn(repository, 'releaseWriter').mockImplementationOnce(async (...args) => {
          await release(...args);
          valid = false;
        });
      }
      const onRelease = vi.fn();
      await expect(session.close(() => valid, onRelease)).resolves.toBe(false);
      expect(onRelease).not.toHaveBeenCalled();
      expect(session.project).toEqual(before);
      expect(session.state.canUndo).toBe(true);
      expect(resourceLedgerSnapshot()).toEqual(owned);
      await session.close();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );

  it('releases acquired writer and snapshot pins when opening cannot admit its history', async () => {
    const project = createProject('open-budget', 'Persisted');
    await repository.create(project, new Map(), 'seed');
    await repository.releaseWriter(await repository.acquireWriter(project.id, 'seed'));
    const released = vi.fn();
    const read = repository.readSnapshot.bind(repository);
    vi.spyOn(repository, 'readSnapshot').mockImplementationOnce(async (...args) => {
      const snapshot = await read(...args);
      return {
        ...snapshot,
        release: async () => {
          await snapshot.release();
          released();
        },
      };
    });
    const writer = vi.spyOn(repository, 'releaseWriter');
    const release = reserveResourceBytes('geometry', RESOURCE_ESTIMATE_CAP_BYTES);
    try {
      await expect(ProjectSession.open(repository, 'open-history', project.id)).rejects.toThrow(
        'cap',
      );
      expect(released).toHaveBeenCalledOnce();
      expect(writer).toHaveBeenCalledOnce();
      expect(resourceLedgerSnapshot().byCategory.history).toBe(0);
    } finally {
      release();
    }
    const session = await ProjectSession.open(repository, 'other-owner', project.id);
    expect(session.state.readOnly).toBe(false);
    await session.close();
  });

  it('releases a new writer when constructor admission rejects before a session is returned', async () => {
    const writer = vi.spyOn(repository, 'releaseWriter');
    const release = reserveResourceBytes('geometry', RESOURCE_ESTIMATE_CAP_BYTES);
    try {
      await expect(ProjectSession.create(repository, 'create-history', 'Rejected')).rejects.toThrow(
        'cap',
      );
      expect(writer).toHaveBeenCalledOnce();
      expect(resourceLedgerSnapshot().byCategory.history).toBe(0);
      expect(await repository.listProjects()).toEqual([]);
    } finally {
      release();
    }
  });

  it('recaptures the latest canonical revision after autosave admission rejects its copy', async () => {
    const session = await ProjectSession.create(repository, 'schedule-budget', 'Initial');
    await session.save();
    const bytes = estimateCanonicalBytes(session.project);
    const release = reserveResourceBytes('geometry', RESOURCE_ESTIMATE_CAP_BYTES - bytes * 3);
    try {
      // The three history snapshots fit exactly during detached edit preparation.
      // Afterwards the pending save also needs history-reference metadata bytes.
      expect(() => session.rename('Changed')).toThrow('cap');
      expect(session.project.name).toBe('Changed');
      expect(session.state).toMatchObject({
        dirty: true,
        revision: 1,
        status: 'error',
        canUndo: true,
      });
      expect(resourceLedgerSnapshot().byCategory.history).toBe(bytes * 2);
      await expect(session.save()).rejects.toThrow('cap');
      expect(session.project.name).toBe('Changed');
    } finally {
      release();
    }
    await session.save();
    expect(session.state).toMatchObject({ dirty: false, revision: 1, persistedRevision: 1 });
    const durable = await repository.readSnapshot(session.project.id);
    expect(durable.project.name).toBe('Changed');
    await durable.release();
    await session.close();
  });

  it('releases admitted history if initial autosave admission rejects construction', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    const bytes = estimateCanonicalBytes(createProject(id, 'Initial'));
    const writer = vi.spyOn(repository, 'releaseWriter');
    const release = reserveResourceBytes('geometry', RESOURCE_ESTIMATE_CAP_BYTES - bytes);
    try {
      await expect(
        ProjectSession.create(repository, 'constructor-budget', 'Initial'),
      ).rejects.toThrow('cap');
      expect(resourceLedgerSnapshot().byCategory.history).toBe(0);
      expect(resourceLedgerSnapshot().byCategory.storage).toBe(0);
      expect(writer).toHaveBeenCalledOnce();
      expect(await repository.listProjects()).toEqual([]);
    } finally {
      release();
    }
  });
});
