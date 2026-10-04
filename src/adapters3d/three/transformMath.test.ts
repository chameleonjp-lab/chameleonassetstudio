import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { rotationFromDegrees } from '../../core3d/commands/objectEditing';
import type { NativeEditContext, NativeEditOptions } from '../../core3d/ports/editPort';
import type { Vec3 } from '../../core3d/model/project';
import { editFixture } from '../../../tools/3d-edit-evaluation/fixtures';
import {
  evaluateDelta as evaluatedDelta,
  selectionFrame as evaluatedFrame,
} from '../../../tools/3d-edit-evaluation/transaction';
import { evaluateDelta, exactTRS, selectionFrame, snapDelta } from './transformMath';

function context(
  options: Partial<NativeEditOptions> = {},
  selection = ['box-node'],
): NativeEditContext {
  return {
    selection,
    activeId: selection[0],
    options: { mode: 'translate', space: 'world', snap: null, ...options },
    readOnly: false,
    lockedIds: [],
  };
}

describe('adopted transform math without WebGL', () => {
  it.each(['translate', 'rotate', 'scale'] as const)(
    'retains the evaluated %s contract for both frames and multi-selection',
    (mode) => {
      for (const space of ['world', 'local'] as const) {
        for (const selection of [['box-node'], ['right-node'], ['box-node', 'right-node']]) {
          const project = editFixture();
          project.nodes[0].transform.rotation = rotationFromDegrees([0, 0, 45]);
          const settings = context({ mode, space, snap: 0.25 }, selection);
          const frame = selectionFrame(project, settings);
          const input: Vec3 = mode === 'scale' ? [1.75, 1.75, 1.75] : [0.7, -0.3, 0.2];
          const before = structuredClone(project);
          expect(frame).toEqual(evaluatedFrame(project, settings));
          expect(evaluateDelta(project, settings, frame, input)).toEqual(
            evaluatedDelta(project, settings, frame, input).updates,
          );
          expect(project).toEqual(before);
        }
      }
    },
  );

  it('rejects shear with relative precision for tiny reflected geometry', () => {
    const project = editFixture();
    project.nodes[0].transform.rotation = rotationFromDegrees([0, 0, 45]);
    project.nodes[0].transform.scale = [-1e-8, 1e-8, 1e-8];
    const settings = context({ mode: 'scale' });
    expect(() =>
      evaluateDelta(project, settings, selectionFrame(project, settings), [2, 1, 1]),
    ).toThrow('shear');
    expect(() => exactTRS(new Matrix4().makeScale(0, 1, 1))).toThrow('Singular');
  });

  it('preserves representable translation under a huge parent origin and rejects local precision loss', () => {
    const project = editFixture();
    project.nodes.find((node) => node.id === 'group-node')!.transform.translation = [1e16, 0, 0];
    const settings = context({}, ['right-node']);
    expect(
      evaluateDelta(project, settings, selectionFrame(project, settings), [0.01, 0, 0])[0].transform
        .translation[0],
    ).toBe(1.26);
    project.nodes.find((node) => node.id === 'right-node')!.transform.translation = [1e16, 0, 0];
    expect(() =>
      evaluateDelta(project, settings, selectionFrame(project, settings), [0.01, 0, 0]),
    ).toThrow('precision');
  });

  it.each(['translate', 'rotate', 'scale'] as const)(
    'keeps %s no-ops exact without decomposition noise',
    (mode) => {
      const project = editFixture();
      project.nodes[0].transform.rotation = rotationFromDegrees([23, 37, 51]);
      project.nodes[0].transform.scale = [-1e-8, 2e-8, 3e-8];
      const settings = context({ mode });
      const input: Vec3 =
        mode === 'scale' ? [1, 1, 1] : mode === 'rotate' ? [Math.PI * 2, 0, 0] : [0, 0, 0];
      expect(
        evaluateDelta(project, settings, selectionFrame(project, settings), input)[0].transform,
      ).toEqual(project.nodes[0].transform);
    },
  );

  it('uses the same delta snap for numeric and pointer inputs and rejects an invalid final sample', () => {
    expect(snapDelta([1.34, 0.61, 1], context({ mode: 'scale', snap: 0.25 }).options)).toEqual([
      1.25, 0.5, 1,
    ]);
    const project = editFixture(),
      settings = context();
    expect(() =>
      evaluateDelta(project, settings, selectionFrame(project, settings), [NaN, 0, 0]),
    ).toThrow('finite');
  });

  it('rejects ambiguous, locked, and read-only selection frames', () => {
    const project = editFixture();
    expect(() => selectionFrame(project, context({}, ['group-node', 'right-node']))).toThrow(
      'ambiguous',
    );
    expect(() => selectionFrame(project, { ...context(), lockedIds: ['box-node'] })).toThrow(
      'locked',
    );
    expect(() => selectionFrame(project, { ...context(), readOnly: true })).toThrow('Read-only');
  });
});
