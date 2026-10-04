import {
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type Scene,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Project3D, Vec3 } from '../../src/core3d/model/project';
import { canvasPoint, pickNative } from './picking';
import { TransformTransaction, type EditContext, type EditResult, type Token } from './transaction';

// Pinned r186 source consumes normalized {x,y,button}; @types/three 0.186.0 labels it PointerEvent.
export const normalizedPointer = (x: number, y: number, button: number) =>
  ({ x, y, button }) as PointerEvent;

interface Dependencies {
  canvas: HTMLCanvasElement;
  camera: Camera;
  scene: Scene;
  root: Object3D;
  transaction: TransformTransaction;
  orbit: { enabled: boolean };
  resetCameraGesture?: () => void;
  document: EventTarget & { hidden?: boolean };
  window: EventTarget;
  changed: () => void;
}

/** Owns DOM input itself: stock TransformControls has no pointercancel transaction contract. */
export class EditController {
  readonly controls: TransformControls;
  readonly proxy = new Object3D();
  private token: Token | null = null;
  private pointerId: number | null = null;
  private cameraPointers = new Set<number>();
  private ignoredPointers = new Set<number>();
  private picking: { id: number; x: number; y: number; shift: boolean } | null = null;
  private cleanups: (() => void)[] = [];
  private blocked = new Set<string>();
  private blockedOrbitEnabled: boolean | null = null;
  private disposed = false;
  private composing = false;
  private suppress = false;
  private previousOrbit = true;
  private geometries = new Set<BufferGeometry>();
  private materials = new Set<Material>();
  private readonly oldTouchAction: string;
  private readonly objectChange = () => this.updateFromProxy();
  private readonly mouseUp = () => {
    if (this.suppress || !this.token || this.pointerId === null) return;
    const token = this.token;
    this.token = null;
    this.dependencies.transaction.commit(token);
    this.applyPreview();
  };

  constructor(private dependencies: Dependencies) {
    const { canvas, camera, scene } = dependencies;
    this.oldTouchAction = canvas.style.touchAction;
    this.controls = new TransformControls(camera, canvas);
    this.controls.disconnect();
    canvas.style.touchAction = 'none';
    // Stock scale always uses local axes. A unit-scale proper-rotation proxy supplies our chosen frame.
    this.controls.setSpace('local');
    this.controls.showE = false;
    this.controls.showXYZE = false;
    this.controls.addEventListener('objectChange', this.objectChange);
    this.controls.addEventListener('mouseUp', this.mouseUp);
    const helper = this.controls.getHelper();
    helper.traverse((object) => {
      if (object instanceof Mesh || 'geometry' in object) {
        const drawable = object as Mesh;
        if (drawable.geometry) this.geometries.add(drawable.geometry);
        for (const material of Array.isArray(drawable.material)
          ? drawable.material
          : [drawable.material])
          if (material) this.materials.add(material);
      }
    });
    for (const geometry of this.geometries)
      geometry.addEventListener('dispose', () => this.geometries.delete(geometry));
    for (const material of this.materials)
      material.addEventListener('dispose', () => this.materials.delete(material));
    scene.add(this.proxy, helper);
    this.listen(canvas, 'pointerdown', (event) => this.pointerDown(event as PointerEvent), true);
    this.listen(canvas, 'pointermove', (event) => this.pointerMove(event as PointerEvent), true);
    this.listen(canvas, 'pointerup', (event) => this.pointerUp(event as PointerEvent), true);
    for (const reason of ['pointercancel', 'lostpointercapture'])
      this.listen(
        canvas,
        reason,
        (event) => {
          const id = (event as PointerEvent).pointerId;
          if (id === this.picking?.id) this.picking = null;
          if (id === this.pointerId) this.cancel(reason);
          if (reason === 'pointercancel') {
            this.cameraPointers.delete(id);
            this.ignoredPointers.delete(id);
          }
        },
        true,
      );
    for (const reason of ['pointerup', 'pointercancel'])
      this.listen(dependencies.document, reason, (event) => {
        const id = (event as PointerEvent).pointerId;
        this.cameraPointers.delete(id);
        this.ignoredPointers.delete(id);
        if (this.picking?.id === id) this.picking = null;
      });
    this.listen(canvas, 'webglcontextlost', () => this.setBlocked('context loss', true));
    this.listen(canvas, 'webglcontextrestored', () => this.setBlocked('context loss', false));
    this.listen(dependencies.document, 'visibilitychange', () =>
      this.setBlocked('hidden', !!dependencies.document.hidden),
    );
    this.listen(dependencies.document, 'freeze', () => this.setBlocked('freeze', true));
    this.listen(dependencies.document, 'resume', () => this.setBlocked('freeze', false));
    this.listen(dependencies.window, 'pagehide', () => this.setBlocked('pagehide', true));
    this.listen(dependencies.window, 'pageshow', () => this.setBlocked('pagehide', false));
    this.listen(dependencies.window, 'keydown', (event) => this.keyDown(event as KeyboardEvent));
    this.listen(dependencies.document, 'compositionstart', () => {
      this.composing = true;
      this.cancel('IME composition');
    });
    this.listen(dependencies.document, 'compositionend', () => {
      this.composing = false;
    });
    this.syncProxy();
  }
  private listen(target: EventTarget, type: string, listener: EventListener, capture = false) {
    target.addEventListener(type, listener, capture);
    this.cleanups.push(() => target.removeEventListener(type, listener, capture));
  }
  get diagnostics() {
    return {
      disposed: this.disposed,
      active: this.dependencies.transaction.active,
      captures: Number(this.pointerId !== null),
      pointerId: this.pointerId,
      cameraPointers: this.cameraPointers.size,
      ignoredPointers: this.ignoredPointers.size,
      listeners: this.cleanups.length + (this.disposed ? 0 : 2),
      helperGeometries: this.geometries.size,
      helperMaterials: this.materials.size,
      helperObjects: this.disposed ? 0 : 2,
      orbitEnabled: this.dependencies.orbit.enabled,
      blocked: [...this.blocked],
      reason: this.dependencies.transaction.lastReason,
    };
  }
  private pointer(event: PointerEvent, moving = false) {
    const point = canvasPoint(
      event.clientX,
      event.clientY,
      this.dependencies.canvas.getBoundingClientRect(),
    );
    return point ? normalizedPointer(point.x, point.y, moving ? -1 : event.button) : null;
  }
  private consume(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  private pointerDown(event: PointerEvent) {
    if (this.disposed) return;
    if (this.blocked.size) {
      this.ignoredPointers.add(event.pointerId);
      this.consume(event);
      return;
    }
    // A new down begins a new sequence for that ID (mouse IDs are commonly reused).
    this.ignoredPointers.delete(event.pointerId);
    // Orbit owns the whole camera gesture, including an additional touch over a gizmo.
    // Never steal its second pointer or consume the terminating event of its first.
    if (this.cameraPointers.size) {
      this.cameraPointers.add(event.pointerId);
      this.picking = null;
      return;
    }
    if (this.pointerId !== null || this.token) {
      this.cancel('second pointer');
      this.ignoredPointers.add(event.pointerId);
      this.consume(event);
      return;
    }
    if (this.ignoredPointers.size) {
      this.ignoredPointers.add(event.pointerId);
      this.consume(event);
      return;
    }
    if (event.button !== 0) {
      this.cameraPointers.add(event.pointerId);
      return;
    }
    const point = this.pointer(event);
    if (!point) return;
    this.dependencies.scene.updateMatrixWorld(true);
    this.controls.pointerHover(point);
    if (this.controls.object && this.controls.axis !== null) {
      this.consume(event);
      try {
        this.token = this.dependencies.transaction.begin();
        this.previousOrbit = this.dependencies.orbit.enabled;
        this.dependencies.orbit.enabled = false;
        this.pointerId = event.pointerId;
        this.dependencies.canvas.setPointerCapture(event.pointerId);
        this.controls.pointerDown(point);
        if (!this.controls.dragging) this.cancel('gizmo missed');
        this.dependencies.changed();
      } catch (error) {
        this.cancel(error instanceof Error ? error.message : String(error));
      }
    } else {
      this.cameraPointers.add(event.pointerId);
      this.picking = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        shift: event.shiftKey,
      };
    }
  }
  private pointerMove(event: PointerEvent) {
    if (this.disposed) return;
    if (this.blocked.size) {
      this.consume(event);
      return;
    }
    if (this.ignoredPointers.has(event.pointerId)) {
      this.consume(event);
      return;
    }
    if (this.cameraPointers.has(event.pointerId)) return;
    const point = this.pointer(event, true);
    if (this.pointerId !== null) {
      this.consume(event);
      if (event.pointerId !== this.pointerId) {
        this.cancel('second pointer');
        return;
      }
      // A finite canvas position can still miss the addon's drag plane. Invalidate
      // before invoking it; only a synchronous objectChange validates this sample.
      if (this.token) this.dependencies.transaction.update(this.token, [NaN, NaN, NaN]);
      if (point) this.controls.pointerMove(point);
      this.applyPreview();
    } else if (!this.token && point) {
      this.controls.pointerHover(point);
      this.dependencies.changed();
    }
  }
  private pointerUp(event: PointerEvent) {
    if (this.ignoredPointers.delete(event.pointerId)) {
      this.consume(event);
      return;
    }
    const cameraOwned = this.cameraPointers.delete(event.pointerId);
    if (cameraOwned && this.pointerId !== null) return;
    if (this.pointerId !== null) {
      this.consume(event);
      if (event.pointerId !== this.pointerId) {
        this.cancel('second pointer');
        return;
      }
      // Re-evaluate the release position; an invalid final sample poisons the session.
      this.pointerMove(event);
      this.controls.pointerUp(normalizedPointer(0, 0, 0));
      this.releaseCapture();
      this.syncProxy();
      this.dependencies.changed();
      return;
    }
    const picked = this.picking;
    this.picking = null;
    if (
      !picked ||
      picked.id !== event.pointerId ||
      Math.hypot(event.clientX - picked.x, event.clientY - picked.y) > 5 ||
      this.blocked.size
    )
      return;
    const { transaction, root, camera, canvas } = this.dependencies;
    const project = transaction.history.project;
    const id = pickNative(
      root,
      camera,
      new Set(project.nodes.map((n) => n.id)),
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
    );
    const context = transaction.settings;
    const selection = picked.shift
      ? id
        ? context.selection.includes(id)
          ? context.selection.filter((item) => item !== id)
          : [...context.selection, id]
        : context.selection
      : id
        ? [id]
        : [];
    this.setContext({
      ...context,
      selection,
      activeId: id && selection.includes(id) ? id : (selection.at(-1) ?? null),
    });
  }
  private updateFromProxy() {
    if (this.suppress || !this.token || this.pointerId === null) return;
    const transaction = this.dependencies.transaction;
    const frame = transaction.frame;
    const inverse = new Quaternion(...frame.rotation).invert();
    const mode = transaction.settings.options.mode;
    let delta: Vec3;
    if (mode === 'translate')
      delta = this.proxy.position
        .clone()
        .sub(new Vector3(...frame.position))
        .applyQuaternion(inverse)
        .toArray();
    else if (mode === 'scale') delta = this.proxy.scale.toArray();
    else {
      // Preserve the selected axis past Euler's +/-90 degree Y branch and over a full turn.
      // rotationAngle is an observable property in the pinned source, omitted by the pinned types.
      const angle = (this.controls as TransformControls & { rotationAngle: number }).rotationAngle;
      const axis = this.controls.axis;
      delta =
        axis === 'X'
          ? [angle, 0, 0]
          : axis === 'Y'
            ? [0, angle, 0]
            : axis === 'Z'
              ? [0, 0, angle]
              : [NaN, NaN, NaN];
    }
    transaction.update(this.token, delta);
    this.applyPreview();
  }
  private releaseCapture() {
    const id = this.pointerId;
    this.pointerId = null; // lostpointercapture may be synchronous in an embedding.
    if (id !== null) {
      if (this.dependencies.canvas.hasPointerCapture(id))
        this.dependencies.canvas.releasePointerCapture(id);
      this.dependencies.orbit.enabled = this.previousOrbit;
    }
  }
  private applyPreview() {
    const transforms = new Map(
      this.dependencies.transaction.preview.nodes.map((n) => [n.id, n.transform]),
    );
    this.dependencies.root.traverse((object) => {
      const transform = transforms.get(object.userData.canonicalNodeId);
      if (!transform) return;
      object.position.fromArray(transform.translation);
      object.quaternion.fromArray(transform.rotation);
      object.scale.fromArray(transform.scale);
    });
    this.dependencies.root.updateMatrixWorld(true);
    this.dependencies.changed();
  }
  private syncProxy() {
    if (this.disposed) return;
    this.controls.detach();
    if (this.blocked.size) return;
    try {
      const transaction = this.dependencies.transaction,
        frame = transaction.frame;
      this.proxy.position.fromArray(frame.position);
      this.proxy.quaternion.fromArray(frame.rotation);
      this.proxy.scale.set(1, 1, 1);
      this.controls.setMode(transaction.settings.options.mode);
      this.controls.attach(this.proxy);
      this.dependencies.scene.updateMatrixWorld(true);
    } catch {
      /* Empty, locked or unrepresentable selection has no editable gizmo. */
    }
  }
  setContext(context: EditContext) {
    this.cancel('selection or options changed');
    this.dependencies.transaction.setContext(context);
    this.syncProxy();
    this.dependencies.changed();
  }
  setCamera(camera: Camera) {
    this.cancel('camera projection changed');
    this.dependencies.camera = camera;
    this.controls.camera = camera;
    this.syncProxy();
    this.dependencies.changed();
  }
  beginNumeric(): EditResult {
    this.cancel('numeric session');
    if (this.disposed || this.blocked.size || this.composing)
      return { ok: false, reason: 'Evaluation is inactive or composing' };
    try {
      this.token = this.dependencies.transaction.begin();
      this.dependencies.changed();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  updateNumeric(delta: Vec3): EditResult {
    if (!this.token) return { ok: false, reason: 'No numeric session' };
    const result = this.dependencies.transaction.update(this.token, delta);
    this.applyPreview();
    return result;
  }
  commitNumeric(): EditResult {
    if (!this.token) return { ok: false, reason: 'No numeric session' };
    const token = this.token;
    this.token = null;
    const result = this.dependencies.transaction.commit(token);
    this.applyPreview();
    this.syncProxy();
    return result;
  }
  cancel(reason = 'explicit cancel') {
    if (this.disposed) return;
    if (this.cameraPointers.size) {
      for (const id of this.cameraPointers) {
        this.ignoredPointers.add(id);
        if (this.dependencies.canvas.hasPointerCapture(id))
          this.dependencies.canvas.releasePointerCapture(id);
      }
      this.cameraPointers.clear();
      this.dependencies.resetCameraGesture?.();
    }
    // Invalidate ownership before reset emits objectChange and before pointerUp emits mouseUp.
    this.token = null;
    this.dependencies.transaction.cancel(reason);
    this.suppress = true;
    this.controls.reset();
    this.controls.pointerUp(normalizedPointer(0, 0, 0));
    this.controls.detach();
    this.suppress = false;
    if (this.pointerId !== null) this.ignoredPointers.add(this.pointerId);
    this.releaseCapture();
    this.picking = null;
    this.applyPreview();
    this.syncProxy();
  }
  setBlocked(reason: string, blocked: boolean) {
    if (this.disposed) return;
    if (blocked) this.blocked.add(reason);
    else this.blocked.delete(reason);
    this.cancel(reason);
    if (this.blocked.size) {
      this.blockedOrbitEnabled ??= this.dependencies.orbit.enabled;
      this.dependencies.orbit.enabled = false;
    } else if (this.blockedOrbitEnabled !== null) {
      this.dependencies.orbit.enabled = this.blockedOrbitEnabled;
      this.blockedOrbitEnabled = null;
    }
    this.syncProxy();
    this.dependencies.changed();
  }
  snapshot(kind: 'png' | 'save' | 'suspend'): Project3D {
    if (this.disposed) throw new Error('Evaluation is disposed');
    if (kind === 'png' && this.dependencies.transaction.active)
      throw new Error('PNG is blocked during transform preview');
    if (kind !== 'png') this.cancel(`${kind} snapshot`);
    return this.dependencies.transaction.history.project;
  }
  private keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.cancel('Escape');
      return;
    }
    const target = event.target as HTMLElement | null;
    if (event.isComposing || target?.matches?.('input,select,textarea,[contenteditable=true]'))
      return;
    if (target !== this.dependencies.canvas || this.disposed || this.blocked.size) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitNumeric();
      return;
    }
    const direction = (
      {
        ArrowLeft: [-1, 0, 0],
        ArrowRight: [1, 0, 0],
        ArrowUp: [0, 1, 0],
        ArrowDown: [0, -1, 0],
      } as Record<string, Vec3>
    )[event.key];
    if (!direction) return;
    event.preventDefault();
    const options = this.dependencies.transaction.settings.options;
    const step = options.snap ?? (options.mode === 'rotate' ? Math.PI / 12 : 0.1);
    if (!this.beginNumeric().ok) return;
    this.updateNumeric(direction.map((v) => (options.mode === 'scale' ? 1 : 0) + v * step) as Vec3);
    this.commitNumeric();
  }
  dispose() {
    if (this.disposed) return;
    this.cancel('dispose');
    this.disposed = true;
    this.cameraPointers.clear();
    this.ignoredPointers.clear();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.controls.removeEventListener('objectChange', this.objectChange);
    this.controls.removeEventListener('mouseUp', this.mouseUp);
    this.controls.detach();
    this.controls.getHelper().removeFromParent();
    this.proxy.removeFromParent();
    this.controls.dispose();
    this.dependencies.canvas.style.touchAction = this.oldTouchAction;
  }
}
