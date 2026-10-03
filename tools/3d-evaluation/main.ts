import { NativeViewport } from './nativeViewport';
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
const evaluation = {
  get diagnostics() {
    return viewport.diagnostics;
  },
  get canvas() {
    return viewport.canvas;
  },
  reset: () => viewport.resetCamera(),
  hidden: (hidden: boolean) => viewport.setHidden(hidden),
  frozen: (frozen: boolean) => viewport.setFrozen(frozen),
  suspend: (persistedRevision: number | null = project.revision) =>
    viewport.suspend({
      persistedRevision,
      currentRevision: project.revision,
      sourcesComplete: true,
    }),
  resume: () => viewport.resume(),
  dispose: () => viewport.dispose(),
  remount: () => {
    viewport.dispose();
    mount();
  },
  edit: () => {
    project.revision += 1;
    project.name = 'Edited name';
    viewport.setProject(project);
  },
  swap: () => {
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
