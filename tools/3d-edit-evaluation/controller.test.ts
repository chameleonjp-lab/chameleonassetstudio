import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildNativeGraph } from '../../src/adapters3d/three/renderer';
import { ProjectHistory } from '../../src/core3d/commands/history';
import { EditController, normalizedPointer } from './controller';
import { editFixture } from './fixtures';
import { TransformTransaction, type EditContext } from './transaction';

class Canvas extends EventTarget {
  style = { touchAction: 'pan-y' };
  ownerDocument = Object.assign(new EventTarget(), { hidden: false });
  clientHeight = 500;
  clientWidth = 800;
  getRootNode() {
    return this.ownerDocument;
  }
  captures = new Set<number>();
  getBoundingClientRect() {
    return { left: 75, top: 30, width: 800, height: 500 };
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
}
function event(type: string, data: Record<string, unknown> = {}) {
  const value = new Event(type, { cancelable: true });
  Object.assign(value, data);
  return value;
}
function setup(useRealOrbit = false) {
  const canvas = new Canvas(),
    document = canvas.ownerDocument,
    window = new EventTarget();
  const history = new ProjectHistory(editFixture(), undefined, true);
  const context: EditContext = {
    selection: ['box-node'],
    activeId: 'box-node',
    options: { mode: 'translate', space: 'world', snap: 0.5 },
    readOnly: false,
    lockedIds: [],
  };
  const transaction = new TransformTransaction(history, context);
  const graph = buildNativeGraph(history.project),
    scene = new Scene(),
    camera = new PerspectiveCamera(45, 1.6, 0.01, 100);
  camera.position.set(5, 4, 7);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.add(graph.root);
  let realOrbit: OrbitControls | null = null;
  let cameraEnabled = true;
  const orbit = {
      get enabled() {
        return realOrbit?.enabled ?? cameraEnabled;
      },
      set enabled(value: boolean) {
        cameraEnabled = value;
        if (realOrbit) realOrbit.enabled = value;
      },
    },
    changed = vi.fn();
  const controller = new EditController({
    canvas: canvas as unknown as HTMLCanvasElement,
    document,
    window,
    camera,
    scene,
    root: graph.root,
    transaction,
    orbit,
    resetCameraGesture: () => {
      realOrbit?.disconnect();
      realOrbit?.connect(canvas as unknown as HTMLCanvasElement);
    },
    changed,
  });
  // EventTarget has no DOM phases. Register Orbit after capture handlers, then
  // forward unconsumed events to document to reproduce browser propagation.
  if (useRealOrbit) realOrbit = new OrbitControls(camera, canvas as unknown as HTMLCanvasElement);
  const emit = (type: string, data: Record<string, unknown> = {}) => {
    const fields = {
      pointerId: 7,
      button: 0,
      pointerType: 'mouse',
      pageX: data.clientX ?? 0,
      pageY: data.clientY ?? 0,
      ...data,
    };
    const sample = event(type, fields);
    const result = canvas.dispatchEvent(sample);
    if (useRealOrbit && !sample.defaultPrevented) document.dispatchEvent(event(type, fields));
    if (type === 'pointerup' || type === 'pointercancel')
      canvas.captures.delete(fields.pointerId as number);
    return result;
  };
  function handle() {
    scene.updateMatrixWorld(true);
    const center = controller.proxy.getWorldPosition(new Vector3()).project(camera);
    const cx = (center.x + 1) * 400,
      cy = (1 - center.y) * 250;
    for (let r = 35; r < 150; r += 3)
      for (let a = 0; a < Math.PI * 2; a += 0.08) {
        const x = cx + Math.cos(a) * r,
          y = cy + Math.sin(a) * r;
        controller.controls.pointerHover(normalizedPointer(x / 400 - 1, 1 - y / 250, 0));
        if (controller.controls.axis === 'X') return { clientX: x + 75, clientY: y + 30 };
      }
    throw new Error('No X handle');
  }
  function drag() {
    const point = handle();
    emit('pointerdown', point);
    expect(transaction.active).toBe(true);
    expect(controller.controls.dragging).toBe(true);
    controller.proxy.position.x += 0.7;
    controller.controls.dispatchEvent({ type: 'objectChange' });
    expect(transaction.preview.nodes[0].transform.translation[0]).toBeCloseTo(-0.75);
    return point;
  }
  function cleanup() {
    controller.dispose();
    realOrbit?.dispose();
    graph.dispose();
  }
  return {
    canvas,
    document,
    window,
    history,
    context,
    transaction,
    graph,
    scene,
    camera,
    orbit,
    realOrbit,
    controller,
    emit,
    drag,
    handle,
    cleanup,
  };
}

describe('evaluation controller: pinned addon and transaction boundary', () => {
  it('keeps two camera touches owned by real OrbitControls even when the second lands on a gizmo', () => {
    const f = setup(true);
    const point = f.handle();
    f.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    f.emit('pointerdown', { pointerId: 2, pointerType: 'touch', ...point });
    expect(f.transaction.active).toBe(false);
    expect(f.orbit.enabled).toBe(true);
    expect(f.controller.diagnostics.cameraPointers).toBe(2);
    f.emit('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    f.emit('pointerup', { pointerId: 2, pointerType: 'touch', ...point });
    const source = f.realOrbit as OrbitControls & { _pointers: number[]; state: number };
    expect(source._pointers).toEqual([]);
    expect(source.state).toBe(-1);
    expect(f.controller.diagnostics.cameraPointers).toBe(0);
    expect(f.history.revision).toBe(0);
    f.cleanup();
  });

  it('a camera gesture cancelled by lifecycle leaves real OrbitControls with no retained pointer', () => {
    const f = setup(true);
    f.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    f.controller.setBlocked('hidden', true);
    const source = f.realOrbit as OrbitControls & { _pointers: number[]; state: number };
    expect(source._pointers).toEqual([]);
    expect(source.state).toBe(-1);
    f.emit('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    f.controller.setBlocked('hidden', false);
    expect(f.controller.diagnostics.cameraPointers).toBe(0);
    f.cleanup();
  });

  it('blocked input cannot start an untracked Orbit gesture, and nested blocks restore camera navigation', () => {
    const f = setup(true);
    f.controller.setBlocked('suspend', true);
    f.controller.setBlocked('context loss', true);
    f.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    const source = f.realOrbit as OrbitControls & { _pointers: number[]; state: number };
    expect(source._pointers).toEqual([]);
    expect(f.orbit.enabled).toBe(false);
    expect(f.controller.diagnostics.cameraPointers).toBe(0);
    f.emit('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 35 });
    f.controller.setBlocked('suspend', false);
    expect(f.orbit.enabled).toBe(false);
    f.controller.setBlocked('context loss', false);
    expect(f.orbit.enabled).toBe(true);
    f.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 80, clientY: 35 });
    expect(source._pointers).toEqual([2]);
    f.emit('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 80, clientY: 35 });
    expect(source._pointers).toEqual([]);
    f.cleanup();
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    '%s clears a pending canvas pick before a late release',
    (reason) => {
      const f = setup();
      const target = f.graph.root.getObjectByName('Right box')!;
      const point = target.getWorldPosition(new Vector3()).project(f.camera);
      const position = { clientX: 75 + (point.x + 1) * 400, clientY: 30 + (1 - point.y) * 250 };
      f.emit('pointerdown', position);
      f.emit(reason);
      f.emit('pointerup', position);
      expect(f.transaction.settings.selection).toEqual(['box-node']);
      f.cleanup();
    },
  );

  it('drives real TransformControls with exclusive capture and camera arbitration', () => {
    const f = setup();
    const point = f.handle();
    const cameraDown = vi.fn();
    f.canvas.addEventListener('pointerdown', cameraDown);
    f.emit('pointerdown', point);
    expect(cameraDown).not.toHaveBeenCalled();
    expect(f.orbit.enabled).toBe(false);
    expect(f.canvas.captures.size).toBe(1);
    f.emit('pointermove', { ...point, clientX: point.clientX + 45, button: -1 });
    expect(f.history.revision).toBe(0);
    expect(f.history.dirty).toBe(false);
    expect(f.transaction.preview).not.toEqual(f.history.project);
    f.emit('pointerup', { ...point, clientX: point.clientX + 45 });
    expect(f.history.revision).toBe(1);
    expect(f.transaction.commits).toBe(1);
    expect(f.orbit.enabled).toBe(true);
    expect(f.canvas.captures.size).toBe(0);
    f.emit('pointerup', point);
    expect(f.history.revision).toBe(1);
    f.cleanup();
  });

  it.each([
    'pointercancel',
    'lostpointercapture',
    'second pointer',
    'Escape',
    'explicit cancel',
    'mode',
    'selection',
    'hidden',
    'freeze',
    'pagehide',
    'context loss',
    'dispose',
  ])('%s invalidates before stock reset and ignores late mouseUp', (reason) => {
    const f = setup();
    const original = f.history.project;
    f.drag();
    const observed: boolean[] = [];
    f.controller.controls.addEventListener('objectChange', () =>
      observed.push(f.transaction.active),
    );
    if (reason === 'pointercancel' || reason === 'lostpointercapture') f.emit(reason);
    else if (reason === 'second pointer') f.emit('pointerdown', { pointerId: 8 });
    else if (reason === 'Escape') f.window.dispatchEvent(event('keydown', { key: 'Escape' }));
    else if (reason === 'explicit cancel') f.controller.cancel();
    else if (reason === 'mode')
      f.controller.setContext({ ...f.context, options: { ...f.context.options, mode: 'rotate' } });
    else if (reason === 'selection')
      f.controller.setContext({ ...f.context, selection: ['right-node'], activeId: 'right-node' });
    else if (reason === 'hidden') {
      f.document.hidden = true;
      f.document.dispatchEvent(event('visibilitychange'));
    } else if (reason === 'freeze') f.document.dispatchEvent(event('freeze'));
    else if (reason === 'pagehide') f.window.dispatchEvent(event('pagehide'));
    else if (reason === 'context loss') f.emit('webglcontextlost');
    else f.controller.dispose();
    expect(observed).toContain(false);
    expect(observed).not.toContain(true);
    f.controller.controls.dispatchEvent({ type: 'mouseUp', mode: 'translate' });
    f.emit('pointerup', { clientX: 400, clientY: 200 });
    expect(f.history.project).toEqual(original);
    expect(f.history.canUndo).toBe(false);
    expect(f.transaction.active).toBe(false);
    expect(f.controller.controls.dragging).toBe(false);
    expect(f.canvas.captures.size).toBe(0);
    expect(f.orbit.enabled).toBe(
      !['hidden', 'freeze', 'pagehide', 'context loss'].includes(reason),
    );
    f.cleanup();
  });

  it('invalid pointer release cannot commit an older valid move', () => {
    const f = setup();
    f.drag();
    f.emit('pointerup', { clientX: NaN, clientY: 80 });
    expect(f.history.revision).toBe(0);
    expect(f.history.canUndo).toBe(false);
    expect(f.controller.diagnostics.reason).toMatch(/invalid/);
    f.cleanup();
  });

  it('a finite in-canvas release that misses the drag plane invalidates the previous preview', () => {
    const f = setup();
    f.camera.position.set(8, 2, 2);
    f.camera.lookAt(0, 0, 0);
    f.camera.updateMatrixWorld();
    const point = f.handle();
    f.emit('pointerdown', point);
    f.emit('pointermove', { ...point, clientX: point.clientX + 10, button: -1 });
    expect(f.transaction.preview).not.toEqual(f.history.project);
    f.emit('pointerup', { clientX: 76, clientY: 31 });
    expect(f.history.revision).toBe(0);
    expect(f.history.canUndo).toBe(false);
    expect(f.transaction.preview).toEqual(f.history.project);
    f.cleanup();
  });

  it('late stock events from a cancelled gesture cannot mutate or commit a newer numeric session', () => {
    const f = setup();
    f.drag();
    f.controller.cancel();
    f.controller.beginNumeric();
    f.controller.updateNumeric([2, 0, 0]);
    const preview = f.transaction.preview;
    f.controller.proxy.position.x += 5;
    f.controller.controls.dispatchEvent({ type: 'objectChange' });
    f.controller.controls.dispatchEvent({ type: 'mouseUp', mode: 'translate' });
    expect(f.transaction.active).toBe(true);
    expect(f.transaction.preview).toEqual(preview);
    expect(f.history.revision).toBe(0);
    f.controller.commitNumeric();
    expect(f.history.revision).toBe(1);
    f.cleanup();
  });

  it('keeps addon snapping disabled and shares canonical snapping with numeric delta', () => {
    const f = setup();
    expect([
      f.controller.controls.translationSnap,
      f.controller.controls.rotationSnap,
      f.controller.controls.scaleSnap,
    ]).toEqual([null, null, null]);
    f.drag();
    const pointerPreview = f.transaction.preview;
    f.controller.cancel();
    expect(f.controller.beginNumeric()).toEqual({ ok: true });
    f.controller.updateNumeric([0.7, 0, 0]);
    expect(f.transaction.preview).toEqual(pointerPreview);
    expect(f.controller.commitNumeric()).toEqual({ ok: true, changed: true });
    expect(f.history.revision).toBe(1);
    f.cleanup();
  });

  it('uses an identity world-scale proxy for rotated objects, rejecting shear without data loss', () => {
    const f = setup();
    f.history.execute((project) => {
      project.nodes[0].transform.rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
    });
    const original = f.history.project;
    f.controller.setContext({
      ...f.context,
      options: { mode: 'scale', space: 'world', snap: null },
    });
    expect(f.controller.proxy.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(f.controller.proxy.scale.toArray()).toEqual([1, 1, 1]);
    expect(f.controller.controls.space).toBe('local');
    f.controller.beginNumeric();
    expect(f.controller.updateNumeric([2, 1, 1])).toMatchObject({ ok: false });
    expect(f.controller.commitNumeric()).toMatchObject({ ok: false });
    expect(f.history.project).toEqual(original);
    f.cleanup();
  });

  it('snaps single-axis pointer rotation consistently past 90 degrees and beyond a full turn', () => {
    const f = setup();
    for (const angle of [2.1, 7.2, -7.2]) {
      f.controller.setContext({
        ...f.context,
        options: { mode: 'rotate', space: 'world', snap: 0.5 },
      });
      const point = f.handle();
      f.emit('pointerdown', point);
      f.controller.controls.axis = 'Y';
      Object.assign(f.controller.controls, { rotationAngle: angle });
      f.controller.controls.dispatchEvent({ type: 'objectChange' });
      const pointerPreview = f.transaction.preview;
      f.controller.cancel();
      f.emit('pointerup', point);
      f.controller.beginNumeric();
      f.controller.updateNumeric([0, angle, 0]);
      expect(f.transaction.preview).toEqual(pointerPreview);
      f.controller.cancel();
    }
    f.cleanup();
  });

  it('blocks PNG preview and cancels before save/suspend snapshots', () => {
    const f = setup();
    for (const kind of ['save', 'suspend'] as const) {
      f.controller.beginNumeric();
      f.controller.updateNumeric([3, 0, 0]);
      expect(() => f.controller.snapshot('png')).toThrow(/blocked/);
      expect(f.controller.snapshot(kind)).toEqual(f.history.project);
      expect(f.controller.commitNumeric()).toMatchObject({ ok: false });
      expect(f.transaction.preview).toEqual(f.history.project);
      expect(f.history.revision).toBe(0);
    }
    f.cleanup();
  });

  it('cancels numeric input on IME composition and blocks edits until composition ends', () => {
    const f = setup();
    f.controller.beginNumeric();
    f.controller.updateNumeric([2, 0, 0]);
    f.document.dispatchEvent(event('compositionstart'));
    expect(f.controller.beginNumeric()).toMatchObject({ ok: false });
    expect(f.controller.commitNumeric()).toMatchObject({ ok: false });
    f.document.dispatchEvent(event('compositionend'));
    expect(f.controller.beginNumeric()).toEqual({ ok: true });
    expect(f.history.revision).toBe(0);
    f.cleanup();
  });

  it('read-only and relevant locks leave selection intact and have no attached gizmo', () => {
    const f = setup();
    for (const context of [
      { ...f.context, readOnly: true },
      { ...f.context, lockedIds: ['box-node'] },
    ]) {
      f.controller.setContext(context);
      expect(f.controller.controls.object).toBeUndefined();
      expect(f.controller.beginNumeric()).toMatchObject({ ok: false });
      expect(f.transaction.settings.selection).toEqual(['box-node']);
    }
    expect(f.history.revision).toBe(0);
    f.cleanup();
  });

  it('repeated real helper disposal releases geometry, material, listener and capture ownership', () => {
    let baseline: { helperGeometries: number; helperMaterials: number; listeners: number } | null =
      null;
    for (let i = 0; i < 10; i++) {
      const f = setup();
      const current = f.controller.diagnostics;
      if (baseline === null)
        baseline = {
          helperGeometries: current.helperGeometries,
          helperMaterials: current.helperMaterials,
          listeners: current.listeners,
        };
      expect(current).toMatchObject(baseline);
      expect(current.helperGeometries).toBeGreaterThan(0);
      expect(current.helperMaterials).toBeGreaterThan(0);
      f.drag();
      f.cleanup();
      f.cleanup();
      expect(f.controller.diagnostics).toMatchObject({
        disposed: true,
        active: false,
        helperObjects: 0,
        helperGeometries: 0,
        helperMaterials: 0,
        listeners: 0,
        captures: 0,
      });
      expect(f.scene.children).toHaveLength(0);
      expect(f.canvas.style.touchAction).toBe('pan-y');
      f.window.dispatchEvent(event('keydown', { key: 'ArrowRight' }));
      expect(f.history.revision).toBe(0);
    }
  });
});
