import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import character from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import {
  saveProjectBundle,
  deleteAssetBundle,
  loadAsset,
  loadBlob,
  loadProject,
  saveProject,
  saveAsset,
  saveAssetRevision,
} from './projectStore';
import { saveSnapshot, listSnapshots } from './snapshotStore';
import { captureStructureState, applyStructureState } from './structureHistory';

beforeEach(resetDbForTests);

async function fixture() {
  const asset = structuredClone(character) as unknown as Asset;
  const project = {
    ...createEmptyProject('structure'),
    assets: [
      {
        id: asset.id,
        name: asset.name,
        displayName: asset.displayName,
        assetType: asset.assetType,
      },
    ],
  };
  const blobs = asset.textures.map((texture, index) => ({
    key: `${asset.id}/${texture.path}`,
    blob: new Blob([new Uint8Array([index + 1])], { type: texture.mimeType }),
  }));
  await saveProjectBundle(project, [asset], blobs);
  return { asset, project, blobs };
}

describe('構造操作の履歴', () => {
  it('通常削除を全画像と復旧点ごと戻し、やり直して再度戻せる', async () => {
    const { asset, project, blobs } = await fixture();
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const editBlob = blobs.find((blob) => blob.key === `${asset.id}/${edit.path}`)!;
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      asset,
      blobKey: editBlob.key,
      blob: editBlob.blob,
      label: 'before',
    });
    const before = await captureStructureState(project.id, [asset.id]);
    const empty = { ...project, assets: [] };
    await deleteAssetBundle({ project: empty, assetId: asset.id });
    const after = await captureStructureState(project.id, [asset.id]);
    for (let round = 0; round < 2; round++) {
      await applyStructureState(after, before);
      expect((await loadAsset(asset.id)).asset).toEqual(asset);
      expect((await loadProject(project.id)).project).toEqual(project);
      for (const input of blobs) {
        expect(await (await loadBlob(input.key))!.arrayBuffer()).toEqual(
          await input.blob.arrayBuffer(),
        );
      }
      expect(await listSnapshots(asset.id)).toHaveLength(1);
      await applyStructureState(before, after);
      expect(await loadBlob(editBlob.key)).toBeNull();
      expect((await loadProject(project.id)).project.assets).toHaveLength(0);
    }
  });

  it('新規作成を画像ごと取り消してやり直せる', async () => {
    const empty = createEmptyProject('create');
    await saveProject(empty);
    const asset = structuredClone(character) as unknown as Asset;
    const before = await captureStructureState(empty.id, [asset.id]);
    const project = {
      ...empty,
      assets: [
        {
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        },
      ],
    };
    const blobs = asset.textures.map((texture) => ({
      key: `${asset.id}/${texture.path}`,
      blob: new Blob([new Uint8Array([4])], { type: texture.mimeType }),
    }));
    await saveProjectBundle(project, [asset], blobs);
    const after = await captureStructureState(empty.id, [asset.id]);
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const original = blobs.find((blob) => blob.key === `${asset.id}/${edit.path}`)!;
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      asset,
      blobKey: original.key,
      blob: original.blob,
      label: 'edit after create',
    });
    await saveAssetRevision({
      projectId: project.id,
      asset,
      putBlobs: [
        { key: original.key, blob: new Blob([new Uint8Array([9])], { type: original.blob.type }) },
      ],
    });
    // 画像編集をUndoした状態。復旧点は意図的に残る。
    await saveAssetRevision({ projectId: project.id, asset, putBlobs: [original] });
    await applyStructureState(after, before);
    expect((await loadProject(empty.id)).project.assets).toHaveLength(0);
    await applyStructureState(before, after);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(await listSnapshots(asset.id)).toHaveLength(1);
  });

  it('別タブのProject変更を上書きせず、全画像も不変', async () => {
    const { asset, project, blobs } = await fixture();
    const expected = await captureStructureState(project.id, [asset.id]);
    await saveProject({ ...project, name: 'other tab' });
    await expect(applyStructureState(expected, expected)).rejects.toThrow('プロジェクトが変更');
    expect((await loadProject(project.id)).project.name).toBe('other tab');
    for (const input of blobs)
      expect(await (await loadBlob(input.key))!.arrayBuffer()).toEqual(
        await input.blob.arrayBuffer(),
      );
  });

  it('別タブが追加した復旧点を取り消しで失わない', async () => {
    const { asset, project, blobs } = await fixture();
    const expected = await captureStructureState(project.id, [asset.id]);
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const blob = blobs.find((blob) => blob.key === `${asset.id}/${edit.path}`)!;
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      asset,
      blobKey: blob.key,
      blob: blob.blob,
      label: 'other tab',
    });
    await applyStructureState(expected, expected);
    expect(await listSnapshots(asset.id)).toHaveLength(1);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
  });

  it('別タブの素材変更でも部分削除しない', async () => {
    const { asset, project } = await fixture();
    const expected = await captureStructureState(project.id, [asset.id]);
    await saveAsset(project.id, {
      ...asset,
      layers: asset.layers.map((layer) => ({ ...layer, opacity: 0.5 })),
    });
    await expect(applyStructureState(expected, expected)).rejects.toThrow('素材が変更');
    expect((await loadAsset(asset.id)).asset.layers[0].opacity).toBe(0.5);
  });
});
