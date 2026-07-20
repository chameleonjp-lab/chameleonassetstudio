import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Project } from '../model';
import { createEmptyProject } from '../model';
import { createLinkedMirrorVariant } from '../model/familyTestFixtures';
import characterAsset from '../samples/asset.character.json';
import {
  requestToPromise,
  resetDbForTests,
  runTransaction,
  STORE_ASSETS,
  STORE_PROJECTS,
} from './db';
import { restoreProject } from './index';
import {
  TRASH_LIMIT,
  deleteAsset,
  deleteAssetBundle,
  deleteAssetsBundle,
  deleteProject,
  listProjectAssets,
  listProjects,
  listTrash,
  loadAsset,
  loadBlob,
  loadProject,
  purgeAllTrash,
  purgeTrash,
  saveAsset,
  saveAssetBatchRevision,
  saveAssetRevision,
  saveBlob,
  saveProject,
  saveProjectBundle,
} from './projectStore';
import { listSnapshots, saveSnapshot } from './snapshotStore';

beforeEach(async () => {
  await resetDbForTests();
});

function assetWithId(id: string, displayName = id): Asset {
  const base = characterAsset as unknown as Asset;
  return { ...base, id, name: id, displayName };
}

function projectWithAssets(name: string, assets: Asset[], id?: string): Project {
  return {
    ...createEmptyProject(name),
    ...(id ? { id } : {}),
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    })),
  };
}

function blobsForAsset(asset: Asset, seed = 1) {
  return asset.textures.map((texture, index) => ({
    key: `${asset.id}/${texture.path}`,
    blob: new Blob([new Uint8Array([seed + index])], { type: texture.mimeType }),
  }));
}

async function saveAssetWithBlobs(project: Project, asset: Asset, seed = 1): Promise<void> {
  await saveProject(project);
  await saveAsset(project.id, asset);
  for (const [index, texture] of asset.textures.entries()) {
    await saveBlob(
      project.id,
      `${asset.id}/${texture.path}`,
      new Blob([new Uint8Array([seed + index])], { type: texture.mimeType }),
    );
  }
}

async function saveCurrentSnapshot(project: Project, asset: Asset, label: string): Promise<void> {
  const edit = asset.textures.find((texture) => texture.kind === 'edit');
  if (!edit) {
    throw new Error('edit texture missing');
  }
  const key = `${asset.id}/${edit.path}`;
  const blob = await loadBlob(key);
  if (!blob) {
    throw new Error('edit blob missing');
  }
  await saveSnapshot({
    projectId: project.id,
    assetId: asset.id,
    label,
    asset,
    blobKey: key,
    blob,
  });
}

describe('project / asset 基本保存', () => {
  it('ProjectとAssetを保存・一覧・読み込みできる', async () => {
    const asset = assetWithId('asset_basic');
    const project = projectWithAssets('basic', [asset]);
    await saveProject(project);
    await saveAsset(project.id, asset);

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(await listProjects()).toHaveLength(1);
    expect(await listProjectAssets(project.id)).toEqual([asset]);
  });

  it('旧IndexedDB Assetを一覧読込時に0.2.0へ原子的に移行し、直後のbatch保存で使える', async () => {
    const current = assetWithId('asset_legacy_indexeddb');
    const legacy = {
      ...structuredClone(current),
      version: '0.1.0',
      legacyRoot: { keep: true },
      textures: current.textures.map((texture, index) =>
        index === 0 ? { ...structuredClone(texture), legacyTexture: 'keep' } : texture,
      ),
    } as unknown as Asset;
    const project = projectWithAssets('legacy indexeddb', [legacy]);
    await saveProject(project);
    await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
      requestToPromise(
        tx.objectStore(STORE_ASSETS).put({
          id: legacy.id,
          projectId: project.id,
          data: legacy,
        }),
      ),
    );
    for (const [index, texture] of legacy.textures.entries()) {
      await saveBlob(
        project.id,
        `${legacy.id}/${texture.path}`,
        new Blob([new Uint8Array([index + 1])], { type: texture.mimeType }),
      );
    }

    const [migrated] = await listProjectAssets(project.id);
    expect(migrated.version).toBe('0.2.0');
    expect(migrated).not.toHaveProperty('provenance');
    expect(migrated).toMatchObject({ legacyRoot: { keep: true } });
    expect(migrated.textures[0]).toMatchObject({ legacyTexture: 'keep' });

    const stored = await runTransaction([STORE_ASSETS], 'readonly', (tx) =>
      requestToPromise(tx.objectStore(STORE_ASSETS).get(legacy.id)),
    );
    expect(stored).toMatchObject({ data: { version: '0.2.0', legacyRoot: { keep: true } } });

    const afterAsset: Asset = { ...migrated, tags: [...migrated.tags, 'after-migration'] };
    await expect(
      saveAssetBatchRevision({
        beforeProject: project,
        afterProject: project,
        targets: [{ beforeAsset: migrated, afterAsset }],
        snapshotLabel: '',
      }),
    ).resolves.toEqual(project);
    expect((await loadAsset(legacy.id)).asset.tags).toContain('after-migration');
  });

  it('一覧内にfuture Assetがあれば旧Assetも部分migrationせず正本を温存する', async () => {
    const legacy = {
      ...assetWithId('asset_atomic_legacy'),
      version: '0.1.0',
    } as unknown as Asset;
    const future = {
      ...assetWithId('asset_atomic_future'),
      version: '0.2.1',
    } as unknown as Asset;
    const project = projectWithAssets('atomic migration failure', [legacy, future]);
    await saveProject(project);
    await runTransaction([STORE_ASSETS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_ASSETS);
      await requestToPromise(store.put({ id: legacy.id, projectId: project.id, data: legacy }));
      await requestToPromise(store.put({ id: future.id, projectId: project.id, data: future }));
    });

    await expect(listProjectAssets(project.id)).rejects.toThrow(/新しい形式/);

    const storedLegacy = (await runTransaction([STORE_ASSETS], 'readonly', (tx) =>
      requestToPromise(tx.objectStore(STORE_ASSETS).get(legacy.id)),
    )) as { data: Asset };
    expect(storedLegacy.data.version).toBe('0.1.0');
  });

  it('別Project所有の既存Assetをmetadata保存で上書きしない', async () => {
    const asset = assetWithId('asset_owner');
    const owner = projectWithAssets('owner', [asset]);
    const other = createEmptyProject('other');
    await saveProject(owner);
    await saveProject(other);
    await saveAsset(owner.id, asset);

    await expect(saveAsset(other.id, { ...asset, displayName: 'wrong' })).rejects.toThrow(
      /属していません/,
    );
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
  });
});

describe('Slice A Family保存・削除境界', () => {
  it('有効なFamilyを保存・読込でき、欠落参照とProject Asset ID重複を拒否する', async () => {
    const base = assetWithId('asset_family_base');
    const variant = assetWithId('asset_family_variant');
    const project = projectWithAssets('family', [base, variant]);
    project.families = [
      {
        id: 'family_hero',
        name: 'Hero',
        baseAssetId: base.id,
        variants: [createLinkedMirrorVariant(variant.id)],
      },
    ];

    await saveProject(project);
    expect((await loadProject(project.id)).project).toEqual(project);

    await expect(
      saveProject({
        ...project,
        families: [
          {
            ...project.families[0],
            baseAssetId: 'asset_missing',
          },
        ],
      }),
    ).rejects.toThrow(/baseAssetId/);
    await expect(
      saveProject({ ...project, assets: [...project.assets, project.assets[0]] }),
    ).rejects.toThrow(/同じAsset ID/);
  });

  it('schema上は正しいがFamily参照が壊れた保存済みProjectをloadProjectで拒否する', async () => {
    const base = assetWithId('asset_invalid_loaded_base');
    const invalid = projectWithAssets('invalid loaded family', [base]);
    invalid.families = [
      {
        id: 'family_invalid_loaded',
        name: 'Invalid Loaded Family',
        baseAssetId: base.id,
        variants: [{ assetId: 'asset_missing', kind: 'manual' }],
      },
    ];
    await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
      requestToPromise(tx.objectStore(STORE_PROJECTS).put(invalid)),
    );

    await expect(loadProject(invalid.id)).rejects.toThrow(/variant assetId/);
  });

  it('base削除とFamily参照を残したvariant削除を拒否し、参照除去後は他memberを維持して原子的に削除する', async () => {
    const base = assetWithId('asset_delete_base');
    const variant = assetWithId('asset_delete_variant');
    const standalone = assetWithId('asset_delete_standalone');
    const project = projectWithAssets('family delete', [base, variant, standalone]);
    project.families = [
      {
        id: 'family_delete',
        name: 'Delete Family',
        baseAssetId: base.id,
        variants: [{ assetId: variant.id, kind: 'manual' }],
      },
    ];
    await saveProjectBundle(
      project,
      [base, variant, standalone],
      [base, variant, standalone].flatMap((item, index) => blobsForAsset(item, 10 + index * 10)),
    );

    await expect(
      deleteAssetBundle({
        project: { ...project, assets: project.assets.filter((entry) => entry.id !== base.id) },
        assetId: base.id,
      }),
    ).rejects.toThrow(/Family.*base/);
    await expect(
      deleteAssetBundle({
        project: { ...project, assets: project.assets.filter((entry) => entry.id !== variant.id) },
        assetId: variant.id,
      }),
    ).rejects.toThrow(/variant として残っています/);

    const nextProject: Project = {
      ...project,
      assets: project.assets.filter((entry) => entry.id !== variant.id),
      families: [{ ...project.families[0], variants: [] }],
    };
    await deleteAssetBundle({ project: nextProject, assetId: variant.id });

    expect((await loadProject(project.id)).project).toEqual(nextProject);
    await expect(loadAsset(variant.id)).rejects.toThrow(/見つかりません/);
    expect((await loadAsset(base.id)).asset.id).toBe(base.id);
    expect((await loadAsset(standalone.id)).asset.id).toBe(standalone.id);
    expect(await loadBlob(`${variant.id}/${variant.textures[0].path}`)).toBeNull();
    expect(await loadBlob(`${base.id}/${base.textures[0].path}`)).not.toBeNull();
    expect(await loadBlob(`${standalone.id}/${standalone.textures[0].path}`)).not.toBeNull();
  });

  it('Family付きProjectをごみ箱へ移動・復元して関係を保持する', async () => {
    const base = assetWithId('asset_restore_family_base');
    const variant = assetWithId('asset_restore_family_variant');
    const project = projectWithAssets('family restore', [base, variant]);
    project.families = [
      {
        id: 'family_restore',
        name: 'Restore Family',
        baseAssetId: base.id,
        variants: [{ assetId: variant.id, kind: 'manual' }],
      },
    ];
    await saveProjectBundle(
      project,
      [base, variant],
      [base, variant].flatMap((item, index) => blobsForAsset(item, 70 + index * 10)),
    );

    await deleteProject(project.id);
    await restoreProject(project.id);

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(base.id)).asset.id).toBe(base.id);
    expect((await loadAsset(variant.id)).asset.id).toBe(variant.id);
  });

  it('variant削除transactionが失敗したらFamily参照・Asset・Blobをすべて維持する', async () => {
    const base = assetWithId('asset_delete_atomic_base');
    const variant = assetWithId('asset_delete_atomic_variant');
    const project = projectWithAssets('family delete atomic', [base, variant]);
    project.families = [
      {
        id: 'family_delete_atomic',
        name: 'Delete Atomic Family',
        baseAssetId: base.id,
        variants: [{ assetId: variant.id, kind: 'manual' }],
      },
    ];
    await saveProjectBundle(
      project,
      [base, variant],
      [base, variant].flatMap((item, index) => blobsForAsset(item, 90 + index * 10)),
    );
    const nextProject: Project = {
      ...project,
      assets: project.assets.filter((entry) => entry.id !== variant.id),
      families: [{ ...project.families[0], variants: [] }],
    };
    const originalDelete = IDBObjectStore.prototype.delete;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'assets' && key === variant.id) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalDelete.call(this, key);
    });

    try {
      await expect(
        deleteAssetBundle({ project: nextProject, assetId: variant.id }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(variant.id)).asset.id).toBe(variant.id);
    expect(await loadBlob(`${variant.id}/${variant.textures[0].path}`)).not.toBeNull();
  });
});

describe('saveProjectBundle guard', () => {
  it('複数の新規Asset・BlobをProject更新と同じtransactionで削除する', async () => {
    const first = assetWithId('asset_multi_delete_first');
    const second = assetWithId('asset_multi_delete_second');
    const project = projectWithAssets('multi delete', [first, second]);
    await saveProjectBundle(
      project,
      [first, second],
      [first, second].flatMap((asset, index) => blobsForAsset(asset, 30 + index * 10)),
    );
    const beforeProject: Project = { ...project, assets: [], updatedAt: project.createdAt };

    await deleteAssetsBundle({
      project: beforeProject,
      assetIds: [first.id, second.id],
    });

    expect((await loadProject(project.id)).project).toEqual(beforeProject);
    await expect(loadAsset(first.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(second.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob(`${first.id}/${first.textures[0].path}`)).toBeNull();
    expect(await loadBlob(`${second.id}/${second.textures[0].path}`)).toBeNull();
  });

  it('複数Asset削除の途中で失敗したらProject・全Asset・全Blobを維持する', async () => {
    const first = assetWithId('asset_multi_delete_rollback_first');
    const second = assetWithId('asset_multi_delete_rollback_second');
    const project = projectWithAssets('multi delete rollback', [first, second]);
    await saveProjectBundle(
      project,
      [first, second],
      [first, second].flatMap((asset, index) => blobsForAsset(asset, 50 + index * 10)),
    );
    const nextProject: Project = { ...project, assets: [], updatedAt: project.createdAt };
    const originalDelete = IDBObjectStore.prototype.delete;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === 'assets' && key === second.id) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalDelete.call(this, key);
    });

    try {
      await expect(
        deleteAssetsBundle({ project: nextProject, assetIds: [first.id, second.id] }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(first.id)).asset).toEqual(first);
    expect((await loadAsset(second.id)).asset).toEqual(second);
    expect(await loadBlob(`${first.id}/${first.textures[0].path}`)).not.toBeNull();
    expect(await loadBlob(`${second.id}/${second.textures[0].path}`)).not.toBeNull();
  });

  it('Project参照・Asset・全Texture Blobを原子的に保存する', async () => {
    const asset = assetWithId('asset_bundle');
    const project = projectWithAssets('bundle', [asset]);
    await saveProjectBundle(project, [asset], blobsForAsset(asset));

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    for (const texture of asset.textures) {
      expect(await loadBlob(`${asset.id}/${texture.path}`)).not.toBeNull();
    }
  });

  it('Project参照欠落、Blob不足、orphan Blobを拒否する', async () => {
    const asset = assetWithId('asset_bundle_invalid');
    const unreferencedProject = createEmptyProject('unreferenced');
    await expect(
      saveProjectBundle(unreferencedProject, [asset], blobsForAsset(asset)),
    ).rejects.toThrow(/参照されていません/);

    const project = projectWithAssets('blob guard', [asset]);
    const complete = blobsForAsset(asset);
    await expect(saveProjectBundle(project, [asset], complete.slice(1))).rejects.toThrow(
      /Blob が保存対象にありません/,
    );
    await expect(
      saveProjectBundle(
        project,
        [asset],
        [...complete, { key: `${asset.id}/orphan.bin`, blob: new Blob([new Uint8Array([9])]) }],
      ),
    ).rejects.toThrow(/対応する TextureRef/);
  });

  it('TextureRefとBlobのMIME type不一致を拒否する', async () => {
    const asset = assetWithId('asset_bundle_mime_mismatch');
    const project = projectWithAssets('mime guard', [asset]);
    const blobs = blobsForAsset(asset);
    blobs[0] = {
      ...blobs[0],
      blob: new Blob([new Uint8Array([1])], { type: 'image/gif' }),
    };

    await expect(saveProjectBundle(project, [asset], blobs)).rejects.toThrow(/MIME type/);
  });

  it('通常改訂でも既存edit・新規sourceのBlob MIME不一致を拒否する', async () => {
    const asset = assetWithId('asset_revision_mime_mismatch');
    const project = projectWithAssets('revision mime guard', [asset]);
    await saveProjectBundle(project, [asset], blobsForAsset(asset));
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const editKey = `${asset.id}/${edit.path}`;

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset,
        putBlobs: [{ key: editKey, blob: new Blob([new Uint8Array([9])], { type: 'image/gif' }) }],
      }),
    ).rejects.toThrow(/MIME type/);
    expect((await loadBlob(editKey))?.type).toBe('image/png');

    const source = {
      id: 'tex_svg_source_added',
      kind: 'source' as const,
      name: 'svg source',
      mimeType: 'image/svg+xml' as const,
      size: { width: 8, height: 8 },
      path: 'source/added.svg',
    };
    const withSource: Asset = { ...asset, textures: [...asset.textures, source] };
    const sourceKey = `${asset.id}/${source.path}`;
    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset: withSource,
        putBlobs: [
          { key: sourceKey, blob: new Blob([new Uint8Array([1])], { type: 'image/gif' }) },
        ],
        sourceBlobTransitions: { createKeys: [sourceKey] },
      }),
    ).rejects.toThrow(/MIME type/);
    expect(await loadBlob(sourceKey)).toBeNull();
  });

  it('Project要約と新規Asset metadataの不一致を拒否する', async () => {
    const asset = assetWithId('asset_bundle_metadata');
    const project = projectWithAssets('metadata guard', [asset]);
    project.assets[0] = { ...project.assets[0], assetType: 'tile' };

    await expect(saveProjectBundle(project, [asset], blobsForAsset(asset))).rejects.toThrow(
      /Asset 要約が保存対象 Asset と一致しません/,
    );
    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(asset.id)).rejects.toThrow(/見つかりません/);
  });

  it('既存Assetを新規bundle APIで上書きしない', async () => {
    const asset = assetWithId('asset_existing', 'before');
    const owner = projectWithAssets('owner', [asset]);
    await saveAssetWithBlobs(owner, asset);
    const changed = { ...asset, displayName: 'after' };
    const nextProject = projectWithAssets('same owner update', [changed], owner.id);

    await expect(
      saveProjectBundle(nextProject, [changed], blobsForAsset(changed, 20)),
    ).rejects.toThrow(/saveAssetRevision/);
    expect((await loadAsset(asset.id)).asset.displayName).toBe('before');
  });

  it('transaction途中失敗時はProject・Asset・Blobを残さない', async () => {
    const asset = assetWithId('asset_bundle_fail');
    const project = projectWithAssets('bundle fail', [asset]);
    const blobs = blobsForAsset(asset);
    const failKey = blobs.at(-1)?.key;
    if (!failKey) {
      throw new Error('fixture blob missing');
    }

    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === 'blobs' &&
        typeof value === 'object' &&
        value !== null &&
        'key' in value &&
        value.key === failKey
      ) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });

    try {
      await expect(saveProjectBundle(project, [asset], blobs)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    await expect(loadProject(project.id)).rejects.toThrow(/見つかりません/);
    await expect(loadAsset(asset.id)).rejects.toThrow(/見つかりません/);
    expect(await loadBlob(blobs[0].key)).toBeNull();
  });
});

describe('改訂保存', () => {
  it('metadata保存でProject要約とAssetを原子的に同期する', async () => {
    const asset = assetWithId('asset_metadata_sync', 'before');
    const project = projectWithAssets('metadata sync', [asset]);
    await saveProject(project);
    await saveAsset(project.id, asset);
    const next: Asset = {
      ...asset,
      name: 'renamed_asset',
      displayName: 'after',
      assetType: 'tile',
      updatedAt: '2026-07-16T01:00:00.000Z',
    };

    await saveAsset(project.id, next);

    expect((await loadAsset(asset.id)).asset).toEqual(next);
    expect((await loadProject(project.id)).project.assets[0]).toEqual({
      id: next.id,
      name: next.name,
      displayName: next.displayName,
      assetType: next.assetType,
    });
  });

  it('metadata保存の途中失敗時はProject要約とAssetを両方維持する', async () => {
    const asset = assetWithId('asset_metadata_atomic', 'before');
    const project = projectWithAssets('metadata atomic', [asset]);
    await saveProject(project);
    await saveAsset(project.id, asset);
    const next: Asset = { ...asset, displayName: 'after', assetType: 'tile' };
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'assets') {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });

    try {
      await expect(saveAsset(project.id, next)).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect((await loadAsset(asset.id)).asset.displayName).toBe('before');
    expect((await loadProject(project.id)).project.assets[0]).toMatchObject({
      displayName: 'before',
      assetType: asset.assetType,
    });
  });

  it('Assetとedit Blobを同じ改訂で更新しsource Blobを維持する', async () => {
    const asset = assetWithId('asset_revision');
    const project = projectWithAssets('revision', [asset]);
    await saveAssetWithBlobs(project, asset);
    const edit = asset.textures.find((texture) => texture.kind === 'edit');
    const source = asset.textures.find((texture) => texture.kind === 'source');
    if (!edit || !source) {
      throw new Error('fixture texture missing');
    }
    const editKey = `${asset.id}/${edit.path}`;
    const sourceKey = `${asset.id}/${source.path}`;
    const sourceBefore = new Uint8Array(await (await loadBlob(sourceKey))!.arrayBuffer());
    const next: Asset = {
      ...asset,
      displayName: 'after',
      textures: asset.textures.map((texture) =>
        texture.id === edit.id ? { ...texture, size: { width: 24, height: 24 } } : texture,
      ),
    };

    await saveAssetRevision({
      projectId: project.id,
      asset: next,
      putBlobs: [{ key: editKey, blob: new Blob([new Uint8Array([99])], { type: edit.mimeType }) }],
    });

    expect((await loadAsset(asset.id)).asset.displayName).toBe('after');
    expect(new Uint8Array(await (await loadBlob(editKey))!.arrayBuffer())).toEqual(
      new Uint8Array([99]),
    );
    expect(new Uint8Array(await (await loadBlob(sourceKey))!.arrayBuffer())).toEqual(sourceBefore);
    expect((await loadProject(project.id)).project.assets[0].displayName).toBe('after');
  });
});

describe('trash restore / purge ownership', () => {
  it('安全なpublic restore入口で衝突なしのProjectを復元する', async () => {
    const asset = assetWithId('asset_restore');
    const project = projectWithAssets('restore', [asset]);
    await saveAssetWithBlobs(project, asset);
    await deleteProject(project.id);
    await restoreProject(project.id);

    expect((await loadProject(project.id)).project).toEqual(project);
    expect((await loadAsset(asset.id)).asset).toEqual(asset);
  });

  it('live Project ID衝突時は完全削除を拒否しlive Blobとtrashを維持する', async () => {
    const asset = assetWithId('asset_project_collision');
    const deleted = projectWithAssets('deleted', [asset], 'project_collision');
    await saveAssetWithBlobs(deleted, asset);
    await deleteProject(deleted.id);
    await saveProject({ ...deleted, name: 'live' });
    await saveBlob(deleted.id, 'live-only/blob.png', new Blob([new Uint8Array([77])]));

    await expect(purgeTrash(deleted.id)).rejects.toThrow(/同じProject ID/);
    expect(await listTrash()).toHaveLength(1);
    expect(await loadBlob('live-only/blob.png')).not.toBeNull();
  });

  it('live Asset ID衝突時は完全削除を拒否し相手snapshotを維持する', async () => {
    const deletedAsset = assetWithId('asset_cross_owner');
    const deletedProject = projectWithAssets('deleted', [deletedAsset]);
    await saveAssetWithBlobs(deletedProject, deletedAsset);
    await saveCurrentSnapshot(deletedProject, deletedAsset, 'deleted snapshot');
    await deleteProject(deletedProject.id);

    const liveAsset = { ...deletedAsset, displayName: 'live asset' };
    const liveProject = projectWithAssets('live', [liveAsset]);
    await saveAssetWithBlobs(liveProject, liveAsset, 30);
    await saveCurrentSnapshot(liveProject, liveAsset, 'live snapshot');

    await expect(purgeTrash(deletedProject.id)).rejects.toThrow(/同じAsset ID/);
    expect((await loadAsset(liveAsset.id)).asset.displayName).toBe('live asset');
    expect(await listSnapshots(liveAsset.id)).toHaveLength(1);
    expect(await listTrash()).toHaveLength(1);
  });

  it('purgeAllは1件でも衝突があれば全trashを維持する', async () => {
    const conflict = createEmptyProject('conflict');
    const other = createEmptyProject('other');
    await saveProject(conflict);
    await saveProject(other);
    await deleteProject(conflict.id);
    await deleteProject(other.id);
    await saveProject({ ...conflict, name: 'live conflict' });

    await expect(purgeAllTrash()).rejects.toThrow(/同じProject ID/);
    expect(await listTrash()).toHaveLength(2);
  });

  it('自動purge対象が衝突する場合は別recordを代替削除しない', async () => {
    const oldest = createEmptyProject('oldest collision');
    await saveProject(oldest);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 0, 1));
      await deleteProject(oldest.id);
      await saveProject({ ...oldest, name: 'live oldest' });
      for (let index = 0; index < TRASH_LIMIT; index += 1) {
        vi.setSystemTime(new Date(2026, 0, index + 2));
        const project = createEmptyProject(`trash ${index}`);
        await saveProject(project);
        await deleteProject(project.id);
      }
    } finally {
      vi.useRealTimers();
    }

    expect(await listTrash()).toHaveLength(TRASH_LIMIT + 1);
    expect((await listTrash()).some((entry) => entry.id === oldest.id)).toBe(true);
  });
});

describe('Asset削除のsnapshot所有境界', () => {
  it('deleteAssetBundleは対象Projectのsnapshotだけを削除する', async () => {
    const sharedAsset = assetWithId('asset_shared_snapshot');
    const trashProject = projectWithAssets('trash owner', [sharedAsset]);
    await saveAssetWithBlobs(trashProject, sharedAsset);
    await saveCurrentSnapshot(trashProject, sharedAsset, 'trash snapshot');
    await deleteProject(trashProject.id);

    const liveProject = projectWithAssets('live owner', [sharedAsset]);
    await saveAssetWithBlobs(liveProject, sharedAsset, 40);
    await saveCurrentSnapshot(liveProject, sharedAsset, 'live snapshot');
    await deleteAssetBundle({ project: { ...liveProject, assets: [] }, assetId: sharedAsset.id });

    const remaining = await listSnapshots(sharedAsset.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('trash snapshot');
  });

  it('低レベルdeleteAssetも保存済み所有Projectのsnapshotだけを削除する', async () => {
    const sharedAsset = assetWithId('asset_shared_low_level');
    const trashProject = projectWithAssets('trash', [sharedAsset]);
    await saveAssetWithBlobs(trashProject, sharedAsset);
    await saveCurrentSnapshot(trashProject, sharedAsset, 'trash snapshot');
    await deleteProject(trashProject.id);

    const liveProject = projectWithAssets('live', [sharedAsset]);
    await saveAssetWithBlobs(liveProject, sharedAsset, 50);
    await saveCurrentSnapshot(liveProject, sharedAsset, 'live snapshot');
    await deleteAsset(sharedAsset.id);

    const remaining = await listSnapshots(sharedAsset.id);
    expect(remaining.map((entry) => entry.label)).toEqual(['trash snapshot']);
  });
});
