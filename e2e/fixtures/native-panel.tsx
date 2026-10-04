import { Profiler, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject, type Project3D, type Vec3 } from '../../src/core3d/model/project';
import { nativeBox } from '../../src/core3d/fixtures/nativeBox';
import { TransformTransaction } from '../../src/features/editor3d/transformTransaction';
import type { NativeEditBinding, NativeEditToken } from '../../src/core3d/ports/editPort';
import {
  NativeViewportPanel,
  type NativeViewportFactory,
  type NativeViewportPort,
  type NativeViewportStatus,
} from '../../src/features/editor3d/NativeViewportPanel';

import { NativeAuthoringPanel } from '../../src/features/editor3d/NativeAuthoringPanel';
import type { NativeCameraState, NativeViewOptions } from '../../src/core3d/ports/renderPort';

type PortLog = {
  cameraWrites: number;
  bindings: number;
  boundProject: string | null;
  capturePending: boolean;
  revision: number;
  disposed: boolean;
  captures: number[];
  suspends: number;
  host: HTMLElement;
};
const ports: PortLog[] = [];
let authorRenders = 0;
let throwSync = false;
const parameters = new URLSearchParams(location.search);
let canonical: Project3D = parameters.has('editing')
  ? nativeBox('panel-a')
  : createProject('panel-a', 'Panel A');
canonical.name = 'Panel A';
let currentEdit: NativeEditBinding | null = null;
let lastGesture: { edit: NativeEditBinding; token: NativeEditToken } | null = null;
let replaceBinding: (() => void) | null = null;
let completeCapture: (() => void) | null = null;
let completeSave: (() => void) | null = null;
const pending: (() => void)[] = [];
const delay = new URLSearchParams(location.search).has('delay');
const factory: NativeViewportFactory = async (host, onStatus) => {
  const log: PortLog = {
    cameraWrites: 0,
    bindings: 0,
    boundProject: null,
    capturePending: false,
    revision: -1,
    disposed: false,
    captures: [],
    suspends: 0,
    host,
  };
  ports.push(log);
  let status: NativeViewportStatus = { state: 'active' };
  let camera: NativeCameraState = {
    position: [3, 3, 3],
    target: [0, 0, 0],
    projection: 'perspective',
    fov: 45,
    span: 3,
  };
  let view: NativeViewOptions = {
    shading: 'material',
    background: 'dark',
    lighting: 'studio',
    grid: false,
    axes: false,
    bounds: false,
  };
  const port: NativeViewportPort = {
    ...(parameters.has('missing-binding')
      ? {}
      : {
          bindEditing(binding: NativeEditBinding | null) {
            log.bindings++;
            log.boundProject = binding?.state.projectId ?? null;
          },
        }),
    getCamera: () => structuredClone(camera),
    setCamera(value) {
      log.cameraWrites++;
      camera = structuredClone(value);
      return { ok: true };
    },
    cameraPreset() {
      return { ok: true };
    },
    focusNode() {
      return { ok: true };
    },
    getViewOptions: () => ({ ...view }),
    setViewOptions(value) {
      view = { ...value };
      return { ok: true };
    },
    get status() {
      return status;
    },
    setProject(project) {
      if (throwSync && project.revision > 0) throw new Error('Fixture sync failed');
      log.revision = project.revision;
      onStatus(port.status);
      return { ok: true };
    },
    resetCamera() {},
    fitCamera() {},
    cameraAction() {
      return { ok: true };
    },
    suspend(contract) {
      if (
        contract.persistedRevision !== contract.currentRevision ||
        contract.currentRevision !== log.revision ||
        !contract.sourcesComplete
      )
        return { ok: false, reason: 'Unsaved fixture' };
      log.suspends++;
      status = { state: 'suspended' };
      onStatus(port.status);
      return { ok: true };
    },
    resume() {
      status = { state: 'active' };
      onStatus(port.status);
      return { ok: true };
    },
    async capturePng() {
      log.captures.push(log.revision);
      if (parameters.has('capture-delay')) {
        log.capturePending = true;
        await new Promise<void>((resolve) => {
          completeCapture = resolve;
        });
        log.capturePending = false;
      }
      return new Blob([new Uint8Array([log.revision])], { type: 'image/png' });
    },
    dispose() {
      log.disposed = true;
      status = { state: 'disposed' };
      onStatus(status);
    },
  };
  if (delay) await new Promise<void>((resolve) => pending.push(resolve));
  return port;
};
const api = {
  get ports() {
    return ports.map(({ host, ...rest }) => ({ ...rest, connected: host.isConnected }));
  },
  get authorRenders() {
    return authorRenders;
  },
  async samples(count: number) {
    if (!lastGesture) throw new Error('Missing preview');
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      lastGesture.edit.preview(lastGesture.token, [NaN, 0, 0]);
      lastGesture.edit.preview(lastGesture.token, [i + 0.25, 0, 0]);
    }
  },
  get editing() {
    return currentEdit?.state ?? null;
  },
  preview(delta: Vec3 = [1, 0, 0]) {
    if (!currentEdit) throw new Error('Editing fixture not enabled');
    const started = currentEdit.begin();
    if (!started.ok) return started;
    lastGesture = { edit: currentEdit, token: started.token };
    return currentEdit.preview(started.token, delta);
  },
  clearSelection() {
    currentEdit?.setSelection([]);
  },
  replaceBinding() {
    replaceBinding?.();
  },
  commitLast() {
    return lastGesture?.edit.commit(lastGesture.token);
  },
  finishCapture() {
    completeCapture?.();
  },
  finishSave() {
    completeSave?.();
  },
  resolve(index: number) {
    pending[index]?.();
  },
};
Object.assign(window, { panelHarness: api });
export type PanelHarness = typeof api;

export function Harness() {
  const [project, setProject] = useState(() => canonical);
  const [bindingVersion, setBindingVersion] = useState(0);
  const editing = useMemo(() => {
    if (!parameters.has('editing')) return undefined;
    const owner = `${project.id}:${bindingVersion}`;
    const binding = new TransformTransaction({
      getProject: () => structuredClone(canonical),
      getIdentity: () => ({ id: canonical.id, revision: canonical.revision }),
      isReadOnly: () => false,
      commit(updates) {
        const next = structuredClone(canonical);
        for (const update of updates)
          next.nodes.find((node) => node.id === update.id)!.transform = structuredClone(
            update.transform,
          );
        next.revision++;
        canonical = next;
        binding.reconcile(owner);
        setProject(next);
      },
    });
    binding.setEvaluator({
      selectionFrame: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }),
      evaluateDelta: (source, context, _frame, delta) =>
        context.selection.map((id) => ({
          id,
          transform: {
            ...structuredClone(source.nodes.find((node) => node.id === id)!.transform),
            translation: [...delta],
          },
        })),
    });
    binding.setSelection(canonical.nodes.map((node) => node.id));
    return binding;
  }, [project.id, bindingVersion]);
  useLayoutEffect(() => {
    currentEdit = editing ?? null;
    replaceBinding = () => setBindingVersion((value) => value + 1);
    return () => {
      if (currentEdit === editing) currentEdit = null;
      replaceBinding = null;
    };
  }, [editing]);
  const [failSave, setFailSave] = useState(false);
  const captureImmediately = useRef(false);
  const saved = useRef(0);
  useLayoutEffect(() => {
    if (!captureImmediately.current) return;
    captureImmediately.current = false;
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.textContent === 'PNG画像を保存',
    );
    button?.click();
  }, [project]);
  return (
    <>
      <button
        onClick={() => {
          captureImmediately.current = true;
          canonical = { ...project, revision: project.revision + 1 };
          editing?.reconcile();
          setProject(canonical);
        }}
      >
        Increment and capture in layout
      </button>
      <button
        onClick={() => {
          canonical = createProject('panel-b', 'Panel B');
          editing?.reconcile();
          setProject(canonical);
        }}
      >
        Switch project
      </button>
      <button
        onClick={() => {
          throwSync = !throwSync;
        }}
      >
        Toggle sync failure
      </button>
      <button onClick={() => setFailSave((value) => !value)}>Toggle save failure</button>
      {editing && (
        <Profiler
          id="authoring"
          onRender={() => {
            authorRenders++;
          }}
        >
          <NativeAuthoringPanel
            project={project}
            edit={editing}
            disabled={false}
            execute={(operation) => {
              editing.cancel('fixture authoring');
              const next = structuredClone(canonical);
              operation(next);
              next.revision++;
              canonical = next;
              editing.reconcile();
              setProject(next);
            }}
          />
        </Profiler>
      )}
      <NativeViewportPanel
        project={project}
        editing={editing}
        factory={factory}
        onSave={async () => {
          if (failSave) throw new Error('Fixture save failed');
          const requestedRevision = project.revision;
          if (new URLSearchParams(location.search).has('save-delay'))
            await new Promise<void>((resolve) => {
              completeSave = resolve;
            });
          saved.current = requestedRevision;
        }}
        getSuspensionContract={() => ({
          currentRevision: project.revision,
          persistedRevision: saved.current,
          sourcesComplete: true,
        })}
      />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
