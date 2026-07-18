/**
 * 2D-2-VARIANT + 2D-2-BATCH Slice B: 原子 batch revision API のstorage層契約テスト。
 * docs/future/2D_2_VARIANT_BATCH_PLAN.md §5 Slice B / §6 batch・storage の受け入れ条件を固定する。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Asset, type Project } from '../model';
import { createLinkedMirrorVariant } from '../model/familyTestFixtures';
import characterAsset from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import {
  applyAssetBatchRevision,
  loadAsset,
  loadBlob,
  loadProject,
  saveAsset,
  saveAssetBatchRevision,
  saveProjectBundle,
} from './projectStore';
import { listSnapshots } from './snapshotStore';

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

function editKeyFor(asset: Asset): string {
  const edit = asset.textures.find((texture) => texture.kind === 'edit');
  if (!edit) {
    throw new Error('fixture edit texture missing');
  }
  return `${asset.id}/${edit.path}`;
}

function sourceKeyFor(asset: Asset): string {
  const source = asset.textures.find((texture) => texture.kind === 'source');
  if (!source) {
    throw new Error('fixture source texture missing');
  }
  return `${asset.id}/${source.path}`;
}

async function seedBatchFixture(prefix: string) {
  const a = assetWithId(`asset_${prefix}_a`, 'A');
  const b = assetWithId(`asset_${prefix}_b`, 'B');
  const project = projectWithAssets(prefix, [a, b]);
  await saveProjectBundle(
    project,
    [a, b],
    [a, b].flatMap((item, index) => blobsForAsset(item, 1 + index * 10)),
  );
  return { project, a, b };
}

async function bytesOf(key: string): Promise<ArrayBuffer> {
  const blob = await loadBlob(key);
  if (!blob) {
    throw new Error(`fixture blob missing: ${key}`);
  }
  return blob.arrayBuffer();
}

describe('saveAssetBatchRevision: 成功系', () => {
  it('複数Asset・複数Blob・Project（families含む）を同時確定し全件反映する', async () => {
    const base = assetWithId('asset_b1_base', 'Base');
    const variant = assetWithId('asset_b1_variant', 'Variant');
    const standalone = assetWithId('asset_b1_standalone', 'Standalone');
    const project = projectWithAssets('batch success', [base, variant, standalone]);
    project.families = [
      {
        id: 'family_b1',
        name: 'B1 Family',
        baseAssetId: base.id,
        variants: [createLinkedMirrorVariant(variant.id)],
      },
    ];
    await saveProjectBundle(
      project,
      [base, variant, standalone],
      [base, variant, standalone].flatMap((item, index) => blobsForAsset(item, 1 + index * 10)),
    );

    const baseKey = editKeyFor(base);
    const variantKey = editKeyFor(variant);
    const baseBeforeBytes = await bytesOf(baseKey);
    const variantBeforeBytes = await bytesOf(variantKey);

    const nextBase: Asset = { ...base, displayName: 'Base after' };
    const nextVariant: Asset = { ...variant, displayName: 'Variant after' };
    const nextProject: Project = {
      ...project,
      assets: project.assets.map((entry) => {
        if (entry.id === base.id) return { ...entry, displayName: nextBase.displayName };
        if (entry.id === variant.id) return { ...entry, displayName: nextVariant.displayName };
        return entry;
      }),
      families: [
        {
          ...project.families[0],
          variants: [
            ...project.families[0].variants,
            { assetId: standalone.id, kind: 'manual' as const },
          ],
        },
      ],
    };

    await saveAssetBatchRevision({
      projectId: project.id,
      project: nextProject,
      baselineProject: project,
      targets: [
        {
          asset: nextBase,
          baselineAsset: base,
          putBlobs: [
            { key: baseKey, blob: new Blob([new Uint8Array([201])], { type: 'image/png' }) },
          ],
          baselineBlobs: [{ key: baseKey, bytes: baseBeforeBytes }],
        },
        {
          asset: nextVariant,
          baselineAsset: variant,
          putBlobs: [
            { key: variantKey, blob: new Blob([new Uint8Array([202])], { type: 'image/png' }) },
          ],
          baselineBlobs: [{ key: variantKey, bytes: variantBeforeBytes }],
        },
      ],
    });

    expect((await loadAsset(base.id)).asset.displayName).toBe('Base after');
    expect((await loadAsset(variant.id)).asset.displayName).toBe('Variant after');
    expect(new Uint8Array(await (await loadBlob(baseKey))!.arrayBuffer())).toEqual(
      new Uint8Array([201]),
    );
    expect(new Uint8Array(await (await loadBlob(variantKey))!.arrayBuffer())).toEqual(
      new Uint8Array([202]),
    );
    const loaded = (await loadProject(project.id)).project;
    expect(loaded.assets.find((entry) => entry.id === base.id)?.displayName).toBe('Base after');
    expect(loaded.assets.find((entry) => entry.id === variant.id)?.displayName).toBe(
      'Variant after',
    );
    expect(loaded.families?.[0]?.variants).toHaveLength(2);

    // 復旧点（Slice B, H1）: Blobを変更したtargetにだけ復旧点が作成される。
    expect(await listSnapshots(base.id)).toHaveLength(1);
    expect(await listSnapshots(variant.id)).toHaveLength(1);
    expect(await listSnapshots(standalone.id)).toHaveLength(0);
  });
});

describe('saveAssetBatchRevision: 拒否ケース（全target無変更）', () => {
  it('0件のtargetsを拒否する', async () => {
    const { project } = await seedBatchFixture('reject_zero');
    await expect(saveAssetBatchRevision({ projectId: project.id, targets: [] })).rejects.toThrow(
      /target 数/,
    );
  });

  it('17件以上のtargetsを拒否する', async () => {
    const { project } = await seedBatchFixture('reject_many');
    const targets = Array.from({ length: 17 }, (_, index) => {
      const asset = assetWithId(`asset_reject_many_${index}`);
      return { asset, baselineAsset: asset };
    });
    await expect(saveAssetBatchRevision({ projectId: project.id, targets })).rejects.toThrow(
      /target 数/,
    );
  });

  it('同じAsset IDの重複指定を拒否し、既存Assetを無変更にする', async () => {
    const { project, a } = await seedBatchFixture('reject_dup');
    const nextA1: Asset = { ...a, displayName: 'A1' };
    const nextA2: Asset = { ...a, displayName: 'A2' };

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          { asset: nextA1, baselineAsset: a },
          { asset: nextA2, baselineAsset: a },
        ],
      }),
    ).rejects.toThrow(/複数回指定/);
    expect((await loadAsset(a.id)).asset.displayName).toBe(a.displayName);
  });

  it('正本に存在しないAssetを含む場合、有効なtargetも含めて全件無変更にする', async () => {
    const { project, a } = await seedBatchFixture('reject_missing_asset');
    const missing = assetWithId('asset_reject_missing_ghost');
    const nextA: Asset = { ...a, displayName: 'A changed' };

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          { asset: nextA, baselineAsset: a },
          { asset: missing, baselineAsset: missing },
        ],
      }),
    ).rejects.toThrow(/保存されていません/);
    expect((await loadAsset(a.id)).asset.displayName).toBe(a.displayName);
  });

  it('準備時点bytesと一致しない/存在しないBlobを拒否する', async () => {
    const { project, a } = await seedBatchFixture('reject_missing_blob');
    const nextA: Asset = { ...a, displayName: 'A changed' };

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          {
            asset: nextA,
            baselineAsset: a,
            baselineBlobs: [
              { key: `${a.id}/does-not-exist.png`, bytes: new Uint8Array([1]).buffer },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/見つかりません/);
    expect((await loadAsset(a.id)).asset.displayName).toBe(a.displayName);
  });

  it('validation失敗（不正なAsset）を拒否する', async () => {
    const { project, a } = await seedBatchFixture('reject_invalid');
    const invalid = { ...a, name: '' };

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [{ asset: invalid, baselineAsset: a }],
      }),
    ).rejects.toThrow(/不正です/);
    expect((await loadAsset(a.id)).asset).toEqual(a);
  });

  it('source Blobへのput指定を理由付きで拒否し、source Blobを維持する', async () => {
    const { project, a } = await seedBatchFixture('reject_source');
    const sourceKey = sourceKeyFor(a);
    const beforeSourceBytes = await bytesOf(sourceKey);

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          {
            asset: a,
            baselineAsset: a,
            putBlobs: [
              { key: sourceKey, blob: new Blob([new Uint8Array([9])], { type: 'image/png' }) },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/source Blob/);
    expect(new Uint8Array(await bytesOf(sourceKey))).toEqual(new Uint8Array(beforeSourceBytes));
  });

  it('write phase途中のBlob put失敗でtransactionがabortされ全target無変更になる', async () => {
    const { project, a, b } = await seedBatchFixture('reject_put_fail');
    const aKey = editKeyFor(a);
    const bKey = editKeyFor(b);
    const aBeforeBytes = await bytesOf(aKey);
    const bBeforeBytes = await bytesOf(bKey);

    const nextA: Asset = { ...a, displayName: 'A ok' };
    const nextB: Asset = { ...b, displayName: 'B fail' };

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
        (value as { key: unknown }).key === bKey
      ) {
        throw new DOMException('fail injection', 'DataError');
      }
      return originalPut.call(this, value, key);
    });

    try {
      await expect(
        saveAssetBatchRevision({
          projectId: project.id,
          targets: [
            {
              asset: nextA,
              baselineAsset: a,
              putBlobs: [
                { key: aKey, blob: new Blob([new Uint8Array([250])], { type: 'image/png' }) },
              ],
              baselineBlobs: [{ key: aKey, bytes: aBeforeBytes }],
            },
            {
              asset: nextB,
              baselineAsset: b,
              putBlobs: [
                { key: bKey, blob: new Blob([new Uint8Array([251])], { type: 'image/png' }) },
              ],
              baselineBlobs: [{ key: bKey, bytes: bBeforeBytes }],
            },
          ],
        }),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect((await loadAsset(a.id)).asset.displayName).toBe(a.displayName);
    expect((await loadAsset(b.id)).asset.displayName).toBe(b.displayName);
    expect(new Uint8Array(await bytesOf(aKey))).toEqual(new Uint8Array(aBeforeBytes));
    expect(new Uint8Array(await bytesOf(bKey))).toEqual(new Uint8Array(bBeforeBytes));
  });

  it('準備後の並行変更を検知しbatchを中止し、並行変更を維持する', async () => {
    const { project, a, b } = await seedBatchFixture('reject_baseline_mismatch');
    const nextA: Asset = { ...a, displayName: 'A staged' };
    const nextB: Asset = { ...b, displayName: 'B staged' };

    // batch呼び出しの準備後、別経路（通常のmetadata保存）でaが並行変更される。
    const concurrentA: Asset = { ...a, displayName: 'A concurrent' };
    await saveAsset(project.id, concurrentA);

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          { asset: nextA, baselineAsset: a },
          { asset: nextB, baselineAsset: b },
        ],
      }),
    ).rejects.toThrow(/準備後に変更された/);

    expect((await loadAsset(a.id)).asset.displayName).toBe('A concurrent');
    expect((await loadAsset(b.id)).asset.displayName).toBe(b.displayName);
  });

  it('復旧点作成の失敗ではmain txを開始せず、全target無変更・snapshotも未作成にする', async () => {
    const { project, a, b } = await seedBatchFixture('reject_snapshot_fail');
    const aKey = editKeyFor(a);
    const bKey = editKeyFor(b);
    const aBeforeBytes = await bytesOf(aKey);

    const nextA: Asset = { ...a, displayName: 'A snapshot ok' };
    const nextB: Asset = { ...b, displayName: 'B snapshot fail' };

    await expect(
      saveAssetBatchRevision({
        projectId: project.id,
        targets: [
          {
            // 先にsnapshot作成が失敗するtargetを置き、後続targetの復旧点が
            // 一切作られないこと（= mainのbatch txも始まらないこと）を確認する。
            asset: nextB,
            baselineAsset: b,
            putBlobs: [
              { key: bKey, blob: new Blob([new Uint8Array([211])], { type: 'image/png' }) },
            ],
            // わざと現状と異なるbaseline bytesを渡し、saveSnapshot内のBlob一致検査を失敗させる。
            baselineBlobs: [{ key: bKey, bytes: new Uint8Array([255, 255]).buffer }],
          },
          {
            asset: nextA,
            baselineAsset: a,
            putBlobs: [
              { key: aKey, blob: new Blob([new Uint8Array([210])], { type: 'image/png' }) },
            ],
            baselineBlobs: [{ key: aKey, bytes: aBeforeBytes }],
          },
        ],
      }),
    ).rejects.toThrow(/一致しません/);

    expect((await loadAsset(a.id)).asset.displayName).toBe(a.displayName);
    expect((await loadAsset(b.id)).asset.displayName).toBe(b.displayName);
    expect(new Uint8Array(await bytesOf(aKey))).toEqual(new Uint8Array(aBeforeBytes));
    expect(await listSnapshots(a.id)).toHaveLength(0);
    expect(await listSnapshots(b.id)).toHaveLength(0);
  });
});

describe('applyAssetBatchRevision: group Undo/Redo基盤', () => {
  it('1回の呼び出しで全Asset・Blob・Projectがbeforeへ戻る', async () => {
    const base = assetWithId('asset_undo_base', 'Base');
    const variant = assetWithId('asset_undo_variant', 'Variant');
    const project = projectWithAssets('batch undo', [base, variant]);
    project.families = [
      {
        id: 'family_undo',
        name: 'Undo Family',
        baseAssetId: base.id,
        variants: [{ assetId: variant.id, kind: 'manual' }],
      },
    ];
    await saveProjectBundle(
      project,
      [base, variant],
      [base, variant].flatMap((item, index) => blobsForAsset(item, 1 + index * 10)),
    );

    const baseKey = editKeyFor(base);
    const variantKey = editKeyFor(variant);
    const baseBeforeBytes = await bytesOf(baseKey);
    const variantBeforeBytes = await bytesOf(variantKey);

    const nextBase: Asset = { ...base, displayName: 'Base after' };
    const nextVariant: Asset = { ...variant, displayName: 'Variant after' };
    const nextProject: Project = {
      ...project,
      assets: project.assets.map((entry) =>
        entry.id === base.id
          ? { ...entry, displayName: nextBase.displayName }
          : entry.id === variant.id
            ? { ...entry, displayName: nextVariant.displayName }
            : entry,
      ),
    };

    const afterBaseBytes = new Uint8Array([220]);
    const afterVariantBytes = new Uint8Array([221]);

    // forward: 通常のbatch適用
    await saveAssetBatchRevision({
      projectId: project.id,
      project: nextProject,
      baselineProject: project,
      targets: [
        {
          asset: nextBase,
          baselineAsset: base,
          putBlobs: [{ key: baseKey, blob: new Blob([afterBaseBytes], { type: 'image/png' }) }],
          baselineBlobs: [{ key: baseKey, bytes: baseBeforeBytes }],
        },
        {
          asset: nextVariant,
          baselineAsset: variant,
          putBlobs: [
            { key: variantKey, blob: new Blob([afterVariantBytes], { type: 'image/png' }) },
          ],
          baselineBlobs: [{ key: variantKey, bytes: variantBeforeBytes }],
        },
      ],
    });

    expect((await loadAsset(base.id)).asset.displayName).toBe('Base after');

    // backward: forward適用後の状態をbaselineとして、before状態へ書き戻す。
    await applyAssetBatchRevision({
      projectId: project.id,
      project,
      baselineProject: nextProject,
      targets: [
        {
          asset: base,
          baselineAsset: nextBase,
          putBlobs: [{ key: baseKey, blob: new Blob([baseBeforeBytes], { type: 'image/png' }) }],
          baselineBlobs: [{ key: baseKey, bytes: afterBaseBytes.buffer }],
        },
        {
          asset: variant,
          baselineAsset: nextVariant,
          putBlobs: [
            { key: variantKey, blob: new Blob([variantBeforeBytes], { type: 'image/png' }) },
          ],
          baselineBlobs: [{ key: variantKey, bytes: afterVariantBytes.buffer }],
        },
      ],
    });

    expect((await loadAsset(base.id)).asset).toEqual(base);
    expect((await loadAsset(variant.id)).asset).toEqual(variant);
    expect(new Uint8Array(await bytesOf(baseKey))).toEqual(new Uint8Array(baseBeforeBytes));
    expect(new Uint8Array(await bytesOf(variantKey))).toEqual(new Uint8Array(variantBeforeBytes));
    expect((await loadProject(project.id)).project).toEqual(project);
  });
});
