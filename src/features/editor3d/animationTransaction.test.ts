import { describe, expect, it, vi } from 'vitest';
import { smallProject } from '../../core3d/fixtures/project';
import { cloneProject } from '../../core3d/model/project';
import { TransformTransaction } from './transformTransaction';
import { RigPoseTransaction } from './rigPoseTransaction';
import { AnimationTransaction } from './animationTransaction';
function fixture(initialReadOnly = false) {
  const project = smallProject();
  let readOnly = initialReadOnly;
  const commit = vi.fn();
  const edit = new TransformTransaction({
    getProject: () => cloneProject(project),
    getIdentity: () => ({ id: project.id, revision: project.revision }),
    isReadOnly: () => readOnly,
    commit,
  });
  const rig = new RigPoseTransaction({
    getProject: () => cloneProject(project),
    isReadOnly: () => readOnly,
    editing: edit,
  });
  const animation = new AnimationTransaction({
    getProject: () => cloneProject(project),
    isReadOnly: () => readOnly,
    editing: edit,
    rig,
  });
  animation.setAvailable(true);
  return {
    project,
    edit,
    rig,
    animation,
    commit,
    setReadOnly: () => {
      readOnly = true;
      edit.reconcile();
    },
  };
}
describe('animation preview authority', () => {
  it('scrubs and plays without revisions, history writes or canonical mutations', () => {
    const f = fixture(),
      before = cloneProject(f.project);
    expect(f.animation.select('clip').ok).toBe(true);
    expect(f.animation.seek(0.5).ok).toBe(true);
    expect(f.animation.state.updates[0].transform.translation).toEqual([0, 0.5, 0]);
    expect(f.animation.play().ok).toBe(true);
    f.animation.advance(1000);
    f.animation.advance(1250);
    expect(f.animation.state.time).toBe(0.75);
    expect(f.project).toEqual(before);
    expect(f.commit).not.toHaveBeenCalled();
  });
  it('preserves stable readonly playback but clears on an ownership transition', () => {
    const f = fixture(true);
    expect(f.animation.select('clip').ok).toBe(true);
    expect(f.animation.play().ok).toBe(true);
    f.edit.reconcile();
    expect(f.animation.state.playing).toBe(true);
    const g = fixture();
    g.animation.select('clip');
    g.setReadOnly();
    expect(g.animation.state.active).toBe(false);
  });
  it('makes rig and animation mutually exclusive without editing forbidden rig implementation', () => {
    const f = fixture();
    f.rig.preview(f.rig.begin(), [{ nodeId: 'joint-b', transform: f.project.nodes[2].transform }]);
    expect(f.animation.select('clip').ok).toBe(true);
    expect(f.rig.state.active).toBe(false);
    expect(() => f.rig.begin()).toThrow();
    expect(f.edit.state.blocked).toContain('animation-preview');
    f.animation.cancel();
    expect(f.edit.state.blocked).not.toContain('animation-preview');
  });
  it('retains paused time and discards background elapsed time', () => {
    const f = fixture();
    f.animation.select('clip');
    f.animation.play();
    f.animation.advance(0);
    f.animation.advance(250);
    f.edit.setBlocked('renderer-document-frozen', true);
    expect(f.animation.state.playing).toBe(false);
    expect(f.animation.state.time).toBe(0.25);
    f.animation.advance(100000);
    expect(f.animation.state.time).toBe(0.25);
    f.edit.setBlocked('renderer-document-frozen', false);
    f.animation.play();
    f.animation.advance(100000);
    f.animation.advance(100100);
    expect(f.animation.state.time).toBeCloseTo(0.35);
  });
  it('handles loop seam, nonloop end and zero duration', () => {
    const f = fixture();
    f.animation.select('clip');
    f.animation.play();
    f.animation.advance(0);
    f.animation.advance(1250);
    expect(f.animation.state.time).toBe(0.25);
    f.project.clips[0].loop = false;
    f.animation.seek(0.9);
    f.animation.play();
    f.animation.advance(0);
    f.animation.advance(1000);
    expect(f.animation.state.time).toBe(1);
    expect(f.animation.state.playing).toBe(false);
    f.project.clips[0].tracks = [];
    f.project.clips[0].duration = 0;
    expect(f.animation.select('clip').ok).toBe(true);
    f.animation.play();
    expect(f.animation.state.playing).toBe(false);
  });
  it('invalidates revision, selection, capture and disposal boundaries', () => {
    const f = fixture();
    f.animation.select('clip');
    f.project.revision++;
    f.edit.reconcile();
    expect(f.animation.state.active).toBe(false);
    f.animation.select('clip');
    f.edit.setSelection(['shape'], 'shape');
    expect(f.animation.state.active).toBe(false);
    const guard = f.animation.beginCapture();
    expect(f.animation.seek(0).ok).toBe(false);
    f.animation.cancel();
    expect(guard.isCurrent()).toBe(false);
    guard.release();
    f.animation.dispose();
    expect(f.animation.play().ok).toBe(false);
  });
  it('keeps nested readonly PNG leases current and releases only once', () => {
    const f = fixture(true);
    const outer = f.animation.beginCapture();
    const editing = f.edit.beginCapture();
    const inner = f.animation.beginCapture();
    expect(outer.isCurrent()).toBe(true);
    expect(inner.isCurrent()).toBe(true);
    inner.release();
    inner.release();
    editing.release();
    expect(outer.isCurrent()).toBe(true);
    outer.release();
    expect(f.animation.select('clip').ok).toBe(true);
  });
  it('preserves previous pose on invalid user seek but stops an invalid clock sample safely', () => {
    const f = fixture();
    f.animation.select('clip');
    f.animation.seek(0.5);
    expect(f.animation.seek(2).ok).toBe(false);
    expect(f.animation.state.time).toBe(0.5);
    f.animation.play();
    f.animation.advance(NaN);
    expect(f.animation.state.playing).toBe(false);
  });
  it('isolates broken observers and clears non-keyed channels when switching clips', () => {
    const f = fixture();
    f.animation.subscribe(() => {
      throw new Error('observer');
    });
    f.project.clips.push({ id: 'empty', name: 'Empty', duration: 1, loop: false, tracks: [] });
    expect(f.animation.select('clip').ok).toBe(true);
    expect(f.animation.select('empty').ok).toBe(true);
    expect(f.animation.state.updates).toEqual([]);
  });
});

it('rejects play when the renderer is unavailable without blocking ordinary editing', () => {
  const f = fixture();
  f.animation.select('clip');
  f.animation.setAvailable(false);
  expect(f.animation.play().ok).toBe(false);
  expect(f.animation.state.playing).toBe(false);
  f.animation.cancel();
  expect(f.edit.state.blocked).toEqual([]);
  f.animation.setAvailable(true);
  expect(f.animation.play().ok).toBe(true);
});

it('reuses revision-owned sources on renderer ticks rather than cloning canonical geometry per frame', () => {
  const f = fixture();
  const getProject = vi.fn(() => cloneProject(f.project));
  const animation = new AnimationTransaction({
    getProject,
    getRevision: () => f.project.revision,
    editing: f.edit,
    rig: f.rig,
    isReadOnly: () => false,
  });
  animation.setAvailable(true);
  animation.select('clip');
  animation.play();
  const calls = getProject.mock.calls.length;
  animation.advance(0);
  animation.advance(100);
  animation.advance(200);
  expect(getProject).toHaveBeenCalledTimes(calls);
  animation.dispose();
  f.animation.dispose();
});

it('disposed animation drops cached project/evaluation and accepts late cleanup without rereading history', () => {
  const f = fixture();
  f.animation.dispose();
  f.rig.dispose();
  const retained = f.animation as unknown as { cachedProject: unknown; evaluator: unknown };
  expect(retained.cachedProject).toBeNull();
  expect(retained.evaluator).toBeNull();
  expect(() => f.animation.cancel()).not.toThrow();
  expect(() => f.animation.dispose()).not.toThrow();
  expect(f.animation.state.active).toBe(false);
});
