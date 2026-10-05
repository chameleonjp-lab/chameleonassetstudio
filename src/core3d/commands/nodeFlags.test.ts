import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { nativeBox } from '../fixtures/nativeBox';
import { identityTransform } from '../model/project';
import { isNodeLocked, isNodeVisible } from '../model/editability';
import { ProjectHistory } from './history';
import { setNodeFlags } from './nodeFlags';
import { renameNode, setNodeTransform, updateMaterial } from './objectEditing';
import { assignMaterial } from './materialEditing';
import { moveVertices } from './meshEditing';
import { reparentNodes, alignNodes } from './sceneAssembly';
import { removeBaseColorTexture } from './textureEditing';
import { openProjectRepository } from '../storage/repository';
import { ProjectSession } from '../../features/editor3d/projectSession';
import { nativeTransformEvaluator } from '../../adapters3d/three/transformMath';

function fixture() {
  const p = nativeBox();
  p.nodes.push({ id: 'parent', name: 'Parent', parentId: null, transform: identityTransform() });
  p.nodes[0].parentId = 'parent';
  return p;
}
describe('canonical visibility and edit lock', () => {
  it('inherits flags without rewriting descendants and preserves one-command Undo/Redo', () => {
    const p = fixture();
    const history = new ProjectHistory(p);
    history.execute((next) => setNodeFlags(next, 'parent', { visible: false }));
    expect(history.revision).toBe(1);
    expect(isNodeVisible(history.project, 'box-node')).toBe(false);
    expect(history.project.nodes[0].visible).toBeUndefined();
    history.undo();
    expect(isNodeVisible(history.project, 'box-node')).toBe(true);
    history.redo();
    expect(isNodeVisible(history.project, 'box-node')).toBe(false);
    history.execute((next) => setNodeFlags(next, 'parent', { locked: true }));
    expect(isNodeLocked(history.project, 'box-node')).toBe(true);
    expect(() =>
      history.execute((next) => setNodeFlags(next, 'box-node', { locked: false })),
    ).toThrow('ロック');
    history.execute((next) => setNodeFlags(next, 'parent', { locked: false }));
    expect(isNodeLocked(history.project, 'box-node')).toBe(false);
  });
  it('blocks direct node, mesh, material, texture and assembly mutations atomically', () => {
    const p = fixture();
    setNodeFlags(p, 'box-node', { locked: true });
    const before = structuredClone(p);
    const operations = [
      () => renameNode(p, 'box-node', 'Changed'),
      () => setNodeTransform(p, 'parent', { ...identityTransform(), translation: [1, 0, 0] }),
      () => moveVertices(p, 'box-mesh', ['v0'], [1, 0, 0]),
      () => updateMaterial(p, 'green', { baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1 }),
      () => assignMaterial(p, 'box-mesh', ['f0'], 'green'),
      () => reparentNodes(p, ['box-node'], null, 'keep-world'),
      () => setNodeFlags(p, 'parent', { visible: false }),
    ];
    for (const operation of operations) {
      expect(operation).toThrow('ロック');
      expect(p).toEqual(before);
    }
    p.blobIds = ['a'.repeat(64)];
    p.materials[0].textureBlobId = p.blobIds[0];
    const textured = structuredClone(p);
    expect(() => removeBaseColorTexture(p, 'green')).toThrow('ロック');
    expect(p).toEqual(textured);
  });
  it('protects shared meshes/materials and prevents unlocking plus editing in one history command', () => {
    const p = fixture();
    p.nodes.push({ ...structuredClone(p.nodes[0]), id: 'shared', locked: true });
    const h = new ProjectHistory(p);
    expect(() =>
      h.execute((next) => {
        next.meshes[0].vertices[0].position[0] = 99;
      }),
    ).toThrow('ロック');
    expect(() =>
      h.execute((next) => {
        next.materials[0].emissiveColor = [1, 0, 0];
      }),
    ).toThrow('ロック');
    expect(() =>
      h.execute((next) => {
        next.nodes[2].locked = false;
        next.nodes[2].name = 'Changed';
      }),
    ).toThrow('ロック');
    expect(() =>
      h.execute((next) => {
        next.nodes[1].transform.translation[0] = 1;
      }),
    ).toThrow('ロック');
    expect(h.project).toEqual(p);
    expect(h.canUndo).toBe(false);
  });
  it('rejects invalid flags without publishing fields', () => {
    const p = fixture();
    const before = structuredClone(p);
    expect(() => setNodeFlags(p, 'parent', { visible: 'false' as unknown as boolean })).toThrow();
    expect(p).toEqual(before);
  });
  it('saves six attributes, reloads them, restores backup in another DB and allows unlocking/re-edit', async () => {
    const factory = new IDBFactory();
    const repository = await openProjectRepository({ indexedDB: factory });
    const independent = await openProjectRepository({ indexedDB: new IDBFactory() });
    try {
      const session = await ProjectSession.create(repository, 'tab', 'All six');
      session.addBox();
      const nodeId = session.project.nodes[0].id,
        materialId = session.project.materials[0].id;
      session.executeAuthoring((p) =>
        updateMaterial(p, materialId, {
          baseColor: [0.1, 0.2, 0.3, 0.4],
          metallic: 0.1,
          roughness: 0.2,
          emissiveColor: [0.2, 0.3, 0.4],
          alphaMode: 'MASK',
          alphaCutoff: 0.25,
          doubleSided: true,
        }),
      );
      session.executeAuthoring((p) => setNodeFlags(p, nodeId, { visible: false, locked: true }));
      const expected = session.project;
      await session.save();
      const read = await repository.readSnapshot(expected.id);
      expect(read.project).toEqual(expected);
      await read.release();
      const bytes = await session.backup();
      const restored = await ProjectSession.restore(independent, 'new-tab', bytes);
      expect(restored.project.nodes).toEqual(expected.nodes);
      expect(restored.project.materials).toEqual(expected.materials);
      restored.edit.setEvaluator(nativeTransformEvaluator);
      restored.edit.setSelection([nodeId]);
      expect(restored.edit.state.context.lockedIds).toEqual([nodeId]);
      expect(restored.edit.begin().ok).toBe(false);
      restored.executeAuthoring((p) => setNodeFlags(p, nodeId, { locked: false }));
      restored.executeAuthoring((p) => setNodeFlags(p, nodeId, { visible: true }));
      restored.executeAuthoring((p) => renameNode(p, nodeId, 'Re-edited'));
      expect(restored.project.nodes[0].name).toBe('Re-edited');
      await restored.save();
      await restored.close();
      await session.close();
    } finally {
      repository.close();
      independent.close();
    }
  });
  it('does not allow alignment to move a locked descendant', () => {
    const p = fixture();
    p.nodes[0].locked = true;
    p.nodes.push({
      id: 'reference',
      name: 'reference',
      parentId: null,
      transform: { ...identityTransform(), translation: [3, 0, 0] },
    });
    const before = structuredClone(p);
    expect(() => alignNodes(p, ['parent', 'reference'], 'reference', 'x', 'origin')).toThrow(
      'ロック',
    );
    expect(p).toEqual(before);
  });
});
