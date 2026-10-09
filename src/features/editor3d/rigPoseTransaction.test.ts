import { describe, it, expect, vi } from 'vitest';
import { createProject, identityTransform, cloneProject } from '../../core3d/model/project';
import { addBox } from '../../core3d/commands/box';
import { addRigJoint, bindSkin } from '../../core3d/rig/authoring';
import { TransformTransaction } from './transformTransaction';
import { RigPoseTransaction } from './rigPoseTransaction';
function fixture() {
  const project = createProject('pose');
  addBox(project, 'box');
  addRigJoint(project, 'joint', 'Joint', null, identityTransform());
  bindSkin(
    project,
    'skin',
    project.meshes[0].id,
    ['joint'],
    project.meshes[0].vertices.map((v) => ({ vertexId: v.id, jointIds: ['joint'], values: [1] })),
  );
  let readOnly = false;
  const edit = new TransformTransaction({
    getProject: () => cloneProject(project),
    getIdentity: () => ({ id: project.id, revision: project.revision }),
    isReadOnly: () => readOnly,
    commit: () => {
      throw new Error('must not commit');
    },
  });
  const pose = new RigPoseTransaction({
    getProject: () => cloneProject(project),
    isReadOnly: () => readOnly,
    editing: edit,
  });
  return {
    project,
    pose,
    edit,
    readOnly: () => {
      readOnly = true;
      edit.reconcile();
    },
  };
}
const update = () => [
  {
    nodeId: 'joint',
    transform: { ...identityTransform(), translation: [1, 0, 0] as [number, number, number] },
  },
];
describe('rig preview ownership', () => {
  it('previews without canonical writes and blocks competing transform gestures', () => {
    const { pose, project, edit } = fixture();
    const before = cloneProject(project);
    expect(pose.preview(pose.begin(), update()).ok).toBe(true);
    expect(project).toEqual(before);
    expect(edit.state.blocked).toContain('rig-pose');
    pose.cancel();
    expect(pose.state.active).toBe(false);
    expect(edit.state.blocked).not.toContain('rig-pose');
  });
  it('rejects stale tokens and does not replace valid previews on invalid input', () => {
    const { pose } = fixture();
    const token = pose.begin();
    expect(pose.preview(token, update()).ok).toBe(true);
    const before = pose.state.updates;
    expect(pose.preview(token, [{ nodeId: 'missing', transform: identityTransform() }]).ok).toBe(
      false,
    );
    expect(pose.state.updates).toEqual(before);
    pose.cancel();
    expect(pose.preview(token, update()).ok).toBe(false);
  });
  it('supersedes older begin tokens without discarding the accumulated pose', () => {
    const { pose } = fixture();
    const older = pose.begin();
    const newer = pose.begin();
    expect(pose.preview(newer, update()).ok).toBe(true);
    expect(pose.preview(older, [{ nodeId: 'joint', transform: identityTransform() }]).ok).toBe(
      false,
    );
    expect(pose.state.updates[0].transform.translation).toEqual([1, 0, 0]);
  });
  it.each(['revision', 'read-only', 'blocked', 'selection'])('cancels on %s', (reason) => {
    const { pose, project, edit, readOnly } = fixture();
    const token = pose.begin();
    pose.preview(token, update());
    if (reason === 'revision') {
      project.revision++;
      edit.reconcile();
    } else if (reason === 'read-only') readOnly();
    else if (reason === 'selection') edit.setSelection(['box-node']);
    else edit.setBlocked('hidden', true);
    expect(pose.state.active).toBe(false);
    expect(pose.preview(token, update()).ok).toBe(false);
  });
  it('capture leases block new previews and become stale across cancellation/disposal', () => {
    const { pose } = fixture();
    const capture = pose.beginCapture();
    expect(() => pose.begin()).toThrow();
    expect(capture.isCurrent()).toBe(true);
    pose.cancel();
    expect(capture.isCurrent()).toBe(false);
    capture.release();
    capture.release();
    pose.preview(pose.begin(), update());
    expect(() => pose.beginCapture()).toThrow();
    pose.dispose();
    expect(() => pose.begin()).toThrow();
  });
  it('keeps nested PNG leases valid in an already-read-only session', () => {
    const { pose, edit, readOnly } = fixture();
    readOnly();
    const outer = pose.beginCapture();
    const render = edit.beginCapture();
    const inner = pose.beginCapture();
    expect(outer.isCurrent()).toBe(true);
    expect(inner.isCurrent()).toBe(true);
    render.release();
    inner.release();
    expect(outer.isCurrent()).toBe(true);
    outer.release();
  });
  it('isolates observers and detaches listeners at disposal', () => {
    const { pose } = fixture();
    const listener = vi.fn();
    pose.subscribe(() => {
      throw new Error('observer');
    });
    pose.subscribe(listener);
    expect(pose.preview(pose.begin(), update()).ok).toBe(true);
    expect(listener).toHaveBeenCalled();
    pose.dispose();
    const count = listener.mock.calls.length;
    pose.cancel();
    expect(listener).toHaveBeenCalledTimes(count);
  });
});
