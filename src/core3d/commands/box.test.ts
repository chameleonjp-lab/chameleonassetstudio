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
