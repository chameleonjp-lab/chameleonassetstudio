import { measureNativeCommits } from './performanceRunner';
import { NativeViewport } from '../../src/adapters3d/three/renderer';
import { nativeBox } from './fixtures';

const host = document.getElementById('viewport')!;
const status = document.getElementById('status')!;
let project = nativeBox();
let viewport: NativeViewport;
const mount = () => {
  viewport = new NativeViewport(host, {
    onStatus: (next) => {
      status.textContent = JSON.stringify(next);
    },
  });
  viewport.setProject(project);
};
mount();
let measurement: AbortController | null = null;
const requireIdle = () => {
  if (measurement) throw new Error('Stop measurement before changing the fixture');
};
const markMeasuring = (active: boolean) =>
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = button.id === 'cancel-measurement' ? !active : active;
  });
const evaluation = {
  measureCommits: async (input: Parameters<typeof measureNativeCommits>[2]) => {
    if (measurement) throw new Error('Measurement already running');
    const operation = new AbortController();
    measurement = operation;
    markMeasuring(true);
    try {
      return await measureNativeCommits(viewport, project, input, {
        iterations: 100,
        observationMs: 60000,
        signal: operation.signal,
      });
    } finally {
      if (measurement === operation) {
        measurement = null;
        markMeasuring(false);
      }
    }
  },
  cancelMeasurement: () => measurement?.abort(),
  get diagnostics() {
    return viewport.diagnostics;
  },
  get canvas() {
    return viewport.canvas;
  },
  inspect: () => {
    const preset = viewport.cameraPreset('top');
    if (!preset.ok) return preset;
    const camera = viewport.getCamera();
    const result = viewport.setCamera({ ...camera, projection: 'orthographic', span: 3 });
    if (!result.ok) return result;
    return viewport.setViewOptions({
      shading: 'wireframe',
      background: 'light',
      lighting: 'soft',
      grid: true,
      axes: true,
      bounds: true,
    });
  },
  reset: () => viewport.resetCamera(),
  resize: (width: number, height: number, dpr: number) => viewport.resize(width, height, dpr),
  hidden: (hidden: boolean) => viewport.setHidden(hidden),
  frozen: (frozen: boolean) => viewport.setFrozen(frozen),
  suspend: (persistedRevision: number | null = project.revision) =>
    viewport.suspend({
      persistedRevision,
      currentRevision: project.revision,
      sourcesComplete: true,
    }),
  resume: () => viewport.resume(),
  dispose: () => {
    requireIdle();
    viewport.dispose();
  },
  remount: () => {
    requireIdle();
    viewport.dispose();
    mount();
  },
  edit: () => {
    requireIdle();
    project.revision += 1;
    project.name = 'Edited name';
    viewport.setProject(project);
  },
  swap: () => {
    requireIdle();
    project = nativeBox(project.id === 'native-box' ? 'other-box' : 'native-box');
    project.nodes[0].transform.translation[0] = project.id === 'native-box' ? 0 : 0.5;
    viewport.setProject(project);
  },
  capture: async () =>
    Array.from(new Uint8Array(await (await viewport.capturePng()).arrayBuffer())),
  contextLoss: () => {
    const extension = viewport.canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    viewport.canvas!.addEventListener(
      'webglcontextlost',
      () => {
        window.setTimeout(() => extension.restoreContext(), 0);
      },
      { once: true },
    );
    extension.loseContext();
    return true;
  },
};
Object.assign(window, { nativeEvaluation: evaluation });
document.getElementById('reset')!.onclick = evaluation.reset;
document.getElementById('swap')!.onclick = evaluation.swap;
document.getElementById('suspend')!.onclick = () => {
  evaluation.suspend();
};
document.getElementById('resume')!.onclick = () => {
  evaluation.resume();
};
document.getElementById('capture')!.onclick = () => {
  void evaluation.capture();
};
export type NativeEvaluation = typeof evaluation;

window.addEventListener('pagehide', () => measurement?.abort());

document.getElementById('cancel-measurement')!.onclick = evaluation.cancelMeasurement;
