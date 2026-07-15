import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { StorageError, resetDbForTests } from './db';
import { deleteBlob, deleteProject, saveAsset, saveBlob, saveProject } from './projectStore';
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
  if (!texture) {
    throw new Error('fixture に edit TextureRef がありません');
  }
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
  };
  const key = editBlobKey(asset);
  const bytes = options?.blobBytes ?? new Uint8Array([7, 7, 7]);
  await saveProject(project);
  await saveAsset(project.id, asset);
  await saveBlob(project.id, key, new Blob([bytes], { type: 'image/png' }));
  return { project, asset, key, bytes };
}

async function saveTestSnapshot(options: {
  projectId: string;
  asset: Asset;
  key: string;
  label: string;
  bytes?: Uint8Array;
}) {
  await saveSnapshot({
    projectId: options.projectId,
    assetId: options.asset.id,
    label: options.label,
    asset: options.asset,
    blobKey: options.key,
    blob: new Blob([options.bytes ?? new Uint8Array([9, 9, 9])], { type: 'image/png' }),
  });
}

describe('復旧点（snapshot）の所有境界', () => {
  it('保存した復旧点を復元でき、復元直前の Asset と edit Blob も返す', async () => {
    const { project, asset, key, bytes } = await seedStoredAsset();
    const snapshotBytes = new Uint8Array([9, 9, 9]);
    await saveTestSnapshot({
      projectId: project.id,
      asset,
      key,
      label: '消しゴム',
      bytes: snapshotBytes,
    });

    const list = await listSnapshots(asset.id);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('消しゴム');

    const restored = await restoreSnapshot(list[0].id);
    expect(restored.asset).toEqual(asset);
    expect(restored.beforeAsset).toEqual(asset);
    expect(restored.blobKey).toBe(key);
    expect(new Uint8Array(await restored.blob.arrayBuffer())).toEqual(snapshotBytes);
    expect(new Uint8Array(await restored.beforeBlob.arrayBuffer())).toEqual(bytes);
  });

  it('存在しない復旧点の復元は理由付きで失敗する', async () => {
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(StorageError);
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(/見つかりません/);
  });

  it('保存されていない Asset の復旧点作成を拒否する', async () => {
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
  });

  it('別 Project を指定した復旧点作成を拒否する', async () => {
    const { asset, key } = await seedStoredAsset();
    await expect(
      saveSnapshot({
        projectId: 'project_wrong',
        assetId: asset.id,
        label: '不正',
        asset,
        blobKey: key,
        blob: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow(/属していません/);
  });

  it('Asset ID と snapshot.asset.id が一致しない入力を拒否する', async () => {
    const { project, asset, key } = await seedStoredAsset();
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: 'asset_wrong',
        label: '不正',
        asset,
        blobKey: key,
        blob: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow(/Asset ID/);
  });

  it('source Blob key を復旧対象として保存できない', async () => {
    const { project, asset } = await seedStoredAsset();
    const source = asset.textures.find((entry) => entry.kind === 'source');
    expect(source).toBeDefined();
    await expect(
      saveSnapshot({
        projectId: project.id,
        assetId: asset.id,
        label: '不正',
        asset,
        blobKey: `${asset.id}/${source!.path}`,
        blob: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow(/edit TextureRef/);
  });

  it('source TextureRef を変更した復旧点を拒否する', async () => {
    const { project, asset, key } = await seedStoredAsset();
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
        blob: new Blob([new Uint8Array([1])]),
      }),
    ).rejects.toThrow(/source TextureRef/);
  });

  it('復元前の edit Blob が欠落している場合は復元を開始しない', async () => {
    const { project, asset, key } = await seedStoredAsset();
    await saveTestSnapshot({ projectId: project.id, asset, key, label: '消しゴム' });
    const [summary] = await listSnapshots(asset.id);
    await deleteBlob(key);

    await expect(restoreSnapshot(summary.id)).rejects.toThrow(/復元前の edit Blob/);
  });
});

describe('復旧点の上限と Project 分離', () => {
  it(`Project + Asset 単位で最大 ${SNAPSHOT_LIMIT_PER_ASSET} 件まで保持し、超過分は最古から消える`, async () => {
    const { project, asset, key } = await seedStoredAsset();
    for (let i = 0; i < SNAPSHOT_LIMIT_PER_ASSET + 2; i += 1) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 1, i + 1));
      try {
        await saveTestSnapshot({
          projectId: project.id,
          asset,
          key,
          label: `操作${i}`,
          bytes: new Uint8Array([i]),
        });
      } finally {
        vi.useRealTimers();
      }
    }
    const list = await listSnapshots(asset.id);
    expect(list).toHaveLength(SNAPSHOT_LIMIT_PER_ASSET);
    expect(list.map((row) => row.label)).toEqual(['操作4', '操作3', '操作2']);
  });

  it('同じ Asset ID を再利用した別 Project の復旧点を一覧・復元へ混ぜない', async () => {
    const first = await seedStoredAsset({ projectId: 'project_old', projectName: 'old' });
    await saveTestSnapshot({
      projectId: first.project.id,
      asset: first.asset,
      key: first.key,
      label: 'old snapshot',
    });
    const [oldSummary] = await listSnapshots(first.asset.id);
    await deleteProject(first.project.id);

    const current = await seedStoredAsset({ projectId: 'project_current', projectName: 'current' });
    await saveTestSnapshot({
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

  it('他のアセットの復旧点には影響しない', async () => {
    const assetA: Asset = { ...baseAsset, id: 'asset_a' };
    const assetB: Asset = { ...baseAsset, id: 'asset_b' };
    const project = { ...createEmptyProject('two assets'), id: 'project_two_assets' };
    await saveProject(project);
    await saveAsset(project.id, assetA);
    await saveAsset(project.id, assetB);
    await saveTestSnapshot({
      projectId: project.id,
      asset: assetA,
      key: editBlobKey(assetA),
      label: 'A の操作',
    });
    await saveTestSnapshot({
      projectId: project.id,
      asset: assetB,
      key: editBlobKey(assetB),
      label: 'B の操作',
    });
    expect(await listSnapshots(assetA.id)).toHaveLength(1);
    expect(await listSnapshots(assetB.id)).toHaveLength(1);
  });

  it('deleteSnapshotsForAsset でアセットの復旧点をすべて消せる', async () => {
    const { project, asset, key } = await seedStoredAsset();
    await saveTestSnapshot({ projectId: project.id, asset, key, label: '操作1' });
    await saveTestSnapshot({ projectId: project.id, asset, key, label: '操作2' });
    await deleteSnapshotsForAsset(asset.id);
    expect(await listSnapshots(asset.id)).toEqual([]);
  });
});
