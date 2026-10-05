import { isNodeLocked } from '../../core3d/model/editability';
import { setNodeTransform } from '../../core3d/commands/objectEditing';
import { composeTransform } from '../../core3d/model/coordinates';
import { cloneProject, type Project3D, type Vec3 } from '../../core3d/model/project';
import type {
  NativeCaptureGuard,
  NativeEditBinding,
  NativeEditContext,
  NativeEditFrame,
  NativeEditOptions,
  NativeEditResult,
  NativeEditStart,
  NativeEditState,
  NativeEditToken,
  NativeTransformEvaluator,
  NativeTransformPreview,
  NativeTransformUpdate,
} from '../../core3d/ports/editPort';

interface TransformAuthority {
  getProject(): Project3D;
  getIdentity(): Pick<Project3D, 'id' | 'revision'>;
  isReadOnly(): boolean;
  commit(updates: NativeTransformUpdate[], expected: Pick<Project3D, 'id' | 'revision'>): void;
}
interface Gesture {
  token: NativeEditToken;
  project: Project3D;
  context: NativeEditContext;
  frame: NativeEditFrame;
  updates: NativeTransformUpdate[] | null;
  valid: boolean;
}
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const failure = (error: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: reason(error),
});

/** Ephemeral transaction authority. Evaluated math and canonical history stay outside. */
export class TransformTransaction implements NativeEditBinding {
  private evaluator: NativeTransformEvaluator | null = null;
  private selection: string[] = [];
  private activeId: string | null = null;
  private options: NativeEditOptions = { mode: 'translate', space: 'world', snap: null };
  private gesture: Gesture | null = null;
  private overlay: NativeTransformPreview | null = null;
  private generation = 0;
  private sequence = 0;
  private epoch = 0;
  private lastReason = 'idle';
  private observerError: string | null = null;
  private lockCache: { id: string; revision: number; ids: string[] } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly blocked = new Set<string>();
  private readonly captures = new Set<symbol>();

  constructor(private readonly authority: TransformAuthority) {}

  private get context(): NativeEditContext {
    const identity = this.authority.getIdentity();
    if (this.lockCache?.id !== identity.id || this.lockCache?.revision !== identity.revision) {
      const project = this.getProject();
      this.lockCache = {
        ...identity,
        ids: project.nodes.filter((node) => isNodeLocked(project, node.id)).map((node) => node.id),
      };
    }
    return {
      selection: [...this.selection],
      activeId: this.activeId,
      options: { ...this.options },
      readOnly: this.authority.isReadOnly(),
      lockedIds: [...this.lockCache.ids],
    };
  }
  get state(): NativeEditState {
    const identity = this.authority.getIdentity();
    return {
      projectId: identity.id,
      revision: identity.revision,
      context: this.context,
      active: this.gesture !== null,
      token: this.gesture?.token ?? null,
      frame: this.gesture ? structuredClone(this.gesture.frame) : null,
      preview: this.overlay ? structuredClone(this.overlay) : null,
      sequence: this.sequence,
      epoch: this.epoch,
      lastReason: this.lastReason,
      observerError: this.observerError,
      blocked: [...this.blocked, ...(this.captures.size ? ['PNG capture'] : [])],
      evaluatorReady: this.evaluator !== null,
    };
  }
  getProject() {
    return this.authority.getProject();
  }
  getFrame(): NativeEditFrame {
    if (this.gesture) return structuredClone(this.gesture.frame);
    this.assertAvailable();
    return this.evaluator!.selectionFrame(this.getProject(), this.context);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(message: string, invalidateCapture = true) {
    this.lastReason = message;
    this.sequence++;
    if (invalidateCapture) this.epoch++;
    // Views are fallible observers, not participants in the canonical transaction.
    // Snapshot iteration also defers listeners added by another observer until the next event.
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener();
      } catch (error) {
        // Keep a bounded local diagnostic without retaining arbitrary thrown objects or telemetry.
        this.observerError = 'Edit state observer failed';
        try {
          this.observerError = String(reason(error)).slice(0, 512);
        } catch {
          // Even a throwing message getter/string conversion cannot break authoring.
        }
      }
    }
  }
  private clear() {
    this.gesture = null;
    this.overlay = null;
  }
  setEvaluator(evaluator: NativeTransformEvaluator) {
    if (this.evaluator === evaluator) return;
    this.clear();
    this.evaluator = evaluator;
    this.publish('transform evaluator ready');
  }
  setSelection(ids: string[], activeId: string | null = ids.at(-1) ?? null) {
    const existing = new Set(this.getProject().nodes.map((node) => node.id));
    const selection = [...new Set(ids)].filter((id) => existing.has(id));
    const active = activeId && selection.includes(activeId) ? activeId : (selection.at(-1) ?? null);
    if (JSON.stringify(selection) === JSON.stringify(this.selection) && active === this.activeId)
      return;
    this.clear();
    this.selection = selection;
    this.activeId = active;
    this.publish('selection changed');
  }
  setOptions(options: NativeEditOptions): NativeEditResult {
    if (
      !['translate', 'rotate', 'scale'].includes(options.mode) ||
      !['world', 'local'].includes(options.space) ||
      (options.snap !== null && (!Number.isFinite(options.snap) || options.snap <= 0))
    ) {
      this.cancel('invalid transform options');
      return failure(new Error('変形の種類・空間・スナップ間隔を確認してください。'));
    }
    if (JSON.stringify(options) === JSON.stringify(this.options)) return { ok: true };
    this.clear();
    this.options = { ...options };
    this.publish('transform options changed');
    return { ok: true };
  }
  private assertAvailable() {
    if (this.authority.isReadOnly()) throw new Error('このプロジェクトは読み取り専用です。');
    if (this.blocked.size || this.captures.size)
      throw new Error('現在は変形操作を開始できません。');
    if (!this.evaluator) throw new Error('変形の準備中です。もう一度操作してください。');
  }
  begin(): NativeEditStart {
    this.cancel('superseded gesture');
    try {
      this.assertAvailable();
      const project = this.getProject();
      const context = this.context;
      if (!context.selection.length || !context.activeId)
        throw new Error('変形するオブジェクトを選択してください。');
      const frame = this.evaluator!.selectionFrame(project, context);
      // Static-authoring, animation, scale and native coordinate guards apply even to a click.
      for (const id of context.selection) {
        const node = project.nodes.find((item) => item.id === id);
        if (!node) throw new Error('対象オブジェクトがありません。選択し直してください。');
        setNodeTransform(cloneProject(project), id, node.transform);
      }
      const token = Object.freeze({
        generation: ++this.generation,
        projectId: project.id,
        revision: project.revision,
      });
      this.gesture = {
        token,
        project,
        context,
        frame: structuredClone(frame),
        updates: null,
        valid: true,
      };
      this.publish('preview');
      return { ok: true, token, frame: structuredClone(frame) };
    } catch (error) {
      return failure(error);
    }
  }
  private requireCurrent(token: NativeEditToken): Gesture {
    const gesture = this.gesture;
    if (!gesture || gesture.token !== token) throw new Error('変形操作の期限が切れました。');
    const current = this.authority.getIdentity();
    if (current.id !== token.projectId || current.revision !== token.revision) {
      this.cancel('project revision changed', token);
      throw new Error('作品が変わりました。現在の対象と値を確認して再操作してください。');
    }
    try {
      this.assertAvailable();
    } catch (error) {
      this.cancel('editing unavailable', token);
      throw error;
    }
    return gesture;
  }
  preview(token: NativeEditToken, delta: Vec3): NativeEditResult {
    try {
      const gesture = this.requireCurrent(token);
      // Poison first: a failed final sample can never commit the last good sample.
      gesture.valid = false;
      gesture.updates = null;
      this.overlay = null;
      const updates = this.evaluator!.evaluateDelta(
        gesture.project,
        gesture.context,
        gesture.frame,
        delta,
      );
      if (
        updates.length !== gesture.context.selection.length ||
        new Set(updates.map((update) => update.id)).size !== updates.length ||
        updates.some((update) => !gesture.context.selection.includes(update.id))
      )
        throw new Error('変形の対象が選択内容と一致しません。');
      const candidate = cloneProject(gesture.project);
      for (const update of updates) setNodeTransform(candidate, update.id, update.transform);
      gesture.updates = structuredClone(updates);
      gesture.valid = true;
      this.overlay = {
        projectId: token.projectId,
        baseRevision: token.revision,
        generation: token.generation,
        sequence: this.sequence + 1,
        updates: structuredClone(updates),
      };
      this.publish('preview');
      return { ok: true };
    } catch (error) {
      // Late callbacks are inert, including notification/reason state of a newer gesture.
      if (this.gesture?.token === token) this.publish(reason(error));
      return failure(error);
    }
  }
  commit(token: NativeEditToken): NativeEditResult {
    let accepted = false;
    try {
      const gesture = this.requireCurrent(token);
      accepted = true;
      if (!gesture.valid) throw new Error('最後の変形値が無効です。再入力してください。');
      const changed =
        gesture.updates?.some(({ id, transform }) => {
          const before = composeTransform(
            gesture.project.nodes.find((node) => node.id === id)!.transform,
          );
          return composeTransform(transform).some((value, index) => value !== before[index]);
        }) ?? false;
      const updates = structuredClone(gesture.updates ?? []);
      this.clear();
      if (changed) {
        this.authority.commit(updates, { id: token.projectId, revision: token.revision });
      }
      this.publish(changed ? 'committed' : 'no-op');
      return { ok: true, changed };
    } catch (error) {
      if (this.gesture?.token === token) this.cancel(reason(error), token);
      // A budget/authoring failure also clears the preview that was removed before commit.
      else if (accepted && !this.gesture) this.publish(reason(error));
      return failure(error);
    }
  }
  cancel(message = 'cancelled', token?: NativeEditToken) {
    if (!this.gesture || (token && this.gesture.token !== token)) return;
    this.clear();
    this.publish(message);
  }
  setBlocked(message: string, blocked: boolean) {
    if (this.blocked.has(message) === blocked) return;
    if (blocked) {
      this.blocked.add(message);
      this.clear();
    } else this.blocked.delete(message);
    this.publish(blocked ? message : 'editing available');
  }
  /** Called only by the session after canonical changes or known writer/close changes. */
  reconcile(message = 'project changed') {
    this.clear();
    const existing = new Set(this.getProject().nodes.map((node) => node.id));
    this.selection = this.selection.filter((id) => existing.has(id));
    if (!this.activeId || !this.selection.includes(this.activeId))
      this.activeId = this.selection.at(-1) ?? null;
    this.publish(message);
  }
  beginCapture(): NativeCaptureGuard {
    if (this.gesture) throw new Error('変形を確定または取り消してからPNGを保存してください。');
    const capture = Symbol('PNG capture');
    this.captures.add(capture);
    this.publish('PNG capture', false);
    const epoch = this.epoch;
    const identity = this.authority.getIdentity();
    let released = false;
    return {
      epoch,
      isCurrent: () => {
        const current = this.authority.getIdentity();
        return (
          !released &&
          this.epoch === epoch &&
          current.id === identity.id &&
          current.revision === identity.revision &&
          !this.gesture
        );
      },
      release: () => {
        if (released) return;
        released = true;
        this.captures.delete(capture);
        this.publish('PNG capture finished', false);
      },
    };
  }
}
