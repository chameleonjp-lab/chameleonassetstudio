import { describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { smallProject } from '../../core3d/fixtures/project';
import { cloneProject, identityTransform, type Project3D } from '../../core3d/model/project';
import { transformPoint, worldMatrix } from '../../core3d/model/coordinates';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import {
  buildNativeGraph,
  checkNativeProfile,
  fitPerspectiveBounds,
  NativeViewport,
  type NativeCameraAction,
  type NativeViewportDependencies,
} from './renderer';

function triangle(): Project3D {
  const project = smallProject();
  project.skins = [];
  project.clips = [];
  return project;
}

describe('isolated native conversion (no WebGL)', () => {
  it('preserves corner UV/normal/material factors and canonical data', () => {
    const project = triangle();
    project.meshes[0].faces[0].normals = [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ];
    project.materials[0].baseColor[3] = 0.5;
    project.materials[0].metallic = 0.7;
    const before = cloneProject(project);
    const graph = buildNativeGraph(project);
    const mesh = graph.root.children[0] as Mesh;
    expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
    expect(Array.from(mesh.geometry.getAttribute('uv').array)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(mesh.geometry.getAttribute('normal').array)).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
    expect(graph.materials[0].color.toArray()).toEqual([0.2, 0.4, 0.6]);
    expect(graph.materials[0]).toMatchObject({
      metalness: 0.7,
      roughness: 0.5,
      opacity: 0.5,
      transparent: true,
    });
    expect(mesh.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 0 }]);
    const disposeGeometry = vi.spyOn(graph.geometries[0], 'dispose');
    const disposeMaterial = vi.spyOn(graph.materials[0], 'dispose');
    graph.dispose();
    graph.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(project).toEqual(before);
  });

  it('matches canonical parent × T × R × S and shares one geometry across node instances', () => {
    const project = triangle();
    project.nodes[0].parentId = 'joint-a';
    project.nodes[0].transform.translation = [1, 2, 3];
    project.nodes[0].transform.scale = [2, 1, 0.5];
    project.nodes[1].transform.translation = [10, -4, 2];
    project.nodes[1].transform.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    project.nodes[1].transform.scale = [1, 2, 3];
    project.nodes.push({
      id: 'instance',
      name: 'Instance',
      parentId: null,
      transform: identityTransform(),
      meshId: 'mesh-one',
    });
    const graph = buildNativeGraph(project);
    const object = graph.root.getObjectByName('Triangle')!;
    const actual = new Vector3(1, 0, 0).applyMatrix4(object.matrixWorld).toArray();
    const expected = transformPoint(worldMatrix(project, 'shape'), [1, 0, 0]);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 12));
    expect(graph.geometries).toHaveLength(1);
    expect(graph.materials).toHaveLength(1);
    expect((graph.root.getObjectByName('Instance') as Mesh).geometry).toBe(
      (object as Mesh).geometry,
    );
    graph.dispose();
  });

  it('builds the hand-authored box with twelve native triangles', () => {
    const graph = buildNativeGraph(nativeBox());
    expect(graph.geometries[0].getAttribute('position').count).toBe(36);
    expect(graph.geometries[0].groups).toEqual([{ start: 0, count: 36, materialIndex: 0 }]);
    const box = new Box3().setFromObject(graph.root);
    expect(box.isEmpty()).toBe(false);
    expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true);
    graph.dispose();
  });

  it('batches adjacent same-material triangles without changing corner or material ordering', () => {
    const project = nativeBox();
    project.materials.push({ id: 'red', baseColor: [1, 0, 0, 1], metallic: 0.8, roughness: 0.3 });
    project.meshes[0].faces = project.meshes[0].faces.slice(0, 4);
    project.meshes[0].faces[2].materialId = 'red';
    const graph = buildNativeGraph(project);
    expect(graph.geometries[0].groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 3, materialIndex: 1 },
      { start: 9, count: 3, materialIndex: 0 },
    ]);
    expect(graph.materials[1].metalness).toBe(0.8);
    graph.dispose();
  });

  it('rejects all unsupported features explicitly rather than displaying a silent subset', () => {
    const animated = smallProject();
    expect(checkNativeProfile(animated)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('skins, animation clips'),
    });
    const textured = triangle();
    textured.blobIds = ['a'.repeat(64)];
    textured.materials[0].textureBlobId = textured.blobIds[0];
    expect(checkNativeProfile(textured)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('textures'),
    });
    const quad = triangle();
    quad.meshes[0].vertices.push({ id: 'v3', position: [1, 1, 0] });
    quad.meshes[0].faces[0] = { id: 'quad', vertexIds: ['v0', 'v1', 'v3', 'v2'] };
    expect(checkNativeProfile(quad)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('non-triangle'),
    });
    expect(() => buildNativeGraph(quad)).toThrow('non-triangle');
  });

  it('fails before GPU construction for invalid, Float32-overflowing, or transformed-overflowing data', () => {
    const project = triangle();
    project.meshes[0].vertices[0].position[0] = NaN;
    expect(checkNativeProfile(project)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Invalid canonical'),
    });
    project.meshes[0].vertices[0].position[0] = 1e40;
    expect(checkNativeProfile(project)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Float32'),
    });
    project.meshes[0].vertices[0].position[0] = 1e30;
    project.nodes[0].transform.scale[0] = 1e30;
    expect(checkNativeProfile(project)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Transformed geometry'),
    });
  });

  it('checks native hierarchy depth at the compact evaluation boundary before conversion', () => {
    const project = triangle();
    project.nodes = Array.from({ length: 64 }, (_, index) => ({
      id: `node-${index}`,
      name: 'Node',
      parentId: index ? `node-${index - 1}` : null,
      transform: identityTransform(),
    }));
    expect(checkNativeProfile(project)).toEqual({ ok: true });
    project.nodes.push({
      id: 'too-deep',
      name: 'Node',
      parentId: 'node-63',
      transform: identityTransform(),
    });
    expect(checkNativeProfile(project)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('depth'),
    });
  });
});

describe('camera fit math', () => {
  it.each([0.3, 1, 3])('fits every transformed box corner in aspect %s', (aspect) => {
    const bounds = {
      min: [-8, -3, -2] as [number, number, number],
      max: [4, 7, 5] as [number, number, number],
    };
    const fit = fitPerspectiveBounds(bounds, aspect);
    const camera = new PerspectiveCamera(45, aspect, fit.near, fit.far);
    camera.position.fromArray(fit.position);
    camera.lookAt(new Vector3(...fit.target));
    camera.updateMatrixWorld(true);
    for (const x of [bounds.min[0], bounds.max[0]])
      for (const y of [bounds.min[1], bounds.max[1]])
        for (const z of [bounds.min[2], bounds.max[2]]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(Math.abs(projected.z)).toBeLessThan(1);
        }
  });

  it('handles point bounds and rejects invalid camera/bounds instead of producing NaN', () => {
    const bounds = {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
    };
    expect(fitPerspectiveBounds(bounds, 1).position.every(Number.isFinite)).toBe(true);
    expect(() => fitPerspectiveBounds(bounds, 0)).toThrow();
    expect(() => fitPerspectiveBounds({ ...bounds, min: [1, 0, 0] }, 1)).toThrow();
  });
});

class CanvasDouble extends EventTarget {
  style: Record<string, string> = {};
  parent: CanvasDouble[] | null = null;
  available = true;
  loseContext = vi.fn();
  context = { getExtension: vi.fn(() => ({ loseContext: this.loseContext })) };
  captured = new Set<number>();
  setAttribute = vi.fn();
  getContext = vi.fn(() => (this.available ? this.context : null));
  hasPointerCapture = (id: number) => this.captured.has(id);
  releasePointerCapture = vi.fn((id: number) => this.captured.delete(id));
  toBlob = vi.fn((callback: BlobCallback) =>
    callback(new Blob(['fake PNG'], { type: 'image/png' })),
  );
  remove() {
    if (this.parent) this.parent.splice(this.parent.indexOf(this), 1);
    this.parent = null;
  }
}

function lifecycleHarness(webgl2Available = true) {
  const pending = new Map<number, FrameRequestCallback>();
  const children: CanvasDouble[] = [];
  const allCanvases: CanvasDouble[] = [];
  let nextFrame = 0;
  const view = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    defaultView: view,
    createElement: () => {
      const canvas = new CanvasDouble();
      canvas.available = webgl2Available;
      allCanvases.push(canvas);
      return canvas;
    },
  });
  const host = {
    ownerDocument: document,
    appendChild: (canvas: CanvasDouble) => {
      children.push(canvas);
      canvas.parent = children;
    },
    getBoundingClientRect: () => ({ width: 640, height: 480 }),
  } as unknown as HTMLElement;
  const rendererInstances: {
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    forceContextLoss: ReturnType<typeof vi.fn>;
  }[] = [];
  const controlInstances: {
    target: Vector3;
    camera: PerspectiveCamera;
    enabled: boolean;
    enableDamping: boolean;
    autoRotate: boolean;
    update: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    change(): void;
  }[] = [];
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const dependencies: NativeViewportDependencies = {
    createRenderer: vi.fn(() => {
      const renderer = {
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        forceContextLoss: vi.fn(),
      };
      rendererInstances.push(renderer);
      return renderer;
    }),
    createControls: (camera) => {
      const listeners = new Set<() => void>();
      const controls = {
        camera,
        target: new Vector3(),
        enabled: true,
        enableDamping: false,
        autoRotate: false,
        update: vi.fn(),
        dispose: vi.fn(),
        addEventListener: (_type: 'change', listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: 'change', listener: () => void) => {
          listeners.delete(listener);
        },
        change: () => listeners.forEach((listener) => listener()),
      };
      controlInstances.push(controls);
      return controls;
    },
    requestFrame: (callback) => {
      pending.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelFrame: (id) => {
      pending.delete(id);
    },
    createResizeObserver: () => observer,
  };
  const onStatus = vi.fn();
  const viewport = new NativeViewport(host, { dependencies, onStatus });
  const flush = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(0));
  };
  return {
    viewport,
    pending,
    children,
    allCanvases,
    rendererInstances,
    controlInstances,
    observer,
    onStatus,
    document,
    view,
    flush,
    dependencies,
  };
}

describe('accessible native camera actions', () => {
  const actions: NativeCameraAction[] = [
    'orbit-left',
    'orbit-right',
    'orbit-up',
    'orbit-down',
    'pan-left',
    'pan-right',
    'pan-up',
    'pan-down',
    'zoom-in',
    'zoom-out',
  ];

  it.each<{
    action: NativeCameraAction;
    position: [number, number, number];
    target: [number, number, number];
  }>([
    { action: 'orbit-left', position: [-2.588190451, 0, 9.659258263], target: [0, 0, 0] },
    { action: 'orbit-right', position: [2.588190451, 0, 9.659258263], target: [0, 0, 0] },
    { action: 'orbit-up', position: [0, 2.588190451, 9.659258263], target: [0, 0, 0] },
    { action: 'orbit-down', position: [0, -2.588190451, 9.659258263], target: [0, 0, 0] },
    { action: 'pan-left', position: [-1, 0, 10], target: [-1, 0, 0] },
    { action: 'pan-right', position: [1, 0, 10], target: [1, 0, 0] },
    { action: 'pan-up', position: [0, 1, 10], target: [0, 1, 0] },
    { action: 'pan-down', position: [0, -1, 10], target: [0, -1, 0] },
    { action: 'zoom-in', position: [0, 0, 8.333333333], target: [0, 0, 0] },
    { action: 'zoom-out', position: [0, 0, 12], target: [0, 0, 0] },
  ])('$action moves only the camera and coalesces one frame', ({ action, position, target }) => {
    const { viewport, controlInstances, pending, flush } = lifecycleHarness();
    const project = triangle();
    const before = cloneProject(project);
    viewport.setProject(project);
    const controls = controlInstances[0];
    controls.camera.position.set(0, 0, 10);
    controls.target.set(0, 0, 0);
    controls.camera.lookAt(controls.target);
    controls.change();
    flush();
    const listeners = viewport.diagnostics.listeners;
    expect(viewport.cameraAction(action)).toEqual({ ok: true });
    viewport.diagnostics.camera.position.forEach((value, index) =>
      expect(value).toBeCloseTo(position[index], 8),
    );
    viewport.diagnostics.camera.target.forEach((value, index) =>
      expect(value).toBeCloseTo(target[index], 8),
    );
    expect(controls.target.toArray()).toEqual(viewport.diagnostics.camera.target);
    expect(controls).toMatchObject({ enabled: true, enableDamping: false, autoRotate: false });
    expect(controlInstances).toHaveLength(1);
    expect(viewport.diagnostics.listeners).toBe(listeners);
    expect(controls.dispose).not.toHaveBeenCalled();
    expect(pending.size).toBe(1);
    flush();
    flush();
    expect(viewport.diagnostics).toMatchObject({ framesRendered: 2, pendingFrames: 0 });
    expect(project).toEqual(before);
    viewport.dispose();
  });

  it('pans in camera screen axes after orbit and preserves the view through resume', () => {
    const { viewport, controlInstances } = lifecycleHarness();
    viewport.setProject(triangle());
    const controls = controlInstances[0];
    controls.camera.position.set(10, 0, 0);
    controls.target.set(0, 0, 0);
    controls.camera.lookAt(controls.target);
    controls.change();
    viewport.cameraAction('pan-right');
    expect(viewport.diagnostics.camera.position).toEqual([10, 0, -1]);
    expect(viewport.diagnostics.camera.target).toEqual([0, 0, -1]);
    const view = viewport.diagnostics.camera;
    viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    viewport.resume();
    expect(viewport.diagnostics.camera).toEqual(view);
    viewport.dispose();
  });

  it('bounds repeated zoom and pole rotation while keeping every result finite', () => {
    const { viewport, controlInstances, pending } = lifecycleHarness();
    viewport.setProject(triangle());
    const { camera, target } = controlInstances[0];
    for (let index = 0; index < 200; index++) viewport.cameraAction('zoom-in');
    expect(camera.position.distanceTo(target)).toBeCloseTo(camera.near * 2, 8);
    for (let index = 0; index < 200; index++) viewport.cameraAction('zoom-out');
    expect(camera.position.distanceTo(target)).toBeCloseTo(camera.far / 2, 8);
    const distance = camera.position.distanceTo(target);
    for (let index = 0; index < 100; index++) viewport.cameraAction('orbit-up');
    expect(camera.position.distanceTo(target)).toBeCloseTo(distance, 8);
    expect(camera.position.y - target.y).toBeCloseTo(distance, 5);
    expect([...camera.position.toArray(), ...target.toArray()].every(Number.isFinite)).toBe(true);
    expect(pending.size).toBe(1);
    viewport.dispose();
  });

  it.each([
    'empty',
    'hidden',
    'frozen',
    'suspended',
    'context-lost',
    'unavailable',
    'unsupported',
    'error',
    'disposed',
  ])('rejects all camera actions in %s state without mutation or frames', (state) => {
    const { viewport, allCanvases, rendererInstances, pending, flush } = lifecycleHarness(
      state !== 'unavailable',
    );
    if (state !== 'empty') viewport.setProject(triangle());
    if (state === 'hidden') viewport.setHidden(true);
    if (state === 'frozen') viewport.setFrozen(true);
    if (state === 'suspended')
      viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    if (state === 'context-lost')
      allCanvases[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    if (state === 'unsupported') viewport.setProject(smallProject());
    if (state === 'error') {
      rendererInstances[0].render.mockImplementationOnce(() => {
        throw new Error('GPU error');
      });
      flush();
    }
    if (state === 'disposed') viewport.dispose();
    const before = viewport.diagnostics;
    expect(before.state).toBe(state);
    actions.forEach((action) => expect(viewport.cameraAction(action).ok).toBe(false));
    expect(viewport.diagnostics).toEqual(before);
    expect(pending.size).toBe(0);
    viewport.dispose();
  });

  it('rejects invalid action and nonfinite camera input before touching controls', () => {
    const { viewport, controlInstances, pending, flush } = lifecycleHarness();
    viewport.setProject(triangle());
    flush();
    const controls = controlInstances[0];
    const before = viewport.diagnostics.camera;
    const updates = controls.update.mock.calls.length;
    expect(viewport.cameraAction('invalid' as NativeCameraAction).ok).toBe(false);
    expect(viewport.diagnostics.camera).toEqual(before);
    controls.camera.position.x = Infinity;
    expect(viewport.cameraAction('pan-right').ok).toBe(false);
    expect(controls.update).toHaveBeenCalledTimes(updates);
    expect(pending.size).toBe(0);
    viewport.dispose();
  });

  it('rejects zoom when a distant target would round the position into the target', () => {
    const { viewport, controlInstances, flush, pending } = lifecycleHarness();
    viewport.setProject(triangle());
    const controls = controlInstances[0];
    controls.camera.position.set(1e20 + 100_000, 0, 0);
    controls.target.set(1e20, 0, 0);
    controls.change();
    flush();
    const before = viewport.diagnostics.camera;
    expect(viewport.cameraAction('zoom-in').ok).toBe(false);
    expect(viewport.diagnostics.camera).toEqual(before);
    expect(pending.size).toBe(0);
    viewport.dispose();
  });
});

describe('native lifecycle ownership (injected renderer, not GPU evidence)', () => {
  it('coalesces requests and has no perpetual idle RAF', () => {
    const { viewport, flush, pending, controlInstances } = lifecycleHarness();
    expect(viewport.setProject(triangle())).toEqual({ ok: true });
    viewport.resize(800, 400);
    viewport.resetCamera();
    expect(pending.size).toBe(1);
    flush();
    expect(viewport.diagnostics).toMatchObject({
      framesRendered: 1,
      pendingFrames: 0,
      controls: 1,
      camera: { aspect: 2 },
    });
    flush();
    expect(viewport.diagnostics.framesRendered).toBe(1);
    controlInstances[0].change();
    expect(pending.size).toBe(1);
    flush();
    expect(viewport.diagnostics.framesRendered).toBe(2);
    viewport.dispose();
  });

  it('stops interaction and pending frames for hidden/freeze, releases a captured drag, and respects overlapping states', () => {
    const { viewport, flush, allCanvases, controlInstances } = lifecycleHarness();
    viewport.setProject(triangle());
    const canvas = allCanvases[0];
    canvas.captured.add(12);
    canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerId: 12 }));
    viewport.setHidden(true);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(12);
    expect(controlInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(viewport.diagnostics).toMatchObject({ state: 'hidden', controls: 0, pendingFrames: 0 });
    viewport.resetCamera();
    viewport.resize();
    flush();
    expect(viewport.diagnostics.framesRendered).toBe(0);
    viewport.setFrozen(true);
    viewport.setHidden(false);
    expect(viewport.diagnostics.state).toBe('frozen');
    expect(viewport.diagnostics.pendingFrames).toBe(0);
    viewport.setFrozen(false);
    flush();
    expect(viewport.diagnostics).toMatchObject({
      state: 'active',
      framesRendered: 1,
      controls: 1,
      pendingFrames: 0,
    });
    viewport.dispose();
  });

  it('handles native visibility, freeze, and BFCache events without duplicated controls/listeners', () => {
    const { viewport, document, view, flush } = lifecycleHarness();
    viewport.setProject(triangle());
    flush();
    const activeListeners = viewport.diagnostics.listeners;
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    viewport.setHidden(false);
    expect(viewport.diagnostics.state).toBe('hidden');
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
    view.dispatchEvent(new Event('pagehide'));
    expect(viewport.diagnostics.state).toBe('hidden');
    view.dispatchEvent(new Event('pageshow'));
    view.dispatchEvent(new Event('pageshow'));
    expect(viewport.diagnostics).toMatchObject({
      controls: 1,
      listeners: activeListeners,
      pendingFrames: 1,
    });
    flush();
    viewport.dispose();
  });

  it('gates GPU disposal on exact saved/displayed/current revision and complete sources', () => {
    const { viewport } = lifecycleHarness();
    const project = triangle();
    project.revision = 5;
    viewport.setProject(project);
    for (const contract of [
      { persistedRevision: null, currentRevision: 5, sourcesComplete: true },
      { persistedRevision: 4, currentRevision: 5, sourcesComplete: true },
      { persistedRevision: 4, currentRevision: 4, sourcesComplete: true },
      { persistedRevision: 5, currentRevision: 5, sourcesComplete: false },
    ]) {
      expect(viewport.suspend(contract).ok).toBe(false);
      expect(viewport.diagnostics).toMatchObject({
        renderers: 1,
        geometries: 1,
        disposedRenderers: 0,
      });
    }
    expect(
      viewport.suspend({ persistedRevision: 5, currentRevision: 5, sourcesComplete: true }),
    ).toEqual({ ok: true });
    expect(viewport.diagnostics).toMatchObject({
      state: 'suspended',
      renderers: 0,
      geometries: 0,
      materials: 0,
      controls: 0,
      canvases: 0,
      pendingFrames: 0,
    });
    viewport.dispose();
  });

  it('rebuilds from its private canonical snapshot and preserves the camera through suspend/resume', () => {
    const { viewport, controlInstances, rendererInstances, children, flush } = lifecycleHarness();
    const project = triangle();
    viewport.setProject(project);
    controlInstances[0].camera.position.set(4, 3, 8);
    controlInstances[0].target.set(0.1, 0.2, 0.3);
    controlInstances[0].change();
    const camera = viewport.diagnostics.camera;
    project.nodes[0].transform.translation[0] = 99;
    viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    expect(viewport.resume()).toEqual({ ok: true });
    flush();
    expect(children).toHaveLength(1);
    expect(viewport.diagnostics.camera).toEqual(camera);
    const scene = rendererInstances[1].render.mock.calls[0][0];
    expect(scene.getObjectByName('Triangle').position.x).toBe(0);
    expect(viewport.diagnostics).toMatchObject({
      rebuilds: 2,
      disposedRenderers: 1,
      disposedGeometries: 1,
    });
    viewport.dispose();
  });

  it('does not reuse a stale pause certificate after a project revision changes', () => {
    const { viewport } = lifecycleHarness();
    const project = triangle();
    viewport.setProject(project);
    viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    project.revision = 1;
    viewport.setProject(project);
    expect(viewport.resume().ok).toBe(false);
    expect(viewport.diagnostics.renderers).toBe(0);
    expect(
      viewport.resume({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true }).ok,
    ).toBe(true);
    viewport.dispose();
  });

  it('preserves same-project camera edits and defers fitting a project switched while suspended', () => {
    const { viewport, controlInstances } = lifecycleHarness();
    const project = triangle();
    viewport.setProject(project);
    controlInstances[0].camera.position.set(4, 3, 8);
    controlInstances[0].target.set(0.1, 0.2, 0.3);
    controlInstances[0].change();
    const camera = viewport.diagnostics.camera;
    project.revision++;
    project.nodes[0].transform.translation[0] = 2;
    viewport.setProject(project);
    expect(viewport.diagnostics.camera).toEqual(camera);
    viewport.suspend({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true });
    project.id = 'new-project';
    project.nodes[0].transform.translation[0] = 100;
    viewport.setProject(project);
    expect(viewport.diagnostics.camera).toEqual(camera);
    expect(
      viewport.resume({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true }).ok,
    ).toBe(true);
    expect(viewport.diagnostics.camera.target[0]).toBeCloseTo(100.5);
    viewport.dispose();
  });

  it('can retry a transient renderer construction failure on resume and releases the raw context', () => {
    const { viewport, dependencies, allCanvases } = lifecycleHarness();
    viewport.setProject(triangle());
    viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    vi.mocked(dependencies.createRenderer).mockImplementationOnce(() => {
      throw new Error('temporary allocation failure');
    });
    expect(viewport.resume().ok).toBe(false);
    expect(allCanvases[1].loseContext).toHaveBeenCalledTimes(1);
    expect(viewport.diagnostics).toMatchObject({
      state: 'unavailable',
      renderers: 0,
      contexts: 0,
      canvases: 0,
      geometries: 0,
    });
    expect(viewport.resume()).toEqual({ ok: true });
    expect(viewport.diagnostics).toMatchObject({
      state: 'active',
      renderers: 1,
      contexts: 1,
      geometries: 1,
    });
    viewport.dispose();
  });

  it('reconstructs after context loss, preserving view and canceling the old canvas ownership', () => {
    const { viewport, allCanvases, controlInstances, flush } = lifecycleHarness();
    viewport.setProject(triangle());
    flush();
    controlInstances[0].camera.position.set(4, 3, 8);
    controlInstances[0].target.set(0.1, 0.2, 0.3);
    controlInstances[0].change();
    const camera = viewport.diagnostics.camera;
    const lost = new Event('webglcontextlost', { cancelable: true });
    allCanvases[0].dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(viewport.diagnostics).toMatchObject({
      state: 'context-lost',
      contextLosses: 1,
      controls: 0,
      pendingFrames: 0,
    });
    flush();
    expect(viewport.diagnostics.framesRendered).toBe(1);
    allCanvases[0].dispatchEvent(new Event('webglcontextrestored'));
    flush();
    expect(viewport.diagnostics).toMatchObject({
      state: 'active',
      contextRestores: 1,
      rebuilds: 2,
      controls: 1,
      canvases: 1,
      framesRendered: 2,
    });
    expect(viewport.diagnostics.camera).toEqual(camera);
    allCanvases[0].dispatchEvent(new Event('webglcontextlost'));
    expect(viewport.diagnostics.contextLosses).toBe(1);
    viewport.dispose();
  });

  it('keeps stable live owners through twenty swaps and releases everything exactly once on dispose', () => {
    const { viewport, rendererInstances, controlInstances, observer, children, pending, document } =
      lifecycleHarness();
    for (let index = 0; index < 20; index++) {
      viewport.setProject(nativeBox());
      expect(viewport.diagnostics).toMatchObject({
        renderers: 1,
        geometries: 1,
        materials: 1,
        controls: 1,
        canvases: 1,
        pendingFrames: 1,
      });
    }
    expect(viewport.diagnostics).toMatchObject({ disposedGeometries: 19, disposedMaterials: 19 });
    viewport.dispose();
    viewport.dispose();
    expect(viewport.diagnostics).toMatchObject({
      state: 'disposed',
      renderers: 0,
      geometries: 0,
      materials: 0,
      controls: 0,
      canvases: 0,
      listeners: 0,
      resizeObservers: 0,
      pendingFrames: 0,
      disposedGeometries: 20,
      disposedMaterials: 20,
    });
    expect(children).toHaveLength(0);
    expect(pending.size).toBe(0);
    expect(rendererInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(rendererInstances[0].forceContextLoss).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    controlInstances.forEach((controls) => expect(controls.dispose).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('resume'));
    expect(viewport.setProject(triangle()).ok).toBe(false);
    expect(viewport.diagnostics.state).toBe('disposed');
  });

  it('fails closed without WebGL2 while leaving canonical input untouched', () => {
    const { viewport, rendererInstances, children } = lifecycleHarness(false);
    const project = triangle();
    const before = cloneProject(project);
    expect(viewport.setProject(project).ok).toBe(false);
    expect(viewport.status).toMatchObject({
      state: 'unavailable',
      reason: expect.stringContaining('WebGL2'),
    });
    expect(children).toHaveLength(0);
    expect(rendererInstances).toHaveLength(0);
    expect(project).toEqual(before);
    viewport.dispose();
  });

  it('removes the previous view when an unsupported project replaces it', () => {
    const { viewport } = lifecycleHarness();
    viewport.setProject(triangle());
    expect(viewport.setProject(smallProject()).ok).toBe(false);
    expect(viewport.diagnostics).toMatchObject({
      state: 'unsupported',
      renderers: 0,
      geometries: 0,
      canvases: 0,
      pendingFrames: 0,
    });
    viewport.dispose();
  });

  it('does not leave context loss latched after an unsupported replacement removes the old canvas', () => {
    const { viewport, allCanvases } = lifecycleHarness();
    viewport.setProject(triangle());
    allCanvases[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    viewport.setProject(smallProject());
    expect(viewport.setProject(triangle())).toEqual({ ok: true });
    expect(viewport.diagnostics).toMatchObject({
      state: 'active',
      renderers: 1,
      contexts: 1,
      geometries: 1,
      controls: 1,
      pendingFrames: 1,
    });
    viewport.dispose();
  });

  it('captures PNG immediately after render, explains read failures, and refuses hidden capture', async () => {
    const { viewport, allCanvases, rendererInstances } = lifecycleHarness();
    viewport.setProject(triangle());
    const blob = await viewport.capturePng();
    expect(blob.type).toBe('image/png');
    expect(rendererInstances[0].render.mock.invocationCallOrder[0]).toBeLessThan(
      allCanvases[0].toBlob.mock.invocationCallOrder[0],
    );
    expect(viewport.diagnostics.pendingFrames).toBe(0);
    allCanvases[0].toBlob.mockImplementationOnce((callback) => callback(null));
    await expect(viewport.capturePng()).rejects.toThrow('encoding failed');
    allCanvases[0].toBlob.mockImplementationOnce(() => {
      throw new Error('read blocked');
    });
    await expect(viewport.capturePng()).rejects.toThrow('read blocked');
    viewport.setHidden(true);
    await expect(viewport.capturePng()).rejects.toThrow('active');
    viewport.dispose();
  });

  it('stops after a renderer failure and exposes the error without an idle retry loop', () => {
    const { viewport, rendererInstances, flush } = lifecycleHarness();
    viewport.setProject(triangle());
    rendererInstances[0].render.mockImplementationOnce(() => {
      throw new Error('GPU error');
    });
    flush();
    expect(viewport.diagnostics).toMatchObject({
      state: 'error',
      framesRendered: 0,
      renderFailures: 1,
      renderers: 0,
      contexts: 0,
      geometries: 0,
      materials: 0,
      canvases: 0,
      controls: 0,
      pendingFrames: 0,
    });
    expect(viewport.status.reason).toContain('GPU error');
    expect(viewport.setProject(triangle()).ok).toBe(true);
    flush();
    expect(viewport.diagnostics).toMatchObject({
      state: 'active',
      framesRendered: 1,
      renderers: 1,
    });
    viewport.dispose();
  });
});
