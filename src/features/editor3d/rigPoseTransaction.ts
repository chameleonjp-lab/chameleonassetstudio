import type { Project3D } from '../../core3d/model/project';
import type {
  NativeEditBinding,
  NativeCaptureGuard,
  NativeEditResult,
} from '../../core3d/ports/editPort';
import type {
  RigPoseBinding,
  RigPoseState,
  RigPoseToken,
  RigPoseUpdate,
} from '../../core3d/ports/rigPosePort';
import { evaluateRigPose } from '../../core3d/rig/pose';

/** Session-owned preview; never touches history or autosave. */
export class RigPoseTransaction implements RigPoseBinding {
  private epoch = 0;
  private sequence = 0;
  private updates: RigPoseUpdate[] = [];
  private reason = '';
  private captures = 0;
  private disposed = false;
  private notifying = false;
  private listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private selectionIdentity = '';
  private readOnlyState = false;
  private identity: { id: string; revision: number };
  constructor(
    private readonly options: {
      getProject(): Project3D;
      isReadOnly(): boolean;
      editing: NativeEditBinding;
    },
  ) {
    const project = options.getProject();
    this.identity = { id: project.id, revision: project.revision };
    this.selectionIdentity = JSON.stringify([
      options.editing.state.context.activeId,
      options.editing.state.context.selection,
    ]);
    this.readOnlyState = options.isReadOnly();
    this.unsubscribe = options.editing.subscribe(() => {
      const project = options.getProject();
      const state = options.editing.state;
      const selection = JSON.stringify([state.context.activeId, state.context.selection]);
      const readOnly = options.isReadOnly();
      const changedReadOnly = readOnly !== this.readOnlyState;
      this.readOnlyState = readOnly;
      const changedSelection = selection !== this.selectionIdentity;
      this.selectionIdentity = selection;
      if (
        changedSelection ||
        project.id !== this.identity.id ||
        project.revision !== this.identity.revision ||
        changedReadOnly ||
        (readOnly && this.updates.length > 0) ||
        state.active ||
        state.blocked.some(
          (reason) =>
            reason !== 'rig-pose' &&
            (reason !== 'PNG capture' || this.updates.length > 0 || this.captures === 0),
        )
      )
        this.cancel('作品・編集権・表示状態が変わったためposeを解除しました。');
    });
  }
  get state(): RigPoseState {
    return {
      projectId: this.identity.id,
      revision: this.identity.revision,
      epoch: this.epoch,
      sequence: this.sequence,
      active: this.updates.length > 0,
      updates: structuredClone(this.updates),
      reason: this.reason,
    };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  begin(): RigPoseToken {
    const project = this.options.getProject();
    if (
      this.disposed ||
      this.options.isReadOnly() ||
      this.captures ||
      this.options.editing.state.blocked.some((reason) => reason !== 'rig-pose')
    )
      throw new Error('現在poseを変更できません。');
    this.options.editing.cancel('poseプレビューを開始しました。');
    if (project.id !== this.identity.id || project.revision !== this.identity.revision)
      this.cancel('作品が変わりました。');
    this.epoch++;
    return { projectId: project.id, revision: project.revision, epoch: this.epoch };
  }
  preview(token: RigPoseToken, updates: RigPoseUpdate[]): NativeEditResult {
    try {
      const project = this.options.getProject();
      if (
        this.disposed ||
        this.options.isReadOnly() ||
        this.captures ||
        token.projectId !== project.id ||
        token.revision !== project.revision ||
        token.epoch !== this.epoch ||
        this.options.editing.state.blocked.some((reason) => reason !== 'rig-pose')
      )
        throw new Error('古いpose操作です。現在の対象を確認してください。');
      const merged = new Map(this.updates.map((update) => [update.nodeId, update]));
      const seen = new Set<string>();
      for (const update of updates) {
        if (seen.has(update.nodeId)) throw new Error('同じjointが重複しています。');
        seen.add(update.nodeId);
        merged.set(update.nodeId, structuredClone(update));
      }
      const next = [...merged.values()];
      evaluateRigPose(project, next);
      this.updates = next;
      this.reason = 'poseは表示確認だけです。保存・バックアップにはrestを含めます。';
      this.options.editing.setBlocked('rig-pose', next.length > 0);
      this.publish();
      return { ok: true, changed: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  cancel(reason = 'restに戻しました。') {
    const project = this.options.getProject();
    const changed =
      this.updates.length > 0 ||
      project.id !== this.identity.id ||
      project.revision !== this.identity.revision;
    this.identity = { id: project.id, revision: project.revision };
    this.updates = [];
    this.epoch++;
    this.reason = reason;
    this.options.editing.setBlocked('rig-pose', false);
    if (changed) this.publish();
  }
  beginCapture(): NativeCaptureGuard {
    if (this.disposed || this.updates.length)
      throw new Error('poseを解除してから取得してください。');
    const epoch = this.epoch;
    this.captures++;
    let released = false;
    return {
      epoch,
      isCurrent: () => !released && !this.disposed && this.epoch === epoch,
      release: () => {
        if (!released) {
          released = true;
          this.captures--;
        }
      },
    };
  }
  dispose() {
    if (this.disposed) return;
    this.cancel('作品を閉じました。');
    this.disposed = true;
    this.unsubscribe();
    this.listeners.clear();
  }
  private publish() {
    this.sequence++;
    if (this.notifying) return;
    this.notifying = true;
    try {
      for (const listener of [...this.listeners]) {
        try {
          listener();
        } catch {
          /* Observers cannot change operation outcomes. */
        }
      }
    } finally {
      this.notifying = false;
    }
  }
}
