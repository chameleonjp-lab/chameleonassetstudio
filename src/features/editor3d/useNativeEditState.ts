import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Project3D } from '../../core3d/model/project';
import type { NativeEditBinding, NativeEditState } from '../../core3d/ports/editPort';

type ControlState = Pick<
  NativeEditState,
  | 'projectId'
  | 'revision'
  | 'context'
  | 'active'
  | 'token'
  | 'lastReason'
  | 'blocked'
  | 'evaluatorReady'
> & { hasPreview: boolean };

/** Full interaction status is only for the small numeric-transform controls. */
export function useNativeEditState(edit?: NativeEditBinding): ControlState | null {
  const store = useMemo(() => {
    let key = '';
    let snapshot: ControlState | null = null;
    return {
      subscribe: (listener: () => void) => edit?.subscribe(listener) ?? (() => {}),
      getSnapshot: () => {
        if (!edit) return null;
        const state = edit.state;
        const next: ControlState = {
          projectId: state.projectId,
          revision: state.revision,
          context: state.context,
          active: state.active,
          token: state.token,
          lastReason: state.lastReason,
          blocked: state.blocked,
          evaluatorReady: state.evaluatorReady,
          hasPreview: state.preview !== null,
        };
        const nextKey = JSON.stringify(next);
        if (nextKey !== key) {
          key = nextKey;
          snapshot = next;
        }
        return snapshot;
      },
    };
  }, [edit]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

type SelectionState = Pick<NativeEditState, 'projectId' | 'revision'> &
  Pick<NativeEditState['context'], 'selection' | 'activeId'>;

/** Heavy panels must not subscribe to per-sample validity, preview, or gesture status. */
function useNativeSelectionState(edit?: NativeEditBinding): SelectionState | null {
  const store = useMemo(() => {
    let key = '';
    let snapshot: SelectionState | null = null;
    return {
      subscribe: (listener: () => void) => edit?.subscribe(listener) ?? (() => {}),
      getSnapshot: () => {
        if (!edit) return null;
        const state = edit.state;
        const next: SelectionState = {
          projectId: state.projectId,
          revision: state.revision,
          selection: state.context.selection,
          activeId: state.context.activeId,
        };
        const nextKey = JSON.stringify(next);
        if (nextKey !== key) {
          key = nextKey;
          snapshot = next;
        }
        return snapshot;
      },
    };
  }, [edit]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The local fallback is only for isolated fixtures that do not own a session. */
export function useNativeObjectSelection(project: Project3D, edit?: NativeEditBinding) {
  const state = useNativeSelectionState(edit);
  const [standalone, setStandalone] = useState({
    projectId: project.id,
    ids: [] as string[],
    activeId: null as string | null,
  });
  const selectedIds =
    state?.selection ?? (standalone.projectId === project.id ? standalone.ids : []);
  const activeId = state
    ? state.activeId
    : standalone.projectId === project.id
      ? standalone.activeId
      : null;
  function setSelection(ids: string[], nextActiveId: string | null = ids.at(-1) ?? null) {
    if (edit) edit.setSelection(ids, nextActiveId);
    else setStandalone({ projectId: project.id, ids, activeId: nextActiveId });
  }
  function setActive(id: string) {
    const ids = edit?.state.context.selection ?? selectedIds;
    setSelection(id ? (ids.includes(id) ? ids : [id]) : [], id || null);
  }
  return { state, selectedIds, activeId, setSelection, setActive };
}
