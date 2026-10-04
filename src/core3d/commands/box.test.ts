import { describe, expect, it } from 'vitest';
import { ProjectHistory } from './history';
import { createProject, validateProject } from '../model/project';
import { addBox } from './box';

describe('native box command', () => {
  it('creates finite editable topology and undoes/redoes it as one revision', () => {
    const history = new ProjectHistory(createProject('box-project'));
    history.execute((project) => addBox(project, 'first'));
    const created = history.project;
    expect(() => validateProject(created)).not.toThrow();
    expect(created.meshes[0].vertices).toHaveLength(8);
    expect(created.meshes[0].faces).toHaveLength(12);
    // Each authored side covers one square; the diagonal corners agree within a side.
    for (let side = 0; side < 6; side++) {
      const corners = new Map<string, [number, number]>();
      for (const face of created.meshes[0].faces.slice(side * 2, side * 2 + 2)) {
        expect(face.uv).toHaveLength(3);
        const [a, b, c] = face.uv!;
        expect((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).toBeGreaterThan(0);
        face.vertexIds.forEach((id, i) => {
          if (corners.has(id)) expect(face.uv![i]).toEqual(corners.get(id));
          corners.set(id, face.uv![i]);
        });
      }
      expect(new Set([...corners.values()].map((v) => v.join(','))).size).toBe(4);
    }
    expect(created.revision).toBe(1);
    expect(history.undo()).toBe(true);
    expect(history.project.meshes).toEqual([]);
    expect(history.redo()).toBe(true);
    expect(history.project.meshes).toEqual(created.meshes);
  });
  it('rejects an ID collision without committing partial geometry', () => {
    const history = new ProjectHistory(createProject('box-project'));
    history.execute((project) => addBox(project, 'first'));
    const before = history.project;
    expect(() => history.execute((project) => addBox(project, 'first'))).toThrow('already exist');
    expect(history.project).toEqual(before);
  });
});
