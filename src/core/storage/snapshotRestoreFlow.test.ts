import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import { loadAsset, loadBlob, saveAssetRevision, saveProject } from './projectStore';
import { listSnapshots, restoreSnapshot, saveSnapshot } from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

/**
 * EditorScreen.handleRestoreSnapshot が行う原子的な改訂保存手順を
 * ストレージ層だけで再現し、「復元 → Undo」を経ても asset.textures[].size と
 * 実際に保存されている Blob の中身が食い違わないことを固定する。
 *
 * 修正前は Undo が asset（JSON）だけを戻し Blob を書き戻さなかったため、
 * Undo 後は「asset は編集後（新サイズ）を指すのに、Blob の実体は復元後（旧サイズ）の
 * ままになる」というデータ不整合が発生していた。
 */
describe('復旧点の復元 -> Undo の整合性（2D-1B-STORAGE §C, Opus 4.8 レビュー修正）', () => {
  it('復元してから Undo すると、texture.size と Blob の実体が復元前の状態に一致する', async () => {
    const projectId = 'project_restore_flow';
    const key = 'asset_restore_flow/textures/main.png';

    const project = createEmptyProject('復旧点フローテスト');
    await saveProject({ ...project, id: projectId });

    const baseAsset = characterAsset as unknown as Asset;
    const newSize = { width: 10, height: 10 };
    const oldSize = { width: 5, height: 5 };

    // 「現在（編集後）」のアセットと Blob
    const currentAsset: Asset = {
      ...baseAsset,
      id: 'asset_restore_flow',
      textures: baseAsset.textures.map((tex) => ({ ...tex, size: newSize })),
    };
    const newBytes = new Uint8Array([9, 9, 9, 9]);
    await saveAssetRevision({
      projectId,
      asset: currentAsset,
      putBlobs: [{ key, blob: new Blob([newBytes], { type: 'image/png' }) }],
    });

    // 「復旧点（編集前）」として、より小さいサイズのアセットと Blob を保存しておく
    const oldAsset: Asset = {
      ...baseAsset,
      id: 'asset_restore_flow',
      textures: baseAsset.textures.map((tex) => ({ ...tex, size: oldSize })),
    };
    const oldBytes = new Uint8Array([1, 1, 1, 1]);
    await saveSnapshot({
      projectId,
      assetId: currentAsset.id,
      label: '消しゴム',
      asset: oldAsset,
      blobKey: key,
      blob: new Blob([oldBytes], { type: 'image/png' }),
    });

    // --- handleRestoreSnapshot と同じ手順 ---
    const [snapshotSummary] = await listSnapshots(currentAsset.id);
    const restored = await restoreSnapshot(snapshotSummary.id);
    // 上書きする前に、復元前（現在）の Blob を退避する
    const beforeBlob = await loadBlob(key);
    expect(beforeBlob).not.toBeNull();
    expect(new Uint8Array(await beforeBlob!.arrayBuffer())).toEqual(newBytes);

    const before: Asset = { ...currentAsset, textures: [...currentAsset.textures] };
    const next: Asset = { ...restored.asset, textures: [...restored.asset.textures] };

    await saveAssetRevision({
      projectId,
      asset: next,
      putBlobs: [{ key, blob: restored.blob }],
    });

    // 復元直後: asset・Blob ともに「旧（復旧点）」で揃っている
    {
      const { asset } = await loadAsset(currentAsset.id);
      expect(asset.textures[0].size).toEqual(oldSize);
      const blob = await loadBlob(key);
      expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(oldBytes);
    }

    // --- Undo（修正後の handleRestoreSnapshot と同じ手順: Blob も書き戻す） ---
    await saveAssetRevision({
      projectId,
      asset: { ...before, textures: [...before.textures] },
      putBlobs: [{ key, blob: beforeBlob! }],
    });

    // Undo 後: asset・Blob ともに「新（復元前）」で揃っている（ここがバグ修正の核心）
    {
      const { asset } = await loadAsset(currentAsset.id);
      expect(asset.textures[0].size).toEqual(newSize);
      const blob = await loadBlob(key);
      expect(blob).not.toBeNull();
      expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(newBytes);
    }
  });
});
