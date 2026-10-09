import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createProject, identityTransform, cloneProject, type Project3D } from '../model/project';
import { worldMatrix, multiplyMatrices } from '../model/coordinates';
import { ProjectHistory } from '../commands/history';
import { addBox } from '../commands/box';
import { openProjectRepository } from '../storage/repository';
import { SaveQueue } from '../storage/saveQueue';
import { exportStoredBackup, restoreBackupCopy } from '../backup/repositoryBackup';
import { skinVertexToMeshLocal, inverseAffineMatrix } from './math';
import { validateSkinProfile } from './profile';
import {
  addRigJoint,
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
  it('authors connected joints and a continuous mixed-weight mesh in the existing schema', () => {
    const p = bound();
    expect(p.schemaVersion).toBe('0.2.0');
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
