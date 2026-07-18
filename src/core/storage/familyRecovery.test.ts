import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset, type Project } from '../model';
import characterAsset from '../samples/asset.character.json';
import { requestToPromise, resetDbForTests, runTransaction, STORE_PROJECTS } from './db';
import {
  deleteProject,
  listProjectAssets,
  listProjects,
  loadBlob,
  loadProject,
  recoverProjectWithoutInvalidFamilies,
  saveProjectBundle,
} from './projectStore';
import { restoreProject } from './projectRecovery';

beforeEach(async () => {
  await resetDbForTests();
});

function fixtureAsset(): Asset {
  const asset = {
    ...(structuredClone(characterAsset) as unknown as Asset),
    id: 'asset_family_recovery',
    name: 'recovery_asset',
    displayName: '復旧アセット',
  };
  (asset as unknown as Record<string, unknown>).futureInternalReferences = {
    layerId: asset.layers[0].id,
    frameId: asset.frames?.[0].id,
  };
  return asset;
}

function projectEntry(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    displayName: asset.displayName,
    assetType: asset.assetType,
  };
}

async function seedInvalidFamilyProject(): Promise<{ project: Project; asset: Asset }> {
  const asset = fixtureAsset();
  const project: Project = {
    ...createEmptyProject('不正Family復旧'),
    id: 'project_family_recovery',
    assets: [projectEntry(asset)],
  };
  (project.assets[0] as unknown as Record<string, unknown>).futureEntryField = {
    preserved: true,
  };
  await saveProjectBundle(
    project,
    [asset],
    asset.textures.map((texture, index) => ({
      key: `${asset.id}/${texture.path}`,
      blob: new Blob([new Uint8Array([index + 1])], { type: texture.mimeType }),
    })),
  );
  const invalid: Project = {
    ...structuredClone(project),
    families: [
      {
        id: 'family_invalid',
        name: '壊れたFamily',
        baseAssetId: 'asset_missing',
        variants: [],
      },
    ],
  };
  await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
    requestToPromise(tx.objectStore(STORE_PROJECTS).put(invalid)),
  );
  return { project: invalid, asset };
}

describe('不正familiesの明示的な隔離copy復旧', () => {
  it('strict loadは拒否し、元を変えずFamilyなしstandalone copyをAsset/Blobごと作る', async () => {
    const { project, asset } = await seedInvalidFamilyProject();
    await expect(loadProject(project.id)).rejects.toThrow('baseAssetId');
    const summaries = await listProjects();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].familyRecoveryError).toContain('Family情報が不正');

    const recovered = await recoverProjectWithoutInvalidFamilies(project.id);
    expect(recovered.warnings.join('\n')).toContain('元のProjectは変更していません');
    const recoveredProject = (await loadProject(recovered.projectId)).project;
    expect(recoveredProject.id).not.toBe(project.id);
    expect(recoveredProject.families).toBeUndefined();
    expect(recoveredProject.assets).toHaveLength(1);
    expect(
      (recoveredProject.assets[0] as unknown as Record<string, unknown>).futureEntryField,
    ).toEqual({ preserved: true });
    const [copiedAsset] = await listProjectAssets(recoveredProject.id);
    expect(copiedAsset.id).not.toBe(asset.id);
    expect(copiedAsset.name).toBe(asset.name);
    expect(copiedAsset.layers.map(({ id }) => id)).toEqual(asset.layers.map(({ id }) => id));
    expect((copiedAsset as unknown as Record<string, unknown>).futureInternalReferences).toEqual(
      (asset as unknown as Record<string, unknown>).futureInternalReferences,
    );
    for (const texture of copiedAsset.textures) {
      expect(await loadBlob(`${copiedAsset.id}/${texture.path}`)).not.toBeNull();
    }

    await expect(loadProject(project.id)).rejects.toThrow('baseAssetId');
    const rawOriginal = await runTransaction([STORE_PROJECTS], 'readonly', (tx) =>
      requestToPromise(tx.objectStore(STORE_PROJECTS).get(project.id) as IDBRequest<Project>),
    );
    expect(rawOriginal.families).toEqual(project.families);
  });

  it('隔離copyでもProject.assetsのportableな並び順を保持する', async () => {
    const assetZ = { ...fixtureAsset(), id: 'asset_z_order', name: 'z-order' };
    const assetA = {
      ...fixtureAsset(),
      id: 'asset_a_order',
      name: 'a-order',
      displayName: 'A order',
    };
    const project: Project = {
      ...createEmptyProject('Family復旧のAsset順'),
      id: 'project_family_order',
      assets: [projectEntry(assetZ), projectEntry(assetA)],
    };
    await saveProjectBundle(
      project,
      [assetZ, assetA],
      [assetZ, assetA].flatMap((asset) =>
        asset.textures.map((texture, index) => ({
          key: `${asset.id}/${texture.path}`,
          blob: new Blob([new Uint8Array([index + 1])], { type: texture.mimeType }),
        })),
      ),
    );
    const invalid = {
      ...structuredClone(project),
      families: [
        {
          id: 'family_invalid_order',
          name: 'broken',
          baseAssetId: 'asset_missing',
          variants: [],
        },
      ],
    } satisfies Project;
    await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
      requestToPromise(tx.objectStore(STORE_PROJECTS).put(invalid)),
    );

    const recovered = await recoverProjectWithoutInvalidFamilies(project.id);
    expect((await loadProject(recovered.projectId)).project.assets.map(({ name }) => name)).toEqual(
      ['z-order', 'a-order'],
    );
  });

  it.each([
    ['null family entry', [null]],
    [
      'non-array variants',
      [
        {
          id: 'family_malformed',
          name: '壊れたFamily',
          baseAssetId: 'asset_family_recovery',
          variants: null,
        },
      ],
    ],
  ])('schema-invalid families（%s）でも一覧を失わず隔離copyできる', async (_label, families) => {
    const { project } = await seedInvalidFamilyProject();
    const malformed = {
      ...structuredClone(project),
      families,
    } as unknown as Project;
    await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
      requestToPromise(tx.objectStore(STORE_PROJECTS).put(malformed)),
    );

    const [summary] = await listProjects();
    expect(summary.familyRecoveryError).toContain('Family情報が不正');
    const recovered = await recoverProjectWithoutInvalidFamilies(project.id);
    expect((await loadProject(recovered.projectId)).project.families).toBeUndefined();

    const rawOriginal = await runTransaction([STORE_PROJECTS], 'readonly', (tx) =>
      requestToPromise(tx.objectStore(STORE_PROJECTS).get(project.id) as IDBRequest<Project>),
    );
    expect(rawOriginal.families).toEqual(families);
  });

  it('families以外も不正なProjectは隔離copyで救済しない', async () => {
    const { project } = await seedInvalidFamilyProject();
    await runTransaction([STORE_PROJECTS], 'readwrite', async (tx) => {
      await requestToPromise(
        tx.objectStore(STORE_PROJECTS).put({ ...project, name: '' } satisfies Project),
      );
    });
    const [summary] = await listProjects();
    expect(summary.familyRecoveryError).toBeUndefined();
    await expect(recoverProjectWithoutInvalidFamilies(project.id)).rejects.toThrow(
      '復旧できるProjectではありません',
    );
  });

  it('schema不正familiesをごみ箱からblocked recovery状態へ安全に復元する', async () => {
    const { project } = await seedInvalidFamilyProject();
    await runTransaction([STORE_PROJECTS], 'readwrite', (tx) =>
      requestToPromise(
        tx.objectStore(STORE_PROJECTS).put({
          ...structuredClone(project),
          families: [null],
        }),
      ),
    );
    await deleteProject(project.id);
    await restoreProject(project.id);
    const [summary] = await listProjects();
    expect(summary.familyRecoveryError).toContain('Family情報が不正');
    await expect(loadProject(project.id)).rejects.toThrow();
  });
});
