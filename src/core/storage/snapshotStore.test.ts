import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { StorageError, resetDbForTests } from './db';
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

const asset = characterAsset as unknown as Asset;

describe('復旧点（snapshot）', () => {
  it('保存した復旧点を復元できる（往復テスト）', async () => {
    const before = new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' });
    await saveSnapshot({
      projectId: 'project_1',
      assetId: asset.id,
      label: '消しゴム',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: before,
    });

    const list = await listSnapshots(asset.id);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('消しゴム');

    const restored = await restoreSnapshot(list[0].id);
    expect(restored.asset).toEqual(asset);
    expect(restored.blobKey).toBe(`${asset.id}/textures/main.png`);
    expect(new Uint8Array(await restored.blob.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
  });

  it('存在しない復旧点の復元は理由付きで失敗する', async () => {
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(StorageError);
    await expect(restoreSnapshot('snapshot_missing')).rejects.toThrow(/見つかりません/);
  });

  it(`アセットあたり最大 ${SNAPSHOT_LIMIT_PER_ASSET} 件までで、超過分は最古から消える`, async () => {
    for (let i = 0; i < SNAPSHOT_LIMIT_PER_ASSET + 2; i += 1) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 1, i + 1));
      try {
        await saveSnapshot({
          projectId: 'project_1',
          assetId: asset.id,
          label: `操作${i}`,
          asset,
          blobKey: `${asset.id}/textures/main.png`,
          blob: new Blob([new Uint8Array([i])], { type: 'image/png' }),
        });
      } finally {
        vi.useRealTimers();
      }
    }
    const list = await listSnapshots(asset.id);
    expect(list).toHaveLength(SNAPSHOT_LIMIT_PER_ASSET);
    // 新しい順に並び、最古の「操作0」「操作1」は消えている
    expect(list.map((row) => row.label)).toEqual(['操作4', '操作3', '操作2']);
  });

  it('他のアセットの復旧点には影響しない', async () => {
    await saveSnapshot({
      projectId: 'project_1',
      assetId: 'asset_a',
      label: 'A の操作',
      asset,
      blobKey: 'asset_a/textures/main.png',
      blob: new Blob([new Uint8Array([1])]),
    });
    await saveSnapshot({
      projectId: 'project_1',
      assetId: 'asset_b',
      label: 'B の操作',
      asset,
      blobKey: 'asset_b/textures/main.png',
      blob: new Blob([new Uint8Array([2])]),
    });
    expect(await listSnapshots('asset_a')).toHaveLength(1);
    expect(await listSnapshots('asset_b')).toHaveLength(1);
  });

  it('deleteSnapshotsForAsset でアセットの復旧点をすべて消せる', async () => {
    await saveSnapshot({
      projectId: 'project_1',
      assetId: asset.id,
      label: '操作1',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: new Blob([new Uint8Array([1])]),
    });
    await saveSnapshot({
      projectId: 'project_1',
      assetId: asset.id,
      label: '操作2',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: new Blob([new Uint8Array([2])]),
    });
    await deleteSnapshotsForAsset(asset.id);
    expect(await listSnapshots(asset.id)).toEqual([]);
  });
});
