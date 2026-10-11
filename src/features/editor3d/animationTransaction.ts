import type { Project3D } from '../../core3d/model/project';
import type { AnimationBinding, AnimationState } from '../../core3d/ports/animationPort';
import type {
  NativeCaptureGuard,
  NativeEditBinding,
  NativeEditResult,
} from '../../core3d/ports/editPort';
import type { RigPoseBinding, RigPoseUpdate } from '../../core3d/ports/rigPosePort';
import { clipTime, prepareClipEvaluation } from '../../core3d/animation/evaluation';

/** Session-owned clock/preview only; explicit authoring commands alone can record keys. */
export class AnimationTransaction implements AnimationBinding {
  private evaluator: ReturnType<typeof prepareClipEvaluation> | null = null;
  private cachedProject: Project3D | null;
  private identity: { id: string; revision: number };
  private clipId: string | null = null;
  private time = 0;
  private playing = false;
  private available = false;
  private active = false;
  private updates: RigPoseUpdate[] = [];
  private reason = '';
  private epoch = 0;
  private sequence = 0;
  private timestamp: number | null = null;
  private captures = 0;
  private disposed = false;
  private notifying = false;
  private selection: string;
  private readOnly: boolean;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  constructor(
    private readonly options: {
      getProject(): Project3D;
      editing: NativeEditBinding;
      rig: RigPoseBinding;
      isReadOnly(): boolean;
      getRevision?(): number;
    },
  ) {
    const project = options.getProject();
    this.identity = { id: project.id, revision: project.revision };
    this.cachedProject = project;
    this.evaluator = null;
    this.selection = JSON.stringify(options.editing.state.context.selection);
    this.readOnly = options.isReadOnly();
    this.unsubscribe = options.editing.subscribe(() => {
      const p = options.getProject(),
        state = options.editing.state;
      const selection = JSON.stringify([state.context.activeId, state.context.selection]);
      const changedSelection = this.selection !== selection;
      this.selection = selection;
      const changedReadOnly = this.readOnly !== options.isReadOnly();
      this.readOnly = options.isReadOnly();
      if (
        p.id !== this.identity.id ||
        p.revision !== this.identity.revision ||
        changedSelection ||
        changedReadOnly ||
        state.active
      ) {
        this.cancel('作品・選択・編集権が変わりました。');
      } else if (state.blocked.some((value) => value.startsWith('renderer-'))) {
        this.pause('背景では再生を停止します。再開は明示操作です。');
      } else if (
        state.blocked.some(
          (value) =>
            value !== 'animation-preview' &&
            (value !== 'PNG capture' || this.active || this.captures === 0),
        )
      ) {
        this.cancel('他の編集・取得操作を開始しました。');
      }
    });
    this.selection = JSON.stringify([
      options.editing.state.context.activeId,
      options.editing.state.context.selection,
    ]);
  }
  get state(): AnimationState {
    return {
      projectId: this.identity.id,
      revision: this.identity.revision,
      epoch: this.epoch,
      sequence: this.sequence,
      active: this.active,
      updates: structuredClone(this.updates),
      reason: this.reason,
      clipId: this.clipId,
      time: this.time,
      playing: this.playing,
    };
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private currentProject(): Project3D {
    if (this.disposed || !this.cachedProject) throw new Error('Animation preview is disposed');
    const revision = this.options.getRevision?.();
    if (revision !== undefined && revision === this.cachedProject.revision)
      return this.cachedProject;
    const project = this.options.getProject();
    if (
      revision === undefined ||
      project.id !== this.cachedProject.id ||
      project.revision !== this.cachedProject.revision
    ) {
      this.cachedProject = project;
      this.evaluator = null;
    }
    return this.cachedProject;
  }
  private evaluate(id: string, time: number) {
    const project = this.currentProject();
    this.evaluator ??= prepareClipEvaluation(project);
    return this.evaluator(id, time);
  }
  private command(operation: () => void): NativeEditResult {
    try {
      if (this.disposed || this.captures)
        throw new Error('Animation preview is unavailable during capture or after disposal');
      this.options.rig.cancel('アニメーションの確認を開始しました。');
      if (this.options.editing.state.blocked.some((value) => value !== 'animation-preview'))
        throw new Error('現在再生できません。表示を再開してから操作してください。');
      this.options.editing.cancel('アニメーションの確認を開始しました。');
      operation();
      this.reason = '再生確認だけです。自動キーはオフです。';
      this.options.editing.setBlocked('animation-preview', this.active);
      this.publish();
      return { ok: true, changed: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  select(id: string | null): NativeEditResult {
    if (id === null) {
      this.clipId = null;
      this.time = 0;
      this.cancel('rest表示');
      return { ok: true, changed: true };
    }
    return this.command(() => {
      const updates = this.evaluate(id, 0);
      this.clipId = id;
      this.time = 0;
      this.updates = updates;
      this.active = true;
      this.playing = false;
      this.timestamp = null;
      this.epoch++;
    });
  }
  seek(time: number): NativeEditResult {
    return this.command(() => {
      if (!this.clipId) throw new Error('Clipを選択してください。');
      const updates = this.evaluate(this.clipId, time);
      this.updates = updates;
      this.time = time;
      this.active = true;
      this.playing = false;
      this.timestamp = null;
      this.epoch++;
    });
  }
  play(): NativeEditResult {
    return this.command(() => {
      if (!this.available) throw new Error('3D表示を再開してから再生してください。');
      const p = this.currentProject(),
        clip = p.clips.find((value) => value.id === this.clipId);
      if (!clip) throw new Error('Clipを選択してください。');
      const time = this.time >= clip.duration ? 0 : this.time;
      this.updates = this.evaluate(clip.id, time);
      this.time = time;
      this.active = true;
      this.playing = clip.duration > 0;
      this.timestamp = null;
      this.epoch++;
    });
  }
  pause(reason = '停止中。時刻と確認poseを保持しています。') {
    const changed = this.playing;
    this.playing = false;
    this.timestamp = null;
    this.reason = reason;
    if (changed) {
      this.epoch++;
      this.publish();
    }
  }
  cancel(reason = 'rest表示') {
    if (this.disposed) return;
    const p = this.currentProject();
    const changed =
      this.active ||
      this.playing ||
      p.id !== this.identity.id ||
      p.revision !== this.identity.revision;
    if (p.id !== this.identity.id) {
      this.clipId = null;
      this.time = 0;
    }
    this.identity = { id: p.id, revision: p.revision };
    const clip = p.clips.find((value) => value.id === this.clipId);
    if (!clip) {
      this.clipId = null;
      this.time = 0;
    } else this.time = Math.min(this.time, clip.duration);
    this.active = false;
    this.playing = false;
    this.updates = [];
    this.timestamp = null;
    this.reason = reason;
    this.epoch++;
    this.options.editing.setBlocked('animation-preview', false);
    if (changed) this.publish();
  }
  setAvailable(available: boolean) {
    this.available = available && !this.disposed;
    if (!this.available) this.pause('3D表示が中断したため再生を停止しました。');
  }
  advance(timestamp: number) {
    if (!this.playing || this.disposed) return;
    if (!Number.isFinite(timestamp)) {
      this.pause('再生時刻が不正です。');
      return;
    }
    if (this.timestamp === null || timestamp < this.timestamp) {
      this.timestamp = timestamp;
      return;
    }
    const delta = (timestamp - this.timestamp) / 1000;
    this.timestamp = timestamp;
    try {
      const p = this.currentProject();
      if (p.id !== this.identity.id || p.revision !== this.identity.revision) {
        this.cancel();
        return;
      }
      const clip = p.clips.find((value) => value.id === this.clipId);
      if (!clip) throw new Error('Clipが変わりました。');
      const time = clipTime(this.time + delta, clip.duration, clip.loop);
      const updates = this.evaluate(clip.id, time);
      this.updates = updates;
      this.time = time;
      if (!clip.loop && time === clip.duration) {
        this.playing = false;
        this.timestamp = null;
      }
      this.publish();
    } catch (error) {
      this.cancel(error instanceof Error ? error.message : String(error));
    }
  }
  beginCapture(): NativeCaptureGuard {
    if (this.disposed || this.active || this.playing)
      throw new Error('再生を解除してから取得してください。');
    const epoch = this.epoch;
    this.captures++;
    let released = false;
    return {
      epoch,
      isCurrent: () => !released && !this.disposed && epoch === this.epoch,
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
    this.cancel();
    this.disposed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.cachedProject = null;
    this.evaluator = null;
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
          /* Observers cannot mutate canonical data. */
        }
      }
    } finally {
      this.notifying = false;
    }
  }
}
