import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from '../history/history';
import { createEmptyProject, type Asset, type Project, type TextureRef } from '../model';
import { createLinkedMirrorVariant } from '../model/familyTestFixtures';
import characterAsset from '../samples/asset.character.json';
import { requestToPromise, resetDbForTests, runTransaction, STORE_ASSETS, STORE_BLOBS } from './db';
import {
  deleteAsset,
  deleteBlob,
  loadAsset,
  loadBlob,
  loadProject,
  saveAssetBatchRevision,
  saveBlob,
  saveProject,
  saveProjectBundle,
  type AssetBatchRevisionTarget,
  type SaveAssetBatchRevisionInput,
} from './projectStore';
import { listSnapshots, restoreSnapshot, saveSnapshot } from './snapshotStore';

const BEFORE_TIME = '2026-07-18T00:00:00.000Z';
const AFTER_TIME = '2026-07-18T01:00:00.000Z';

beforeEach(async () => {
  await resetDbForTests();
});

function assetWithId(id: string): Asset {
  const asset = structuredClone(characterAsset) as unknown as Asset;
  return {
    ...asset,
    id,
    name: id,
    displayName: id,
    updatedAt: BEFORE_TIME,
  };
}

function projectEntry(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    displayName: asset.displayName,
    assetType: asset.assetType,
  };
}

function blobForTexture(asset: Asset, texture: TextureRef, seed: number): Blob {
  const index = asset.textures.findIndex((candidate) => candidate.id === texture.id);
  if (index < 0) {
    throw new Error('fixture TextureRef missing');
  }
  return new Blob([new Uint8Array([seed + index])], { type: texture.mimeType });
}

function blobsForAsset(asset: Asset, seed: number) {
  return asset.textures.map((texture) => ({
    key: `${asset.id}/${texture.path}`,
    blob: blobForTexture(asset, texture, seed),
  }));
}

function editTexture(asset: Asset): TextureRef {
  const edit = asset.textures.find((texture) => texture.kind === 'edit');
  if (!edit) {
    throw new Error('fixture edit TextureRef missing');
  }
  return edit;
}

function sourceTexture(asset: Asset): TextureRef {
  const source = asset.textures.find((texture) => texture.kind === 'source');
  if (!source) {
    throw new Error('fixture source TextureRef missing');
  }
  return source;
}

function keyFor(asset: Asset, texture: TextureRef): string {
  return `${asset.id}/${texture.path}`;
}

function changedAsset(asset: Asset, displayName: string): Asset {
  return {
    ...structuredClone(asset),
    displayName,
    updatedAt: AFTER_TIME,
  };
}

interface BatchFixture {
  beforeProject: Project;
  afterProject: Project;
  base: Asset;
  variant: Asset;
  standalone: Asset;
  afterBase: Asset;
  afterVariant: Asset;
  baseSeed: number;
  variantSeed: number;
  standaloneSeed: number;
  input: SaveAssetBatchRevisionInput;
}

async function seedBatchFixture(): Promise<BatchFixture> {
  const base = assetWithId('asset_batch_base');
  const variant = assetWithId('asset_batch_variant');
  const standalone = assetWithId('asset_batch_standalone');
  const baseSeed = 10;
  const variantSeed = 20;
  const standaloneSeed = 30;
  const linked = createLinkedMirrorVariant(variant.id);
  // Asset IDと同じ文字列の内部IDもFamily remap対象ではない境界を保存中も維持する。
  linked.recipe.idMap.layers = { [base.id]: variant.id };
  linked.recipe.writeSet.layers = [variant.id];

  const beforeProject: Project = {
    ...createEmptyProject('Slice B batch'),
    assets: [base, variant, standalone].map(projectEntry),
    families: [
      {
        id: 'family_batch',
        name: 'Batch Family',
        baseAssetId: base.id,
        variants: [linked],
      },
    ],
    updatedAt: BEFORE_TIME,
  };
  (beforeProject as unknown as Record<string, unknown>).futureProjectField = {
    preserved: true,
  };
  await saveProjectBundle(
    beforeProject,
    [base, variant, standalone],
    [
      ...blobsForAsset(base, baseSeed),
      ...blobsForAsset(variant, variantSeed),
      ...blobsForAsset(standalone, standaloneSeed),
    ],
  );

  const afterBase = changedAsset(base, 'Base after');
  const afterVariant = changedAsset(variant, 'Variant after');
  const afterProject: Project = {
    ...structuredClone(beforeProject),
    assets: [afterBase, afterVariant, standalone].map(projectEntry),
    families: beforeProject.families?.map((family) => ({
      ...family,
      name: 'Batch Family after',
    })),
    updatedAt: AFTER_TIME,
  };
  const baseEdit = editTexture(base);
  const variantEdit = editTexture(variant);
  const input: SaveAssetBatchRevisionInput = {
    beforeProject,
    afterProject,
    targets: [
      {
        beforeAsset: base,
        afterAsset: afterBase,
        blobs: [
          {
            key: keyFor(base, baseEdit),
            before: blobForTexture(base, baseEdit, baseSeed),
            after: new Blob([new Uint8Array([91])], { type: baseEdit.mimeType }),
          },
        ],
      },
      {
        beforeAsset: variant,
        afterAsset: afterVariant,
        blobs: [
          {
            key: keyFor(variant, variantEdit),
            before: blobForTexture(variant, variantEdit, variantSeed),
            after: new Blob([new Uint8Array([92])], { type: variantEdit.mimeType }),
          },
        ],
      },
    ],
    snapshotLabel: 'Slice B batch before',
  };
  return {
    beforeProject,
    afterProject,
    base,
    variant,
    standalone,
    afterBase,
    afterVariant,
    baseSeed,
    variantSeed,
    standaloneSeed,
    input,
  };
}

async function bytesAt(key: string): Promise<number[]> {
  const blob = await loadBlob(key);
  if (!blob) {
    return [];
  }
  return [...new Uint8Array(await blob.arrayBuffer())];
}

function reverseInput(
  input: SaveAssetBatchRevisionInput,
  label: string,
): SaveAssetBatchRevisionInput {
  return {
    beforeProject: input.afterProject,
    afterProject: input.beforeProject,
    targets: input.targets.map((target) => ({
      beforeAsset: target.afterAsset,
      afterAsset: target.beforeAsset,
      blobs: target.blobs?.map((blob) => ({
        key: blob.key,
        before: blob.after,
        after: blob.before,
      })),
    })),
    snapshotLabel: label,
  };
}

async function expectBeforeState(fixture: BatchFixture): Promise<void> {
  expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.beforeProject);
  expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.base);
  expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.variant);
  const baseEdit = editTexture(fixture.base);
  const variantEdit = editTexture(fixture.variant);
  expect(await bytesAt(keyFor(fixture.base, baseEdit))).toEqual([
    fixture.baseSeed + fixture.base.textures.indexOf(baseEdit),
  ]);
  expect(await bytesAt(keyFor(fixture.variant, variantEdit))).toEqual([
    fixture.variantSeed + fixture.variant.textures.indexOf(variantEdit),
  ]);
}

describe('Slice B saveAssetBatchRevision', () => {
  it('Project要約・Family・2 Asset・2 edit Blob・復旧点を1回で確定する', async () => {
    const fixture = await seedBatchFixture();
    const standaloneSource = sourceTexture(fixture.standalone);
    const standaloneSourceKey = keyFor(fixture.standalone, standaloneSource);
    const standaloneBefore = await bytesAt(standaloneSourceKey);
    const baseSource = sourceTexture(fixture.base);
    const baseSourceBefore = await bytesAt(keyFor(fixture.base, baseSource));

    await saveAssetBatchRevision(fixture.input);

    const savedProject = (await loadProject(fixture.beforeProject.id)).project;
    expect(savedProject).toEqual(fixture.afterProject);
    expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.afterBase);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.afterVariant);
    expect((await loadAsset(fixture.standalone.id)).asset).toEqual(fixture.standalone);
    expect(await bytesAt(keyFor(fixture.base, editTexture(fixture.base)))).toEqual([91]);
    expect(await bytesAt(keyFor(fixture.variant, editTexture(fixture.variant)))).toEqual([92]);
    expect(await bytesAt(keyFor(fixture.base, baseSource))).toEqual(baseSourceBefore);
    expect(await bytesAt(standaloneSourceKey)).toEqual(standaloneBefore);
    expect(savedProject.families?.[0]).toMatchObject({
      id: 'family_batch',
      name: 'Batch Family after',
      baseAssetId: fixture.base.id,
      variants: [{ assetId: fixture.variant.id }],
    });
    const savedLinked = savedProject.families?.[0].variants[0];
    expect(savedLinked?.kind).toBe('linked-mirror');
    if (savedLinked?.kind === 'linked-mirror') {
      expect(savedLinked.recipe.idMap.layers).toEqual({
        [fixture.base.id]: fixture.variant.id,
      });
      expect(savedLinked.recipe.writeSet.layers).toEqual([fixture.variant.id]);
      expect(savedLinked.fingerprint).toEqual(
        fixture.beforeProject.families?.[0].variants[0].fingerprint,
      );
    }
    expect((savedProject as unknown as Record<string, unknown>).futureProjectField).toEqual({
      preserved: true,
    });

    for (const asset of [fixture.base, fixture.variant]) {
      const snapshots = await listSnapshots(asset.id);
      expect(snapshots).toHaveLength(1);
      const restored = await restoreSnapshot(snapshots[0].id);
      expect(restored.asset).toEqual(asset);
      const restoredBytes = [...new Uint8Array(await restored.blob.arrayBuffer())];
      const seed = asset.id === fixture.base.id ? fixture.baseSeed : fixture.variantSeed;
      expect(restoredBytes).toEqual([seed + asset.textures.indexOf(editTexture(asset))]);
      expect(await bytesAt(restored.blobKey)).not.toEqual([...restoredBytes]);
    }
  });

  it('History Undoでは内容一致を保ったまま後続Project updatedAtだけを維持する', async () => {
    const fixture = await seedBatchFixture();
    await saveAssetBatchRevision(fixture.input);
    const laterTime = '2026-07-18T02:00:00.000Z';
    await saveProject({ ...structuredClone(fixture.afterProject), updatedAt: laterTime });
    const reverse = {
      ...reverseInput(fixture.input, 'history undo before'),
      allowProjectUpdatedAtDrift: true,
    };

    const committed = await saveAssetBatchRevision(reverse);
    expect(committed).toEqual({ ...fixture.beforeProject, updatedAt: laterTime });
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(committed);
    expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.base);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.variant);
  });

  it('History用updatedAt drift許可でもFamily等のProject変更はCAS拒否する', async () => {
    const fixture = await seedBatchFixture();
    await saveAssetBatchRevision(fixture.input);
    await saveProject({
      ...structuredClone(fixture.afterProject),
      families: fixture.afterProject.families?.map((family) => ({
        ...family,
        name: 'concurrent family change',
      })),
      updatedAt: '2026-07-18T02:00:00.000Z',
    });

    await expect(
      saveAssetBatchRevision({
        ...reverseInput(fixture.input, 'history undo before'),
        allowProjectUpdatedAtDrift: true,
      }),
    ).rejects.toThrow('Projectが変更');
    expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.afterBase);
  });

  it('preview時に読んだbase Blobが変わったらread expectation CASで全書込を拒否する', async () => {
    const fixture = await seedBatchFixture();
    const variantEdit = editTexture(fixture.variant);
    const baseEdit = editTexture(fixture.base);
    const afterProject: Project = {
      ...structuredClone(fixture.beforeProject),
      assets: fixture.beforeProject.assets.map((entry) =>
        entry.id === fixture.variant.id ? projectEntry(fixture.afterVariant) : entry,
      ),
      updatedAt: AFTER_TIME,
    };
    const expectedBaseBlob = blobForTexture(fixture.base, baseEdit, fixture.baseSeed);
    const input: SaveAssetBatchRevisionInput = {
      beforeProject: fixture.beforeProject,
      afterProject,
      targets: [
        {
          beforeAsset: fixture.variant,
          afterAsset: fixture.afterVariant,
          blobs: [
            {
              key: keyFor(fixture.variant, variantEdit),
              before: blobForTexture(fixture.variant, variantEdit, fixture.variantSeed),
              after: new Blob([new Uint8Array([99])], { type: variantEdit.mimeType }),
            },
          ],
        },
      ],
      readExpectations: [
        {
          asset: fixture.base,
          blobs: [{ key: keyFor(fixture.base, baseEdit), expected: expectedBaseBlob }],
        },
      ],
      snapshotLabel: 'linked refresh before',
    };

    await saveBlob(
      fixture.beforeProject.id,
      keyFor(fixture.base, baseEdit),
      new Blob([new Uint8Array([77])], { type: baseEdit.mimeType }),
    );
    await expect(saveAssetBatchRevision(input)).rejects.toThrow('refresh入力Blobが変更');
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.beforeProject);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.variant);
    expect(await bytesAt(keyFor(fixture.variant, variantEdit))).toEqual([
      fixture.variantSeed + fixture.variant.textures.indexOf(variantEdit),
    ]);
    expect(await listSnapshots(fixture.variant.id)).toEqual([]);
  });

  it('書込target自身のsource Blobもread expectation CASで保護する', async () => {
    const fixture = await seedBatchFixture();
    const variantEdit = editTexture(fixture.variant);
    const variantSource = sourceTexture(fixture.variant);
    const afterProject: Project = {
      ...structuredClone(fixture.beforeProject),
      assets: fixture.beforeProject.assets.map((entry) =>
        entry.id === fixture.variant.id ? projectEntry(fixture.afterVariant) : entry,
      ),
      updatedAt: AFTER_TIME,
    };
    const input: SaveAssetBatchRevisionInput = {
      beforeProject: fixture.beforeProject,
      afterProject,
      targets: [
        {
          beforeAsset: fixture.variant,
          afterAsset: fixture.afterVariant,
          blobs: [
            {
              key: keyFor(fixture.variant, variantEdit),
              before: blobForTexture(fixture.variant, variantEdit, fixture.variantSeed),
              after: new Blob([new Uint8Array([99])], { type: variantEdit.mimeType }),
            },
          ],
        },
      ],
      readExpectations: [
        {
          asset: fixture.variant,
          blobs: [
            {
              key: keyFor(fixture.variant, variantSource),
              expected: blobForTexture(fixture.variant, variantSource, fixture.variantSeed),
            },
          ],
        },
      ],
      snapshotLabel: 'linked refresh before',
    };

    await saveBlob(
      fixture.beforeProject.id,
      keyFor(fixture.variant, variantSource),
      new Blob([new Uint8Array([77])], { type: variantSource.mimeType }),
    );
    await expect(saveAssetBatchRevision(input)).rejects.toThrow('refresh入力Blobが変更');
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.beforeProject);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.variant);
    expect(await bytesAt(keyFor(fixture.variant, variantEdit))).toEqual([
      fixture.variantSeed + fixture.variant.textures.indexOf(variantEdit),
    ]);
    expect(await listSnapshots(fixture.variant.id)).toEqual([]);
  });

  it('read expectationのAsset重複・非Texture Blobを事前拒否する', async () => {
    const fixture = await seedBatchFixture();
    await expect(
      saveAssetBatchRevision({
        ...fixture.input,
        readExpectations: [{ asset: fixture.standalone }, { asset: fixture.standalone }],
      }),
    ).rejects.toThrow('同じAsset IDが重複');

    const variantOnlyInput: SaveAssetBatchRevisionInput = {
      ...fixture.input,
      targets: [fixture.input.targets[1]],
      afterProject: {
        ...structuredClone(fixture.beforeProject),
        assets: fixture.beforeProject.assets.map((entry) =>
          entry.id === fixture.variant.id ? projectEntry(fixture.afterVariant) : entry,
        ),
        updatedAt: AFTER_TIME,
      },
      readExpectations: [
        {
          asset: fixture.base,
          blobs: [
            {
              key: `${fixture.base.id}/textures/not-referenced.png`,
              expected: new Blob([new Uint8Array([1])], { type: 'image/png' }),
            },
          ],
        },
      ],
    };
    await expect(saveAssetBatchRevision(variantOnlyInput)).rejects.toThrow(
      '対応するTextureRefがありません',
    );
  });

  it('metadata-only targetを同じ原子APIで保存し、Blobと復旧点を変更しない', async () => {
    const fixture = await seedBatchFixture();
    const beforeBlobBytes = await Promise.all(
      fixture.base.textures.map((texture) => bytesAt(keyFor(fixture.base, texture))),
    );
    const afterProject: Project = {
      ...structuredClone(fixture.beforeProject),
      assets: fixture.beforeProject.assets.map((entry) =>
        entry.id === fixture.base.id ? projectEntry(fixture.afterBase) : entry,
      ),
      families: fixture.beforeProject.families?.map((family) => ({
        ...family,
        name: 'Metadata-only Family after',
      })),
      updatedAt: AFTER_TIME,
    };

    await saveAssetBatchRevision({
      beforeProject: fixture.beforeProject,
      afterProject,
      targets: [
        {
          beforeAsset: fixture.base,
          afterAsset: fixture.afterBase,
          blobs: [],
        },
      ],
      snapshotLabel: '',
    });

    expect((await loadProject(afterProject.id)).project).toEqual(afterProject);
    expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.afterBase);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.variant);
    expect(
      await Promise.all(
        fixture.base.textures.map((texture) => bytesAt(keyFor(fixture.base, texture))),
      ),
    ).toEqual(beforeBlobBytes);
    expect(await listSnapshots(fixture.base.id)).toEqual([]);
  });

  it('Blob revisionのないTextureRef変更を拒否してAssetとBlobの整合を維持する', async () => {
    const fixture = await seedBatchFixture();
    const edit = editTexture(fixture.base);
    const afterAsset: Asset = {
      ...changedAsset(fixture.base, 'Invalid texture metadata'),
      textures: fixture.base.textures.map((texture) =>
        texture.id === edit.id ? { ...texture, mimeType: 'image/jpeg' } : texture,
      ),
    };
    const afterProject: Project = {
      ...structuredClone(fixture.beforeProject),
      assets: fixture.beforeProject.assets.map((entry) =>
        entry.id === afterAsset.id ? projectEntry(afterAsset) : entry,
      ),
      updatedAt: AFTER_TIME,
    };

    await expect(
      saveAssetBatchRevision({
        beforeProject: fixture.beforeProject,
        afterProject,
        targets: [{ beforeAsset: fixture.base, afterAsset, blobs: [] }],
        snapshotLabel: '',
      }),
    ).rejects.toThrow(/Blobを変更しないTextureRef/);
    await expectBeforeState(fixture);
    expect(await listSnapshots(fixture.base.id)).toEqual([]);
  });

  it('Blob準備中に呼び出し元がrevision objectを書き換えても同期copyを保存する', async () => {
    const fixture = await seedBatchFixture();
    const revision = fixture.input.targets[0].blobs![0];
    const originalBefore = revision.before;
    const originalArrayBuffer = originalBefore.arrayBuffer.bind(originalBefore);
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(originalBefore, 'arrayBuffer').mockImplementation(async () => {
      markStarted();
      await gate;
      return originalArrayBuffer();
    });

    const saving = saveAssetBatchRevision(fixture.input);
    await started;
    revision.key = keyFor(fixture.variant, editTexture(fixture.variant));
    revision.before = new Blob([new Uint8Array([201])], {
      type: editTexture(fixture.variant).mimeType,
    });
    revision.after = new Blob([new Uint8Array([202])], {
      type: editTexture(fixture.variant).mimeType,
    });
    release();

    try {
      await expect(saving).resolves.toEqual(fixture.afterProject);
    } finally {
      spy.mockRestore();
    }
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.afterProject);
    expect(await bytesAt(keyFor(fixture.base, editTexture(fixture.base)))).toEqual([91]);
    expect(await bytesAt(keyFor(fixture.variant, editTexture(fixture.variant)))).toEqual([92]);
  });

  it('同じAPIを1つのHistory entryのgroup Undo / Redoに使う', async () => {
    const fixture = await seedBatchFixture();
    await saveAssetBatchRevision(fixture.input);
    const history = new History();
    const undoInput = reverseInput(fixture.input, 'Undo前');

    expect(
      history.push({
        label: 'Batch revision',
        undo: async () => {
          await saveAssetBatchRevision(undoInput);
        },
        redo: async () => {
          await saveAssetBatchRevision(fixture.input);
        },
      }),
    ).toBe(true);
    await history.waitForPending();

    await expect(history.undo()).resolves.toBe(true);
    await expectBeforeState(fixture);
    await expect(history.redo()).resolves.toBe(true);
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.afterProject);
    expect(await bytesAt(keyFor(fixture.base, editTexture(fixture.base)))).toEqual([91]);
    expect(await bytesAt(keyFor(fixture.variant, editTexture(fixture.variant)))).toEqual([92]);
  });

  it('0件・17件・重複Asset・重複Blob keyを理由付きで拒否する', async () => {
    const fixture = await seedBatchFixture();
    await expect(saveAssetBatchRevision({ ...fixture.input, targets: [] })).rejects.toThrow(
      /1〜16件/,
    );
    await expect(
      saveAssetBatchRevision({
        ...fixture.input,
        targets: Array.from({ length: 17 }, () => fixture.input.targets[0]),
      }),
    ).rejects.toThrow(/1〜16件/);
    await expect(
      saveAssetBatchRevision({
        ...fixture.input,
        targets: [fixture.input.targets[0], fixture.input.targets[0]],
      }),
    ).rejects.toThrow(/Asset ID.*重複/);

    const duplicateBlobTarget: AssetBatchRevisionTarget = {
      ...fixture.input.targets[0],
      blobs: [fixture.input.targets[0].blobs![0], fixture.input.targets[0].blobs![0]],
    };
    await expect(
      saveAssetBatchRevision({ ...fixture.input, targets: [duplicateBlobTarget] }),
    ).rejects.toThrow(/1件以下/);
    await expectBeforeState(fixture);
  });

  it('欠落Asset・欠落Blobを拒否して他targetを変更しない', async () => {
    const missingAssetFixture = await seedBatchFixture();
    await deleteAsset(missingAssetFixture.variant.id);
    await expect(saveAssetBatchRevision(missingAssetFixture.input)).rejects.toThrow(
      /Assetが保存されていません/,
    );
    expect((await loadAsset(missingAssetFixture.base.id)).asset).toEqual(missingAssetFixture.base);

    await resetDbForTests();
    const missingBlobFixture = await seedBatchFixture();
    const missingKey = keyFor(missingBlobFixture.variant, editTexture(missingBlobFixture.variant));
    await deleteBlob(missingKey);
    await expect(saveAssetBatchRevision(missingBlobFixture.input)).rejects.toThrow(
      /Blobが見つかりません/,
    );
    expect((await loadAsset(missingBlobFixture.base.id)).asset).toEqual(missingBlobFixture.base);
    expect(await listSnapshots(missingBlobFixture.base.id)).toEqual([]);
  });

  it('別Project所有のAsset・Blobを拒否して正本を変更しない', async () => {
    const assetFixture = await seedBatchFixture();
    await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
      requestToPromise(
        tx.objectStore(STORE_ASSETS).put({
          id: assetFixture.variant.id,
          projectId: 'project_other',
          data: assetFixture.variant,
        }),
      ),
    );
    await expect(saveAssetBatchRevision(assetFixture.input)).rejects.toThrow(
      /指定Projectに属していません/,
    );
    expect((await loadAsset(assetFixture.base.id)).asset).toEqual(assetFixture.base);
    expect((await loadProject(assetFixture.beforeProject.id)).project).toEqual(
      assetFixture.beforeProject,
    );

    await resetDbForTests();
    const blobFixture = await seedBatchFixture();
    const blobKey = keyFor(blobFixture.variant, editTexture(blobFixture.variant));
    await runTransaction([STORE_BLOBS], 'readwrite', async (tx) => {
      const store = tx.objectStore(STORE_BLOBS);
      const record = await requestToPromise(
        store.get(blobKey) as IDBRequest<
          | {
              key: string;
              projectId: string;
              mimeType: string;
              bytes: ArrayBuffer;
              updatedAt: string;
            }
          | undefined
        >,
      );
      if (!record) {
        throw new Error('fixture Blob missing');
      }
      await requestToPromise(store.put({ ...record, projectId: 'project_other' }));
    });
    await expect(saveAssetBatchRevision(blobFixture.input)).rejects.toThrow(
      /参照するBlobが見つかりません/,
    );
    expect((await loadAsset(blobFixture.base.id)).asset).toEqual(blobFixture.base);
    expect((await loadProject(blobFixture.beforeProject.id)).project).toEqual(
      blobFixture.beforeProject,
    );
    expect(await listSnapshots(blobFixture.base.id)).toEqual([]);
  });

  it('stale Project・Asset・BlobをCASで拒否する', async () => {
    const projectFixture = await seedBatchFixture();
    const latestProject = { ...projectFixture.beforeProject, name: 'changed after preview' };
    await saveProject(latestProject);
    await expect(saveAssetBatchRevision(projectFixture.input)).rejects.toThrow(/Projectが変更/);
    expect((await loadProject(latestProject.id)).project.name).toBe('changed after preview');

    await resetDbForTests();
    const assetFixture = await seedBatchFixture();
    const latestAsset = { ...assetFixture.variant, displayName: 'changed after preview' };
    await runTransaction([STORE_ASSETS], 'readwrite', (tx) =>
      requestToPromise(
        tx.objectStore(STORE_ASSETS).put({
          id: latestAsset.id,
          projectId: assetFixture.beforeProject.id,
          data: latestAsset,
        }),
      ),
    );
    await expect(saveAssetBatchRevision(assetFixture.input)).rejects.toThrow(/Assetが変更/);
    expect((await loadAsset(latestAsset.id)).asset.displayName).toBe('changed after preview');

    await resetDbForTests();
    const blobFixture = await seedBatchFixture();
    const blobKey = keyFor(blobFixture.variant, editTexture(blobFixture.variant));
    await saveBlob(
      blobFixture.beforeProject.id,
      blobKey,
      new Blob([new Uint8Array([77])], { type: editTexture(blobFixture.variant).mimeType }),
    );
    await expect(saveAssetBatchRevision(blobFixture.input)).rejects.toThrow(/edit Blobが変更/);
    expect(await bytesAt(blobKey)).toEqual([77]);
    expect((await loadAsset(blobFixture.base.id)).asset).toEqual(blobFixture.base);

    await resetDbForTests();
    const mimeFixture = await seedBatchFixture();
    const mimeKey = keyFor(mimeFixture.variant, editTexture(mimeFixture.variant));
    const unchangedBytes = await bytesAt(mimeKey);
    await saveBlob(
      mimeFixture.beforeProject.id,
      mimeKey,
      new Blob([new Uint8Array(unchangedBytes)], { type: 'image/jpeg' }),
    );
    await expect(saveAssetBatchRevision(mimeFixture.input)).rejects.toThrow(/edit Blobが変更/);
    expect((await loadBlob(mimeKey))?.type).toBe('image/jpeg');
    expect(await bytesAt(mimeKey)).toEqual(unchangedBytes);
    expect((await loadAsset(mimeFixture.base.id)).asset).toEqual(mimeFixture.base);
  });

  it('不正な2件目Assetとsource変更をcommit前に拒否する', async () => {
    const fixture = await seedBatchFixture();
    const invalidTarget: AssetBatchRevisionTarget = {
      ...fixture.input.targets[1],
      afterAsset: { ...fixture.afterVariant, name: '' },
    };
    const invalidProject = {
      ...fixture.afterProject,
      assets: fixture.afterProject.assets.map((entry) =>
        entry.id === fixture.variant.id ? { ...entry, name: '' } : entry,
      ),
    };
    await expect(
      saveAssetBatchRevision({
        ...fixture.input,
        afterProject: invalidProject,
        targets: [fixture.input.targets[0], invalidTarget],
      }),
    ).rejects.toThrow(/不正/);

    const source = sourceTexture(fixture.base);
    const sourceChanged = {
      ...fixture.afterBase,
      textures: fixture.afterBase.textures.map((texture) =>
        texture.id === source.id
          ? { ...texture, size: { width: texture.size.width + 1, height: texture.size.height } }
          : texture,
      ),
    };
    await expect(
      saveAssetBatchRevision({
        ...fixture.input,
        afterProject: {
          ...fixture.afterProject,
          assets: fixture.afterProject.assets.map((entry) =>
            entry.id === sourceChanged.id ? projectEntry(sourceChanged) : entry,
          ),
        },
        targets: [
          { ...fixture.input.targets[0], afterAsset: sourceChanged },
          fixture.input.targets[1],
        ],
      }),
    ).rejects.toThrow(/source/);
    await expectBeforeState(fixture);
  });

  it('不正なFamily参照を全targetのcommit前に拒否する', async () => {
    const fixture = await seedBatchFixture();
    const invalidProject = structuredClone(fixture.afterProject);
    invalidProject.families![0].baseAssetId = 'asset_missing';

    await expect(
      saveAssetBatchRevision({ ...fixture.input, afterProject: invalidProject }),
    ).rejects.toThrow(/baseAssetId/);
    await expectBeforeState(fixture);
    expect(await listSnapshots(fixture.base.id)).toEqual([]);
    expect(await listSnapshots(fixture.variant.id)).toEqual([]);
  });

  it('snapshot・2件目Asset・2件目Blobの途中失敗で全storeをrollbackする', async () => {
    for (const failure of ['snapshot', 'asset', 'blob'] as const) {
      await resetDbForTests();
      const fixture = await seedBatchFixture();
      const existingEdit = editTexture(fixture.standalone);
      await saveSnapshot({
        projectId: fixture.beforeProject.id,
        assetId: fixture.standalone.id,
        label: 'existing',
        asset: fixture.standalone,
        blobKey: keyFor(fixture.standalone, existingEdit),
        blob: blobForTexture(fixture.standalone, existingEdit, fixture.standaloneSeed),
      });
      const originalPut = IDBObjectStore.prototype.put;
      const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        const row = value as { assetId?: string; id?: string; key?: string };
        if (
          (failure === 'snapshot' &&
            this.name === 'snapshots' &&
            row.assetId === fixture.variant.id) ||
          (failure === 'asset' && this.name === 'assets' && row.id === fixture.variant.id) ||
          (failure === 'blob' &&
            this.name === 'blobs' &&
            row.key === keyFor(fixture.variant, editTexture(fixture.variant)))
        ) {
          throw new DOMException(`${failure} failure`, 'DataError');
        }
        return originalPut.call(this, value, key);
      });
      try {
        await expect(saveAssetBatchRevision(fixture.input)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
      await expectBeforeState(fixture);
      expect(await listSnapshots(fixture.base.id)).toEqual([]);
      expect(await listSnapshots(fixture.variant.id)).toEqual([]);
      expect((await listSnapshots(fixture.standalone.id)).map((item) => item.label)).toEqual([
        'existing',
      ]);
    }
  });

  it('QuotaExceededErrorで全件をrollbackし容量不足として返す', async () => {
    const fixture = await seedBatchFixture();
    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const row = value as { key?: string };
      if (
        this.name === 'blobs' &&
        row.key === keyFor(fixture.variant, editTexture(fixture.variant))
      ) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      return originalPut.call(this, value, key);
    });
    try {
      await expect(saveAssetBatchRevision(fixture.input)).rejects.toMatchObject({
        code: 'quota-exceeded',
      });
    } finally {
      spy.mockRestore();
    }
    await expectBeforeState(fixture);
    expect(await listSnapshots(fixture.base.id)).toEqual([]);
    expect(await listSnapshots(fixture.variant.id)).toEqual([]);
  });

  it('group Undo失敗時はHistory stackと確定済みafter状態を維持する', async () => {
    const fixture = await seedBatchFixture();
    await saveAssetBatchRevision(fixture.input);
    const history = new History();
    const undoInput = reverseInput(fixture.input, 'Undo failure');
    history.push({
      label: 'Batch revision',
      undo: async () => {
        await saveAssetBatchRevision(undoInput);
      },
      redo: async () => {
        await saveAssetBatchRevision(fixture.input);
      },
    });
    await history.waitForPending();

    const originalPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const row = value as { id?: string };
      if (this.name === 'assets' && row.id === fixture.variant.id) {
        throw new DOMException('undo failure', 'DataError');
      }
      return originalPut.call(this, value, key);
    });
    try {
      await expect(history.undo()).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect(history.getState()).toMatchObject({ canUndo: true, canRedo: false });
    expect((await loadProject(fixture.beforeProject.id)).project).toEqual(fixture.afterProject);
    expect((await loadAsset(fixture.base.id)).asset).toEqual(fixture.afterBase);
    expect((await loadAsset(fixture.variant.id)).asset).toEqual(fixture.afterVariant);
    expect(await bytesAt(keyFor(fixture.base, editTexture(fixture.base)))).toEqual([91]);
    expect(await bytesAt(keyFor(fixture.variant, editTexture(fixture.variant)))).toEqual([92]);
  });
});
