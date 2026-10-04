import { describe, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProjectHistory } from '../../core3d/commands/history';
import { setNodeTransform } from '../../core3d/commands/objectEditing';
import { TransformTransaction } from '../../features/editor3d/transformTransaction';
import type { NativeCameraState, NativeViewOptions } from '../../core3d/ports/renderPort';
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
  ownerDocument!: Document;
  clientWidth = 640;
  clientHeight = 480;
  parent: CanvasDouble[] | null = null;
  available = true;
  loseContext = vi.fn();
  context = { getExtension: vi.fn(() => ({ loseContext: this.loseContext })) };
  captured = new Set<number>();
  getRootNode = () => this.ownerDocument;
  getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 });
  setPointerCapture = (id: number) => this.captured.add(id);
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

function lifecycleHarness(
  webgl2Available = true,
  createControls?: NativeViewportDependencies['createControls'],
) {
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
      canvas.ownerDocument = document as unknown as Document;
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
    camera: PerspectiveCamera | OrthographicCamera;
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
    createControls:
      createControls ??
      ((camera) => {
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
      }),
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

function expectBoundsInView(bounds: Box3, camera: PerspectiveCamera | OrthographicCamera) {
  camera.updateMatrixWorld(true);
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
        expect(Math.abs(point.z)).toBeLessThan(1);
      }
}

function realControlsHarness() {
  const controls: OrbitControls[] = [];
  const harness = lifecycleHarness(true, (camera, canvas) => {
    const instance = new OrbitControls(camera, canvas);
    vi.spyOn(instance, 'dispose');
    controls.push(instance);
    return instance;
  });
  return { ...harness, controls };
}

function pointerEvent(type: string, x: number, y: number) {
  return Object.assign(new Event(type), {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
  });
}

describe('native screen orientation with real OrbitControls (no browser or GPU)', () => {
  const cases = (['perspective', 'orthographic'] as const).flatMap((projection) =>
    (['numeric apply', 'suspend', 'context restore', 'same-project rebuild'] as const).map(
      (transition) => ({ projection, transition }),
    ),
  );

  it.each(cases)(
    'preserves top-view pointer orbit through $projection $transition',
    ({ projection, transition }) => {
      const { viewport, controls, allCanvases, document, flush } = realControlsHarness();
      const project = nativeBox();
      const original = cloneProject(project);
      expect(viewport.setProject(project)).toEqual({ ok: true });
      expect(viewport.setCamera({ ...viewport.getCamera(), projection })).toEqual({ ok: true });
      expect(viewport.cameraPreset('top')).toEqual({ ok: true });
      const topPosition = viewport.getCamera().position;
      const canvas = allCanvases.at(-1)!;
      canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100));
      document.dispatchEvent(pointerEvent('pointermove', 160, 130));
      document.dispatchEvent(pointerEvent('pointerup', 160, 130));
      flush();
      expect(viewport.getCamera().position).not.toEqual(topPosition);
      const beforeCamera = controls.at(-1)!.object;
      beforeCamera.updateMatrixWorld(true);
      const before = viewport.getCamera();
      const world = beforeCamera.matrixWorld.toArray();
      const projectionMatrix = beforeCamera.projectionMatrix.toArray();
      const point = new Vector3(0.4, 0.2, 0.1).project(beforeCamera).toArray();
      const listeners = viewport.diagnostics.listeners;
      expect(before.up).toEqual([0, 0, -1]);

      if (transition === 'numeric apply')
        expect(viewport.setCamera(viewport.getCamera())).toEqual({ ok: true });
      else if (transition === 'suspend') {
        expect(
          viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true }),
        ).toEqual({ ok: true });
        expect(viewport.resume()).toEqual({ ok: true });
      } else if (transition === 'context restore') {
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        canvas.dispatchEvent(new Event('webglcontextrestored'));
      } else {
        const changed = cloneProject(project);
        changed.revision++;
        expect(viewport.setProject(changed)).toEqual({ ok: true });
      }
      flush();
      const camera = controls.at(-1)!.object;
      camera.updateMatrixWorld(true);
      expect(viewport.getCamera()).toMatchObject({
        up: before.up,
        projection,
        fov: before.fov,
        span: before.span,
      });
      camera.matrixWorld
        .toArray()
        .forEach((value, index) => expect(value).toBeCloseTo(world[index], 12));
      camera.projectionMatrix
        .toArray()
        .forEach((value, index) => expect(value).toBeCloseTo(projectionMatrix[index], 12));
      new Vector3(0.4, 0.2, 0.1)
        .project(camera)
        .toArray()
        .forEach((value, index) => expect(value).toBeCloseTo(point[index], 12));
      expect(controls.filter((instance) => instance.enabled)).toHaveLength(1);
      expect(viewport.diagnostics).toMatchObject({ state: 'active', controls: 1, listeners });
      expect(project).toEqual(original);
      viewport.dispose();
      controls.forEach((instance) => expect(instance.dispose).toHaveBeenCalledTimes(1));
      expect(viewport.diagnostics).toMatchObject({ controls: 0, listeners: 0, pendingFrames: 0 });
    },
  );

  it.each(['perspective', 'orthographic'] as const)(
    'moves each top-view keyboard orbit by fifteen degrees in the %s screen frame',
    (projection) => {
      const { viewport, controls } = realControlsHarness();
      viewport.setProject(nativeBox());
      viewport.setCamera({ ...viewport.getCamera(), projection });
      for (const action of ['orbit-left', 'orbit-right', 'orbit-up', 'orbit-down'] as const) {
        viewport.cameraPreset('top');
        const start = new Vector3(...viewport.getCamera().position).normalize();
        // The same installed OrbitControls path that pointer rotation calls, without listeners.
        const expected = new OrbitControls(controls.at(-1)!.object.clone());
        expected.target.fromArray(viewport.getCamera().target);
        if (action === 'orbit-left' || action === 'orbit-right')
          expected.rotateLeft(((action === 'orbit-left' ? 1 : -1) * Math.PI) / 12);
        else expected.rotateUp(((action === 'orbit-up' ? 1 : -1) * Math.PI) / 12);
        expect(viewport.cameraAction(action)).toEqual({ ok: true });
        const direction = new Vector3(...viewport.getCamera().position).normalize();
        expect(start.angleTo(direction)).toBeCloseTo(Math.PI / 12, 12);
        viewport
          .getCamera()
          .position.forEach((value, index) =>
            expect(value).toBeCloseTo(expected.object.position.toArray()[index], 12),
          );
        expect(viewport.getCamera().up).toEqual([0, 0, -1]);
      }
      for (const preset of ['front', 'right'] as const) {
        viewport.cameraPreset('top');
        expect(viewport.cameraPreset(preset)).toEqual({ ok: true });
        expect(viewport.getCamera().up).toEqual([0, 1, 0]);
      }
      viewport.cameraPreset('top');
      viewport.resetCamera();
      expect(viewport.getCamera().up).toEqual([0, 1, 0]);
      viewport.dispose();
    },
  );

  it.each(
    (['perspective', 'orthographic'] as const).flatMap((projection) =>
      (['front', 'top'] as const).map((preset) => ({ projection, preset })),
    ),
  )(
    'restores the real controls pole limit in $projection from $preset',
    ({ projection, preset }) => {
      const { viewport, controls, allCanvases } = realControlsHarness();
      viewport.setProject(nativeBox());
      viewport.setCamera({ ...viewport.getCamera(), projection });
      viewport.cameraPreset(preset);
      controls.at(-1)!.rotateUp(Math.PI);
      const camera = controls.at(-1)!.object;
      camera.updateMatrixWorld(true);
      const world = camera.matrixWorld.toArray();
      const up = viewport.getCamera().up;
      expect(viewport.setCamera(viewport.getCamera())).toEqual({ ok: true });
      expect(
        viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true }),
      ).toEqual({ ok: true });
      expect(viewport.resume()).toEqual({ ok: true });
      const canvas = allCanvases.at(-1)!;
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(viewport.status.state).toBe('active');
      expect(viewport.getCamera().up).toEqual(up);
      controls.at(-1)!.object.updateMatrixWorld(true);
      // OrbitControls' acos/sin round trip loses about 1e-10 near its pole clamp.
      controls
        .at(-1)!
        .object.matrixWorld.toArray()
        .forEach((value, index) => expect(value).toBeCloseTo(world[index], 8));
      viewport.dispose();
    },
  );

  it('rejects malformed, zero and parallel up vectors without changing live controls or view', () => {
    const { viewport, controls, flush } = realControlsHarness();
    viewport.setProject(nativeBox());
    viewport.cameraPreset('top');
    flush();
    const state = viewport.getCamera();
    const before = viewport.diagnostics;
    const camera = controls.at(-1)!.object;
    const world = camera.matrixWorld.toArray();
    const invalid = [
      null,
      [1, 0],
      ['1', 0, 0],
      [NaN, 0, 1],
      [Infinity, 0, 1],
      [1e40, 0, 1],
      [0, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
    ];
    for (const up of invalid) {
      expect(viewport.setCamera({ ...state, up } as NativeCameraState).ok).toBe(false);
      expect(viewport.diagnostics).toEqual(before);
      expect(controls.at(-1)!.object).toBe(camera);
      expect(camera.matrixWorld.toArray()).toEqual(world);
      expect(controls.at(-1)!.dispose).not.toHaveBeenCalled();
    }
    state.up![0] = 99;
    expect(viewport.diagnostics).toEqual(before);
    viewport.dispose();
  });

  it('recovers a finite but unfit extreme field of view through camera reset', () => {
    const { viewport, controls } = realControlsHarness();
    const project = nativeBox();
    const original = cloneProject(project);
    viewport.setProject(project);
    expect(
      viewport.setCamera({
        ...viewport.getCamera(),
        position: [0, 0, 10],
        target: [0, 0, 0],
        fov: 3.4e-37,
      }),
    ).toEqual({ ok: true });
    const before = viewport.getCamera();
    expect(viewport.cameraPreset('front').ok).toBe(false);
    expect(() => viewport.fitCamera()).toThrow();
    expect(viewport.getCamera()).toEqual(before);
    expect(() => viewport.resetCamera()).not.toThrow();
    expect(viewport.getCamera()).toMatchObject({
      projection: 'perspective',
      fov: 45,
      up: [0, 1, 0],
    });
    const graph = buildNativeGraph(project);
    expectBoundsInView(
      new Box3().setFromObject(graph.root),
      controls.at(-1)!.object as PerspectiveCamera,
    );
    graph.dispose();
    expect(project).toEqual(original);
    viewport.dispose();
  });

  it.each(['perspective', 'orthographic'] as const)(
    'pans along the actual %s screen axes at the controls pole',
    (projection) => {
      const { viewport, controls } = realControlsHarness();
      viewport.setProject(nativeBox());
      viewport.setCamera({
        ...viewport.getCamera(),
        position: [0, 0, 10],
        target: [0, 0, 0],
        projection,
      });
      controls.at(-1)!.rotateLeft(Math.PI / 4);
      controls.at(-1)!.rotateUp(Math.PI);
      for (const [action, column] of [
        ['pan-right', 0],
        ['pan-up', 1],
      ] as const) {
        const camera = controls.at(-1)!.object;
        camera.updateMatrixWorld(true);
        const expected = new Vector3().setFromMatrixColumn(camera.matrixWorld, column).normalize();
        const before = new Vector3(...viewport.getCamera().target);
        expect(viewport.cameraAction(action)).toEqual({ ok: true });
        const movement = new Vector3(...viewport.getCamera().target).sub(before).normalize();
        expect(movement.dot(expected)).toBeCloseTo(1, 12);
      }
      viewport.dispose();
    },
  );
});

describe('native numeric camera and inspection state', () => {
  it('atomically validates all numeric fields and projections before touching live state', () => {
    const { viewport, controlInstances, pending, flush } = lifecycleHarness();
    viewport.setProject(nativeBox());
    flush();
    const before = viewport.diagnostics;
    const state = viewport.getCamera();
    const updates = controlInstances[0].update.mock.calls.length;
    const invalid: NativeCameraState[] = [
      { ...state, position: [NaN, 1, 2] },
      { ...state, target: [1, Infinity, 2] },
      { ...state, position: [1e40, 1, 2] },
      { ...state, position: [...state.target] },
      { ...state, position: [1, 2] as unknown as NativeCameraState['position'] },
      { ...state, position: ['1', 2, 3] as unknown as NativeCameraState['position'] },
      { ...state, projection: 'fisheye' as NativeCameraState['projection'] },
      ...[NaN, 0, 180, -1].map((fov) => ({ ...state, fov })),
      ...[0, -1, Infinity, 1e-100, 1e40].map((span) => ({
        ...state,
        projection: 'orthographic' as const,
        span,
      })),
    ];
    invalid.forEach((value) => expect(viewport.setCamera(value).ok).toBe(false));
    expect(viewport.cameraPreset('invalid' as 'front').ok).toBe(false);
    expect(viewport.focusNode('missing').ok).toBe(false);
    viewport.resize(Infinity, 10);
    viewport.resize(1e308, 1);
    expect(viewport.diagnostics).toEqual(before);
    expect(controlInstances[0].update).toHaveBeenCalledTimes(updates);
    expect(controlInstances[0].dispose).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
    state.position[0] = 999;
    state.target[0] = 999;
    expect(viewport.diagnostics).toEqual(before);
    viewport.dispose();
  });

  it('changes projection and controls together while retaining numeric settings and canonical data', () => {
    const { viewport, controlInstances, pending, flush } = lifecycleHarness();
    const project = nativeBox();
    const original = cloneProject(project);
    viewport.setProject(project);
    flush();
    const state: NativeCameraState = {
      position: [2, 3, 8],
      target: [0, 1, 0],
      projection: 'perspective',
      fov: 67,
      span: 5,
    };
    expect(viewport.setCamera(state)).toEqual({ ok: true });
    expect(viewport.getCamera()).toEqual({ ...state, up: [0, 1, 0] });
    expect(controlInstances).toHaveLength(1);
    expect(viewport.setCamera({ ...state, projection: 'orthographic' })).toEqual({ ok: true });
    expect(controlInstances).toHaveLength(2);
    expect(controlInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(controlInstances[1].camera).toBeInstanceOf(OrthographicCamera);
    expect(viewport.getCamera()).toEqual({ ...state, projection: 'orthographic', up: [0, 1, 0] });
    viewport.resize(200, 800);
    const camera = controlInstances[1].camera as OrthographicCamera;
    expect(camera.right - camera.left).toBeCloseTo(1.25);
    expect(camera.top - camera.bottom).toBe(5);
    expect(pending.size).toBe(1);
    expect(viewport.setCamera(state)).toEqual({ ok: true });
    expect(controlInstances[2].camera).toBeInstanceOf(PerspectiveCamera);
    expect((controlInstances[2].camera as PerspectiveCamera).fov).toBe(67);
    expect(project).toEqual(original);
    viewport.dispose();
  });

  it.each(['perspective', 'orthographic'] as const)(
    'fits front/right/top and portrait bounds in %s',
    (projection) => {
      const { viewport, controlInstances } = lifecycleHarness();
      const project = nativeBox();
      project.nodes[0].transform.translation = [1e8, -3e8, 2e8];
      project.nodes[0].transform.scale = [10, 30, 3];
      project.nodes[0].transform.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
      viewport.setProject(project);
      viewport.setCamera({ ...viewport.getCamera(), projection, fov: 63 });
      const graph = buildNativeGraph(project);
      const bounds = new Box3().setFromObject(graph.root);
      for (const [width, height] of [
        [200, 800],
        [800, 200],
      ]) {
        viewport.resize(width, height);
        for (const preset of ['front', 'right', 'top'] as const) {
          expect(viewport.cameraPreset(preset)).toEqual({ ok: true });
          const camera = controlInstances.at(-1)!.camera;
          const direction = new Vector3(...viewport.getCamera().position)
            .sub(new Vector3(...viewport.getCamera().target))
            .normalize();
          expect(direction.toArray()).toEqual(
            preset === 'front' ? [0, 0, 1] : preset === 'right' ? [1, 0, 0] : [0, 1, 0],
          );
          expectBoundsInView(bounds, camera);
          if (preset === 'top') expect(camera.up.toArray()).toEqual([0, 0, -1]);
        }
      }
      graph.dispose();
      viewport.dispose();
    },
  );

  it.each([1e-6, 1e8])(
    'resets tiny/large models of size %s after a numeric camera edit',
    (scale) => {
      const { viewport, controlInstances } = lifecycleHarness();
      const project = nativeBox();
      project.nodes[0].transform.scale = [scale, scale, scale];
      project.nodes[0].transform.translation = [scale * 1000, 0, 0];
      expect(viewport.setProject(project)).toEqual({ ok: true });
      viewport.setCamera({ ...viewport.getCamera(), position: [3, 4, 5], target: [0, 0, 0] });
      viewport.resetCamera();
      const graph = buildNativeGraph(project);
      expectBoundsInView(new Box3().setFromObject(graph.root), controlInstances.at(-1)!.camera);
      graph.dispose();
      viewport.dispose();
    },
  );

  it('focuses the canonical-ID subtree, excluding unrelated nodes and every helper', () => {
    const { viewport, controlInstances } = lifecycleHarness();
    const project = nativeBox();
    project.nodes[0].parentId = 'assembly';
    project.nodes[0].transform.translation = [2, 3, 4];
    project.nodes.push({
      id: 'assembly',
      name: 'Box',
      parentId: null,
      transform: { ...identityTransform(), translation: [1000, 0, 0] },
    });
    project.nodes.push({
      id: 'other',
      name: 'Box',
      parentId: null,
      meshId: 'box-mesh',
      transform: { ...identityTransform(), translation: [-1e9, 0, 0] },
    });
    viewport.setProject(project);
    viewport.setViewOptions({ ...viewport.getViewOptions(), grid: true, axes: true, bounds: true });
    expect(viewport.focusNode('assembly')).toEqual({ ok: true });
    expect(viewport.getCamera().target).toEqual([1002, 3, 4]);
    const focused = viewport.getCamera();
    expect(viewport.focusNode('Box').ok).toBe(false);
    expect(viewport.focusNode('Inspection grid').ok).toBe(false);
    expect(viewport.getCamera()).toEqual(focused);
    expect(controlInstances.at(-1)!.camera.far).toBeGreaterThan(1e9);
    viewport.setCamera({
      ...focused,
      position: [1002, 3, 1e10],
      projection: 'orthographic',
      span: 3,
    });
    expect(controlInstances.at(-1)!.camera.far).toBeGreaterThan(1e10);
    viewport.focusNode('box-node');
    expect(viewport.getCamera().span).toBeCloseTo(Math.sqrt(3) * 1.2);
    viewport.dispose();
  });

  it('uses visible orthographic span for keyboard zoom/pan and preserves pointer zoom on resize', () => {
    const { viewport, controlInstances } = lifecycleHarness();
    viewport.setProject(nativeBox());
    viewport.resize(400, 800);
    viewport.setCamera({
      position: [0, 0, 10],
      target: [0, 0, 0],
      projection: 'orthographic',
      fov: 45,
      span: 12,
    });
    viewport.cameraAction('zoom-in');
    expect(viewport.getCamera()).toMatchObject({
      position: [0, 0, 10],
      target: [0, 0, 0],
      span: 10,
    });
    viewport.cameraAction('pan-right');
    expect(viewport.getCamera()).toMatchObject({ position: [0.5, 0, 10], target: [0.5, 0, 0] });
    viewport.cameraAction('pan-up');
    expect(viewport.getCamera()).toMatchObject({ position: [0.5, 1, 10], target: [0.5, 1, 0] });
    const controls = controlInstances.at(-1)!;
    controls.camera.zoom = 2;
    controls.camera.updateProjectionMatrix();
    controls.change();
    expect(viewport.getCamera().span).toBe(5);
    viewport.resize(800, 400);
    expect(viewport.getCamera().span).toBe(5);
    viewport.cameraAction('zoom-out');
    expect(viewport.getCamera().span).toBe(6);
    viewport.dispose();
  });

  it('keeps material/solid/wireframe and helpers outside the canonical graph and validates options atomically', async () => {
    const { viewport, rendererInstances, pending, flush } = lifecycleHarness();
    const project = nativeBox();
    project.materials[0].baseColor[3] = 0.25;
    project.materials[0].metallic = 0.7;
    const original = cloneProject(project);
    viewport.setProject(project);
    flush();
    const scene = rendererInstances[0].render.mock.calls[0][0] as Scene;
    const mesh = scene.getObjectByName('Box') as Mesh;
    const originals = mesh.material as MeshStandardMaterial[];
    const disposeOriginal = vi.spyOn(originals[0], 'dispose');
    const fit = viewport.getCamera();
    const options: NativeViewOptions = {
      shading: 'wireframe',
      background: 'light',
      lighting: 'soft',
      grid: true,
      axes: true,
      bounds: true,
    };
    expect(viewport.setViewOptions(options)).toEqual({ ok: true });
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect(mesh.material).toMatchObject({ wireframe: true, toneMapped: false, opacity: 1 });
    expect((mesh.material as MeshBasicMaterial).color.getHex()).toBe(0x263449);
    expect(scene.background).toEqual(new Color(0xe8edf3));
    expect(scene.children.find((object) => object instanceof AmbientLight)).toMatchObject({
      intensity: 2.5,
    });
    expect(scene.children.find((object) => object instanceof DirectionalLight)).toMatchObject({
      intensity: 1,
    });
    const helpers = scene.children.filter((object) => object instanceof LineSegments);
    expect(helpers).toHaveLength(3);
    helpers.forEach((helper) => expect(helper.parent).toBe(scene));
    const helperDisposals = helpers.map((helper) => vi.spyOn(helper, 'dispose'));
    const disposeOverride = vi.spyOn(mesh.material as MeshBasicMaterial, 'dispose');
    viewport.fitCamera();
    expect(viewport.getCamera()).toMatchObject({ ...fit, position: expect.any(Array) });
    viewport
      .getCamera()
      .position.forEach((value, index) => expect(value).toBeCloseTo(fit.position[index], 12));
    await viewport.capturePng();
    expect(rendererInstances[0].render.mock.lastCall![0].children).toEqual(
      expect.arrayContaining(helpers),
    );
    expect(pending.size).toBe(0);
    const before = viewport.diagnostics;
    for (const invalid of [
      { shading: 'flat' },
      { background: 'pink' },
      { lighting: 'flat' },
      { grid: 1 },
      { axes: null },
      { bounds: undefined },
    ]) {
      expect(viewport.setViewOptions({ ...options, ...invalid } as NativeViewOptions).ok).toBe(
        false,
      );
      expect(viewport.diagnostics).toEqual(before);
    }
    const copy = viewport.getViewOptions();
    copy.axes = false;
    expect(viewport.getViewOptions()).toEqual(options);
    viewport.setViewOptions({ ...options, background: 'dark', lighting: 'studio' });
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect((mesh.material as MeshBasicMaterial).color.getHex()).toBe(0xdce5ef);
    viewport.setViewOptions({ ...options, shading: 'solid' });
    expect(mesh.material).toMatchObject({ wireframe: false });
    expect(disposeOverride).toHaveBeenCalledTimes(1);
    helperDisposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    viewport.setViewOptions({
      ...options,
      shading: 'material',
      grid: false,
      axes: false,
      bounds: false,
    });
    expect(mesh.material).toBe(originals);
    expect(originals[0]).toMatchObject({ opacity: 0.25, metalness: 0.7 });
    expect(disposeOriginal).not.toHaveBeenCalled();
    expect(project).toEqual(original);
    viewport.dispose();
    expect(disposeOriginal).toHaveBeenCalledTimes(1);
  });

  it.each(['hidden', 'frozen', 'suspended', 'context-lost', 'disposed'] as const)(
    'rejects all new inspection mutations while %s',
    (state) => {
      const { viewport, allCanvases, pending } = lifecycleHarness();
      viewport.setProject(nativeBox());
      if (state === 'hidden') viewport.setHidden(true);
      if (state === 'frozen') viewport.setFrozen(true);
      if (state === 'suspended')
        viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
      if (state === 'context-lost')
        allCanvases[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      if (state === 'disposed') viewport.dispose();
      const before = viewport.diagnostics;
      expect(viewport.setCamera({ ...viewport.getCamera(), projection: 'orthographic' }).ok).toBe(
        false,
      );
      expect(viewport.cameraPreset('top').ok).toBe(false);
      expect(viewport.focusNode('box-node').ok).toBe(false);
      expect(viewport.setViewOptions({ ...viewport.getViewOptions(), axes: true }).ok).toBe(false);
      expect(viewport.diagnostics).toEqual(before);
      expect(pending.size).toBe(0);
      viewport.dispose();
    },
  );
});

describe('native lifecycle ownership (injected renderer, not GPU evidence)', () => {
  it.each(['suspend', 'context loss', 'hidden/frozen'] as const)(
    'preserves orthographic projection, settings and helper owners through %s',
    (transition) => {
      const { viewport, controlInstances, rendererInstances, allCanvases, flush } =
        lifecycleHarness();
      const project = nativeBox();
      const original = cloneProject(project);
      viewport.setProject(project);
      viewport.cameraPreset('top');
      viewport.focusNode('box-node');
      viewport.setCamera({ ...viewport.getCamera(), projection: 'orthographic', span: 3 });
      viewport.setViewOptions({
        shading: 'wireframe',
        background: 'light',
        lighting: 'soft',
        grid: true,
        axes: true,
        bounds: true,
      });
      viewport.cameraAction('zoom-in');
      viewport.cameraAction('pan-right');
      flush();
      const scene = rendererInstances[0].render.mock.lastCall![0] as Scene;
      const oldHelpers = scene.children.filter((object) => object instanceof LineSegments);
      const disposals = oldHelpers.map((helper) => vi.spyOn(helper, 'dispose'));
      const before = viewport.getCamera();
      const options = viewport.getViewOptions();
      const camera = controlInstances.at(-1)!.camera;
      const projection = camera.projectionMatrix.toArray();
      const world = camera.matrixWorld.toArray();
      const listeners = viewport.diagnostics.listeners;
      if (transition === 'suspend') {
        viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
        expect(viewport.diagnostics).toMatchObject({
          helperGeometries: 0,
          helperMaterials: 0,
          inspectionMaterials: 0,
        });
        viewport.resume();
      } else if (transition === 'context loss') {
        allCanvases[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        allCanvases[0].dispatchEvent(new Event('webglcontextrestored'));
      } else {
        viewport.setHidden(true);
        viewport.setFrozen(true);
        viewport.setHidden(false);
        expect(viewport.diagnostics.pendingFrames).toBe(0);
        viewport.setFrozen(false);
      }
      flush();
      expect(viewport.getCamera()).toEqual(before);
      expect(viewport.getViewOptions()).toEqual(options);
      expect(controlInstances.at(-1)!.camera.projectionMatrix.toArray()).toEqual(projection);
      expect(controlInstances.at(-1)!.camera.matrixWorld.toArray()).toEqual(world);
      expect(viewport.diagnostics).toMatchObject({
        helperGeometries: 3,
        helperMaterials: 3,
        inspectionMaterials: 1,
        controls: 1,
        listeners,
        pendingFrames: 0,
      });
      disposals.forEach((spy) =>
        expect(spy).toHaveBeenCalledTimes(transition === 'hidden/frozen' ? 0 : 1),
      );
      expect(project).toEqual(original);
      viewport.dispose();
      disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
      expect(viewport.diagnostics).toMatchObject({
        helperGeometries: 0,
        helperMaterials: 0,
        inspectionMaterials: 0,
        geometries: 0,
        materials: 0,
        controls: 0,
        listeners: 0,
      });
    },
  );

  it('retains inspection for same-project rebuilds, reclips distant edits, and resets it for a new project', () => {
    const { viewport, controlInstances } = lifecycleHarness();
    const project = nativeBox();
    viewport.setProject(project);
    viewport.setCamera({ ...viewport.getCamera(), projection: 'orthographic', fov: 71, span: 3 });
    viewport.setViewOptions({
      shading: 'solid',
      background: 'light',
      lighting: 'soft',
      grid: true,
      axes: true,
      bounds: true,
    });
    const camera = viewport.getCamera();
    const options = viewport.getViewOptions();
    project.revision++;
    project.nodes[0].transform.translation = [1e9, 0, 0];
    viewport.setProject(project);
    expect(viewport.getCamera()).toEqual(camera);
    expect(viewport.getViewOptions()).toEqual(options);
    expect(controlInstances.at(-1)!.camera.far).toBeGreaterThan(1e9);
    viewport.suspend({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true });
    project.id = 'replacement';
    viewport.setProject(project);
    expect(viewport.getCamera()).toEqual(camera);
    expect(viewport.getViewOptions()).toEqual(options);
    viewport.resume({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true });
    expect(viewport.getCamera()).toMatchObject({
      projection: 'perspective',
      fov: 45,
      target: [1e9, 0, 0],
    });
    expect(viewport.getViewOptions()).toEqual({
      shading: 'material',
      background: 'dark',
      lighting: 'studio',
      grid: false,
      axes: false,
      bounds: false,
    });
    expect(viewport.diagnostics).toMatchObject({
      helperGeometries: 0,
      helperMaterials: 0,
      inspectionMaterials: 0,
    });
    viewport.dispose();
  });
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

function editingHarness() {
  const harness = lifecycleHarness();
  const history = new ProjectHistory(nativeBox(), undefined, true);
  let readOnly = false;
  const binding = new TransformTransaction({
    getProject: () => history.project,
    getIdentity: () => ({ id: history.project.id, revision: history.revision }),
    isReadOnly: () => readOnly,
    commit: (updates, expected) => {
      expect(expected).toEqual({ id: history.project.id, revision: history.revision });
      history.execute((project) =>
        updates.forEach(({ id, transform }) => setNodeTransform(project, id, transform)),
      );
    },
  });
  harness.viewport.setProject(history.project);
  harness.viewport.bindEditing(binding);
  binding.setSelection(['box-node']);
  harness.flush();
  const scene = () => harness.rendererInstances.at(-1)!.render.mock.calls.at(-1)![0] as Scene;
  const object = () => scene().getObjectByName('Box')!;
  const start = () => {
    const result = binding.begin();
    if (!result.ok) throw new Error(result.reason);
    return result.token;
  };
  const readonly = () => {
    readOnly = true;
    binding.reconcile('read only');
  };
  return { ...harness, history, binding, scene, object, start, readonly };
}

describe('native editing integration (real helpers, injected GPU boundary)', () => {
  it('applies hundreds of same-revision previews to the canonical ID map without graph, controls, or helper reconstruction', () => {
    const f = editingHarness();
    const before = f.history.project;
    const object = f.object(),
      controls = f.controlInstances[0];
    const helpers = f.scene().children.filter((item) => /selection/.test(item.name));
    const baseline = f.viewport.diagnostics;
    const token = f.start();
    for (let i = 1; i <= 200; i++) expect(f.binding.preview(token, [i / 10, 0, 0]).ok).toBe(true);
    expect(f.object()).toBe(object);
    expect(object.position.x).toBe(20);
    expect(f.history.project).toEqual(before);
    expect(f.controlInstances).toHaveLength(1);
    expect(controls.dispose).not.toHaveBeenCalled();
    expect(f.viewport.diagnostics).toMatchObject({
      rebuilds: baseline.rebuilds,
      runtimeGeneration: baseline.runtimeGeneration,
      previewApplied: true,
      selectionHelpers: 2,
    });
    expect(f.scene().children.filter((item) => /selection/.test(item.name))).toEqual(helpers);
    expect(f.pending.size).toBe(1);
    f.binding.cancel('test cancel');
    expect(object.position.x).toBe(0);
    expect(f.viewport.diagnostics.previewApplied).toBe(false);
    f.viewport.dispose();
  });

  it('restores canonical transforms on invalid final samples and commits through the session once', () => {
    const f = editingHarness(),
      token = f.start();
    f.binding.preview(token, [2, 0, 0]);
    expect(f.object().position.x).toBe(2);
    f.binding.preview(token, [NaN, 0, 0]);
    expect(f.object().position.x).toBe(0);
    expect(f.binding.commit(token).ok).toBe(false);
    expect(f.history.revision).toBe(0);
    const next = f.start();
    f.binding.preview(next, [3, 0, 0]);
    expect(f.binding.commit(next)).toEqual({ ok: true, changed: true });
    f.viewport.setProject(f.history.project);
    f.flush();
    expect(f.history.revision).toBe(1);
    expect(f.object().position.x).toBe(3);
    expect(f.viewport.diagnostics.editing?.active).toBe(false);
    f.history.undo();
    f.binding.reconcile('undo');
    f.viewport.setProject(f.history.project);
    f.flush();
    expect(f.object().position.x).toBe(0);
    f.viewport.dispose();
  });

  it.each(['project', 'revision', 'generation', 'sequence'] as const)(
    'rejects stale %s overlay metadata',
    (kind) => {
      const f = editingHarness(),
        token = f.start();
      f.binding.preview(token, [2, 0, 0]);
      const valid = f.binding.state;
      const bad = structuredClone(valid);
      if (kind === 'project') bad.preview!.projectId = 'foreign';
      if (kind === 'revision') bad.preview!.baseRevision++;
      if (kind === 'generation') bad.preview!.generation++;
      if (kind === 'sequence') bad.preview!.sequence--;
      vi.spyOn(f.binding, 'state', 'get').mockReturnValue(bad);
      // Rebinding applies this detached payload without replacing the canonical graph.
      f.viewport.bindEditing(null);
      f.viewport.bindEditing(f.binding);
      expect(f.object().position.x).toBe(0);
      expect(f.viewport.diagnostics.previewApplied).toBe(false);
      vi.restoreAllMocks();
      f.viewport.dispose();
    },
  );

  it.each(['projection', 'context', 'suspend', 'hidden', 'frozen'] as const)(
    'cancels and rebinds on %s while retaining selection and the saved graph',
    (kind) => {
      const f = editingHarness(),
        token = f.start();
      f.binding.preview(token, [2, 0, 0]);
      const old = f.viewport.diagnostics.editing!;
      const oldCanvas = f.viewport.canvas;
      if (kind === 'projection')
        f.viewport.setCamera({ ...f.viewport.getCamera(), projection: 'orthographic' });
      if (kind === 'context') {
        f.allCanvases[0].dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        expect(f.binding.state.active).toBe(false);
        f.allCanvases[0].dispatchEvent(new Event('webglcontextrestored'));
      }
      if (kind === 'suspend') {
        expect(
          f.viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true })
            .ok,
        ).toBe(true);
        expect(f.binding.state.blocked).toEqual([]);
        f.viewport.resume();
      }
      if (kind === 'hidden') {
        f.viewport.setHidden(true);
        f.viewport.setHidden(false);
      }
      if (kind === 'frozen') {
        f.viewport.setFrozen(true);
        f.viewport.setFrozen(false);
      }
      f.flush();
      expect(f.binding.state.active).toBe(false);
      expect(f.binding.state.context.selection).toEqual(['box-node']);
      expect(f.viewport.diagnostics).toMatchObject({
        state: 'active',
        previewApplied: false,
        selectionHelpers: 2,
      });
      expect(f.viewport.diagnostics.editing).toMatchObject({
        listeners: old.listeners,
        helperGeometries: old.helperGeometries,
        captures: 0,
      });
      expect(f.object().position.x).toBe(0);
      if (kind === 'context' || kind === 'suspend') expect(f.viewport.canvas).not.toBe(oldCanvas);
      f.viewport.dispose();
    },
  );

  it('keeps inspection and selection in read-only mode while session begin and captured old tokens reject', () => {
    const f = editingHarness(),
      token = f.start();
    f.binding.preview(token, [2, 0, 0]);
    f.readonly();
    expect(f.object().position.x).toBe(0);
    expect(f.binding.begin().ok).toBe(false);
    expect(f.binding.preview(token, [3, 0, 0]).ok).toBe(false);
    expect(f.binding.commit(token).ok).toBe(false);
    expect(f.viewport.cameraAction('orbit-right').ok).toBe(true);
    expect(f.viewport.diagnostics.selectionHelpers).toBe(2);
    expect(f.history.revision).toBe(0);
    f.viewport.dispose();
  });

  it('omits editing helpers from PNG but preserves requested inspection helpers', async () => {
    const f = editingHarness();
    f.viewport.setViewOptions({
      ...f.viewport.getViewOptions(),
      grid: true,
      axes: true,
      bounds: true,
    });
    f.rendererInstances[0].render.mockImplementation((scene: Scene) => {
      if (!f.binding.state.blocked.includes('PNG capture')) return;
      for (const child of scene.children) {
        if (child.name.includes('selection') || child.name === 'Transform gizmo')
          expect(child.visible).toBe(false);
        if (child.name.startsWith('Inspection')) expect(child.visible).toBe(true);
      }
    });
    await expect(f.viewport.capturePng()).resolves.toBeInstanceOf(Blob);
    expect(f.binding.state.blocked).toEqual([]);
    expect(
      f
        .scene()
        .children.filter((item) => item.name.includes('selection'))
        .every((item) => item.visible),
    ).toBe(true);
    const token = f.start();
    f.binding.preview(token, [1, 0, 0]);
    await expect(f.viewport.capturePng()).rejects.toThrow();
    expect(f.binding.state.active).toBe(true);
    f.viewport.dispose();
  });

  it('does not resurrect a gizmo after read-only or empty-selection PNG encoding', async () => {
    const f = editingHarness();
    const gizmo = () => f.scene().getObjectByName('Transform gizmo')!;
    f.binding.setSelection([]);
    expect(gizmo().visible).toBe(false);
    await f.viewport.capturePng();
    expect(gizmo().visible).toBe(false);
    f.binding.setSelection(['box-node']);
    f.readonly();
    await f.viewport.capturePng();
    expect(gizmo().visible).toBe(false);
    expect(f.viewport.cameraAction('orbit-left').ok).toBe(true);
    f.viewport.dispose();
  });

  it.each([
    'selection',
    'canonical',
    'runtime',
    'hidden',
    'camera',
    'inspection',
    'resize',
  ] as const)(
    'rejects delayed PNG encoding after %s changes and releases the capture block',
    async (kind) => {
      const f = editingHarness();
      let encode: BlobCallback | undefined;
      f.allCanvases[0].toBlob.mockImplementation((callback) => {
        encode = callback;
      });
      const result = f.viewport.capturePng();
      const rejected = expect(result).rejects.toThrow('stale');
      expect(f.binding.begin().ok).toBe(false);
      if (kind === 'selection') f.binding.setSelection([]);
      if (kind === 'canonical') {
        f.history.execute((project) => {
          project.name = 'Edited';
        });
        f.binding.reconcile();
      }
      if (kind === 'runtime') f.viewport.setProject(f.history.project);
      if (kind === 'hidden') f.viewport.setHidden(true);
      if (kind === 'camera')
        f.viewport.setCamera({ ...f.viewport.getCamera(), projection: 'orthographic' });
      if (kind === 'inspection')
        f.viewport.setViewOptions({ ...f.viewport.getViewOptions(), grid: true });
      if (kind === 'resize') f.viewport.resize(400, 600);
      encode!(new Blob(['png']));
      await rejected;
      expect(f.binding.state.blocked).not.toContain('PNG capture');
      f.viewport.dispose();
    },
  );

  it('disposes selection geometry/material exactly once and distinguishes active multi-selection', () => {
    const f = editingHarness();
    f.history.execute((project) =>
      project.nodes.push({ ...structuredClone(project.nodes[0]), id: 'second', name: 'Second' }),
    );
    f.binding.reconcile();
    f.viewport.setProject(f.history.project);
    f.binding.setSelection(['box-node', 'second'], 'second');
    f.flush();
    const helpers = f
      .scene()
      .children.filter((item) => /^(Active object selection|Selected object)$/.test(item.name));
    expect(helpers.map((helper) => helper.name).sort()).toEqual([
      'Active object selection',
      'Active object selection',
      'Selected object',
    ]);
    const dispose = helpers.flatMap((helper) => {
      const drawable = helper as Mesh;
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
      return [
        vi.spyOn(drawable.geometry, 'dispose'),
        ...materials.map((material) => vi.spyOn(material, 'dispose')),
      ];
    });
    f.viewport.bindEditing(null);
    f.viewport.dispose();
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cleans partial edit-controller construction and retains the canonical rescue data', () => {
    const f = editingHarness();
    f.viewport.bindEditing(null);
    const original = f.history.project;
    const subscribe = f.binding.subscribe.bind(f.binding);
    vi.spyOn(f.binding, 'subscribe')
      .mockImplementationOnce(subscribe)
      .mockImplementationOnce(() => {
        throw new Error('injected subscribe failure');
      });
    f.viewport.bindEditing(f.binding);
    expect(f.viewport.status).toMatchObject({
      state: 'error',
      reason: expect.stringContaining('injected subscribe failure'),
    });
    expect(f.viewport.diagnostics).toMatchObject({
      editing: null,
      selectionHelpers: 0,
      contexts: 0,
      canvases: 0,
      renderers: 0,
      controls: 0,
      pendingFrames: 0,
    });
    expect(getEventListeners(f.allCanvases[0], 'pointerdown')).toHaveLength(0);
    expect(f.history.project).toEqual(original);
    f.viewport.dispose();
  });

  it('refuses pause and PNG when the displayed revision trails a newly committed session', async () => {
    const f = editingHarness(),
      token = f.start();
    f.binding.preview(token, [1, 0, 0]);
    f.binding.commit(token);
    expect(
      f.viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true }).ok,
    ).toBe(false);
    await expect(f.viewport.capturePng()).rejects.toThrow('displayed canonical revision');
    expect(f.viewport.status.state).toBe('active');
    f.viewport.dispose();
  });

  it('numeric transformations remain available without a renderer and during GPU suspension', () => {
    const f = editingHarness();
    f.viewport.suspend({ persistedRevision: 0, currentRevision: 0, sourcesComplete: true });
    const token = f.start();
    expect(f.binding.preview(token, [2, 0, 0]).ok).toBe(true);
    expect(f.binding.commit(token)).toEqual({ ok: true, changed: true });
    f.viewport.setProject(f.history.project);
    expect(
      f.viewport.resume({ persistedRevision: 1, currentRevision: 1, sourcesComplete: true }).ok,
    ).toBe(true);
    f.flush();
    expect(f.object().position.x).toBe(2);
    f.viewport.dispose();
  });

  it('repeated bindings and runtime release keep one subscription/controller and release every helper', () => {
    const f = editingHarness();
    const baseline = f.viewport.diagnostics.editing!;
    const canvas = f.allCanvases[0];
    const actualListeners = getEventListeners(canvas, 'pointerdown').length;
    for (let i = 0; i < 12; i++) {
      f.viewport.bindEditing(null);
      expect(f.viewport.diagnostics).toMatchObject({
        editing: null,
        selectionHelpers: 0,
        editSubscriptions: 0,
      });
      f.viewport.bindEditing(f.binding);
      expect(f.viewport.diagnostics).toMatchObject({ editSubscriptions: 1, selectionHelpers: 2 });
      expect(f.viewport.diagnostics.editing).toMatchObject({
        helperGeometries: baseline.helperGeometries,
        helperMaterials: baseline.helperMaterials,
        listeners: baseline.listeners,
      });
      f.viewport.setProject(f.history.project);
      f.flush();
      expect(getEventListeners(canvas, 'pointerdown')).toHaveLength(actualListeners);
    }
    f.viewport.dispose();
    expect(getEventListeners(canvas, 'pointerdown')).toHaveLength(0);
    expect(f.viewport.diagnostics).toMatchObject({
      editing: null,
      editSubscriptions: 0,
      selectionHelpers: 0,
      geometries: 0,
      materials: 0,
      listeners: 0,
      controls: 0,
      pendingFrames: 0,
      canvases: 0,
    });
    expect(f.pending.size).toBe(0);
    expect(f.children).toHaveLength(0);
    expect(f.binding.state.blocked).toEqual([]);
  });
});
