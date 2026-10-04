import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { ProjectHistory } from '../../src/core3d/commands/history';
import { rotationFromDegrees } from '../../src/core3d/commands/objectEditing';
import { composeTransform, transformPoint, worldMatrix } from '../../src/core3d/model/coordinates';
import { smallProject } from '../../src/core3d/fixtures/project';
import { identityTransform, type Project3D, type Vec3 } from '../../src/core3d/model/project';
import { editFixture } from './fixtures';
import {
  evaluateDelta,
  exactTRS,
  selectionFrame,
  snapDelta,
  TransformTransaction,
  type EditContext,
  type EditOptions,
} from './transaction';

function context(options: Partial<EditOptions> = {}, selection = ['box-node']): EditContext {
  return {
    selection,
    activeId: selection[0] ?? null,
    options: { mode: 'translate', space: 'world', snap: null, ...options },
    readOnly: false,
    lockedIds: [],
  };
}

function setup(project = editFixture(), settings = context(), budget?: number) {
  const history = new ProjectHistory(project, budget, true);
  return { history, transaction: new TransformTransaction(history, settings) };
}

function pose(project: Project3D, id = 'box-node') {
  return project.nodes.find((node) => node.id === id)!.transform;
}

function close(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 10));
}

function worldPosition(project: Project3D, id: string) {
  return transformPoint(worldMatrix(project, id), [0, 0, 0]);
}

describe('native transform transaction (Node only)', () => {
  it('commits sub-metre translation at a large origin without a magnitude-scaled no-op threshold', () => {
    const project = editFixture();
    pose(project).translation = [1e9, 0, 0];
    const { history, transaction } = setup(project, context({ snap: 0.5 }));
    const token = transaction.begin();
    expect(transaction.update(token, [0.5, 0, 0])).toEqual({ ok: true });
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    expect(pose(history.project).translation[0]).toBe(1e9 + 0.5);
    expect(history.revision).toBe(1);
  });

  it('preserves small local translations below a large parent world origin', () => {
    const project = editFixture();
    pose(project, 'group-node').translation = [1e16, 0, 0];
    const { history, transaction } = setup(project, context({}, ['right-node']));
    const token = transaction.begin();
    expect(transaction.update(token, [0.01, 0, 0])).toEqual({ ok: true });
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    expect(pose(history.project, 'right-node').translation[0]).toBe(1.26);
  });

  it('rejects a significant delta lost at local coordinate precision', () => {
    const project = editFixture();
    pose(project).translation = [1e16, 0, 0];
    const { history, transaction } = setup(project);
    const token = transaction.begin();
    expect(transaction.update(token, [0.01, 0, 0])).toMatchObject({ ok: false });
    expect(transaction.commit(token)).toMatchObject({ ok: false });
    expect(history.project).toEqual(project);
  });

  it('accepts a small invertible parent whose determinant is below an absolute epsilon', () => {
    const project = editFixture();
    pose(project, 'group-node').scale = [1e-8, 1e-8, 1e-8];
    const { history, transaction } = setup(project, context({}, ['right-node']));
    const token = transaction.begin();
    expect(transaction.update(token, [0.5, 0, 0])).toEqual({ ok: true });
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    expect(pose(history.project, 'right-node').translation[0]).toBe(50000001.25);
  });

  it('treats combined XYZ half-turn identity as a no-op', () => {
    const { history, transaction } = setup(editFixture(), context({ mode: 'rotate' }));
    const before = history.project,
      token = transaction.begin();
    expect(transaction.update(token, [Math.PI, Math.PI, Math.PI])).toEqual({ ok: true });
    expect(transaction.commit(token)).toEqual({ ok: true, changed: false });
    expect(history.project).toEqual(before);
  });

  it('rejects relative shear on tiny objects without an absolute linear tolerance floor', () => {
    const project = editFixture();
    pose(project).scale = [1e-8, 1e-8, 1e-8];
    pose(project).rotation = rotationFromDegrees([0, 0, 45]);
    const { history, transaction } = setup(project, context({ mode: 'scale', space: 'world' }));
    const before = history.project,
      token = transaction.begin();
    expect(transaction.update(token, [2, 1, 1])).toMatchObject({ ok: false });
    expect(transaction.commit(token)).toMatchObject({ ok: false });
    expect(history.project).toEqual(before);
    expect(history.canUndo).toBe(false);
  });

  it('retains zero-delta and complete-turn no-ops without matrix-decomposition noise', () => {
    const project = editFixture();
    pose(project).translation = [1e9, 2e8, -3e8];
    pose(project).scale = [1e-8, 2e-8, 3e-8];
    pose(project).rotation = rotationFromDegrees([23, 37, 51]);
    for (const options of [
      { mode: 'translate', delta: [0, 0, 0] },
      { mode: 'rotate', delta: [Math.PI * 2, 0, 0] },
      { mode: 'scale', delta: [1, 1, 1] },
    ] as const) {
      const { history, transaction } = setup(project, context({ mode: options.mode }));
      const token = transaction.begin();
      expect(transaction.update(token, [...options.delta])).toEqual({ ok: true });
      expect(transaction.commit(token)).toEqual({ ok: true, changed: false });
      expect(history.project).toEqual(project);
    }
  });

  it('keeps repeated previews off canonical data, revision, dirty state and history', () => {
    const { history, transaction } = setup();
    const before = history.project;
    const token = transaction.begin();
    for (const x of [0.1, 0.3, 0.8, 2]) {
      expect(transaction.update(token, [x, 0, 0])).toEqual({ ok: true });
      close(pose(transaction.preview).translation, [-1.25 + x, 0, 0]);
      expect(history.project).toEqual(before);
      expect(history.preview).toEqual(before);
      expect(history.revision).toBe(0);
      expect(history.dirty).toBe(false);
      expect(history.canUndo).toBe(false);
    }
    expect(transaction.commits).toBe(0);
    expect(transaction.active).toBe(true);
  });

  it('commits the last absolute delta once and undoes/redoes it in one history step', () => {
    const { history, transaction } = setup();
    const original = history.project;
    const token = transaction.begin();
    transaction.update(token, [1, 0, 0]);
    transaction.update(token, [3, 2, 1]);
    const preview = transaction.preview;
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    expect(history.project).toEqual({ ...preview, revision: 1 });
    expect(transaction.active).toBe(false);
    expect(transaction.commits).toBe(1);
    expect(history.dirty).toBe(true);
    expect(transaction.commit(token).ok).toBe(false);
    expect(history.revision).toBe(1);
    expect(history.undo()).toBe(true);
    expect(history.project).toEqual({ ...original, revision: 2 });
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.project).toEqual({ ...preview, revision: 3 });
    expect(history.canRedo).toBe(false);
  });

  it.each([
    ['translate', [0, 0, 0]],
    ['rotate', [0, 0, 0]],
    ['scale', [1, 1, 1]],
  ] as const)('does not record an identity %s delta', (mode, input) => {
    const { history, transaction } = setup(editFixture(), context({ mode }));
    const before = history.project;
    const token = transaction.begin();
    expect(transaction.update(token, [...input])).toEqual({ ok: true });
    expect(transaction.commit(token)).toEqual({ ok: true, changed: false });
    expect(history.project).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.dirty).toBe(false);
    expect(transaction.lastReason).toBe('no-op');
  });

  it('treats begin/commit without a sample as a no-op and cancel discards a valid preview', () => {
    const { history, transaction } = setup();
    const before = history.project;
    expect(transaction.commit(transaction.begin())).toEqual({ ok: true, changed: false });
    const token = transaction.begin();
    transaction.update(token, [8, 1, 0]);
    transaction.cancel('Escape');
    expect(transaction.preview).toEqual(before);
    expect(transaction.token).toBeNull();
    expect(transaction.active).toBe(false);
    expect(transaction.commit(token).ok).toBe(false);
    expect(history.project).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.dirty).toBe(false);
  });

  it('rejects a failed final sample rather than committing an earlier valid preview', () => {
    const { history, transaction } = setup();
    const before = history.project;
    const token = transaction.begin();
    expect(transaction.update(token, [2, 0, 0]).ok).toBe(true);
    expect(transaction.update(token, [NaN, 0, 0])).toMatchObject({
      ok: false,
      reason: expect.stringContaining('finite'),
    });
    expect(transaction.preview).toEqual(before);
    expect(transaction.commit(token)).toEqual({
      ok: false,
      reason: 'Latest transform update is invalid',
    });
    expect(transaction.active).toBe(false);
    expect(history.project).toEqual(before);
    expect(history.canUndo).toBe(false);
    expect(history.dirty).toBe(false);
  });

  it('allows a later valid sample to recover an invalid active gesture', () => {
    const { history, transaction } = setup();
    const token = transaction.begin();
    expect(transaction.update(token, [Infinity, 0, 0]).ok).toBe(false);
    expect(transaction.update(token, [1, 0, 0]).ok).toBe(true);
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    close(pose(history.project).translation, [-0.25, 0, 0]);
  });

  it('rejects copied, foreign and superseded tokens without poisoning the live session', () => {
    const { history, transaction } = setup();
    const previous = transaction.begin();
    const token = transaction.begin();
    const foreign = setup().transaction.begin();
    expect(Object.isFrozen(token)).toBe(true);
    transaction.update(token, [2, 0, 0]);
    const preview = transaction.preview;
    for (const invalid of [{ ...token }, previous, foreign]) {
      expect(transaction.update(invalid, [9, 0, 0])).toEqual({
        ok: false,
        reason: 'Stale session token',
      });
      expect(transaction.commit(invalid)).toEqual({ ok: false, reason: 'Stale session token' });
      expect(transaction.token).toBe(token);
      expect(transaction.preview).toEqual(preview);
    }
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    expect(history.project).toEqual({ ...preview, revision: 1 });
  });

  it.each(['update', 'commit'] as const)(
    'rejects %s after canonical revision changes',
    (action) => {
      const { history, transaction } = setup();
      const token = transaction.begin();
      transaction.update(token, [2, 0, 0]);
      history.execute((candidate) => {
        candidate.name = 'Independent edit';
      });
      const changed = history.project;
      const result =
        action === 'update' ? transaction.update(token, [4, 0, 0]) : transaction.commit(token);
      expect(result).toEqual({ ok: false, reason: 'Project revision changed' });
      expect(transaction.active).toBe(false);
      expect(transaction.preview).toEqual(changed);
      expect(history.project).toEqual(changed);
      expect(transaction.commits).toBe(0);
      expect(history.undo()).toBe(true);
      expect(history.canUndo).toBe(false);
    },
  );

  it('invalidates even a visually identical pose restored by Undo', () => {
    const { history, transaction } = setup();
    const token = transaction.begin();
    history.execute((candidate) => {
      candidate.name = 'Temporary edit';
    });
    history.undo();
    expect(transaction.update(token, [2, 0, 0]).ok).toBe(false);
    expect(transaction.active).toBe(false);
    expect(history.revision).toBe(2);
    expect(history.canRedo).toBe(true);
  });

  it('cancels when selection or editability changes and owns a clone of replacement settings', () => {
    const { history, transaction } = setup();
    const token = transaction.begin();
    transaction.update(token, [1, 0, 0]);
    const replacement = context({}, ['right-node']);
    replacement.readOnly = true;
    transaction.setContext(replacement);
    replacement.readOnly = false;
    expect(transaction.commit(token).ok).toBe(false);
    expect(transaction.preview).toEqual(history.project);
    expect(() => transaction.begin()).toThrow('Read-only');
    expect(history.dirty).toBe(false);
  });

  it('captures external options, selection, input and returned snapshots without retaining aliases', () => {
    const settings = context({ snap: 0.5 });
    const { history, transaction } = setup(editFixture(), settings);
    const token = transaction.begin();
    settings.options.mode = 'scale';
    settings.options.snap = 100;
    settings.selection[0] = 'right-node';
    settings.lockedIds.push('box-node');
    const exposed = transaction.settings;
    exposed.options.space = 'local';
    exposed.readOnly = true;
    const frame = transaction.frame;
    frame.position[0] = 100;
    const input: Vec3 = [0.76, 0, 0];
    expect(transaction.update(token, input).ok).toBe(true);
    input[0] = NaN;
    const snapshot = transaction.preview;
    pose(snapshot).translation[0] = 200;
    snapshot.nodes.length = 0;
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
    close(pose(history.project).translation, [-0.25, 0, 0]);
    close(pose(history.project, 'right-node').translation, [1.25, 0, 0]);
    expect(transaction.settings).toEqual(context({ snap: 0.5 }));
  });

  it('rejects a history-budget overflow atomically, retaining saved state and referenced sources', () => {
    const project = editFixture();
    const blobId = 'a'.repeat(64);
    project.blobIds.push(blobId);
    project.sources.push({
      id: 'original-source',
      blobId,
      mimeType: 'application/octet-stream',
      rights: { declared: 'self-authored', embedded: '' },
    });
    const { history, transaction } = setup(project, context(), 1);
    const before = history.project;
    const token = transaction.begin();
    expect(transaction.update(token, [2, 0, 0]).ok).toBe(true);
    expect(transaction.commit(token)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Undo'),
    });
    expect(history.project).toEqual(before);
    expect(history.retainedBlobIds).toEqual([blobId]);
    expect(history.dirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(transaction.preview).toEqual(before);
    expect(transaction.commits).toBe(0);
    expect(transaction.active).toBe(false);
  });

  it('preserves existing Undo and Redo branches when a transform exceeds the history budget', () => {
    const project = editFixture();
    const first = { ...structuredClone(project), name: 'A', revision: 1 };
    const second = { ...structuredClone(project), name: 'B', revision: 2 };
    const budget = new TextEncoder().encode(JSON.stringify([project, first, second])).byteLength;
    const { history, transaction } = setup(project, context(), budget);
    history.execute((candidate) => {
      candidate.name = 'A';
    });
    history.execute((candidate) => {
      candidate.name = 'B';
    });
    expect(history.undo()).toBe(true);
    history.acknowledgeSaved(project.id, history.revision);
    const before = history.project;
    const references = history.historyBlobIds;
    const token = transaction.begin();
    expect(
      transaction.update(token, [12345.6789012345, 12345.6789012345, 12345.6789012345]).ok,
    ).toBe(true);
    expect(transaction.commit(token)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Undo'),
    });
    expect(history.project).toEqual(before);
    expect(history.historyBlobIds).toEqual(references);
    expect(history.dirty).toBe(false);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toBe(true);
    expect(history.project).toEqual({ ...second, revision: 4 });
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.project).toEqual({ ...project, revision: 6 });
    expect(history.canUndo).toBe(false);
  });
});

describe('selection and authoring guards', () => {
  it.each([
    ['selected node', ['box-node'], ['box-node']],
    ['ancestor', ['right-node'], ['group-node']],
    ['affected descendant', ['group-node'], ['right-node']],
  ])('rejects a locked %s before starting a transaction', (_label, selection, lockedIds) => {
    const settings = context({}, selection);
    settings.lockedIds = lockedIds;
    const { history, transaction } = setup(editFixture(), settings);
    expect(() => transaction.begin()).toThrow('locked');
    expect(transaction.active).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.dirty).toBe(false);
  });

  it('allows an unrelated locked branch', () => {
    const settings = context();
    settings.lockedIds = ['right-node'];
    const { transaction } = setup(editFixture(), settings);
    const token = transaction.begin();
    expect(transaction.update(token, [1, 0, 0]).ok).toBe(true);
    expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
  });

  it.each([
    ['empty', [], null],
    ['duplicate', ['box-node', 'box-node'], 'box-node'],
    ['unselected pivot', ['box-node'], 'right-node'],
    ['missing pivot', ['box-node'], null],
    ['missing node', ['gone'], 'gone'],
    ['parent and descendant', ['group-node', 'right-node'], 'group-node'],
  ] as const)('rejects %s selection', (_label, selection, activeId) => {
    const settings = context({}, [...selection]);
    settings.activeId = activeId;
    const { transaction } = setup(editFixture(), settings);
    expect(() => transaction.begin()).toThrow();
    expect(transaction.active).toBe(false);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid snap increment %s', (snap) => {
    const { transaction } = setup(editFixture(), context({ snap }));
    expect(() => transaction.begin()).toThrow('Invalid transform options');
  });

  it('rejects read-only evaluation without a preview', () => {
    const settings = context();
    settings.readOnly = true;
    const { transaction } = setup(editFixture(), settings);
    expect(() => transaction.begin()).toThrow('Read-only');
    expect(transaction.active).toBe(false);
  });

  it.each(['shape', 'joint-a', 'joint-b'])(
    'preserves rig/animation data when static editing %s is unsupported',
    (id) => {
      const project = smallProject();
      const { history, transaction } = setup(project, context({}, [id]));
      expect(() => transaction.begin()).toThrow('未対応');
      expect(history.project).toEqual(project);
      expect(transaction.active).toBe(false);
    },
  );
});

describe('local/world transform mathematics', () => {
  it.each(['world', 'local'] as const)(
    'translates in the %s axes of a rotated active object',
    (space) => {
      const project = editFixture();
      pose(project).rotation = rotationFromDegrees([0, 0, 90]);
      const { history, transaction } = setup(project, context({ space }));
      const token = transaction.begin();
      expect(transaction.update(token, [2, 0, 0]).ok).toBe(true);
      expect(transaction.commit(token).ok).toBe(true);
      close(pose(history.project).translation, space === 'world' ? [0.75, 0, 0] : [-1.25, 2, 0]);
    },
  );

  it.each(['world', 'local'] as const)(
    'rotates around the %s X axis at the active origin',
    (space) => {
      const project = editFixture();
      pose(project).rotation = rotationFromDegrees([0, 0, 90]);
      const { transaction } = setup(project, context({ mode: 'rotate', space }));
      const token = transaction.begin();
      expect(transaction.update(token, [Math.PI / 2, 0, 0]).ok).toBe(true);
      const transform = pose(transaction.preview);
      close(transform.translation, [-1.25, 0, 0]);
      const localX = transformPoint(
        composeTransform({ ...transform, translation: [0, 0, 0] }),
        [1, 0, 0],
      );
      const localY = transformPoint(
        composeTransform({ ...transform, translation: [0, 0, 0] }),
        [0, 1, 0],
      );
      close(localX, space === 'world' ? [0, 0, 1] : [0, 1, 0]);
      close(localY, space === 'world' ? [-1, 0, 0] : [0, 0, 1]);
    },
  );

  it.each(['world', 'local'] as const)(
    'scales the %s X axis while retaining a representable rotated pose',
    (space) => {
      const project = editFixture();
      pose(project).rotation = rotationFromDegrees([0, 0, 90]);
      const { transaction } = setup(project, context({ mode: 'scale', space }));
      const token = transaction.begin();
      expect(transaction.update(token, [2, 1, 1]).ok).toBe(true);
      const transform = pose(transaction.preview);
      close(transform.translation, [-1.25, 0, 0]);
      close(transform.scale, space === 'world' ? [1, 2, 1] : [2, 1, 1]);
      close(
        transformPoint(composeTransform({ ...transform, translation: [0, 0, 0] }), [1, 0, 0]),
        space === 'world' ? [0, 1, 0] : [0, 2, 0],
      );
    },
  );

  it('converts a world translation through a rotated/scaled parent back to native local TRS', () => {
    const project = editFixture();
    pose(project, 'group-node').rotation = rotationFromDegrees([0, 0, 90]);
    pose(project, 'group-node').scale = [2, 2, 2];
    const originalParent = structuredClone(pose(project, 'group-node'));
    const { transaction } = setup(project, context({}, ['right-node']));
    const token = transaction.begin();
    expect(transaction.update(token, [2, 0, 0]).ok).toBe(true);
    close(pose(transaction.preview, 'right-node').translation, [1.25, -1, 0]);
    close(worldPosition(transaction.preview, 'right-node'), [2, 2.5, 0]);
    expect(pose(transaction.preview, 'group-node')).toEqual(originalParent);
  });

  it.each([
    ['translate', [1, 2, 0], [-0.25, 2, 0], [2.25, 2, 0]],
    ['rotate', [0, 0, Math.PI / 2], [-1.25, 0, 0], [-1.25, 2.5, 0]],
    ['scale', [2, 2, 2], [-1.25, 0, 0], [3.75, 0, 0]],
  ] as const)(
    'applies one %s to selection roots around the same active pivot',
    (mode, input, left, right) => {
      const { history, transaction } = setup(
        editFixture(),
        context({ mode }, ['box-node', 'right-node']),
      );
      const before = history.project;
      const token = transaction.begin();
      close(transaction.frame.position, [-1.25, 0, 0]);
      expect(transaction.update(token, [...input]).ok).toBe(true);
      close(worldPosition(transaction.preview, 'box-node'), [...left]);
      close(worldPosition(transaction.preview, 'right-node'), [...right]);
      expect(pose(transaction.preview, 'group-node')).toEqual(identityTransform());
      expect(history.project).toEqual(before);
      expect(transaction.commit(token)).toEqual({ ok: true, changed: true });
      expect(history.revision).toBe(1);
      expect(history.undo()).toBe(true);
      expect(history.project).toEqual({ ...before, revision: 2 });
      expect(history.canUndo).toBe(false);
    },
  );

  it('uses an explicitly chosen active pivot regardless of selection order', () => {
    const project = editFixture();
    const settings = context({ mode: 'rotate' }, ['box-node', 'right-node']);
    settings.activeId = 'right-node';
    const { transaction } = setup(project, settings);
    const token = transaction.begin();
    close(transaction.frame.position, [1.25, 0, 0]);
    expect(transaction.update(token, [0, 0, Math.PI]).ok).toBe(true);
    close(worldPosition(transaction.preview, 'box-node'), [3.75, 0, 0]);
    close(worldPosition(transaction.preview, 'right-node'), [1.25, 0, 0]);
  });

  it.each([
    ['translate', 0.5, [0.74, -0.76, 0.24], [0.5, -1, 0]],
    ['rotate', Math.PI / 4, [0.8, -0.8, 0.1], [Math.PI / 4, -Math.PI / 4, 0]],
    ['scale', 0.25, [1.12, 0.63, 1.38], [1, 0.75, 1.5]],
  ] as const)(
    'snaps shared plain %s deltas from the session origin',
    (mode, snap, input, expected) => {
      const project = editFixture();
      const settings = context({ mode, snap });
      const plainInput: Vec3 = [...input];
      Object.freeze(plainInput);
      close(snapDelta(plainInput, settings.options), [...expected]);
      const { transaction } = setup(project, settings);
      const token = transaction.begin();
      expect(transaction.update(token, plainInput).ok).toBe(true);
      const unsnapped = context({ mode });
      const numeric = evaluateDelta(project, unsnapped, selectionFrame(project, unsnapped), [
        ...expected,
      ]);
      close(composeTransform(pose(transaction.preview)), composeTransform(pose(numeric.candidate)));
      expect(plainInput).toEqual(input);
    },
  );

  it('keeps unsnapped deltas unchanged and rejects malformed components', () => {
    const settings = context().options;
    const input: Vec3 = [0.125, -0.2, 1.75];
    expect(snapDelta(input, settings)).toEqual(input);
    expect(snapDelta(input, settings)).not.toBe(input);
    for (const invalid of [
      [0, 0],
      [0, 0, 0, 0],
      [0, NaN, 0],
      [Infinity, 0, 0],
    ]) {
      expect(() => snapDelta(invalid as Vec3, settings)).toThrow('finite three-component');
    }
  });
});

describe('strict TRS rejection and reflection support', () => {
  it('rejects affine shear even when translation is very large', () => {
    const shear = new Matrix4().makeTranslation(1e12, -1e12, 0);
    shear.elements[4] = 0.01;
    expect(() => exactTRS(shear)).toThrow('shear');
  });

  it('rejects world nonuniform scaling of a 45-degree rotated target without losing its last canonical pose', () => {
    const project = editFixture();
    pose(project).rotation = rotationFromDegrees([0, 0, 45]);
    const { history, transaction } = setup(project, context({ mode: 'scale' }));
    const token = transaction.begin();
    expect(transaction.update(token, [2, 2, 2]).ok).toBe(true);
    expect(transaction.update(token, [2, 1, 1])).toMatchObject({
      ok: false,
      reason: expect.stringContaining('shear'),
    });
    expect(transaction.commit(token).ok).toBe(false);
    expect(history.project).toEqual(project);
    expect(transaction.preview).toEqual(project);
    expect(history.canUndo).toBe(false);
  });

  it('rejects world rotation under a nonuniform parent when the required local transform has shear', () => {
    const project = editFixture();
    pose(project, 'group-node').scale = [2, 1, 1];
    const { history, transaction } = setup(project, context({ mode: 'rotate' }, ['right-node']));
    const token = transaction.begin();
    expect(transaction.update(token, [0, 0, Math.PI / 4])).toMatchObject({
      ok: false,
      reason: expect.stringContaining('shear'),
    });
    expect(transaction.commit(token).ok).toBe(false);
    expect(history.project).toEqual(project);
  });

  it('rejects a sheared local selection frame rather than inventing a rotation', () => {
    const project = editFixture();
    pose(project, 'group-node').scale = [2, 1, 1];
    pose(project, 'right-node').rotation = rotationFromDegrees([0, 0, 45]);
    const { transaction } = setup(project, context({ space: 'local' }, ['right-node']));
    expect(() => transaction.begin()).toThrow('shear');
    expect(transaction.active).toBe(false);
  });

  it('rolls back all selected roots if a later root would require shear', () => {
    const project = editFixture();
    pose(project, 'right-node').rotation = rotationFromDegrees([0, 0, 45]);
    const { history, transaction } = setup(
      project,
      context({ mode: 'scale' }, ['box-node', 'right-node']),
    );
    const token = transaction.begin();
    expect(transaction.update(token, [2, 1, 1]).ok).toBe(false);
    expect(transaction.commit(token).ok).toBe(false);
    expect(transaction.preview).toEqual(project);
    expect(history.project).toEqual(project);
    expect(history.canUndo).toBe(false);
  });

  it('preserves a representable negative scale reflection across commit, Undo and Redo', () => {
    const { history, transaction } = setup(editFixture(), context({ mode: 'scale' }));
    const token = transaction.begin();
    expect(transaction.update(token, [-2, 1, 3]).ok).toBe(true);
    expect(transaction.commit(token).ok).toBe(true);
    close(pose(history.project).scale, [-2, 1, 3]);
    expect(history.undo()).toBe(true);
    close(pose(history.project).scale, [1, 1, 1]);
    expect(history.redo()).toBe(true);
    close(pose(history.project).scale, [-2, 1, 3]);
  });

  it.each([0, 1e-12, -1e-12, Infinity, NaN, 1e40])(
    'rejects unsupported scale %s without a canonical mutation',
    (scale) => {
      const { history, transaction } = setup(editFixture(), context({ mode: 'scale' }));
      const before = history.project;
      const token = transaction.begin();
      expect(transaction.update(token, [scale, 1, 1]).ok).toBe(false);
      expect(transaction.commit(token).ok).toBe(false);
      expect(history.project).toEqual(before);
      expect(history.dirty).toBe(false);
    },
  );

  it('rejects singular/nonfinite matrices and singular parents', () => {
    expect(() => exactTRS(new Matrix4().makeScale(0, 1, 1))).toThrow();
    expect(() => exactTRS(new Matrix4().makeTranslation(NaN, 0, 0))).toThrow('Non-finite');
    const project = editFixture();
    pose(project, 'group-node').scale = [0, 1, 1];
    const settings = context({}, ['right-node']);
    expect(() =>
      evaluateDelta(project, settings, { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, [1, 0, 0]),
    ).toThrow('Singular parent');
    const { history, transaction } = setup(project, settings);
    expect(() => transaction.begin()).toThrow();
    expect(history.project).toEqual(project);
    expect(transaction.active).toBe(false);
  });
});
