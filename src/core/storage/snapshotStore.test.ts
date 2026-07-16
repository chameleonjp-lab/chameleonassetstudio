import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { StorageError, resetDbForTests } from './db';
import {
  deleteBlob,
  deleteProject,
  loadBlob,
  saveAsset,
  saveBlob,
  saveProject,
} from './projectStore';
import {
  SNAPSHOT_LIMIT_PER_ASSET,
  deleteSnapshotsForAsset,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
} from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

const baseAsset = characterAsset as unknown as Asset;

function editBlobKey(asset: Asset): string {
  const texture = asset.textures.find((entry) => entry.kind === 'edit');
  if (!texture) throw new Error('fixture に edit TextureRef がありません');
  return `${asset.id}/${texture.path}`;
}

async function seedStoredAsset(options?: {
  projectId?: string;
  projectName?: string;
  asset?: Asset;
  blobBytes?: Uint8Array;
}) {
  const asset = options?.asset ?? baseAsset;
  const project = {
    ...createEmptyProject(options?.projectName ?? 'snapshot test'),
    id: options?.projectId ?? 'project_1',
    assets: [
      {
        id: asset.id,
        name: asset.name,
        displayName: asset.displayName,
        assetType: asset.assetType,
      },
    ],
  };
  const key = editBlobKey(asset);
  const bytes = options?.blobBytes ?? new Uint8Array([7, 7, 7]);
  const blob = new Blob([bytes], { type: 'image/png' });
  await saveProject(project);
  await saveAsset(project.id, asset);
  await saveBlob(project.id, key, blob);
  return { project, asset, key, bytes, blob };
}

async function saveCurrentSnapshot(options: {
  projectId: string;
  asset: Asset;
  key: string;
  label: string;
}) {
  const blob = await loadBlob(options.key);
  if (!blob) throw new Error('stored edit blob missing');
  await saveSnapshot({
    projectId: options.projectId,
    assetId: options.asset.id,
    label: options.label,
    asset: options.asset,
    blobKey: options.key,
    blob,
  });
}

describe('復旧点（snapshot）の所有境界', () => {
  it('現在の保存済みedit Blobを復旧点として保存・復元できる', async () => {
    const { project, asset, key, bytes } = await seedStoredAsset();
    await saveCurrentSnapshot({ projectId: project.id, asset, key, label: '消しゴム' });
    const [summary] = await listSnapshots(asset.id);
    expect(summary.label).toBe('消しゴム');
    const restored = await restoreSnapshot(summary.id);
    expect(restored.asset).toEqual(asset);
    expect(restored.beforeAsset).toEqual(asset);
    expect(restored.blobKey).toBe(key);
    expect(new Uint8Array(await restored.blob.arrayBuffer())).toEqual(bytes);
    expect(new Uint8Array(await restored.beforeBlob.arrayBuffer())).toEqual(bytes);
  });

  it('保存済みedit Blobと異なる入力Blobを拒否してsnapshotを残さない', async () => {
    const { project, asset, key } = await seedStoredAsset();
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: asset.id,
        label: 'stale',
        asset,
        blobKey: key,
        blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
      }),
    ).rejects.toThrow(/保存済みBlobと一致しません/);
    expect(await listSnapshots(asset.id)).toEqual([]);
  });

  it('存在しない復旧点の復元は理由付きで失敗する', async () => {
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(StorageError);
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(/見つかりません/);
  });

  it('保存されていないAssetと別Project指定を拒否する', async () => {
    await expect(
      saveSnapshot({
        projectId: 'project_missing',
        assetId: baseAsset.id,
        label: '不正',
        asset: baseAsset,
        blobKey: editBlobKey(baseAsset),
        blob: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow(/復旧対象アセット/);

    const { asset, key, blob } = await seedStoredAsset();
    await expect(
      saveSnapshot({
        projectId: 'project_wrong',
        assetId: asset.id,
        label: '不正',
        asset,
        blobKey: key,
        blob,
      }),
    ).rejects.toThrow(/属していません/);
  });

  it('Asset ID不一致、source key、source TextureRef変更を拒否する', async () => {
    const { project, asset, key, blob } = await seedStoredAsset();
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: 'asset_wrong',
        label: '不正',
        asset,
        blobKey: key,
        blob,
      }),
    ).rejects.toThrow(/Asset ID/);

    const source = asset.textures.find((entry) => entry.kind === 'source')!;
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: asset.id,
        label: '不正',
        asset,
        blobKey: `${asset.id}/${source.path}`,
        blob,
      }),
    ).rejects.toThrow(/edit TextureRef/);

    const modified: Asset = {
      ...asset,
      textures: asset.textures.map((texture) =>
        texture.kind === 'source' ? { ...texture, name: `${texture.name}-changed` } : texture,
      ),
    };
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: asset.id,
        label: '不正',
        asset: modified,
        blobKey: key,
        blob,
      }),
    ).rejects.toThrow(/source TextureRef/);
  });

  it('復元前のedit Blobが欠落している場合は復元を開始しない', async () => {
    const { project, asset, key } = await seedStoredAsset();
    await saveCurrentSnapshot({ projectId: project.id, asset, key, label: '消しゴム' });
    const [summary] = await listSnapshots(asset.id);
    await deleteBlob(key);
    await expect(restoreSnapshot(summary.id)).rejects.toThrow(/復元前の edit Blob/);
  });
});

describe('復旧点の上限とProject分離', () => {
  it(`Project + Asset単位で最大${SNAPSHOT_LIMIT_PER_ASSET}件まで保持する`, async () => {
    const { project, asset, key } = await seedStoredAsset();
    for (let index = 0; index < SNAPSHOT_LIMIT_PER_ASSET + 2; index += 1) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 1, index + 1));
      try {
        await saveCurrentSnapshot({ projectId: project.id, asset, key, label: `操作${index}` });
      } finally {
        vi.useRealTimers();
      }
    }
    const list = await listSnapshots(asset.id);
    expect(list).toHaveLength(SNAPSHOT_LIMIT_PER_ASSET);
    expect(list.map((row) => row.label)).toEqual(['操作4', '操作3', '操作2']);
  });

  it('同じAsset IDを再利用した別Projectの復旧点を一覧・復元へ混ぜない', async () => {
    const first = await seedStoredAsset({ projectId: 'project_old', projectName: 'old' });
    await saveCurrentSnapshot({
      projectId: first.project.id,
      asset: first.asset,
      key: first.key,
      label: 'old snapshot',
    });
    const [oldSummary] = await listSnapshots(first.asset.id);
    await deleteProject(first.project.id);

    const current = await seedStoredAsset({ projectId: 'project_current', projectName: 'current' });
    await saveCurrentSnapshot({
      projectId: current.project.id,
      asset: current.asset,
      key: current.key,
      label: 'current snapshot',
    });
    expect((await listSnapshots(current.asset.id)).map((row) => row.label)).toEqual([
      'current snapshot',
    ]);
    await expect(restoreSnapshot(oldSummary.id)).rejects.toThrow(/属していません/);
  });

  it('Project IDを指定して対象所有者の復旧点だけを削除する', async () => {
    const first = await seedStoredAsset({ projectId: 'project_delete_old' });
    await saveCurrentSnapshot({
      projectId: first.project.id,
      asset: first.asset,
      key: first.key,
      label: 'old snapshot',
    });
    await deleteProject(first.project.id);
    const current = await seedStoredAsset({ projectId: 'project_delete_current' });
    await saveCurrentSnapshot({
      projectId: current.project.id,
      asset: current.asset,
      key: current.key,
      label: 'current snapshot',
    });
    await deleteSnapshotsForAsset(current.project.id, current.asset.id);
    expect(await listSnapshots(current.asset.id)).toEqual([]);
    await deleteProject(current.project.id);
    const all = await listSnapshots(current.asset.id);
    expect(all.map((row) => row.label)).toEqual(['old snapshot']);
  });
});
