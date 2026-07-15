import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset, type TextureRef } from '../model';
import characterAsset from '../samples/asset.character.json';
import { resetDbForTests } from './db';
import {
  loadAsset,
  loadBlob,
  saveAsset,
  saveAssetRevision,
  saveBlob,
  saveProject,
  saveProjectBundle,
} from './projectStore';

beforeEach(async () => {
  await resetDbForTests();
});

const bytes = (value: number) => new Blob([new Uint8Array([value])], { type: 'image/png' });

function cloneBaseAsset(): Asset {
  return structuredClone(characterAsset) as unknown as Asset;
}

function keyFor(asset: Asset, texture: TextureRef): string {
  return `${asset.id}/${texture.path}`;
}

async function seedAsset(asset: Asset = cloneBaseAsset()) {
  const project = createEmptyProject('texture invariants');
  const blobs = asset.textures.map((texture, index) => ({
    key: keyFor(asset, texture),
    blob: bytes(index + 1),
  }));
  await saveProjectBundle(project, [asset], blobs);
  return { project, asset };
}

function addedTexture(asset: Asset, texture: TextureRef): Asset {
  return { ...asset, textures: [...asset.textures, texture] };
}

describe('2D-1B-LAYERS final storage invariants', () => {
  it('rejects duplicate TextureRef IDs', async () => {
    const asset = cloneBaseAsset();
    asset.textures.push({
      ...asset.textures[1],
      path: 'textures/duplicate-id.png',
    });
    const project = createEmptyProject('duplicate id');

    await expect(saveAsset(project.id, asset)).rejects.toThrow(/同じ TextureRef ID/);
  });

  it('rejects duplicate Blob keys', async () => {
    const asset = cloneBaseAsset();
    asset.textures.push({ ...asset.textures[1], id: 'tex_duplicate_key' });
    const project = createEmptyProject('duplicate key');

    await expect(saveAsset(project.id, asset)).rejects.toThrow(/同じ Blob key/);
  });

  it('allows saveAsset metadata-only updates', async () => {
    const { project, asset } = await seedAsset();
    const next = { ...asset, displayName: 'metadata updated' };

    await saveAsset(project.id, next);

    expect((await loadAsset(asset.id)).asset.displayName).toBe('metadata updated');
  });

  it('rejects saveAsset TextureRef additions and removals', async () => {
    const { project, asset } = await seedAsset();
    const extra: TextureRef = {
      id: 'tex_extra',
      kind: 'edit',
      name: 'extra',
      mimeType: 'image/png',
      size: { width: 1, height: 1 },
      path: 'textures/extra.png',
    };

    await expect(saveAsset(project.id, addedTexture(asset, extra))).rejects.toThrow(
      /saveAssetRevision/,
    );
    await expect(
      saveAsset(project.id, { ...asset, textures: asset.textures.slice(0, 1) }),
    ).rejects.toThrow(/saveAssetRevision/);
  });

  it('rejects saveAsset source kind, path, mimeType, and size changes', async () => {
    const { project, asset } = await seedAsset();
    const source = asset.textures.find((texture) => texture.kind === 'source')!;
    const variants: TextureRef[] = [
      { ...source, kind: 'edit' },
      { ...source, path: 'source/renamed.png' },
      { ...source, mimeType: 'image/jpeg' },
      {
        ...source,
        size: { width: source.size.width + 1, height: source.size.height },
      },
    ];

    for (const replacement of variants) {
      const next = {
        ...asset,
        textures: asset.textures.map((texture) =>
          texture.id === source.id ? replacement : texture,
        ),
      };
      await expect(saveAsset(project.id, next)).rejects.toThrow(/saveAssetRevision/);
    }
  });

  it('rejects saveAsset project ownership changes', async () => {
    const { asset } = await seedAsset();
    const other = createEmptyProject('other');
    await saveProject(other);

    await expect(saveAsset(other.id, asset)).rejects.toThrow(/指定 Project/);
  });

  it('rejects orphan Blob puts', async () => {
    const { project, asset } = await seedAsset();

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset,
        putBlobs: [{ key: `${asset.id}/textures/orphan.png`, blob: bytes(9) }],
      }),
    ).rejects.toThrow(/対応する TextureRef がありません/);
  });

  it('rejects deleting retained edit and thumbnail Blobs', async () => {
    const asset = cloneBaseAsset();
    const thumbnail: TextureRef = {
      id: 'tex_thumb',
      kind: 'thumbnail',
      name: 'thumb',
      mimeType: 'image/png',
      size: { width: 64, height: 64 },
      path: 'thumbnails/thumb.png',
    };
    asset.textures.push(thumbnail);
    const { project } = await seedAsset(asset);
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset,
        deleteBlobKeys: [keyFor(asset, edit)],
      }),
    ).rejects.toThrow(/保存後 Asset が参照する Blob/);
    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset,
        deleteBlobKeys: [keyFor(asset, thumbnail)],
      }),
    ).rejects.toThrow(/保存後 Asset が参照する Blob/);
  });

  it('allows deleting an existing orphan Blob but rejects a missing Blob key', async () => {
    const { project, asset } = await seedAsset();
    const orphanKey = `${asset.id}/textures/orphan-cleanup.png`;
    await saveBlob(project.id, orphanKey, bytes(7));

    await saveAssetRevision({
      projectId: project.id,
      asset,
      deleteBlobKeys: [orphanKey],
    });
    expect(await loadBlob(orphanKey)).toBeNull();

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset,
        deleteBlobKeys: [`${asset.id}/textures/missing.png`],
      }),
    ).rejects.toThrow(/保存前 TextureRef がありません/);
  });

  it('allows updating existing edit and thumbnail Blobs', async () => {
    const asset = cloneBaseAsset();
    const thumbnail: TextureRef = {
      id: 'tex_thumb',
      kind: 'thumbnail',
      name: 'thumb',
      mimeType: 'image/png',
      size: { width: 64, height: 64 },
      path: 'thumbnails/thumb.png',
    };
    asset.textures.push(thumbnail);
    const { project } = await seedAsset(asset);
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;

    await saveAssetRevision({
      projectId: project.id,
      asset,
      putBlobs: [
        { key: keyFor(asset, edit), blob: bytes(8) },
        { key: keyFor(asset, thumbnail), blob: bytes(9) },
      ],
    });

    expect(new Uint8Array(await (await loadBlob(keyFor(asset, edit)))!.arrayBuffer())).toEqual(
      new Uint8Array([8]),
    );
    expect(new Uint8Array(await (await loadBlob(keyFor(asset, thumbnail)))!.arrayBuffer())).toEqual(
      new Uint8Array([9]),
    );
  });

  it('allows adding and removing non-source TextureRefs with their Blobs', async () => {
    const { project, asset } = await seedAsset();
    const extra: TextureRef = {
      id: 'tex_extra',
      kind: 'edit',
      name: 'extra',
      mimeType: 'image/png',
      size: { width: 1, height: 1 },
      path: 'textures/extra.png',
    };
    const extraKey = keyFor(asset, extra);
    const withExtra = addedTexture(asset, extra);

    await saveAssetRevision({
      projectId: project.id,
      asset: withExtra,
      putBlobs: [{ key: extraKey, blob: bytes(7) }],
    });
    expect(await loadBlob(extraKey)).not.toBeNull();

    await saveAssetRevision({
      projectId: project.id,
      asset,
      deleteBlobKeys: [extraKey],
    });
    expect(await loadBlob(extraKey)).toBeNull();
  });

  it('rejects source kind changes even with explicit delete permissions', async () => {
    const { project, asset } = await seedAsset();
    const source = asset.textures.find((texture) => texture.kind === 'source')!;
    const sourceKey = keyFor(asset, source);
    const next = {
      ...asset,
      textures: asset.textures.map((texture) =>
        texture.id === source.id ? { ...texture, kind: 'edit' as const } : texture,
      ),
    };

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset: next,
        deleteBlobKeys: [sourceKey],
        sourceBlobTransitions: { deleteKeys: [sourceKey] },
      }),
    ).rejects.toThrow();
  });

  it('rejects source path, mimeType, and size changes with create/delete permissions', async () => {
    const variants = [
      (source: TextureRef) => ({ ...source, path: 'source/renamed.png' }),
      (source: TextureRef) => ({ ...source, mimeType: 'image/jpeg' as const }),
      (source: TextureRef) => ({
        ...source,
        size: { width: source.size.width + 1, height: source.size.height },
      }),
    ];

    for (const change of variants) {
      await resetDbForTests();
      const { project, asset } = await seedAsset();
      const source = asset.textures.find((texture) => texture.kind === 'source')!;
      const previousKey = keyFor(asset, source);
      const changed = change(source);
      const nextKey = keyFor(asset, changed);
      const next = {
        ...asset,
        textures: asset.textures.map((texture) => (texture.id === source.id ? changed : texture)),
      };

      await expect(
        saveAssetRevision({
          projectId: project.id,
          asset: next,
          putBlobs: previousKey === nextKey ? [] : [{ key: nextKey, blob: bytes(4) }],
          deleteBlobKeys: previousKey === nextKey ? [] : [previousKey],
          sourceBlobTransitions:
            previousKey === nextKey ? {} : { createKeys: [nextKey], deleteKeys: [previousKey] },
        }),
      ).rejects.toThrow(/既存 source TextureRef/);
    }
  });

  it('rejects reusing an existing source key for a new edit TextureRef', async () => {
    const { project, asset } = await seedAsset();
    const source = asset.textures.find((texture) => texture.kind === 'source')!;
    const replacement: TextureRef = {
      ...source,
      id: 'tex_replacement',
      kind: 'edit',
    };
    const next = {
      ...asset,
      textures: asset.textures.map((texture) => (texture.id === source.id ? replacement : texture)),
    };

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset: next,
        deleteBlobKeys: [keyFor(asset, source)],
        sourceBlobTransitions: { deleteKeys: [keyFor(asset, source)] },
      }),
    ).rejects.toThrow();
  });

  it('rejects reusing an existing edit key for a new source TextureRef', async () => {
    const { project, asset } = await seedAsset();
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const replacement: TextureRef = {
      ...edit,
      id: 'tex_new_source',
      kind: 'source',
    };
    const next = {
      ...asset,
      textures: asset.textures.map((texture) => (texture.id === edit.id ? replacement : texture)),
    };
    const key = keyFor(asset, edit);

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset: next,
        putBlobs: [{ key, blob: bytes(6) }],
        sourceBlobTransitions: { createKeys: [key] },
      }),
    ).rejects.toThrow();
  });

  it('keeps Asset JSON and Blobs unchanged after validation failure', async () => {
    const { project, asset } = await seedAsset();
    const edit = asset.textures.find((texture) => texture.kind === 'edit')!;
    const beforeBlob = new Uint8Array(await (await loadBlob(keyFor(asset, edit)))!.arrayBuffer());
    const next = { ...asset, displayName: 'must not persist' };

    await expect(
      saveAssetRevision({
        projectId: project.id,
        asset: next,
        putBlobs: [
          { key: keyFor(asset, edit), blob: bytes(9) },
          { key: `${asset.id}/textures/orphan.png`, blob: bytes(10) },
        ],
      }),
    ).rejects.toThrow(/対応する TextureRef/);

    expect((await loadAsset(asset.id)).asset).toEqual(asset);
    expect(new Uint8Array(await (await loadBlob(keyFor(asset, edit)))!.arrayBuffer())).toEqual(
      beforeBlob,
    );
  });
});
