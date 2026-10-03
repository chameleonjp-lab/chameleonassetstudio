import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject } from '../../src/core3d/model/project';
import {
  NativeViewportPanel,
  type NativeViewportFactory,
  type NativeViewportPort,
  type NativeViewportStatus,
} from '../../src/features/editor3d/NativeViewportPanel';

type PortLog = {
  revision: number;
  disposed: boolean;
  captures: number[];
  suspends: number;
  host: HTMLElement;
};
const ports: PortLog[] = [];
let throwSync = false;
let completeSave: (() => void) | null = null;
const pending: (() => void)[] = [];
const delay = new URLSearchParams(location.search).has('delay');
const factory: NativeViewportFactory = async (host, onStatus) => {
  const log: PortLog = { revision: -1, disposed: false, captures: [], suspends: 0, host };
  ports.push(log);
  let status: NativeViewportStatus = { state: 'active' };
  const port: NativeViewportPort = {
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
  const [project, setProject] = useState(() => createProject('panel-a', 'Panel A'));
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
          setProject((value) => ({ ...value, revision: value.revision + 1 }));
        }}
      >
        Increment and capture in layout
      </button>
      <button onClick={() => setProject(createProject('panel-b', 'Panel B'))}>
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
      <NativeViewportPanel
        project={project}
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
