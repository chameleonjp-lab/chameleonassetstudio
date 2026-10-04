import {
  AmbientLight,
  Color,
  DirectionalLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildNativeGraph, type NativeGraph } from '../../src/adapters3d/three/renderer';
import { ProjectHistory } from '../../src/core3d/commands/history';
import type { Project3D, Vec3 } from '../../src/core3d/model/project';
import { EditController, normalizedPointer } from './controller';
import { editFixture } from './fixtures';
import { TransformTransaction, type EditContext, type Mode } from './transaction';

const host = document.getElementById('viewport')!;
const status = document.getElementById('status')!;
const initialContext = (): EditContext => ({
  selection: ['box-node'],
  activeId: 'box-node',
  options: { mode: 'translate', space: 'world', snap: 0.5 },
  readOnly: false,
  lockedIds: [],
});
let history: ProjectHistory,
  transaction: TransformTransaction,
  controller: EditController | null = null;
let renderer: WebGLRenderer,
  scene: Scene,
  graph: NativeGraph,
  camera: PerspectiveCamera | OrthographicCamera,
  orbit: OrbitControls;
let frame: number | null = null,
  frames = 0,
  disposed = false,
  projection: 'perspective' | 'orthographic' = 'perspective';
let saved: Project3D | null = null;
const cleanups: (() => void)[] = [];
let observer: ResizeObserver | null = null;
let message = '';
let restoring = 0;
let restoreListener: (() => void) | null = null;
let restoreTimer: number | null = null;

function updateStatus() {
  if (!history) return;
  status.textContent = JSON.stringify({
    revision: history.revision,
    dirty: history.dirty,
    commits: transaction.commits,
    selection: transaction.settings.selection,
    active: transaction.active,
    result: message || transaction.lastReason,
  });
  const context = transaction.settings,
    selection = context.selection;
  for (const button of document.querySelectorAll<HTMLButtonElement>('#objects button'))
    button.setAttribute('aria-pressed', String(selection.includes(button.dataset.nodeId!)));
  (document.getElementById('mode') as HTMLSelectElement).value = context.options.mode;
  (document.getElementById('space') as HTMLSelectElement).value = context.options.space;
  (document.getElementById('read-only') as HTMLInputElement).checked = context.readOnly;
  const lock = document.getElementById('lock') as HTMLInputElement;
  lock.checked = context.activeId !== null && context.lockedIds.includes(context.activeId);
  lock.disabled = context.activeId === null;
  const snap = document.getElementById('snap') as HTMLInputElement;
  if (document.activeElement !== snap) snap.value = String(context.options.snap ?? 0);
  (document.getElementById('projection') as HTMLSelectElement).value = projection;
}
function requestRender() {
  message = '';
  updateStatus();
  if (disposed || controller?.diagnostics.blocked.length || document.hidden) {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    return;
  }
  if (frame === null)
    frame = requestAnimationFrame(() => {
      frame = null;
      if (disposed || controller?.diagnostics.blocked.length) return;
      renderer.render(scene, camera);
      frames++;
    });
}
function size() {
  const { width, height } = host.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  renderer.setSize(width, height, false);
  if (camera instanceof PerspectiveCamera) camera.aspect = width / height;
  else {
    camera.left = (-4 * width) / height;
    camera.right = (4 * width) / height;
    camera.top = 4;
    camera.bottom = -4;
  }
  camera.updateProjectionMatrix();
  requestRender();
}
function listen(target: EventTarget, type: string, listener: EventListener) {
  target.addEventListener(type, listener);
  cleanups.push(() => target.removeEventListener(type, listener));
}
function objectList() {
  const list = document.getElementById('objects')!;
  list.replaceChildren();
  for (const node of history.project.nodes) {
    const button = document.createElement('button');
    button.textContent = node.name;
    button.dataset.nodeId = node.id;
    button.onclick = (event) => {
      const context = transaction.settings;
      const selection = event.shiftKey
        ? context.selection.includes(node.id)
          ? context.selection.filter((id) => id !== node.id)
          : [...context.selection, node.id]
        : [node.id];
      controller!.setContext({
        ...context,
        selection,
        activeId: selection.includes(node.id) ? node.id : (selection.at(-1) ?? null),
      });
    };
    list.append(button);
  }
  updateStatus();
}
function mount(project = editFixture()) {
  disposed = false;
  message = '';
  history = new ProjectHistory(project, undefined, true);
  transaction = new TransformTransaction(history, initialContext());
  renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Native editing canvas');
  host.append(renderer.domElement);
  scene = new Scene();
  scene.background = new Color('#25344a');
  scene.add(new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  graph = buildNativeGraph(project);
  scene.add(graph.root);
  camera = new PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(5, 4, 7);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.target.set(0, 0, 0);
  orbit.update();
  orbit.addEventListener('change', requestRender);
  cleanups.push(() => orbit.removeEventListener('change', requestRender));
  controller = new EditController({
    canvas: renderer.domElement,
    camera,
    scene,
    root: graph.root,
    transaction,
    orbit,
    resetCameraGesture: () => {
      orbit.disconnect();
      orbit.connect(renderer.domElement);
    },
    document,
    window,
    changed: requestRender,
  });
  listen(renderer.domElement, 'webglcontextlost', (event) => {
    event.preventDefault();
    requestRender();
  });
  listen(renderer.domElement, 'webglcontextrestored', () => {
    restoring++;
    requestRender();
  });
  observer = new ResizeObserver(size);
  observer.observe(host);
  projection = 'perspective';
  objectList();
  size();
}
function dispose() {
  if (disposed) return;
  restoreListener?.();
  restoreListener = null;
  if (restoreTimer !== null) window.clearTimeout(restoreTimer);
  restoreTimer = null;
  controller!.dispose();
  disposed = true;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  observer?.disconnect();
  observer = null;
  for (const cleanup of cleanups.splice(0)) cleanup();
  orbit.dispose();
  graph.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
  scene.clear();
}
function setProjection(next: typeof projection) {
  projection = next;
  const previous = camera;
  camera =
    next === 'perspective'
      ? new PerspectiveCamera(45, 1, 0.01, 100)
      : new OrthographicCamera(-4, 4, 4, -4, 0.01, 100);
  camera.position.copy(previous.position);
  camera.quaternion.copy(previous.quaternion);
  orbit.object = camera;
  orbit.update();
  controller!.setCamera(camera);
  size();
}
function report(result: unknown) {
  message = JSON.stringify(result);
  updateStatus();
}
const evaluation = {
  get diagnostics() {
    return {
      ...controller!.diagnostics,
      revision: history.revision,
      dirty: history.dirty,
      commits: transaction.commits,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      selection: transaction.settings.selection,
      projectId: history.project.id,
      framesRendered: frames,
      pendingFrames: Number(frame !== null),
      projection,
      camera: camera.position.toArray(),
      canvases: host.querySelectorAll('canvas').length,
      renderers: disposed ? 0 : 1,
      nativeGeometries: disposed ? 0 : graph.geometries.length,
      nativeMaterials: disposed ? 0 : graph.materials.length,
      mainListeners: cleanups.length + Number(restoreListener !== null),
      pendingContextTimers: Number(restoreTimer !== null),
      resizeObservers: Number(observer !== null),
      contextRestores: restoring,
      savedRevision: saved?.revision ?? null,
    };
  },
  get project() {
    return history.project;
  },
  get preview() {
    return transaction.preview;
  },
  get settings() {
    return transaction.settings;
  },
  configure: (context: Partial<EditContext>) =>
    controller!.setContext({ ...transaction.settings, ...context }),
  begin: () => controller!.beginNumeric(),
  update: (delta: Vec3) => controller!.updateNumeric(delta),
  commit: () => controller!.commitNumeric(),
  cancel: () => controller!.cancel(),
  undo: () => {
    controller!.cancel('undo');
    const result = history.undo();
    controller!.cancel('undo applied');
    return result;
  },
  redo: () => {
    controller!.cancel('redo');
    const result = history.redo();
    controller!.cancel('redo applied');
    return result;
  },
  hidden: (value: boolean) => controller!.setBlocked('hidden', value),
  frozen: (value: boolean) => controller!.setBlocked('freeze', value),
  suspend: () => {
    const snapshot = controller!.snapshot('suspend');
    controller!.setBlocked('suspend', true);
    return snapshot;
  },
  resume: () => controller!.setBlocked('suspend', false),
  save: () => {
    saved = controller!.snapshot('save');
    history.acknowledgeSaved(saved.id, saved.revision);
    updateStatus();
    return saved;
  },
  capture: async () => {
    controller!.snapshot('png');
    renderer.render(scene, camera);
    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))),
        'image/png',
      ),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  },
  projectPoint: (id: string) => {
    const object = graph.root.getObjectByProperty('uuid', graph.root.uuid);
    let target = object;
    graph.root.traverse((item) => {
      if (item.userData.canonicalNodeId === id) target = item;
    });
    if (!target || target === graph.root) throw new Error('Unknown native ID');
    graph.root.updateMatrixWorld(true);
    const point = target.getWorldPosition(new Vector3()).project(camera as Camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - point.y) * rect.height) / 2,
    };
  },
  /** Test-only hit discovery; actual interaction still uses browser pointer events. */
  handlePoint: (axis: 'X' | 'Y' | 'Z') => {
    scene.updateMatrixWorld(true);
    const rect = renderer.domElement.getBoundingClientRect();
    const center = controller!.proxy.getWorldPosition(new Vector3()).project(camera);
    const cx = ((center.x + 1) * rect.width) / 2,
      cy = ((1 - center.y) * rect.height) / 2;
    for (let radius = 35; radius < 150; radius += 3)
      for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
        const x = cx + Math.cos(angle) * radius,
          y = cy + Math.sin(angle) * radius;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) continue;
        controller!.controls.pointerHover(
          normalizedPointer((x / rect.width) * 2 - 1, 1 - (y / rect.height) * 2, 0),
        );
        if (controller!.controls.axis === axis) return { x: rect.left + x, y: rect.top + y };
      }
    throw new Error(`No ${axis} handle is hittable`);
  },
  projection: setProjection,
  swap: () => {
    const id =
      history.project.id === 'native-edit-evaluation'
        ? 'other-native-edit'
        : 'native-edit-evaluation';
    controller!.cancel('project changed');
    dispose();
    mount(editFixture(id));
  },
  dispose,
  remount: () => {
    const project = history.project;
    dispose();
    mount(project);
  },
  contextLoss: () => {
    if (
      disposed ||
      restoreListener ||
      restoreTimer !== null ||
      renderer.getContext().isContextLost()
    )
      return false;
    const extension = renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) return false;
    const canvas = renderer.domElement,
      currentRenderer = renderer;
    const onLoss = () => {
      restoreListener?.();
      restoreListener = null;
      restoreTimer = window.setTimeout(() => {
        restoreTimer = null;
        if (!disposed && renderer === currentRenderer) extension.restoreContext();
      }, 0);
    };
    canvas.addEventListener('webglcontextlost', onLoss);
    restoreListener = () => canvas.removeEventListener('webglcontextlost', onLoss);
    extension.loseContext();
    return true;
  },
};
mount();
Object.assign(window, { nativeTransformEvaluation: evaluation });
for (const id of ['mode', 'space', 'snap', 'read-only', 'lock'])
  document.getElementById(id)!.onchange = () => {
    const context = transaction.settings;
    const snap = (document.getElementById('snap') as HTMLInputElement).valueAsNumber;
    controller!.setContext({
      ...context,
      readOnly:
        id === 'read-only'
          ? (document.getElementById('read-only') as HTMLInputElement).checked
          : context.readOnly,
      lockedIds:
        id !== 'lock' || !context.activeId
          ? context.lockedIds
          : (document.getElementById('lock') as HTMLInputElement).checked
            ? [...new Set([...context.lockedIds, context.activeId])]
            : context.lockedIds.filter((locked) => locked !== context.activeId),
      options: {
        mode:
          id === 'mode'
            ? ((document.getElementById('mode') as HTMLSelectElement).value as Mode)
            : context.options.mode,
        space:
          id === 'space'
            ? ((document.getElementById('space') as HTMLSelectElement).value as 'world' | 'local')
            : context.options.space,
        snap: id === 'snap' ? (snap === 0 ? null : snap) : context.options.snap,
      },
    });
  };
document.getElementById('projection')!.onchange = () =>
  setProjection(
    (document.getElementById('projection') as HTMLSelectElement).value as typeof projection,
  );
document.getElementById('begin')!.onclick = () => report(evaluation.begin());
document.getElementById('preview')!.onclick = (event) => {
  if ((event as MouseEvent).isTrusted && (event as MouseEvent).button !== 0) return;
  report(
    evaluation.update(
      ['dx', 'dy', 'dz'].map(
        (id) => (document.getElementById(id) as HTMLInputElement).valueAsNumber,
      ) as Vec3,
    ),
  );
};
document.getElementById('commit')!.onclick = () => report(evaluation.commit());
document.getElementById('cancel')!.onclick = evaluation.cancel;
document.getElementById('undo')!.onclick = evaluation.undo;
document.getElementById('redo')!.onclick = evaluation.redo;
document.getElementById('save')!.onclick = () => report(evaluation.save());
document.getElementById('capture')!.onclick = () => {
  void evaluation
    .capture()
    .then((bytes) => report({ pngBytes: bytes.length }))
    .catch((error: unknown) => report(String(error)));
};
export type NativeTransformEvaluation = typeof evaluation;
