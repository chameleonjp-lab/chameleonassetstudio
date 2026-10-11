import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createProject, identityTransform, cloneProject, type Project3D } from '../model/project';
import { worldMatrix, multiplyMatrices } from '../model/coordinates';
import { ProjectHistory } from '../commands/history';
import { addBox } from '../commands/box';
import { rotationFromDegrees } from '../commands/objectEditing';
import { hashBlob, openProjectRepository } from '../storage/repository';
import { SaveQueue } from '../storage/saveQueue';
import { exportStoredBackup, restoreBackupCopy } from '../backup/repositoryBackup';
import { skinVertexToMeshLocal, inverseAffineMatrix } from './math';
import { validateSkinProfile } from './profile';
import {
  addHumanoidRig,
  extendSkinJoints,
  removeUnusedRigJoint,
  addRigJoint,
  assignRigidPartToJoint,
  bindSkin,
  setSkinWeights,
  fitRigJoint,
  reparentRigJoint,
  rebindSkin,
  type VertexWeights,
} from './authoring';

function fixture() {
  const p = createProject('rig-authoring');
  addBox(p, 'box');
  addRigJoint(p, 'root', 'Root', null, identityTransform());
  addRigJoint(p, 'tip', 'Tip', 'root', { ...identityTransform(), translation: [0, 1, 0] });
  return p;
}
function weights(p: Project3D, meshIndex = 0): VertexWeights {
  return p.meshes[meshIndex].vertices.map(({ id }) => ({
    vertexId: id,
    jointIds: ['root', 'tip'],
    values: [0.25, 0.75],
  }));
}
function bound() {
  const p = fixture();
  bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], weights(p));
  return p;
}
function unchanged(p: Project3D, operation: () => void) {
  const before = cloneProject(p);
  expect(operation).toThrow();
  expect(p).toEqual(before);
}

describe('native rig authoring commands', () => {
  it('creates a self-authored guide without binding and removes only unreferenced joints', () => {
    const p = fixture();
    const ids = addHumanoidRig(p, 'guide');
    expect(ids).toHaveLength(7);
    expect(p.skins).toHaveLength(0);
    unchanged(p, () => removeUnusedRigJoint(p, 'guide-hips'));
    removeUnusedRigJoint(p, 'guide-head');
    expect(p.nodes.some((node) => node.id === 'guide-head')).toBe(false);
    const boundProject = bound();
    unchanged(boundProject, () => removeUnusedRigJoint(boundProject, 'tip'));
  });
  it('supports more than four palette joints while retaining the four-influence per-vertex limit', () => {
    const p = bound();
    const guide = addHumanoidRig(p, 'guide');
    const before = structuredClone(p.skins[0]);
    extendSkinJoints(p, 'skin', guide);
    expect(p.skins[0].joints).toHaveLength(9);
    expect(p.skins[0].weights).toEqual(before.weights);
    expect(p.skins[0].joints.slice(0, 2)).toEqual(before.joints);
    setSkinWeights(p, 'skin', [
      { vertexId: p.meshes[0].vertices[0].id, jointIds: [guide[6]], values: [1] },
    ]);
    expect(p.skins[0].weights[0].jointIds).toEqual([guide[6]]);
    p.nodes.find((node) => node.id === guide[5])!.locked = true;
    unchanged(p, () => extendSkinJoints(p, 'skin', [guide[5]]));
  });
  it('authors connected joints and a continuous mixed-weight mesh in the existing schema', () => {
    const p = bound();
    expect(p.schemaVersion).toBe('0.3.0');
    expect(p.nodes.find((n) => n.id === 'tip')!.parentId).toBe('root');
    expect(() => validateSkinProfile(p.skins[0], p.meshes[0], p.nodes)).not.toThrow();
    const posed = cloneProject(p);
    posed.nodes.find((n) => n.id === 'tip')!.transform.translation[0] = 2;
    const meshNode = p.nodes.find((n) => n.meshId === p.meshes[0].id)!;
    const vertex = p.meshes[0].vertices[0];
    const actual = skinVertexToMeshLocal({
      position: vertex.position,
      restMeshWorld: worldMatrix(p, meshNode.id),
      currentMeshWorld: worldMatrix(posed, meshNode.id),
      joints: p.skins[0].joints.map(({ nodeId }) => ({
        nodeId,
        restWorld: worldMatrix(p, nodeId),
        posedWorld: worldMatrix(posed, nodeId),
      })),
      influences: [
        { jointId: 'root', weight: 0.25 },
        { jointId: 'tip', weight: 0.75 },
      ],
    });
    expect(actual[0]).toBeCloseTo(vertex.position[0] + 1.5);
    expect(p.nodes.find((n) => n.id === 'tip')!.transform.translation).toEqual([0, 1, 0]);
  });

  it('commits once through history, then undoes/redoes without advancing itself', () => {
    const h = new ProjectHistory(fixture());
    const before = h.project;
    h.execute((p) => bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], weights(p)));
    expect(h.revision).toBe(1);
    expect(h.project.skins).toHaveLength(1);
    h.undo();
    expect(h.project.skins).toEqual(before.skins);
    h.redo();
    expect(h.revision).toBe(3);
    expect(h.project.skins[0].weights).toEqual(weights(before));
    const p = bound();
    expect(p.revision).toBe(0);
  });

  it('copies caller transforms and weights instead of retaining mutable inputs', () => {
    const p = fixture();
    const input = weights(p);
    bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], input);
    input[0].values[0] = 99;
    expect(p.skins[0].weights[0].values).toEqual([0.25, 0.75]);
    const transform = identityTransform();
    fitRigJoint(p, 'tip', transform);
    transform.translation[0] = 99;
    expect(p.nodes.find((n) => n.id === 'tip')!.transform.translation[0]).toBe(0);
  });

  it('updates only selected vertices and normalizes only when explicitly requested', () => {
    const p = bound();
    const old = structuredClone(p.skins[0].weights);
    const input = [{ ...old[0], values: [1, 3] }];
    unchanged(p, () => setSkinWeights(p, 'skin', input));
    setSkinWeights(p, 'skin', input, { normalize: true });
    expect(p.skins[0].weights).toEqual(old);
    setSkinWeights(p, 'skin', [{ ...old[0], values: [0.6, 0.4] }]);
    expect(p.skins[0].weights[0].values).toEqual([0.6, 0.4]);
    expect(p.skins[0].weights.slice(1)).toEqual(old.slice(1));
    expect(input[0].values).toEqual([1, 3]);
  });

  it('normalizes large finite inputs without overflowing their sum', () => {
    const p = bound();
    setSkinWeights(p, 'skin', [{ ...p.skins[0].weights[0], values: [1e308, 1e308] }], {
      normalize: true,
    });
    expect(p.skins[0].weights[0].values).toEqual([0.5, 0.5]);
  });

  it.each([
    [-1, 2],
    [NaN, 1],
    [Infinity, 1],
    [0, 0],
  ])('rejects invalid normalization atomically: %j', (...values) => {
    const p = bound();
    unchanged(p, () =>
      setSkinWeights(p, 'skin', [{ ...p.skins[0].weights[0], values }], { normalize: true }),
    );
  });

  it('rejects empty, duplicate and unknown assignments and more than four influences', () => {
    const p = bound();
    const entry = p.skins[0].weights[0];
    unchanged(p, () => setSkinWeights(p, 'skin', []));
    unchanged(p, () => setSkinWeights(p, 'skin', [entry, entry]));
    unchanged(p, () => setSkinWeights(p, 'skin', [{ ...entry, vertexId: 'missing' }]));
    unchanged(p, () =>
      setSkinWeights(p, 'skin', [{ ...entry, jointIds: ['missing'], values: [1] }]),
    );
    for (let i = 0; i < 3; i++) addRigJoint(p, `extra${i}`, 'Extra', null, identityTransform());
    const fresh = fixture();
    for (let i = 0; i < 3; i++) addRigJoint(fresh, `extra${i}`, 'Extra', null, identityTransform());
    const ids = ['root', 'tip', 'extra0', 'extra1', 'extra2'];
    unchanged(fresh, () =>
      bindSkin(
        fresh,
        'skin',
        fresh.meshes[0].id,
        ids,
        weights(fresh).map((w) => ({ ...w, jointIds: ids, values: Array(5).fill(0.2) })),
      ),
    );
  });

  it('accepts exactly four influences and explicitly regenerates stored bind data', () => {
    const p = fixture();
    addRigJoint(p, 'third', 'Third', 'root', identityTransform());
    addRigJoint(p, 'fourth', 'Fourth', 'root', identityTransform());
    const ids = ['root', 'tip', 'third', 'fourth'];
    bindSkin(
      p,
      'skin',
      p.meshes[0].id,
      ids,
      weights(p).map((entry) => ({ ...entry, jointIds: ids, values: [0.1, 0.2, 0.3, 0.4] })),
    );
    const original = structuredClone(p.skins[0].weights);
    p.skins[0].joints[0].inverseBind[12] = 4;
    rebindSkin(p, 'skin');
    expect(p.skins[0].weights).toEqual(original);
    p.skins[0].joints.forEach((joint) => {
      const product = multiplyMatrices(worldMatrix(p, joint.nodeId), joint.inverseBind);
      product.forEach((value, i) => expect(value).toBeCloseTo(i % 5 === 0 ? 1 : 0, 10));
    });
  });

  it('rejects a colliding skin ID and a locked mesh instance atomically', () => {
    const p = bound();
    addBox(p, 'second');
    unchanged(p, () => bindSkin(p, 'skin', p.meshes[1].id, ['root', 'tip'], weights(p, 1)));
    const original = p.nodes.find((item) => item.meshId === p.meshes[0].id)!;
    p.nodes.push({ ...structuredClone(original), id: 'locked-instance', locked: true });
    unchanged(p, () =>
      setSkinWeights(p, 'skin', [{ ...p.skins[0].weights[0], values: [0.5, 0.5] }]),
    );
  });

  it('requires complete explicit coverage, unique joints, mesh and scene references', () => {
    const p = fixture();
    unchanged(p, () => bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], weights(p).slice(1)));
    unchanged(p, () => bindSkin(p, 'skin', p.meshes[0].id, ['root', 'root'], weights(p)));
    unchanged(p, () => bindSkin(p, 'skin', p.meshes[0].id, ['missing'], weights(p)));
    unchanged(p, () => bindSkin(p, 'skin', 'missing', ['root'], []));
    const orphan = fixture();
    orphan.nodes = orphan.nodes.filter((n) => !n.meshId);
    unchanged(orphan, () =>
      bindSkin(orphan, 'skin', orphan.meshes[0].id, ['root', 'tip'], weights(orphan)),
    );
    bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], weights(p));
    unchanged(p, () => bindSkin(p, 'another', p.meshes[0].id, ['root', 'tip'], weights(p)));
  });

  it('rejects duplicate IDs, cycles and missing parents without partial writes', () => {
    const p = bound();
    unchanged(p, () => addRigJoint(p, 'root', 'Duplicate', null, identityTransform()));
    unchanged(p, () => addRigJoint(p, 'new', 'New', 'missing', identityTransform()));
    unchanged(p, () => addRigJoint(p, 'new', ' ', null, identityTransform()));
    unchanged(p, () => reparentRigJoint(p, 'root', 'tip', identityTransform()));
    unchanged(p, () => reparentRigJoint(p, 'root', 'missing', identityTransform()));
  });

  it.each(['mesh', 'joint', 'ancestor'])(
    'protects a locked %s during weight edits and rebind',
    (target) => {
      const p = bound();
      const id =
        target === 'mesh' ? p.nodes.find((n) => n.meshId)!.id : target === 'joint' ? 'tip' : 'root';
      p.nodes.find((n) => n.id === id)!.locked = true;
      unchanged(p, () =>
        setSkinWeights(p, 'skin', [{ ...p.skins[0].weights[0], values: [0.5, 0.5] }]),
      );
      unchanged(p, () => rebindSkin(p, 'skin'));
      unchanged(p, () => fitRigJoint(p, 'tip', identityTransform()));
    },
  );

  it('protects locks when adding a child, binding, and reparenting', () => {
    const p = fixture();
    p.nodes.find((n) => n.id === 'root')!.locked = true;
    unchanged(p, () => addRigJoint(p, 'new', 'New', 'root', identityTransform()));
    unchanged(p, () => bindSkin(p, 'skin', p.meshes[0].id, ['root', 'tip'], weights(p)));
    addRigJoint(p, 'free', 'Free', null, identityTransform());
    unchanged(p, () => reparentRigJoint(p, 'free', 'root', identityTransform()));
  });

  it('rebinds every affected skin under a nonuniform parent while preserving weights and topology', () => {
    const p = bound();
    addBox(p, 'second');
    bindSkin(p, 'skin2', p.meshes[1].id, ['root', 'tip'], weights(p, 1));
    const oldMeshes = structuredClone(p.meshes);
    const oldWeights = p.skins.map((s) => structuredClone(s.weights));
    fitRigJoint(p, 'root', { ...identityTransform(), translation: [2, 3, 4], scale: [2, 3, 4] });
    for (const value of p.skins)
      for (const joint of value.joints) {
        const product = multiplyMatrices(worldMatrix(p, joint.nodeId), joint.inverseBind);
        product.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 10));
      }
    expect(p.skins.map((s) => s.weights)).toEqual(oldWeights);
    expect(p.meshes).toEqual(oldMeshes);
  });

  it('rejects rest edits when another affected skin is locked or a descendant is animated', () => {
    const p = bound();
    addBox(p, 'second');
    bindSkin(p, 'skin2', p.meshes[1].id, ['root', 'tip'], weights(p, 1));
    p.nodes.find((n) => n.meshId === p.meshes[1].id)!.locked = true;
    unchanged(p, () => fitRigJoint(p, 'root', { ...identityTransform(), translation: [2, 0, 0] }));
    const animated = bound();
    animated.clips.push({
      id: 'clip',
      name: 'Clip',
      duration: 1,
      loop: false,
      tracks: [
        {
          nodeId: 'tip',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [{ time: 0, value: [0, 1, 0] }],
        },
      ],
    });
    unchanged(animated, () => fitRigJoint(animated, 'root', identityTransform()));
    unchanged(animated, () => reparentRigJoint(animated, 'root', null, identityTransform()));
  });

  it.each(['old-parent', 'new-parent', 'shared-joint'])(
    'rejects reparent/rest changes affecting animated %s',
    (target) => {
      const p = bound();
      addRigJoint(p, 'old-parent', 'Old parent', null, identityTransform());
      addRigJoint(p, 'new-parent', 'New parent', null, identityTransform());
      reparentRigJoint(p, 'root', 'old-parent', identityTransform());
      const animatedId = target === 'shared-joint' ? 'root' : target;
      p.clips.push({
        id: 'motion',
        name: 'Motion',
        duration: 1,
        loop: false,
        tracks: [
          {
            nodeId: animatedId,
            property: 'translation',
            interpolation: 'LINEAR',
            keys: [{ time: 0, value: [0, 0, 0] }],
          },
        ],
      });
      unchanged(p, () => reparentRigJoint(p, 'tip', 'new-parent', identityTransform()));
      if (target !== 'new-parent') unchanged(p, () => fitRigJoint(p, 'tip', identityTransform()));
    },
  );

  it.each([0, -1, 1e-46, Infinity])(
    'rejects unsupported bound scale %s without replacing rest or bind data',
    (scale) => {
      const p = bound();
      unchanged(p, () => fitRigJoint(p, 'root', { ...identityTransform(), scale: [scale, 1, 1] }));
    },
  );

  it('supports coincident joint positions and explicit local reparenting', () => {
    const p = bound();
    fitRigJoint(p, 'tip', identityTransform());
    expect(p.skins[0].joints[0].inverseBind).toEqual(p.skins[0].joints[1].inverseBind);
    addRigJoint(p, 'new-parent', 'Parent', null, {
      ...identityTransform(),
      translation: [3, 0, 0],
    });
    reparentRigJoint(p, 'root', 'new-parent', identityTransform());
    expect(p.nodes.find((n) => n.id === 'root')!.parentId).toBe('new-parent');
    expect(p.skins[0].joints[0].inverseBind).toEqual(
      inverseAffineMatrix(worldMatrix(p, 'root')).map((value) => (value === 0 ? 0 : value)),
    );
  });

  it('persists, backs up, restores to another database and edits mixed weights again', async () => {
    const source = await openProjectRepository({ indexedDB: new IDBFactory() });
    const target = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const p = bound();
      await source.create(p, new Map(), 'writer');
      const history = new ProjectHistory(p, undefined, true);
      history.execute((candidate) =>
        setSkinWeights(candidate, 'skin', [
          { ...candidate.skins[0].weights[0], values: [0.4, 0.6] },
        ]),
      );
      const lease = await source.acquireWriter(p.id, 'writer');
      await new SaveQueue(source, lease, 0).save(
        history.project,
        new Map(),
        history.historyBlobIds,
      );
      const archive = await exportStoredBackup(source, p.id);
      await restoreBackupCopy(target, archive, 'restored-rig', 'target-writer');
      const restored = await target.readSnapshot('restored-rig');
      expect(restored.project.skins[0].weights[0].values).toEqual([0.4, 0.6]);
      expect(restored.project.skins[0].joints).toEqual(p.skins[0].joints);
      const resumed = new ProjectHistory(restored.project, undefined, true);
      resumed.execute((candidate) =>
        setSkinWeights(candidate, 'skin', [
          { ...candidate.skins[0].weights[0], values: [0.5, 0.5] },
        ]),
      );
      expect(resumed.project.skins[0].weights[0].values).toEqual([0.5, 0.5]);
      const targetLease = await target.acquireWriter('restored-rig', 'target-writer');
      await new SaveQueue(target, targetLease, restored.project.revision).save(
        resumed.project,
        restored.blobs,
        resumed.historyBlobIds,
      );
      await restored.release();
      const final = await target.readSnapshot('restored-rig');
      expect(final.project.skins[0].weights[0].values).toEqual([0.5, 0.5]);
      await final.release();
    } finally {
      source.close();
      target.close();
    }
  });
});

describe('explicit rigid-part bone assignment', () => {
  function rigidFixture() {
    const p = bound();
    addBox(p, 'rigid');
    return p;
  }
  function close(actual: number[], expected: number[]) {
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 9));
  }
  function animate(p: Project3D, nodeId: string) {
    p.clips.push({
      id: `motion-${nodeId}`,
      name: 'Motion',
      duration: 1,
      loop: false,
      tracks: [
        {
          nodeId,
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [1, 2, 3] },
          ],
        },
      ],
    });
  }

  it('preserves rest world placement under transformed parents without altering existing smooth skin', () => {
    const p = rigidFixture();
    fitRigJoint(p, 'root', {
      translation: [4, -3, 1],
      rotation: rotationFromDegrees([20, 30, 40]),
      scale: [2, 2, 2],
    });
    addRigJoint(p, 'old-parent', 'Old', null, {
      translation: [-5, 2, 3],
      rotation: rotationFromDegrees([-10, 15, 20]),
      scale: [0.5, 0.5, 0.5],
    });
    const part = p.nodes.find((item) => item.id === 'rigid-node')!;
    part.parentId = 'old-parent';
    part.transform = {
      translation: [1, 2, 3],
      rotation: rotationFromDegrees([10, -20, 30]),
      scale: [-2, 3, 4],
    };
    const before = cloneProject(p),
      world = worldMatrix(p, part.id);
    assignRigidPartToJoint(p, part.id, 'tip', 'keep-world');
    expect(p.nodes.find((item) => item.id === part.id)!.parentId).toBe('tip');
    close(worldMatrix(p, part.id), world);
    expect(p.nodes.filter((item) => item.id !== part.id)).toEqual(
      before.nodes.filter((item) => item.id !== part.id),
    );
    expect({ ...p, nodes: before.nodes }).toEqual(before);
    expect(p.skins.some((value) => value.meshId === part.meshId)).toBe(false);
    assignRigidPartToJoint(p, part.id, null, 'keep-world');
    expect(p.nodes.find((item) => item.id === part.id)!.parentId).toBeNull();
    close(worldMatrix(p, part.id), world);
    expect({ ...p, nodes: before.nodes }).toEqual(before);
  });

  it('preserves explicit local values exactly on assignment and detach', () => {
    const p = fixture();
    p.nodes.find((item) => item.id === 'root')!.transform.translation = [4, 0, 0];
    const original = structuredClone(p.nodes[0].transform);
    assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-local');
    expect(p.nodes[0].transform).toEqual(original);
    close(worldMatrix(p, 'box-node').slice(12, 15), [4, 1, 0]);
    assignRigidPartToJoint(p, 'box-node', null, 'keep-local');
    expect(p.nodes[0].transform).toEqual(original);
    close(worldMatrix(p, 'box-node').slice(12, 15), [0, 0, 0]);
    expect(p.skins).toEqual([]);
  });

  it('changes only the chosen instance, allowing an unrelated locked instance of shared geometry', () => {
    const p = fixture();
    p.nodes.push({
      ...structuredClone(p.nodes[0]),
      id: 'locked-instance',
      locked: true,
    });
    const before = cloneProject(p);
    assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world');
    expect(p.nodes.find((item) => item.id === 'locked-instance')).toEqual(before.nodes.at(-1));
    expect(p.meshes).toEqual(before.meshes);
    expect(p.nodes[0].meshId).toBe(p.nodes.at(-1)!.meshId);
  });

  it('allows animated target bones and ancestors while preserving all existing clips and skin data', () => {
    const p = rigidFixture();
    animate(p, 'tip');
    animate(p, 'root');
    animate(p, 'box-node');
    const before = cloneProject(p),
      world = worldMatrix(p, 'rigid-node');
    assignRigidPartToJoint(p, 'rigid-node', 'tip', 'keep-world');
    close(worldMatrix(p, 'rigid-node'), world);
    expect(p.clips).toEqual(before.clips);
    expect(p.skins).toEqual(before.skins);
    expect({ ...p, nodes: before.nodes }).toEqual(before);
    // Once attached, those tracks are old inherited motion. Detach cannot silently retarget it.
    unchanged(p, () => assignRigidPartToJoint(p, 'rigid-node', null, 'keep-world'));
  });

  it.each(['box-node', 'tip', 'root'])(
    'rejects animation on the source or its old ancestor %s for either retention mode',
    (animatedId) => {
      const p = fixture();
      assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-local');
      addRigJoint(p, 'destination', 'Destination', null, identityTransform());
      animate(p, animatedId);
      for (const mode of ['keep-world', 'keep-local'] as const) {
        unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'destination', mode));
        unchanged(p, () => assignRigidPartToJoint(p, 'box-node', null, mode));
      }
    },
  );

  it('rejects skinned source instances and mesh nodes participating as joints', () => {
    const p = bound();
    p.nodes.push({ ...structuredClone(p.nodes[0]), id: 'shared-skinned' });
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'shared-skinned', 'tip', 'keep-local'));
    const jointMesh = rigidFixture();
    jointMesh.skins[0].joints.push({
      nodeId: 'rigid-node',
      inverseBind: inverseAffineMatrix(worldMatrix(jointMesh, 'rigid-node')),
    });
    unchanged(jointMesh, () =>
      assignRigidPartToJoint(jointMesh, 'rigid-node', 'tip', 'keep-world'),
    );
  });

  it.each(['source', 'old-ancestor', 'target', 'target-ancestor'])(
    'rejects an effectively locked %s atomically',
    (target) => {
      const p = fixture();
      addRigJoint(p, 'old-parent', 'Old', null, identityTransform());
      p.nodes[0].parentId = 'old-parent';
      const id = {
        source: 'box-node',
        'old-ancestor': 'old-parent',
        target: 'tip',
        'target-ancestor': 'root',
      }[target];
      p.nodes.find((item) => item.id === id)!.locked = true;
      for (const mode of ['keep-world', 'keep-local'] as const)
        unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', mode));
    },
  );

  it('rejects missing IDs, nonmesh sources, mesh targets, self-parenting, nonleaf parts and invalid modes', () => {
    const p = fixture();
    addBox(p, 'other');
    unchanged(p, () => assignRigidPartToJoint(p, 'missing', 'tip', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'missing', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'root', 'tip', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'other-node', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'box-node', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'bad' as 'keep-world'));
    addRigJoint(p, 'child', 'Child', 'box-node', identityTransform());
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'child', 'keep-local'));
  });

  it('rejects an already corrupt cyclic input before resolving any world matrices', () => {
    const p = fixture();
    p.nodes.find((item) => item.id === 'root')!.parentId = 'tip';
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
  });

  it('rejects shear for keep-world while still allowing the explicit local option', () => {
    const p = fixture();
    p.nodes.find((item) => item.id === 'tip')!.transform = {
      ...identityTransform(),
      rotation: rotationFromDegrees([0, 0, 35]),
      scale: [2, 1, 3],
    };
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
    const local = structuredClone(p.nodes[0].transform);
    assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-local');
    expect(p.nodes[0].transform).toEqual(local);
    p.nodes[0].transform.rotation = rotationFromDegrees([0, 0, 25]);
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', null, 'keep-world'));
  });

  it.each([0, 1e-50, 1e50, Infinity])(
    'rejects non-renderable target scale %s in either retention mode',
    (scale) => {
      const p = fixture();
      p.nodes.find((item) => item.id === 'tip')!.transform.scale = [scale, 1, 1];
      unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
      unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-local'));
    },
  );

  it('does not let a large world X hide lost Y precision during keep-world assignment', () => {
    const p = fixture();
    p.nodes[0].transform.translation = [1e8, 0.001, 0];
    p.nodes.find((item) => item.id === 'tip')!.transform.translation = [0, 1e14, 0];
    unchanged(p, () => assignRigidPartToJoint(p, 'box-node', 'tip', 'keep-world'));
  });

  it('uses one history revision, rejects repeated no-ops and undoes animated-target assignment', () => {
    const p = fixture();
    animate(p, 'tip');
    const history = new ProjectHistory(p),
      before = history.project;
    history.execute((candidate) =>
      assignRigidPartToJoint(candidate, 'box-node', 'tip', 'keep-world'),
    );
    const assigned = history.project;
    expect(history.revision).toBe(1);
    for (const mode of ['keep-world', 'keep-local'] as const) {
      expect(() =>
        history.execute((candidate) => assignRigidPartToJoint(candidate, 'box-node', 'tip', mode)),
      ).toThrow('すでに');
      expect(history.project).toEqual(assigned);
      expect(history.revision).toBe(1);
    }
    expect(() =>
      history.execute((candidate) =>
        assignRigidPartToJoint(candidate, 'box-node', null, 'keep-world'),
      ),
    ).toThrow('元に戻す');
    expect(history.revision).toBe(1);
    history.undo();
    expect(history.project.nodes).toEqual(before.nodes);
    history.redo();
    expect(history.project.nodes).toEqual(assigned.nodes);
    expect(history.project.clips).toEqual(before.clips);
    expect(history.revision).toBe(3);
    const rootPart = fixture();
    unchanged(rootPart, () => assignRigidPartToJoint(rootPart, 'box-node', null, 'keep-world'));
  });

  it('retains sources and original bytes through save, independent backup restore and further reassignment', async () => {
    const source = await openProjectRepository({ indexedDB: new IDBFactory() });
    const target = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const p = rigidFixture(),
        originalBytes = new Uint8Array([3, 1, 4, 1, 5, 9]),
        blobId = await hashBlob(originalBytes);
      p.blobIds.push(blobId);
      p.sources.push({
        id: 'original-source',
        blobId,
        mimeType: 'application/octet-stream',
        rights: { declared: 'Self-authored test source', embedded: '' },
      });
      const before = cloneProject(p);
      await source.create(p, new Map([[blobId, originalBytes]]), 'writer');
      const history = new ProjectHistory(p, undefined, true);
      history.execute((candidate) =>
        assignRigidPartToJoint(candidate, 'rigid-node', 'tip', 'keep-world'),
      );
      const lease = await source.acquireWriter(p.id, 'writer');
      await new SaveQueue(source, lease, 0).save(
        history.project,
        new Map(),
        history.historyBlobIds,
      );
      const archive = await exportStoredBackup(source, p.id);
      await restoreBackupCopy(target, archive, 'restored-rigid', 'target-writer');
      const restored = await target.readSnapshot('restored-rigid');
      try {
        expect(restored.project.nodes).toEqual(history.project.nodes);
        expect(restored.project.skins).toEqual(before.skins);
        expect(restored.project.meshes).toEqual(before.meshes);
        expect(restored.project.sources).toEqual(before.sources);
        expect(restored.project.blobIds).toEqual(before.blobIds);
        expect(restored.blobs.get(blobId)).toEqual(originalBytes);
        const resumed = new ProjectHistory(restored.project, undefined, true);
        resumed.execute((candidate) =>
          assignRigidPartToJoint(candidate, 'rigid-node', null, 'keep-world'),
        );
        close(worldMatrix(resumed.project, 'rigid-node'), worldMatrix(before, 'rigid-node'));
        expect(resumed.project.skins).toEqual(before.skins);
      } finally {
        await restored.release();
      }
    } finally {
      source.close();
      target.close();
    }
  });
});
