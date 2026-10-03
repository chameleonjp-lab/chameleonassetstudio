import { describe, it, expect } from 'vitest';
import { createProject } from '../model/project';
import { smallProject } from '../fixtures/project';
import { ProjectHistory, HistoryBudgetError } from './history';
describe('revision history', () => {
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
