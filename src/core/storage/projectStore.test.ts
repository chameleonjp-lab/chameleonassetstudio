import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Project } from '../model';
import { createEmptyProject } from '../model';
import characterAsset from '../samples/asset.character.json';
import { StorageError, resetDbForTests } from './db';
import {
  TRASH_LIMIT,
  deleteAsset,
  deleteAssetBundle,
  deleteProject,
  listProjectAssets,
  listProjects,
  listTrash,
  loadAsset,
  loadBlob,
  loadProject,
  purgeAllTrash,
  purgeTrash,
  restoreProject,
  saveAsset,
  saveAssetRevision,
  saveBlob,
  saveProject,
  saveProjectBundle,
} from './projectStore';
import { listSnapshots, saveSnapshot } from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

describe('project の保存と読み込み', () => {
  it('保存したプロジェクトを読み込める（往復テスト）', async () => {
    const project = createEmptyProject('テストプロジェクト');
    await saveProject(project);
    const { project: loaded, appliedMigrations } = await loadProject(project.id);
    expect(loaded).toEqual(project);
    expect(appliedMigrations).toEqual([]);
  });

  it('保存したプロジェクトが一覧へ出る', async () => {
    const a = createEmptyProject('プロジェクト A', new Date('2026-07-01T00:00:00.000Z'));
    const b = createEmptyProject('プロジェクト B', new Date('2026-07-02T00:00:00.000Z'));
    await saveProject(a);
    await saveProject(b);
    const summaries = await listProjects();
    expect(summaries).toHaveLength(2);
    // 更新が新しい順
    expect(summaries[0].name).toBe('プロジェクト B');
    expect(summaries[1].name).toBe('プロジェクト A');
    expect(summaries[0].assetCount).toBe(0);
  });

  it('存在しないプロジェクトの読み込みは理由付きで失敗する', async () => {
    await expect(loadProject('project_missing')).rejects.toThrow(StorageError);
    await expect(loadProject('project_missing')).rejects.toThrow(/見つかりません/);
  });

  it('不正なプロジェクトは保存前の検証で落ちる', async () => {
    const broken = { ...createEmptyProject('壊れた'), name: '' } as Project;
    await expect(saveProject(broken)).rejects.toThrow(/name/);
  });

  it('プロジェクトを削除すると一覧から消える', async () => {
    const project = createEmptyProject('削除対象');
    await saveProject(project);
    await deleteProject(project.id);
    expect(await listProjects()).toEqual([]);
    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
  });
});

describe('asset の保存と読み込み', () => {
  it('保存したアセットを読み込める（往復テスト）', async () => {
    const project = createEmptyProject('アセット用');
    await saveProject(project);
    const asset = characterAsset as unknown as Asset;
    await saveAsset(project.id, asset);
    const { asset: loaded } = await loadAsset(asset.id);
    expect(loaded).toEqual(asset);
  });

  it('プロジェクト単位でアセットを一覧できる', async () => {
    const project = createEmptyProject('アセット用');
    const other = createEmptyProject('別プロジェクト');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveProject(other);
    await saveAsset(project.id, asset);
    expect(await listProjectAssets(project.id)).toHaveLength(1);
    expect(await listProjectAssets(other.id)).toHaveLength(0);
  });

  it('プロジェクト削除でアセットも消える', async () => {
    const project = createEmptyProject('カスケード削除');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await deleteProject(project.id);
    await expect(loadAsset(asset.id)).rejects.toThrow(/見つかりません/);
  });
});

describe('画像 Blob の保存と読み込み', () => {
  it('保存した Blob の内容と MIME タイプが保持される（往復テスト）', async () => {
    const project = createEmptyProject('Blob 用');
    await saveProject(project);
    const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([original], { type: 'image/png' });

    await saveBlob(project.id, 'assets/asset_001/source/original.png', blob);
    const loaded = await loadBlob('assets/asset_001/source/original.png');

    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('image/png');
    const bytes = new Uint8Array(await loaded!.arrayBuffer());
    expect(bytes).toEqual(original);
  });

  it('存在しない Blob は null を返す', async () => {
    expect(await loadBlob('missing-key')).toBeNull();
  });

  // 仕様変更（2D-1B-STORAGE §B）: deleteProject は「ごみ箱へ移動」になり、
  // 復元できるよう Blob は保持したまま残す。完全に消えるのは purgeTrash / purgeAllTrash /
  // ごみ箱上限超過による自動 purge のときだけになったため、期待値を更新した。
  it('プロジェクトをごみ箱へ移動しても Blob は残り、完全削除で消える', async () => {
    const project = createEmptyProject('Blob 削除');
    await saveProject(project);
    await saveBlob(
      project.id,
      'key1',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    await deleteProject(project.id);
    expect(await loadBlob('key1')).not.toBeNull();

    const [trash] = await listTrash();
    await purgeTrash(trash.id);
    expect(await loadBlob('key1')).toBeNull();
  });
});

describe('saveProjectBundle（project + assets + blobs の原子的保存）', () => {
  it('project / assets / blobs をまとめて保存できる（往復テスト）', async () => {
    const project = createEmptyProject('バンドル保存');
    const asset = characterAsset as unknown as Asset;
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });

    await saveProjectBundle(project, [asset], [{ key: 'bundle-key', blob }]);

    const { project: loadedProject } = await loadProject(project.id);
    expect(loadedProject).toEqual(project);
    const { asset: loadedAsset } = await loadAsset(asset.id);
    expect(loadedAsset).toEqual(asset);
    const loadedBlob = await loadBlob('bundle-key');
    expect(loadedBlob).not.toBeNull();
    expect(new Uint8Array(await loadedBlob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('不正なアセットは保存前の検証で落ち、何も書き込まれない', async () => {
    const project = createEmptyProject('検証落ち');
    const brokenAsset = {
      ...(characterAsset as unknown as Asset),
      assetType: 'spaceship',
    } as unknown as Asset;
    await expect(
      saveProjectBundle(
        project,
        [brokenAsset],
        [{ key: 'k', blob: new Blob([new Uint8Array([1])]) }],
      ),
    ).rejects.toThrow(/assetType/);
    // 検証で落ちた場合、project 自体もトランザクションへ入る前なので保存されていない
    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob('k')).toBeNull();
  });

  it('transaction 途中の Blob 書き込みが失敗すると project / asset / blob のいずれも保存されない（原子性）', async () => {
    const project = createEmptyProject('原子性テスト');
    const asset = characterAsset as unknown as Asset;
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === 'blobs' &&
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === 'fail-key'
      ) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });

    try {
      await expect(
        saveProjectBundle(
          project,
          [asset],
          [
            { key: 'good-key', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }) },
            { key: 'fail-key', blob: new Blob([new Uint8Array([2])], { type: 'image/png' }) },
          ],
        ),
      ).rejects.toThrow();
    } finally {
      putSpy.mockRestore();
    }

    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(asset.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob('good-key')).toBeNull();
    expect(await loadBlob('fail-key')).toBeNull();
  });

  it('空の Blob key は transaction 開始前の入力検証で拒否する', async () => {
    const project = createEmptyProject('入力検証');
    const asset = characterAsset as unknown as Asset;

    await expect(
      saveProjectBundle(
        project,
        [asset],
        [{ key: '', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }) }],
      ),
    ).rejects.toThrow(/Blob key が空/);
    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
  });
});

describe('saveAssetRevision（asset + blobs の原子的改訂保存）', () => {
  it('Asset と複数 Blob を一つの改訂として保存できる', async () => {
    const project = createEmptyProject('改訂保存');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);

    await saveAssetRevision({
      projectId: project.id,
      asset,
      putBlobs: [
        { key: `${asset.id}/source/original.png`, blob: new Blob([new Uint8Array([1])]) },
        { key: `${asset.id}/textures/main.png`, blob: new Blob([new Uint8Array([2])]) },
      ],
    });

    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/source/original.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([1]));
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/textures/main.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([2]));
  });

  it('Blob 上書き後、読み込んだ Asset と Blob が対応する', async () => {
    const project = createEmptyProject('改訂上書き');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(project.id, `${asset.id}/textures/main.png`, new Blob([new Uint8Array([1])]));
    const next: Asset = {
      ...asset,
      textures: asset.textures.map((texture) =>
        texture.id === 'tex_main' ? { ...texture, size: { width: 24, height: 24 } } : texture,
      ),
    };

    await saveAssetRevision({
      projectId: project.id,
      asset: next,
      putBlobs: [
        { key: `${asset.id}/textures/main.png`, blob: new Blob([new Uint8Array([2, 4])]) },
      ],
    });

    expect(
      (await loadAsset(asset.id)).asset.textures.find((texture) => texture.id === 'tex_main')?.size,
    ).toEqual({
      width: 24,
      height: 24,
    });
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/textures/main.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([2, 4]));
  });

  it('Blob 削除と Asset 更新を同時に確定できる', async () => {
    const project = createEmptyProject('改訂削除');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(
      project.id,
      `${asset.id}/textures/old-layer.png`,
      new Blob([new Uint8Array([9])]),
    );
    const next: Asset = { ...asset, displayName: '削除後' };

    await saveAssetRevision({
      projectId: project.id,
      asset: next,
      deleteBlobKeys: [`${asset.id}/textures/old-layer.png`],
    });

    expect((await loadAsset(asset.id)).asset.displayName).toBe('削除後');
    expect(await loadBlob(`${asset.id}/textures/old-layer.png`)).toBeNull();
  });

  it('source Blob が残り、edit Blob だけが更新される', async () => {
    const project = createEmptyProject('source 不変');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(project.id, `${asset.id}/source/original.png`, new Blob([new Uint8Array([1])]));
    await saveBlob(project.id, `${asset.id}/textures/main.png`, new Blob([new Uint8Array([2])]));

    await saveAssetRevision({
      projectId: project.id,
      asset: { ...asset, updatedAt: '2026-07-13T00:00:00.000Z' },
      putBlobs: [{ key: `${asset.id}/textures/main.png`, blob: new Blob([new Uint8Array([3])]) }],
    });

    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/source/original.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([1]));
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/textures/main.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([3]));
  });

  it('更新途中の失敗後、旧 Asset・旧 edit Blob・source Blob が残る', async () => {
    const project = createEmptyProject('改訂失敗');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(project.id, `${asset.id}/source/original.png`, new Blob([new Uint8Array([1])]));
    await saveBlob(project.id, `${asset.id}/textures/main.png`, new Blob([new Uint8Array([2])]));
    const next: Asset = { ...asset, displayName: '失敗した改訂' };
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === 'blobs' &&
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === `${asset.id}/textures/new-layer.png`
      ) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });
    try {
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: next,
          putBlobs: [
            { key: `${asset.id}/textures/main.png`, blob: new Blob([new Uint8Array([3])]) },
            { key: `${asset.id}/textures/new-layer.png`, blob: new Blob([new Uint8Array([4])]) },
          ],
        }),
      ).rejects.toThrow();
    } finally {
      putSpy.mockRestore();
    }

    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/textures/main.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([2]));
    expect(
      new Uint8Array(await (await loadBlob(`${asset.id}/source/original.png`))!.arrayBuffer()),
    ).toEqual(new Uint8Array([1]));
    expect(await loadBlob(`${asset.id}/textures/new-layer.png`)).toBeNull();
  });

  it('同じ Blob key を保存と削除へ同時指定すると拒否する', async () => {
    const asset = characterAsset as unknown as Asset;
    await expect(
      saveAssetRevision({
        projectId: 'project_x',
        asset,
        putBlobs: [{ key: `${asset.id}/textures/main.png`, blob: new Blob() }],
        deleteBlobKeys: [`${asset.id}/textures/main.png`],
      }),
    ).rejects.toThrow(/同時に指定できません/);
  });

  it('対象 Asset 以外の Blob key は保存・削除とも拒否する', async () => {
    const asset = characterAsset as unknown as Asset;
    await expect(
      saveAssetRevision({
        projectId: 'project_x',
        asset,
        putBlobs: [{ key: `other_asset/textures/main.png`, blob: new Blob() }],
      }),
    ).rejects.toThrow(/対象アセットの prefix/);
    await expect(
      saveAssetRevision({
        projectId: 'project_x',
        asset,
        deleteBlobKeys: [`other_asset/textures/main.png`],
      }),
    ).rejects.toThrow(/対象アセットの prefix/);
  });

  describe('source Blob transition guard', () => {
    const baseAsset = characterAsset as unknown as Asset;
    const sourceKey = `${baseAsset.id}/source/original.png`;
    const editKey = `${baseAsset.id}/textures/main.png`;
    const newSourceKey = `${baseAsset.id}/source/added.png`;
    const newEditKey = `${baseAsset.id}/textures/added.png`;

    async function seedAsset() {
      const project = createEmptyProject('source guard');
      const asset = characterAsset as unknown as Asset;
      await saveProject(project);
      await saveAsset(project.id, asset);
      await saveBlob(project.id, sourceKey, new Blob([new Uint8Array([1])], { type: 'image/png' }));
      await saveBlob(project.id, editKey, new Blob([new Uint8Array([2])], { type: 'image/png' }));
      return { project, asset };
    }

    function withAddedSource(asset: Asset): Asset {
      return {
        ...asset,
        textures: [
          ...asset.textures,
          {
            id: 'tex_added_source',
            kind: 'source',
            name: 'added original',
            mimeType: 'image/png',
            size: { width: 1, height: 1 },
            path: 'source/added.png',
          },
          {
            id: 'tex_added_edit',
            kind: 'edit',
            name: 'added',
            mimeType: 'image/png',
            size: { width: 1, height: 1 },
            path: 'textures/added.png',
          },
        ],
        layers: [
          ...asset.layers,
          {
            id: 'layer_added',
            name: 'added',
            layerType: 'image',
            visible: true,
            locked: false,
            opacity: 1,
            transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
            textureId: 'tex_added_edit',
          },
        ],
      };
    }

    it('rejects overwriting and deleting existing source blobs', async () => {
      const { project, asset } = await seedAsset();
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset,
          putBlobs: [{ key: sourceKey, blob: new Blob([new Uint8Array([9])]) }],
        }),
      ).rejects.toThrow(/既存 source Blob は上書きできません/);
      await expect(
        saveAssetRevision({ projectId: project.id, asset, deleteBlobKeys: [sourceKey] }),
      ).rejects.toThrow(/既存 source Blob は削除できません/);
    });

    it('rejects bypasses that remove or reclassify existing source TextureRefs', async () => {
      const { project, asset } = await seedAsset();
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: {
            ...asset,
            textures: asset.textures.filter((texture) => texture.kind !== 'source'),
          },
          deleteBlobKeys: [sourceKey],
        }),
      ).rejects.toThrow(/delete 許可/);
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: {
            ...asset,
            textures: asset.textures.map((texture) =>
              texture.kind === 'source' ? { ...texture, kind: 'edit' as const } : texture,
            ),
          },
          putBlobs: [{ key: sourceKey, blob: new Blob([new Uint8Array([9])]) }],
        }),
      ).rejects.toThrow(/既存 source Blob は上書きできません/);
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: {
            ...asset,
            textures: asset.textures.map((texture) =>
              texture.kind === 'source' ? { ...texture, path: 'source/renamed.png' } : texture,
            ),
          },
          deleteBlobKeys: [sourceKey],
        }),
      ).rejects.toThrow(/delete 許可/);
    });

    it('allows explicit create, undo delete, and redo for newly added source only', async () => {
      const { project, asset } = await seedAsset();
      const after = withAddedSource(asset);
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: after,
          putBlobs: [{ key: newSourceKey, blob: new Blob([new Uint8Array([3])]) }],
        }),
      ).rejects.toThrow(/create 許可/);
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: after,
          putBlobs: [{ key: newSourceKey, blob: new Blob([new Uint8Array([3])]) }],
          sourceBlobTransitions: { createKeys: [`${asset.id}/source/unrelated.png`] },
        }),
      ).rejects.toThrow(/create 許可/);
      await saveAssetRevision({
        projectId: project.id,
        asset: after,
        putBlobs: [
          { key: newSourceKey, blob: new Blob([new Uint8Array([3])]) },
          { key: newEditKey, blob: new Blob([new Uint8Array([4])]) },
        ],
        sourceBlobTransitions: { createKeys: [newSourceKey] },
      });
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset,
          deleteBlobKeys: [newSourceKey, newEditKey],
        }),
      ).rejects.toThrow(/delete 許可/);
      await saveAssetRevision({
        projectId: project.id,
        asset,
        deleteBlobKeys: [newSourceKey, newEditKey],
        sourceBlobTransitions: { deleteKeys: [newSourceKey] },
      });
      expect(await loadBlob(newSourceKey)).toBeNull();
      await saveAssetRevision({
        projectId: project.id,
        asset: after,
        putBlobs: [
          { key: newSourceKey, blob: new Blob([new Uint8Array([3])]) },
          { key: newEditKey, blob: new Blob([new Uint8Array([4])]) },
        ],
        sourceBlobTransitions: { createKeys: [newSourceKey] },
      });
      expect(new Uint8Array(await (await loadBlob(sourceKey))!.arrayBuffer())).toEqual(
        new Uint8Array([1]),
      );
    });

    it('keeps asset and blobs atomic when source transition validation or transaction writes fail', async () => {
      const { project, asset } = await seedAsset();
      const after = withAddedSource({ ...asset, displayName: 'failed' });
      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: after,
          putBlobs: [{ key: newEditKey, blob: new Blob([new Uint8Array([9])]) }],
          sourceBlobTransitions: { createKeys: [newSourceKey] },
        }),
      ).rejects.toThrow(/一致しません/);
      expect((await loadAsset(asset.id)).asset).toEqual(asset);
      expect(await loadBlob(newEditKey)).toBeNull();
      const originalPut = IDBObjectStore.prototype.put;
      const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (
          this.name === 'blobs' &&
          typeof value === 'object' &&
          value !== null &&
          'key' in value &&
          value.key === newEditKey
        )
          throw new DOMException('fail injection', 'DataError');
        return originalPut.call(this, value, key);
      });
      try {
        await expect(
          saveAssetRevision({
            projectId: project.id,
            asset: withAddedSource(asset),
            putBlobs: [
              { key: newSourceKey, blob: new Blob([new Uint8Array([3])]) },
              { key: newEditKey, blob: new Blob([new Uint8Array([4])]) },
            ],
            sourceBlobTransitions: { createKeys: [newSourceKey] },
          }),
        ).rejects.toThrow();
      } finally {
        putSpy.mockRestore();
      }
      expect((await loadAsset(asset.id)).asset).toEqual(asset);
      expect(await loadBlob(newSourceKey)).toBeNull();
      expect(await loadBlob(newEditKey)).toBeNull();
    });
  });
});

describe('ごみ箱（trash）', () => {
  it('ごみ箱の一覧に表示され、復元すると一覧へ戻る', async () => {
    const project = createEmptyProject('ごみ箱テスト');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);

    await deleteProject(project.id);
    expect(await listProjects()).toEqual([]);
    const trashList = await listTrash();
    expect(trashList).toHaveLength(1);
    expect(trashList[0].name).toBe('ごみ箱テスト');
    expect(trashList[0].assetCount).toBe(1);

    await restoreProject(trashList[0].id);
    expect(await listTrash()).toEqual([]);
    const { project: restored } = await loadProject(project.id);
    expect(restored).toEqual(project);
    const { asset: restoredAsset } = await loadAsset(asset.id);
    expect(restoredAsset).toEqual(asset);
  });

  it('存在しないごみ箱 id の復元は理由付きで失敗する', async () => {
    await expect(restoreProject('trash_missing')).rejects.toThrow(/見つかりません/);
  });

  it('purgeTrash で完全に削除すると復元できなくなる', async () => {
    const project = createEmptyProject('完全削除テスト');
    await saveProject(project);
    await deleteProject(project.id);
    const [trash] = await listTrash();
    await purgeTrash(trash.id);
    expect(await listTrash()).toEqual([]);
    await expect(restoreProject(trash.id)).rejects.toThrow(/見つかりません/);
  });

  it('ごみ箱に移動しただけでは復旧点は残り、完全削除で消える', async () => {
    const project = createEmptyProject('復旧点つきプロジェクト');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      label: '消しゴム',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    });

    await deleteProject(project.id);
    // ごみ箱にある間は復元点を残す（復元後に Undo できるようにするため）
    expect(await listSnapshots(asset.id)).toHaveLength(1);

    const [trash] = await listTrash();
    await purgeTrash(trash.id);
    // 完全削除時には復旧点も一緒に消える（孤児データを残さない）
    expect(await listSnapshots(asset.id)).toEqual([]);
  });

  it('purgeAllTrash でごみ箱を空にできる', async () => {
    const a = createEmptyProject('空にする A');
    const b = createEmptyProject('空にする B');
    await saveProject(a);
    await saveProject(b);
    await deleteProject(a.id);
    await deleteProject(b.id);
    expect(await listTrash()).toHaveLength(2);
    await purgeAllTrash();
    expect(await listTrash()).toEqual([]);
  });

  it(`上限（${TRASH_LIMIT} 件）を超えると最も古いプロジェクトが自動で完全削除される`, async () => {
    const projects: Project[] = [];
    for (let i = 0; i < TRASH_LIMIT + 1; i += 1) {
      const project = createEmptyProject(`自動削除 ${i}`);
      await saveProject(project);
      projects.push(project);
    }
    // deletedAt の順序をテスト内で確実に区別するため、Date だけ fake にして 1 日ずつ進める
    // （setTimeout / setImmediate は実時間のままにし、fake-indexeddb 内部のスケジューリングに影響させない）。
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < projects.length; i += 1) {
        vi.setSystemTime(new Date(2026, 1, i + 1));
        await deleteProject(projects[i].id);
      }
    } finally {
      vi.useRealTimers();
    }
    const trashList = await listTrash();
    expect(trashList).toHaveLength(TRASH_LIMIT);
    // 最初に削除した「自動削除 0」は上限超過で完全に消えている
    expect(trashList.some((entry) => entry.name === '自動削除 0')).toBe(false);
    expect(trashList.some((entry) => entry.name === '自動削除 1')).toBe(true);
  });
});

describe('deleteAsset（アセット単位の削除）', () => {
  // 以前は assets ストアのみ削除しており、`${assetId}/...` の Blob が孤児として
  // 残り続けるバグがあった。この修正を固定する回帰テスト。
  it('アセットを削除すると、そのアセットの Blob だけが消え、他アセットの Blob は残る', async () => {
    const project = createEmptyProject('deleteAsset テスト');
    const assetA = characterAsset as unknown as Asset;
    const assetB: Asset = { ...assetA, id: 'asset_b_002' };
    await saveProject(project);
    await saveAsset(project.id, assetA);
    await saveAsset(project.id, assetB);
    await saveBlob(project.id, `${assetA.id}/textures/main.png`, new Blob([new Uint8Array([1])]));
    await saveBlob(project.id, `${assetB.id}/textures/main.png`, new Blob([new Uint8Array([2])]));

    await deleteAsset(assetA.id);

    await expect(loadAsset(assetA.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob(`${assetA.id}/textures/main.png`)).toBeNull();
    expect(await loadBlob(`${assetB.id}/textures/main.png`)).not.toBeNull();
  });

  it('存在しないアセットの削除は何もせず正常に終わる', async () => {
    await expect(deleteAsset('asset_missing')).resolves.toBeUndefined();
  });

  // Opus 4.8 レビュー指摘: deleteAsset が snapshots を消さないと、
  // 存在しないアセットを指す復旧点が孤児として残ってしまう。
  it('アセットを削除すると、その復旧点も一緒に消える', async () => {
    const project = createEmptyProject('deleteAsset 復旧点テスト');
    const asset = characterAsset as unknown as Asset;
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      label: '消しゴム',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    });
    expect(await listSnapshots(asset.id)).toHaveLength(1);

    await deleteAsset(asset.id);

    expect(await listSnapshots(asset.id)).toEqual([]);
  });
});

describe('deleteAssetBundle（project + asset + blobs + snapshots の原子的削除）', () => {
  it('Project 参照、Asset、Blob、snapshot を一体で削除できる', async () => {
    const asset = characterAsset as unknown as Asset;
    const project: Project = {
      ...createEmptyProject('bundle delete'),
      assets: [
        {
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        },
      ],
    };
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(project.id, `${asset.id}/textures/main.png`, new Blob([new Uint8Array([1])]));
    await saveSnapshot({
      projectId: project.id,
      assetId: asset.id,
      label: '消しゴム',
      asset,
      blobKey: `${asset.id}/textures/main.png`,
      blob: new Blob([new Uint8Array([1])]),
    });
    const nextProject: Project = { ...project, assets: [], updatedAt: '2026-07-13T00:00:00.000Z' };

    await deleteAssetBundle({ project: nextProject, assetId: asset.id });

    expect((await loadProject(project.id)).project.assets).toEqual([]);
    await expect(loadAsset(asset.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob(`${asset.id}/textures/main.png`)).toBeNull();
    expect(await listSnapshots(asset.id)).toEqual([]);
  });

  it('他の Asset や他 Project の Blob は削除せず、途中一致する別キーも誤削除しない', async () => {
    const assetA = characterAsset as unknown as Asset;
    const assetB: Asset = { ...assetA, id: 'asset_b_002' };
    const otherProject = createEmptyProject('other');
    const project: Project = {
      ...createEmptyProject('bundle delete scope'),
      assets: [
        {
          id: assetA.id,
          name: assetA.name,
          displayName: assetA.displayName,
          assetType: assetA.assetType,
        },
        {
          id: assetB.id,
          name: assetB.name,
          displayName: assetB.displayName,
          assetType: assetB.assetType,
        },
      ],
    };
    await saveProject(project);
    await saveProject(otherProject);
    await saveAsset(project.id, assetA);
    await saveAsset(project.id, assetB);
    await saveBlob(project.id, `${assetA.id}/textures/main.png`, new Blob([new Uint8Array([1])]));
    await saveBlob(project.id, `${assetB.id}/textures/main.png`, new Blob([new Uint8Array([2])]));
    await saveBlob(
      project.id,
      `prefix-${assetA.id}/textures/main.png`,
      new Blob([new Uint8Array([3])]),
    );
    await saveBlob(
      otherProject.id,
      `${assetA.id}-other/textures/main.png`,
      new Blob([new Uint8Array([4])]),
    );
    const nextProject: Project = {
      ...project,
      assets: [
        {
          id: assetB.id,
          name: assetB.name,
          displayName: assetB.displayName,
          assetType: assetB.assetType,
        },
      ],
    };

    await deleteAssetBundle({ project: nextProject, assetId: assetA.id });

    expect(await loadBlob(`${assetA.id}/textures/main.png`)).toBeNull();
    expect(await loadBlob(`${assetB.id}/textures/main.png`)).not.toBeNull();
    expect(await loadBlob(`prefix-${assetA.id}/textures/main.png`)).not.toBeNull();
    expect(await loadBlob(`${assetA.id}-other/textures/main.png`)).not.toBeNull();
    expect((await loadAsset(assetB.id)).asset).toEqual(assetB);
  });

  it('不正な更新後 Project は transaction 開始前に拒否され、削除前状態が残る', async () => {
    const asset = characterAsset as unknown as Asset;
    const project: Project = {
      ...createEmptyProject('bundle delete invalid'),
      assets: [
        {
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        },
      ],
    };
    await saveProject(project);
    await saveAsset(project.id, asset);
    await saveBlob(project.id, `${asset.id}/textures/main.png`, new Blob([new Uint8Array([1])]));
    const invalidProject = { ...project, name: '', assets: [] } as Project;

    await expect(deleteAssetBundle({ project: invalidProject, assetId: asset.id })).rejects.toThrow(
      /project/,
    );

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(await loadBlob(`${asset.id}/textures/main.png`)).not.toBeNull();
  });

  it('削除対象 Asset が別 Project に属する場合は Project 更新も Asset 削除も行わない', async () => {
    const asset = characterAsset as unknown as Asset;
    const ownerProject: Project = {
      ...createEmptyProject('owner'),
      assets: [
        {
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        },
      ],
    };
    const wrongProject = createEmptyProject('wrong');
    const nextWrongProject: Project = { ...wrongProject, name: 'wrong updated', assets: [] };
    await saveProject(ownerProject);
    await saveProject(wrongProject);
    await saveAsset(ownerProject.id, asset);

    await expect(
      deleteAssetBundle({ project: nextWrongProject, assetId: asset.id }),
    ).rejects.toThrow(/属していません/);

    expect((await loadProject(wrongProject.id)).project).toEqual(wrongProject);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
  });

  it('既に削除済みの Asset でも Project 更新は冪等に完了する', async () => {
    const asset = characterAsset as unknown as Asset;
    const project: Project = {
      ...createEmptyProject('bundle delete idempotent'),
      assets: [
        {
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        },
      ],
    };
    await saveProject(project);
    await saveAsset(project.id, asset);
    const nextProject: Project = { ...project, assets: [] };

    await deleteAssetBundle({ project: nextProject, assetId: asset.id });
    await expect(
      deleteAssetBundle({ project: nextProject, assetId: asset.id }),
    ).resolves.toBeUndefined();

    expect((await loadProject(project.id)).project.assets).toEqual([]);
  });
});
