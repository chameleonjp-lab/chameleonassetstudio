import { describe, expect, it, vi } from 'vitest';
import { addBox } from '../../core3d/commands/box';
import { ProjectHistory } from '../../core3d/commands/history';
import { setNodeTransform } from '../../core3d/commands/objectEditing';
import { createProject, type Vec3 } from '../../core3d/model/project';
import type { NativeEditBinding, NativeTransformEvaluator } from '../../core3d/ports/editPort';
import { TransformTransaction } from './transformTransaction';

function fixture(budget?: number) {
  const project = createProject('work', 'Work');
  addBox(project, 'one');
  addBox(project, 'two');
  const history = new ProjectHistory(project, budget, true);
  let readOnly = false;
  const getProject = vi.fn(() => history.project);
  const commit = vi.fn((updates, expected) => {
    expect(expected).toEqual({ id: 'work', revision: history.revision });
    history.execute((candidate) => {
      for (const { id, transform } of updates) setNodeTransform(candidate, id, transform);
    });
  });
  const edit = new TransformTransaction({
    getProject,
    getIdentity: () => ({ id: 'work', revision: history.revision }),
    isReadOnly: () => readOnly,
    commit,
  });
  // Deterministic plain evaluator fixture: mathematics is tested in the adapter, not copied here.
  const evaluator: NativeTransformEvaluator = {
    selectionFrame: vi.fn<NativeTransformEvaluator['selectionFrame']>(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })),
    evaluateDelta: vi.fn<NativeTransformEvaluator['evaluateDelta']>(
      (source, context, _frame, delta) => {
        if (!delta.every(Number.isFinite)) throw new Error('invalid sample');
        return context.selection.map((id) => ({
          id,
          transform: {
            ...structuredClone(source.nodes.find((node) => node.id === id)!.transform),
            translation: [...delta],
          },
        }));
      },
    ),
  };
  edit.setEvaluator(evaluator);
  edit.setSelection(['one-node']);
  return {
    edit,
    evaluator,
    history,
    commit,
    getProject,
    setReadOnly: (value: boolean) => {
      readOnly = value;
    },
  };
}
function begin(edit: NativeEditBinding) {
  const started = edit.begin();
  if (!started.ok) throw new Error(started.reason);
  return started.token;
}
function move(edit: NativeEditBinding, delta: Vec3 = [2, 3, 4]) {
  const token = begin(edit);
  expect(edit.preview(token, delta)).toEqual({ ok: true });
  return token;
}

describe('native session transform authority', () => {
  it('keeps begin truthful and returns its owned token when a view observer throws', () => {
    const { edit, history } = fixture();
    const broken = vi.fn(() => {
      throw new Error('view begin failed');
    });
    const healthy = vi.fn();
    edit.subscribe(broken);
    edit.subscribe(healthy);
    const started = edit.begin();
    expect({
      result: started.ok,
      active: edit.state.active,
      healthy: healthy.mock.calls.length,
    }).toEqual({ result: true, active: true, healthy: 1 });
    if (!started.ok) throw new Error(started.reason);
    expect(edit.state.token).toBe(started.token);
    expect(edit.state.observerError).toBe('view begin failed');
    expect(edit.state.lastReason).toBe('preview');
    expect(history.revision).toBe(0);
    edit.cancel('test cleanup', started.token);
    expect(edit.state.active).toBe(false);
  });

  it('keeps valid preview truthful and notifies healthy observers after a view observer throws', () => {
    const { edit, history } = fixture();
    const token = begin(edit);
    edit.subscribe(
      vi.fn().mockImplementationOnce(() => {
        throw new Error('view preview failed');
      }),
    );
    const healthy = vi.fn();
    edit.subscribe(healthy);
    const result = edit.preview(token, [2, 0, 0]);
    expect({ result, active: edit.state.active, healthy: healthy.mock.calls.length }).toEqual({
      result: { ok: true },
      active: true,
      healthy: 1,
    });
    expect(edit.state.preview!.updates[0].transform.translation).toEqual([2, 0, 0]);
    expect(edit.state.observerError).toBe('view preview failed');
    expect(edit.state.lastReason).toBe('preview');
    expect(history.revision).toBe(0);
    expect(edit.commit(token)).toEqual({ ok: true, changed: true });
    expect(history.revision).toBe(1);
  });

  it('stores only a bounded string when an Error has a non-string message', () => {
    const { edit } = fixture();
    const error = new Error('original');
    Object.defineProperty(error, 'message', { value: ['x'.repeat(1000)] });
    edit.subscribe(() => {
      throw error;
    });
    const token = begin(edit);
    expect(edit.state.observerError).toBe('x'.repeat(512));
    expect(edit.state.token).toBe(token);
    edit.cancel('cleanup', token);
  });

  it('bounds local observer diagnostics and isolates thrown diagnostic conversion', () => {
    const { edit } = fixture();
    const unsubscribe = edit.subscribe(() => {
      throw new Error('x'.repeat(1000));
    });
    const token = begin(edit);
    expect(edit.state.observerError).toBe('x'.repeat(512));
    unsubscribe();
    edit.subscribe(() => {
      throw {
        toString: () => {
          throw new Error('conversion failed');
        },
      };
    });
    const healthy = vi.fn();
    edit.subscribe(healthy);
    expect(edit.preview(token, [1, 0, 0])).toEqual({ ok: true });
    expect(healthy).toHaveBeenCalledOnce();
    expect(edit.state.observerError).toBe('Edit state observer failed');
    expect(edit.state.lastReason).toBe('preview');
  });

  it('publishes same-revision detached TRS overlays synchronously without cloning canonical data for subscribers', () => {
    const { edit, history, getProject, commit } = fixture();
    const original = history.project;
    const events: number[] = [];
    const unsubscribe = edit.subscribe(() => events.push(edit.state.sequence));
    const token = move(edit);
    expect(events).toHaveLength(2);
    expect(edit.state.preview).toMatchObject({
      projectId: 'work',
      baseRevision: 0,
      generation: token.generation,
      sequence: edit.state.sequence,
    });
    getProject.mockClear();
    const state = edit.state;
    state.preview!.updates[0].transform.translation[0] = 99;
    state.context.selection.length = 0;
    expect(edit.state.preview!.updates[0].transform.translation).toEqual([2, 3, 4]);
    expect(edit.state.context.selection).toEqual(['one-node']);
    expect(getProject).not.toHaveBeenCalled();
    expect(history.project).toEqual(original);
    expect(history.preview).toEqual(original);
    expect(history.dirty).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    unsubscribe();
    edit.cancel();
    expect(events).toHaveLength(2);
  });

  it('snapshots start project/context and makes one canonical commit for all samples and selected nodes', () => {
    const { edit, evaluator, history, commit } = fixture();
    edit.setSelection(['one-node', 'two-node'], 'two-node');
    const token = move(edit, [2, 0, 0]);
    edit.preview(token, [4, 0, 0]);
    const calls = vi.mocked(evaluator.evaluateDelta).mock.calls;
    expect(calls[0][0].nodes[0].transform.translation).toEqual([0, 0, 0]);
    expect(calls[1][0].nodes[0].transform.translation).toEqual([0, 0, 0]);
    expect(calls[1][1].activeId).toBe('two-node');
    expect(edit.commit(token)).toEqual({ ok: true, changed: true });
    expect(commit).toHaveBeenCalledOnce();
    expect(history.revision).toBe(1);
    expect(history.project.nodes.map((node) => node.transform.translation)).toEqual([
      [4, 0, 0],
      [4, 0, 0],
    ]);
    expect(history.canUndo).toBe(true);
    expect(edit.state.preview).toBeNull();
    expect(edit.commit(token).ok).toBe(false);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('invalidates the last good overlay when the latest sample fails, then refuses commit', () => {
    const { edit, history, commit } = fixture();
    const token = move(edit);
    expect(edit.preview(token, [NaN, 0, 0])).toEqual({ ok: false, reason: 'invalid sample' });
    expect(edit.state).toMatchObject({ active: true, preview: null });
    expect(edit.commit(token).ok).toBe(false);
    expect(edit.state.active).toBe(false);
    expect(history.revision).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it('allows an explicitly corrected sample after invalid input', () => {
    const { edit, history } = fixture();
    const token = move(edit);
    edit.preview(token, [NaN, 0, 0]);
    edit.preview(token, [3, 0, 0]);
    expect(edit.commit(token)).toEqual({ ok: true, changed: true });
    expect(history.project.nodes[0].transform.translation).toEqual([3, 0, 0]);
  });

  it('rejects an evaluator update for an unselected node and preserves history', () => {
    const { edit, evaluator, history } = fixture();
    vi.mocked(evaluator.evaluateDelta).mockReturnValue([
      { id: 'two-node', transform: history.project.nodes[1].transform },
    ]);
    const token = begin(edit);
    expect(edit.preview(token, [1, 0, 0]).ok).toBe(false);
    expect(edit.commit(token).ok).toBe(false);
    expect(history.revision).toBe(0);
  });

  it('rechecks native guards on evaluated values before exposing a preview', () => {
    const { edit, evaluator, history } = fixture();
    const transform = history.project.nodes[0].transform;
    transform.scale = [0, 1, 1];
    vi.mocked(evaluator.evaluateDelta).mockReturnValue([{ id: 'one-node', transform }]);
    const token = begin(edit);
    expect(edit.preview(token, [1, 0, 0]).ok).toBe(false);
    expect(edit.state.preview).toBeNull();
    expect(history.revision).toBe(0);
  });

  it.each(['cancel', 'zero', 'click'] as const)(
    'does not consume history or commit for %s',
    (kind) => {
      const { edit, history, commit } = fixture();
      const token = begin(edit);
      if (kind === 'cancel') {
        edit.preview(token, [1, 0, 0]);
        edit.cancel();
      } else {
        if (kind === 'zero') edit.preview(token, [0, 0, 0]);
        expect(edit.commit(token)).toEqual({ ok: true, changed: false });
      }
      expect(history.revision).toBe(0);
      expect(history.canUndo).toBe(false);
      expect(history.dirty).toBe(false);
      expect(commit).not.toHaveBeenCalled();
    },
  );

  it('keeps the newer gesture intact under all late foreign-token callbacks', () => {
    const { edit } = fixture();
    const first = move(edit);
    const second = move(edit, [5, 0, 0]);
    const state = edit.state;
    expect(edit.preview(first, [6, 0, 0]).ok).toBe(false);
    expect(edit.commit(first).ok).toBe(false);
    edit.cancel('late cancel', first);
    expect(edit.state).toEqual(state);
    expect(edit.commit({ ...second }).ok).toBe(false);
    expect(edit.state).toEqual(state);
    expect(edit.commit(second).ok).toBe(true);
  });

  it('clears selection IDs and active pivot removed by a canonical command', () => {
    const { edit, history } = fixture();
    edit.setSelection(['missing', 'one-node', 'one-node', 'two-node'], 'two-node');
    expect(edit.state.context.selection).toEqual(['one-node', 'two-node']);
    move(edit);
    history.execute((project) => {
      project.nodes = project.nodes.filter((node) => node.id !== 'two-node');
    });
    edit.reconcile();
    expect(edit.state).toMatchObject({
      active: false,
      preview: null,
      context: { selection: ['one-node'], activeId: 'one-node' },
    });
  });

  it('refuses captured-revision commits when the authority changes before notification', () => {
    const { edit, history, commit } = fixture();
    const token = move(edit);
    history.execute((project) => {
      project.name = 'Changed';
    });
    expect(edit.commit(token).ok).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(edit.state.active).toBe(false);
    expect(history.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
  });

  it('preserves the history budget and removes failed-commit overlays', () => {
    const { edit, history } = fixture(1);
    const token = move(edit);
    const result = edit.commit(token);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('Undo予算') });
    expect(history.revision).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(edit.state).toMatchObject({ active: false, preview: null });
  });

  it('cancels on context, lifecycle and known read-only changes', () => {
    const { edit, setReadOnly } = fixture();
    move(edit);
    edit.setOptions({ mode: 'rotate', space: 'local', snap: 0.25 });
    expect(edit.state.active).toBe(false);
    move(edit);
    edit.setBlocked('document hidden', true);
    expect(edit.state.active).toBe(false);
    expect(edit.begin().ok).toBe(false);
    edit.setBlocked('document hidden', false);
    move(edit);
    setReadOnly(true);
    edit.reconcile('writer ownership lost');
    expect(edit.state).toMatchObject({ active: false, context: { readOnly: true } });
    expect(edit.begin().ok).toBe(false);
  });

  it('rejects active-preview PNG, blocks new gestures through nested encoding guards and keeps its own epoch', () => {
    const { edit } = fixture();
    move(edit);
    expect(() => edit.beginCapture()).toThrow('変形を確定');
    expect(edit.state.active).toBe(true);
    edit.cancel();
    const epoch = edit.state.epoch;
    const first = edit.beginCapture();
    const second = edit.beginCapture();
    expect(first.epoch).toBe(epoch);
    expect(edit.begin().ok).toBe(false);
    expect(first.isCurrent()).toBe(true);
    expect(second.isCurrent()).toBe(true);
    first.release();
    first.release();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(edit.begin().ok).toBe(false);
    second.release();
    expect(edit.state.epoch).toBe(epoch);
    expect(edit.begin().ok).toBe(true);
  });

  it('invalidates PNG after same-revision context changes and canonical commands during encoding', () => {
    const { edit, history } = fixture();
    const first = edit.beginCapture();
    edit.setSelection(['two-node']);
    expect(first.isCurrent()).toBe(false);
    first.release();
    const second = edit.beginCapture();
    history.execute((project) => {
      project.name = 'new';
    });
    expect(second.isCurrent()).toBe(false);
    second.release();
  });
});
