import { describe, expect, it } from 'vitest';
import { createProject, identityTransform, cloneProject } from '../model/project';
import { addBox } from '../commands/box';
import { addRigJoint, bindSkin } from './authoring';
import {
  evaluateRigPose,
  evaluateTransformPose,
  prepareTransformPose,
  rigPoseTargetIds,
} from './pose';
import { worldMatrix, transformPoint } from '../model/coordinates';
function fixture() {
  const p = createProject('pose');
  addBox(p, 'box');
  addRigJoint(p, 'a', 'A', null, identityTransform());
  addRigJoint(p, 'b', 'B', 'a', { ...identityTransform(), translation: [0, 1, 0] });
  bindSkin(
    p,
    'skin',
    p.meshes[0].id,
    ['a', 'b'],
    p.meshes[0].vertices.map((v) => ({ vertexId: v.id, jointIds: ['a', 'b'], values: [0.5, 0.5] })),
  );
  return p;
}
describe('rig pose evaluation', () => {
  it('returns detached local pose while retaining rest, weights, revision and bind matrices', () => {
    const p = fixture(),
      before = cloneProject(p);
    const result = evaluateRigPose(p, [
      { nodeId: 'b', transform: { ...identityTransform(), translation: [1, 1, 0] } },
    ]);
    expect(result.nodes.find((n) => n.id === 'b')!.transform.translation).toEqual([1, 1, 0]);
    expect(p).toEqual(before);
    expect(result.skins).toEqual(p.skins);
    expect(result.revision).toBe(p.revision);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid joint scale %s', (scale) => {
    const p = fixture(),
      before = cloneProject(p);
    expect(() =>
      evaluateRigPose(p, [
        { nodeId: 'b', transform: { ...identityTransform(), scale: [scale, 1, 1] } },
      ]),
    ).toThrow();
    expect(p).toEqual(before);
  });
  it('rejects duplicate, unknown, non-joint, locked and overflowing transforms', () => {
    const p = fixture();
    const update = { nodeId: 'b', transform: identityTransform() };
    expect(() => evaluateRigPose(p, [update, update])).toThrow();
    expect(() => evaluateRigPose(p, [{ ...update, nodeId: 'box-node' }])).toThrow();
    expect(() => evaluateRigPose(p, [{ ...update, nodeId: 'missing' }])).toThrow();
    expect(() =>
      evaluateRigPose(p, [
        { nodeId: 'a', transform: { ...identityTransform(), translation: [3.5e38, 0, 0] } },
      ]),
    ).toThrow();
    p.nodes.find((n) => n.id === 'a')!.locked = true;
    expect(() => evaluateRigPose(p, [update])).toThrow();
  });
  it('rejects overflowing shader intermediates even when precombined local matrices would cancel', () => {
    const p = createProject('overflow');
    addBox(p, 'box');
    p.nodes[0].transform.translation = [2e38, 0, 0];
    addRigJoint(p, 'joint', 'Joint', null, { ...identityTransform(), translation: [-2e38, 0, 0] });
    bindSkin(
      p,
      'skin',
      p.meshes[0].id,
      ['joint'],
      p.meshes[0].vertices.map((vertex) => ({
        vertexId: vertex.id,
        jointIds: ['joint'],
        values: [1],
      })),
    );
    expect(() => evaluateRigPose(p, [{ nodeId: 'joint', transform: identityTransform() }])).toThrow(
      'Float32',
    );
  });
  it('validates zero-weight padded shader slots before their multiplication by zero', () => {
    const p = fixture();
    p.nodes.find((node) => node.id === 'b')!.parentId = null;
    p.meshes[0].vertices[0].position = [2e38, 0, 0];
    p.skins[0].weights = p.meshes[0].vertices.map((vertex) => ({
      vertexId: vertex.id,
      jointIds: ['b'],
      values: [1],
    }));
    expect(() =>
      evaluateRigPose(p, [
        { nodeId: 'a', transform: { ...identityTransform(), scale: [4, 1, 1] } },
      ]),
    ).toThrow('Float32');
  });
  it('retains accepted near-unit weight sums without assuming the blended normal matrix is affine', () => {
    const p = fixture();
    p.skins[0].weights[0].values = [0.5, 0.500001];
    expect(() =>
      evaluateRigPose(p, [{ nodeId: 'b', transform: identityTransform() }]),
    ).not.toThrow();
    expect(p.skins[0].weights[0].values).toEqual([0.5, 0.500001]);
  });
  it('rejects overflow in unskinned descendants moved by a posed joint', () => {
    const p = fixture();
    addBox(p, 'unskinned');
    p.nodes.find((node) => node.meshId === p.meshes[1].id)!.parentId = 'a';
    p.meshes[1].vertices[0].position = [2e38, 0, 0];
    expect(() => evaluateRigPose(p, [])).not.toThrow();
    expect(() =>
      evaluateRigPose(p, [
        { nodeId: 'a', transform: { ...identityTransform(), scale: [4, 1, 1] } },
      ]),
    ).toThrow('Float32');
  });
  it('allows an independent rig to pose while another mesh is locked', () => {
    const p = fixture();
    addBox(p, 'other');
    addRigJoint(p, 'independent', 'Independent', null, identityTransform());
    bindSkin(
      p,
      'other-skin',
      p.meshes[1].id,
      ['independent'],
      p.meshes[1].vertices.map((vertex) => ({
        vertexId: vertex.id,
        jointIds: ['independent'],
        values: [1],
      })),
    );
    p.nodes.find((node) => node.meshId === p.meshes[1].id)!.locked = true;
    expect(() =>
      evaluateRigPose(p, [{ nodeId: 'a', transform: identityTransform() }]),
    ).not.toThrow();
  });
  it('validates stored binds and mixed vertex results, not just transform shapes', () => {
    const p = fixture();
    p.skins[0].joints[1].inverseBind[0] = 0;
    expect(() => evaluateRigPose(p, [])).toThrow();
    const extreme = fixture();
    extreme.meshes[0].vertices[0].position = [2e38, 0, 0];
    expect(() =>
      evaluateRigPose(extreme, [
        { nodeId: 'a', transform: { ...identityTransform(), scale: [4, 1, 1] } },
      ]),
    ).toThrow();
  });
});

it('allows display-only object and locked bone animation while retaining strict manual rig authorization', () => {
  const p = fixture();
  p.nodes.find((node) => node.id === 'b')!.locked = true;
  const joint = {
    nodeId: 'b',
    transform: { ...identityTransform(), translation: [1, 1, 0] as [number, number, number] },
  };
  expect(() => evaluateRigPose(p, [joint])).toThrow();
  expect(
    evaluateTransformPose(p, [joint]).nodes.find((node) => node.id === 'b')!.transform.translation,
  ).toEqual([1, 1, 0]);
  const object = {
    nodeId: p.nodes.find((node) => node.meshId)!.id,
    transform: identityTransform(),
  };
  expect(() => evaluateRigPose(p, [object])).toThrow();
  expect(() => evaluateTransformPose(p, [object])).not.toThrow();
});

it('prepared animation falls back near Float32 limits instead of trusting source AABB corners', () => {
  const p = fixture();
  p.clips = [];
  p.nodes.find((node) => node.id === 'b')!.transform = identityTransform();
  p.meshes[0].faces = [];
  p.meshes[0].vertices = [
    [0, 1, 0],
    [0.125, 1, 0],
    [0.0075, 1, 0],
  ].map((position, index) => ({ id: 'v' + index, position: position as [number, number, number] }));
  const shape = p.nodes.find((node) => node.meshId)!;
  shape.transform.rotation = [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)];
  p.skins[0].joints = [p.skins[0].joints[0]];
  p.skins[0].weights = p.meshes[0].vertices.map((vertex) => ({
    vertexId: vertex.id,
    jointIds: ['a'],
    values: [1],
  }));
  const updates = [
    {
      nodeId: 'a',
      transform: {
        translation: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] as [
          number,
          number,
          number,
          number,
        ],
        scale: [3.4028234663852886e38, 3.4028234663852886e38, 3.4028234663852886e38] as [
          number,
          number,
          number,
        ],
      },
    },
  ];
  expect(() => evaluateTransformPose(p, updates)).toThrow('Float32');
  expect(() => prepareTransformPose(p)(updates)).toThrow('Float32');
});

describe('rigid-only guide pose eligibility', () => {
  function rigid() {
    const project = createProject('rigid-pose');
    addBox(project, 'part');
    addRigJoint(project, 'guide', 'Guide', null, identityTransform());
    addRigJoint(project, 'tip', 'Tip', 'guide', { ...identityTransform(), translation: [0, 1, 0] });
    project.nodes[0].parentId = 'tip';
    return project;
  }
  it('allows meshless ancestors of rigid parts while preserving original geometry/rest', () => {
    const project = rigid(),
      before = cloneProject(project);
    expect([...rigPoseTargetIds(project)]).toEqual(['tip', 'guide']);
    const posed = evaluateRigPose(project, [
      { nodeId: 'guide', transform: { ...identityTransform(), translation: [3, 0, 0] } },
    ]);
    expect(transformPoint(worldMatrix(posed, 'part-node'), [0, 0, 0])).toEqual([3, 1, 0]);
    expect(posed.meshes).toEqual(before.meshes);
    expect(posed.skins).toEqual([]);
    expect(project).toEqual(before);
  });
  it('rejects an unrelated empty guide and a mesh target', () => {
    const project = rigid();
    addRigJoint(project, 'unused', 'Unused', null, identityTransform());
    for (const nodeId of ['unused', 'part-node'])
      expect(() =>
        evaluateRigPose(project, [{ nodeId, transform: identityTransform() }]),
      ).toThrow();
  });
  it('keeps descendant/ancestor locks and Float32 limits for rigid-only poses', () => {
    const project = rigid(),
      before = cloneProject(project);
    expect(() =>
      evaluateRigPose(project, [
        { nodeId: 'guide', transform: { ...identityTransform(), translation: [1e39, 0, 0] } },
      ]),
    ).toThrow();
    expect(project).toEqual(before);
    project.nodes[0].locked = true;
    expect(() =>
      evaluateRigPose(project, [{ nodeId: 'guide', transform: identityTransform() }]),
    ).toThrow();
  });
  it('does not grant eligibility merely because a group is ancestor of a smooth skin mesh', () => {
    const project = fixture();
    addRigJoint(project, 'nonpalette', 'Nonpalette', null, identityTransform());
    project.nodes.find((node) => node.meshId)!.parentId = 'nonpalette';
    expect(rigPoseTargetIds(project).has('nonpalette')).toBe(false);
  });
});
