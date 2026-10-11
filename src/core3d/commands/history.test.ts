import { afterEach, describe, it, expect, vi } from 'vitest';
import { createProject, type Project3D } from '../model/project';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';
import * as resourceEstimates from '../profile/resourceEstimates';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  reserveResourceBytes,
  resourceLedgerSnapshot,
} from '../profile/resourceLedger';
import { smallProject } from '../fixtures/project';
import { ProjectHistory, HistoryBudgetError } from './history';
describe('revision history', () => {
  it('returns frozen detached plain metadata, with no ownership claim for untracked history', () => {
    const project = smallProject(),
      original = structuredClone(project),
      h = new ProjectHistory(project, undefined, true);
    const initial = h.metadata;
    expect(initial).toEqual({
      undoCount: 0,
      redoCount: 0,
      hasPreview: false,
      serializedCommitBudgetBytes: 32 * 1024 * 1024,
      ownershipEstimateBytes: null,
    });
    expect(Object.getPrototypeOf(initial)).toBe(Object.prototype);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Reflect.set(initial, 'undoCount', 99)).toBe(false);
    expect(h.metadata).not.toBe(initial);
    expect(h.metadata).toEqual(initial);
    expect(h.revision).toBe(0);
    expect(h.dirty).toBe(false);
    h.execute((p) => {
      p.name = 'Committed';
    });
    expect(h.metadata).toMatchObject({ undoCount: 1, ownershipEstimateBytes: null });
    expect(initial.undoCount).toBe(0);
    expect(project).toEqual(original);
  });

  it('reports preview and existing clear semantics without changing revision or saved state on reads', () => {
    const h = new ProjectHistory(smallProject(), undefined, true);
    h.previewCommand((p) => {
      p.name = 'Preview only';
    });
    expect(h.metadata).toMatchObject({ undoCount: 0, redoCount: 0, hasPreview: true });
    // An empty-stack cleanup is already a no-op, including an active preview.
    h.clearHistory();
    expect(h.metadata.hasPreview).toBe(true);
    expect(h.revision).toBe(0);
    expect(h.dirty).toBe(false);
    h.cancelPreview();
    expect(h.metadata.hasPreview).toBe(false);
    h.previewCommand((p) => {
      p.name = 'Committed preview';
    });
    h.commitPreview();
    expect(h.metadata).toMatchObject({ undoCount: 1, redoCount: 0, hasPreview: false });
    h.acknowledgeSaved(h.project.id, h.revision);
    const committed = h.metadata;
    expect(h.metadata).toEqual(committed);
    expect(h.revision).toBe(1);
    expect(h.dirty).toBe(false);
    h.undo();
    expect(h.metadata).toMatchObject({ undoCount: 0, redoCount: 1, hasPreview: false });
    h.redo();
    expect(h.metadata).toEqual(committed);
    h.previewCommand((p) => {
      p.name = 'Cancelled by cleanup';
    });
    h.clearHistory();
    expect(h.metadata).toMatchObject({ undoCount: 0, redoCount: 0, hasPreview: false });
    expect(h.project.name).toBe('Committed preview');
    expect(h.revision).toBe(4);
    expect(h.dirty).toBe(true);
    h.clearHistory();
    expect(h.revision).toBe(4);
  });

  it('explains budget rejection with current-content backup guidance and preserves existing history', () => {
    const project = createProject('p', 'A');
    const first = { ...project, name: 'B', revision: 1 };
    const budget = new TextEncoder().encode(JSON.stringify([project, first])).byteLength;
    const h = new ProjectHistory(project, budget, true);
    h.execute((p) => {
      p.name = 'B';
    });
    h.previewCommand((p) => {
      p.name = 'C';
    });
    const before = h.metadata,
      current = h.project,
      preview = h.preview;
    expect(() => h.commitPreview()).toThrow(HistoryBudgetError);
    const message = new HistoryBudgetError().message;
    expect(message).toContain('この操作は適用していません');
    expect(message).toContain('現在の内容とUndo/Redo履歴は保持しています');
    expect(message).toContain('現在の内容をバックアップしてください');
    expect(message).toContain('バックアップにUndo/Redo履歴は含まれません');
    expect(message).not.toMatch(/整理|削除|クリア/);
    expect(h.metadata).toEqual(before);
    expect(h.metadata.serializedCommitBudgetBytes).toBe(budget);
    expect(h.project).toEqual(current);
    expect(h.preview).toEqual(preview);
    expect(h.revision).toBe(1);
    expect(h.dirty).toBe(true);
    expect(h.undo()).toBe(true);
    expect(h.project.name).toBe('A');
    expect(h.redo()).toBe(true);
    expect(h.project.name).toBe('B');
  });

  it('explicit history cleanup advances reference generation without deleting current content', () => {
    const h = new ProjectHistory(smallProject());
    h.execute((p) => {
      p.name = 'Edited';
    });
    h.clearHistory();
    expect(h.project.name).toBe('Edited');
    expect(h.revision).toBe(2);
    expect(h.canUndo).toBe(false);
    expect(h.historyBlobIds.revision).toBe(2);
    h.clearHistory();
    expect(h.revision).toBe(2);
  });
  it('detaches callback-owned vectors before preview is retained', () => {
    const h = new ProjectHistory(smallProject());
    const position: [number, number, number] = [2, 0, 0];
    h.previewCommand((p) => {
      p.meshes[0].vertices[0].position = position;
    });
    position[0] = Number.NaN;
    h.commitPreview();
    expect(h.project.meshes[0].vertices[0].position).toEqual([2, 0, 0]);
  });
  it('preview/cancel never marks an edit as committed and commit is one revision', () => {
    const history = new ProjectHistory(smallProject(), undefined, true);
    history.previewCommand((p) => {
      p.name = 'Preview';
    });
    expect(history.project.name).not.toBe('Preview');
    expect(history.dirty).toBe(false);
    history.cancelPreview();
    expect(history.preview.name).toBe(history.project.name);
    history.previewCommand((p) => {
      p.name = 'Committed';
    });
    history.commitPreview();
    expect(history.revision).toBe(1);
    expect(history.project.name).toBe('Committed');
    history.commitPreview();
    expect(history.revision).toBe(1);
  });
  it('Undo and Redo create fresh revisions, branch clears Redo, failed command is atomic', () => {
    const h = new ProjectHistory(smallProject());
    h.execute((p) => {
      p.name = 'B';
    });
    h.execute((p) => {
      p.name = 'C';
    });
    expect(h.undo()).toBe(true);
    expect(h.project.name).toBe('B');
    expect(h.revision).toBe(3);
    expect(h.redo()).toBe(true);
    expect(h.project.name).toBe('C');
    expect(h.revision).toBe(4);
    h.undo();
    h.execute((p) => {
      p.name = 'D';
    });
    expect(h.canRedo).toBe(false);
    const before = h.project;
    expect(() =>
      h.execute((p) => {
        p.nodes[0].meshId = 'missing';
      }),
    ).toThrow();
    expect(h.project).toEqual(before);
  });
  it('A save acknowledgement arriving after B edit leaves B dirty; old acknowledgement cannot revert saved state', () => {
    const h = new ProjectHistory(createProject('p'), undefined, true);
    h.execute((p) => {
      p.name = 'A';
    });
    const a = h.revision;
    h.execute((p) => {
      p.name = 'B';
    });
    h.acknowledgeSaved('p', a);
    expect(h.dirty).toBe(true);
    h.acknowledgeSaved('p', h.revision);
    h.acknowledgeSaved('p', a);
    expect(h.dirty).toBe(false);
  });
  it('does not silently trim history when its payload budget is exceeded', () => {
    const h = new ProjectHistory(createProject('p'), 1, true);
    expect(() =>
      h.execute((p) => {
        p.name = 'B';
      }),
    ).toThrow(HistoryBudgetError);
    expect(h.revision).toBe(0);
    expect(h.dirty).toBe(false);
    expect(h.canUndo).toBe(false);
  });
});

describe('tracked history ownership', () => {
  const releases: (() => void)[] = [];
  function tracked(project = smallProject(), budget?: number) {
    const history = new ProjectHistory(project, budget, true, { trackResources: true });
    releases.push(() => history.dispose());
    return history;
  }
  function pressure(bytes: number) {
    const release = reserveResourceBytes('geometry', bytes);
    releases.push(release);
    return release;
  }
  const ownedBytes = () => resourceLedgerSnapshot().byCategory.history;
  afterEach(() => {
    vi.restoreAllMocks();
    releases.splice(0).forEach((release) => release());
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('reads stored metadata without serialization, model estimation or cloning, including inside rejected callbacks', () => {
    const h = tracked();
    h.execute((p) => {
      p.name = 'B';
    });
    h.undo();
    h.previewCommand((p) => {
      p.name = 'Preview';
    });
    const before = h.metadata,
      revision = h.revision,
      dirty = h.dirty,
      ledger = resourceLedgerSnapshot();
    expect(before).toMatchObject({
      undoCount: 0,
      redoCount: 1,
      hasPreview: true,
      ownershipEstimateBytes: ownedBytes(),
    });
    const clone = vi.spyOn(globalThis, 'structuredClone'),
      serialize = vi.spyOn(JSON, 'stringify'),
      encode = vi.spyOn(TextEncoder.prototype, 'encode'),
      estimate = vi.spyOn(resourceEstimates, 'estimateCanonicalBytes');
    for (let read = 0; read < 10; read++) expect(h.metadata).toEqual(before);
    expect(clone).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(estimate).not.toHaveBeenCalled();
    expect(h.revision).toBe(revision);
    expect(h.dirty).toBe(dirty);
    expect(resourceLedgerSnapshot()).toEqual(ledger);
    expect(() =>
      h.execute(() => {
        // Temporary candidate reservation must not inflate retained metadata.
        expect(ownedBytes()).toBeGreaterThan(before.ownershipEstimateBytes!);
        expect(h.metadata).toEqual(before);
        throw new Error('Rejected callback');
      }),
    ).toThrow('Rejected callback');
    expect(h.metadata).toEqual(before);
    expect(resourceLedgerSnapshot()).toEqual(ledger);
  });

  it.each([-1, 0, 1])(
    'admits constructor at the shared cap boundary %+i before cloning',
    (delta) => {
      const project = smallProject();
      const bytes = estimateCanonicalBytes(project);
      pressure(RESOURCE_ESTIMATE_CAP_BYTES - bytes + delta);
      const clone = vi.spyOn(globalThis, 'structuredClone');
      const before = resourceLedgerSnapshot();
      if (delta > 0) {
        expect(() => tracked(project)).toThrow('cap');
        expect(clone).not.toHaveBeenCalled();
        expect(resourceLedgerSnapshot()).toEqual(before);
      } else {
        tracked(project);
        expect(clone).toHaveBeenCalledOnce();
        expect(ownedBytes()).toBe(bytes);
        expect(resourceLedgerSnapshot().totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES + delta);
      }
    },
  );

  it('counts current, undo, redo and preview once and transfers private snapshots without new clones', () => {
    const h = tracked();
    const a = estimateCanonicalBytes(h.project);
    expect(h.metadata.ownershipEstimateBytes).toBe(a);
    h.execute((p) => {
      p.name = 'B';
    });
    const b = estimateCanonicalBytes(h.project);
    expect(ownedBytes()).toBe(a + b);
    expect(h.metadata).toMatchObject({ undoCount: 1, ownershipEstimateBytes: a + b });
    h.execute((p) => {
      p.name = 'Longer C';
    });
    const c = estimateCanonicalBytes(h.project);
    h.previewCommand((p) => {
      p.name = 'Preview D';
    });
    const preview = estimateCanonicalBytes(h.preview);
    expect(ownedBytes()).toBe(a + b + c + preview);
    expect(h.metadata).toMatchObject({
      undoCount: 2,
      redoCount: 0,
      hasPreview: true,
      ownershipEstimateBytes: a + b + c + preview,
    });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(h.undo()).toBe(true);
    expect(ownedBytes()).toBe(a + b + c);
    expect(h.metadata).toMatchObject({
      undoCount: 1,
      redoCount: 1,
      hasPreview: false,
      ownershipEstimateBytes: a + b + c,
    });
    expect(h.redo()).toBe(true);
    expect(ownedBytes()).toBe(a + b + c);
    expect(h.metadata).toMatchObject({ undoCount: 2, redoCount: 0 });
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    expect(h.revision).toBe(4);
    h.undo();
    h.execute((p) => {
      p.name = 'Branch';
    });
    const branch = estimateCanonicalBytes(h.project);
    expect(ownedBytes()).toBe(a + b + branch);
    expect(h.canRedo).toBe(false);
    expect(h.metadata).toMatchObject({
      undoCount: 2,
      redoCount: 0,
      ownershipEstimateBytes: a + b + branch,
    });
    h.clearHistory();
    expect(h.project.name).toBe('Branch');
    expect(ownedBytes()).toBe(branch);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.metadata).toMatchObject({
      undoCount: 0,
      redoCount: 0,
      ownershipEstimateBytes: branch,
    });
  });

  it('replaces/cancels previews and adopts an already-owned preview at full combined capacity', () => {
    const h = tracked();
    const original = estimateCanonicalBytes(h.project);
    h.previewCommand((p) => {
      p.name = 'First preview';
    });
    h.previewCommand((p) => {
      p.name = 'Second preview';
    });
    expect(ownedBytes()).toBe(original + estimateCanonicalBytes(h.preview));
    expect(h.metadata.ownershipEstimateBytes).toBe(ownedBytes());
    h.cancelPreview();
    expect(ownedBytes()).toBe(original);
    expect(h.metadata).toMatchObject({ hasPreview: false, ownershipEstimateBytes: original });
    h.previewCommand((p) => {
      p.name = 'Committed preview';
    });
    const before = ownedBytes();
    pressure(RESOURCE_ESTIMATE_CAP_BYTES - before);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    h.commitPreview();
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    expect(h.project.name).toBe('Committed preview');
    expect(h.canUndo).toBe(true);
    expect(ownedBytes()).toBe(before);
    expect(h.undo()).toBe(true);
    expect(h.redo()).toBe(true);
    h.clearHistory();
    expect(ownedBytes()).toBe(estimateCanonicalBytes(h.project));
  });

  it('preserves old redo, preview, project and ticket when the first clone cannot be admitted', () => {
    const h = tracked();
    h.execute((p) => {
      p.name = 'Saved in redo';
    });
    h.undo();
    h.previewCommand((p) => {
      p.name = 'Old preview';
    });
    const project = h.project;
    const preview = h.preview;
    pressure(RESOURCE_ESTIMATE_CAP_BYTES - resourceLedgerSnapshot().totalBytes);
    const before = resourceLedgerSnapshot();
    const edit = vi.fn();
    expect(() => h.execute(edit)).toThrow('cap');
    expect(edit).not.toHaveBeenCalled();
    expect(h.project).toEqual(project);
    expect(h.preview).toEqual(preview);
    expect(h.canRedo).toBe(true);
    expect(resourceLedgerSnapshot()).toEqual(before);
  });

  it.each(['execute', 'previewCommand'] as const)(
    'rolls back %s when growth fits one candidate but not its detached clone',
    (operation) => {
      const h = tracked(createProject('p', 'A'));
      h.execute((p) => {
        p.name = 'B';
      });
      h.undo();
      h.previewCommand((p) => {
        p.name = 'P';
      });
      const project = h.project;
      const preview = h.preview;
      const grown = { ...project, name: 'x'.repeat(64) };
      const estimate = estimateCanonicalBytes(grown);
      pressure(RESOURCE_ESTIMATE_CAP_BYTES - ownedBytes() - estimate * 2 + 1);
      const before = resourceLedgerSnapshot();
      const clone = vi.spyOn(globalThis, 'structuredClone');
      expect(() =>
        h[operation]((p) => {
          p.name = grown.name;
        }),
      ).toThrow('cap');
      expect(clone).toHaveBeenCalledOnce();
      clone.mockRestore();
      expect(resourceLedgerSnapshot()).toEqual(before);
      expect(h.project).toEqual(project);
      expect(h.preview).toEqual(preview);
      expect(h.canRedo).toBe(true);
    },
  );

  it('releases temporary ownership on callback, validation and detached-clone errors', () => {
    const h = tracked();
    h.previewCommand((p) => {
      p.name = 'Keep preview';
    });
    const before = resourceLedgerSnapshot();
    const project = h.project;
    const preview = h.preview;
    expect(() =>
      h.execute(() => {
        throw new Error('callback');
      }),
    ).toThrow('callback');
    expect(() =>
      h.execute((p) => {
        p.nodes[0].meshId = 'missing';
      }),
    ).toThrow();
    const real = globalThis.structuredClone;
    const failing = vi.spyOn(globalThis, 'structuredClone');
    failing.mockImplementationOnce((value) => real(value));
    failing.mockImplementationOnce(() => {
      throw new Error('clone failed');
    });
    expect(() =>
      h.execute((p) => {
        p.name = 'Never adopted';
      }),
    ).toThrow('clone failed');
    failing.mockRestore();
    expect(resourceLedgerSnapshot()).toEqual(before);
    expect(h.project).toEqual(project);
    expect(h.preview).toEqual(preview);
  });

  it.each([-1, 0, 1])(
    'keeps the serialized history budget boundary %+i independent of structural ownership',
    (delta) => {
      const project = createProject('p', 'A');
      const next = { ...project, name: 'B', revision: 1 };
      const bytes = new TextEncoder().encode(JSON.stringify([project, next])).byteLength;
      const h = tracked(project, bytes + delta);
      h.previewCommand((p) => {
        p.name = 'B';
      });
      const before = resourceLedgerSnapshot();
      if (delta < 0) {
        expect(() => h.commitPreview()).toThrow(HistoryBudgetError);
        expect(h.project).toEqual(project);
        expect(h.preview).toEqual({ ...project, name: 'B' });
        expect(h.canUndo).toBe(false);
        expect(resourceLedgerSnapshot()).toEqual(before);
      } else {
        h.commitPreview();
        expect(h.project).toEqual(next);
        expect(h.canUndo).toBe(true);
        expect(resourceLedgerSnapshot()).toEqual(before);
      }
    },
  );

  it('detaches callback-owned data and releases all snapshots only on explicit disposal', () => {
    const h = tracked();
    let escaped: Project3D | undefined;
    h.execute((p) => {
      escaped = p;
      p.name = 'Committed';
    });
    escaped!.name = 'Mutated caller';
    expect(h.project.name).toBe('Committed');
    h.previewCommand((p) => {
      p.name = 'Preview';
    });
    expect(ownedBytes()).toBeGreaterThan(0);
    h.dispose();
    h.dispose();
    expect(ownedBytes()).toBe(0);
    expect(() => h.project).toThrow('closed');
    expect(() => h.preview).toThrow('closed');
    expect(() => h.execute(() => {})).toThrow('closed');
    expect(h.revision).toBe(1);
    expect(h.dirty).toBe(true);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.retainedBlobIds).toEqual([]);
  });
});
