import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from './asset';
import type { LinkedAssetFamilyVariant } from './familyVariantRecipes';
import {
  createLinkedMirrorVariantDraft,
  createLinkedPaletteVariantDraft,
  createLinkedVariantFingerprint,
  FamilyVariantRecipeError,
  inspectLinkedVariant,
  prepareLinkedVariantRefresh,
} from './familyVariantRecipes';

const NOW = new Date('2026-07-18T00:00:00.000Z');

function baseAsset(): Asset {
  return structuredClone(characterAsset) as unknown as Asset;
}

function blobsFor(asset: Asset, editByte = 2): Map<string, Blob> {
  return new Map(
    asset.textures.map((texture) => [
      texture.path,
      new Blob([new Uint8Array([texture.kind === 'source' ? 1 : editByte])], {
        type: texture.mimeType,
      }),
    ]),
  );
}

async function mirrorFixture() {
  const base = baseAsset();
  const draft = createLinkedMirrorVariantDraft(base, { now: NOW });
  const baseBlobs = blobsFor(base);
  const variantBlobs = blobsFor(draft.asset);
  const fingerprint = await createLinkedVariantFingerprint({
    base,
    variant: draft.asset,
    recipe: draft.recipe,
    baseBlobs,
    variantBlobs,
    now: NOW,
  });
  const variant: LinkedAssetFamilyVariant = {
    assetId: draft.asset.id,
    kind: 'linked-mirror',
    recipe: draft.recipe,
    fingerprint,
  };
  return { base, draft, baseBlobs, variantBlobs, variant };
}

describe('Slice C family variant recipe / fingerprint', () => {
  it('Asset ID・名前・日時とobject key順に依存せず、内部構造と対象Blob差を検出する', async () => {
    const fixture = await mirrorFixture();
    const remappedBase = {
      ...structuredClone(fixture.base),
      id: 'asset_imported_base',
      name: 'renamed_base',
      displayName: '表示名変更',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      gameAttributes: { z: 1, a: 2 },
    };
    const remappedVariant = {
      ...structuredClone(fixture.draft.asset),
      id: 'asset_imported_variant',
      name: 'renamed_variant',
      displayName: '表示名変更',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      gameAttributes: { a: 2, z: 1 },
    };
    const remapped = await createLinkedVariantFingerprint({
      base: remappedBase,
      variant: remappedVariant,
      recipe: fixture.variant.recipe,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: NOW,
    });
    expect(remapped.base).toBe(fixture.variant.fingerprint.base);
    expect(remapped.variant).toBe(fixture.variant.fingerprint.variant);
    expect(remapped.base).toMatch(/^sha256:[0-9a-f]{64}$/);

    remappedBase.layers[0].opacity = 0.5;
    const changed = await createLinkedVariantFingerprint({
      base: remappedBase,
      variant: remappedVariant,
      recipe: fixture.variant.recipe,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: NOW,
    });
    expect(changed.base).not.toBe(fixture.variant.fingerprint.base);
  });

  it('Unicode内部ID・pathでもlocaleに依存せず、set配列とmap挿入順を正規化する', async () => {
    const fixture = await mirrorFixture();
    const base = structuredClone(fixture.base);
    const variantAsset = structuredClone(fixture.draft.asset);
    const baseEdit = base.textures.find((texture) => texture.kind === 'edit')!;
    const targetEditId = fixture.variant.recipe.idMap.textures[baseEdit.id];
    const targetEdit = variantAsset.textures.find((texture) => texture.id === targetEditId)!;
    baseEdit.path = 'textures/色😀.png';
    targetEdit.path = 'textures/色😀.png';

    const baseAnchor = { ...structuredClone(base.anchors[0]), id: '基準😀anchor' };
    const targetAnchor = {
      ...structuredClone(variantAsset.anchors[0]),
      id: '派生äanchor',
    };
    base.anchors.push(baseAnchor);
    variantAsset.anchors.push(targetAnchor);

    const recipe = structuredClone(fixture.variant.recipe);
    recipe.idMap.anchors[baseAnchor.id] = targetAnchor.id;
    recipe.writeSet.anchors.push(targetAnchor.id);
    recipe.writeSet.blobPaths = [targetEdit.path];
    const reordered = structuredClone(recipe);
    reordered.idMap.anchors = Object.fromEntries(Object.entries(reordered.idMap.anchors).reverse());
    for (const key of [
      'textures',
      'layers',
      'parts',
      'anchors',
      'colliders',
      'frames',
      'animations',
      'blobPaths',
    ] as const) {
      reordered.writeSet[key].reverse();
    }

    const [first, second] = await Promise.all(
      [recipe, reordered].map((candidate) =>
        createLinkedVariantFingerprint({
          base,
          variant: variantAsset,
          recipe: candidate,
          baseBlobs: blobsFor(base),
          variantBlobs: blobsFor(variantAsset),
          now: NOW,
        }),
      ),
    );
    expect(second).toEqual(first);
  });

  it('stale / manual-adjustedの4象限をwrite-set全体で判定する', async () => {
    const fixture = await mirrorFixture();
    await expect(
      inspectLinkedVariant({
        base: fixture.base,
        variantAsset: fixture.draft.asset,
        variant: fixture.variant,
        baseBlobs: fixture.baseBlobs,
        variantBlobs: fixture.variantBlobs,
      }),
    ).resolves.toMatchObject({ status: 'up-to-date', stale: false, manualAdjusted: false });

    const staleBase = structuredClone(fixture.base);
    staleBase.layers[0].opacity = 0.75;
    await expect(
      inspectLinkedVariant({
        base: staleBase,
        variantAsset: fixture.draft.asset,
        variant: fixture.variant,
        baseBlobs: fixture.baseBlobs,
        variantBlobs: fixture.variantBlobs,
      }),
    ).resolves.toMatchObject({ status: 'ready', stale: true, manualAdjusted: false });

    const adjustedVariant = structuredClone(fixture.draft.asset);
    adjustedVariant.layers[0].opacity = 0.25;
    await expect(
      inspectLinkedVariant({
        base: fixture.base,
        variantAsset: adjustedVariant,
        variant: fixture.variant,
        baseBlobs: fixture.baseBlobs,
        variantBlobs: fixture.variantBlobs,
      }),
    ).resolves.toMatchObject({
      status: 'manual-adjusted',
      stale: false,
      manualAdjusted: true,
    });
    await expect(
      inspectLinkedVariant({
        base: staleBase,
        variantAsset: adjustedVariant,
        variant: fixture.variant,
        baseBlobs: fixture.baseBlobs,
        variantBlobs: fixture.variantBlobs,
      }),
    ).resolves.toMatchObject({ status: 'manual-adjusted', stale: true, manualAdjusted: true });
  });

  it('mirror refreshで既存内部IDを保ち、base追加要素に一度だけtarget IDを割り当てる', async () => {
    const fixture = await mirrorFixture();
    const changedBase = structuredClone(fixture.base);
    changedBase.layers.push({
      ...structuredClone(changedBase.layers[0]),
      id: 'layer_added_after_sync',
      name: 'added',
    });
    const existingLayerTarget = fixture.variant.recipe.idMap.layers[fixture.base.layers[0].id];
    const artifact = await prepareLinkedVariantRefresh({
      base: changedBase,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(artifact.nextVariant.recipe.idMap.layers[fixture.base.layers[0].id]).toBe(
      existingLayerTarget,
    );
    const addedTarget = artifact.nextVariant.recipe.idMap.layers.layer_added_after_sync;
    expect(addedTarget).toBeTruthy();
    expect(artifact.afterAsset.layers.map(({ id }) => id)).toContain(addedTarget);
    expect(artifact.changes.join('\n')).toContain('追加1件');

    const afterInspection = await inspectLinkedVariant({
      base: changedBase,
      variantAsset: artifact.afterAsset,
      variant: artifact.nextVariant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
    });
    expect(afterInspection.status).toBe('up-to-date');
    expect(artifact.nextVariant.recipe.idMap.layers.layer_added_after_sync).toBe(addedTarget);
    expect(artifact.baseReadBlobPaths).toEqual(fixture.base.textures.map(({ path }) => path));
    expect(artifact.variantReadBlobPaths).toEqual(
      fixture.draft.asset.textures.map(({ path }) => path),
    );
  });

  it('linked mirrorはFrame時間とevent IDを維持し、refreshでFrame参照を対応先へ更新する', async () => {
    const fixture = await mirrorFixture();
    const changedBase = structuredClone(fixture.base);
    changedBase.frames![0].durationMs = 175;
    changedBase.animations[0].events = [
      {
        id: 'event_linked',
        name: 'step_left',
        frameId: changedBase.frames![0].id,
        payload: { volume: 0.5 },
      },
    ];

    const before = await inspectLinkedVariant({
      base: changedBase,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
    });
    expect(before.stale).toBe(true);

    const artifact = await prepareLinkedVariantRefresh({
      base: changedBase,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    const targetFrameId = artifact.nextVariant.recipe.idMap.frames[changedBase.frames![0].id];
    expect(artifact.afterAsset.frames?.find(({ id }) => id === targetFrameId)?.durationMs).toBe(
      175,
    );
    expect(artifact.afterAsset.animations[0].events).toEqual([
      {
        id: 'event_linked',
        name: 'step_left',
        frameId: targetFrameId,
        payload: { volume: 0.5 },
      },
    ]);
  });

  it('write-set内の手動削除をmanual-adjustedとして検出し、同じtarget IDで復元する', async () => {
    const fixture = await mirrorFixture();
    const removedTargetId = fixture.variant.recipe.idMap.layers[fixture.base.layers[0].id];
    const manuallyDeleted = {
      ...structuredClone(fixture.draft.asset),
      layers: fixture.draft.asset.layers.filter((layer) => layer.id !== removedTargetId),
    };
    const inspection = await inspectLinkedVariant({
      base: fixture.base,
      variantAsset: manuallyDeleted,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
    });
    expect(inspection).toMatchObject({ status: 'manual-adjusted', manualAdjusted: true });

    const artifact = await prepareLinkedVariantRefresh({
      base: fixture.base,
      variantAsset: manuallyDeleted,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(artifact.afterAsset.layers.map(({ id }) => id)).toContain(removedTargetId);
    expect(artifact.nextVariant.recipe.idMap.layers[fixture.base.layers[0].id]).toBe(
      removedTargetId,
    );
  });

  it('baseのcollection順変更をtarget ID対応を保ったままmirrorのz-orderへ反映する', async () => {
    const base = baseAsset();
    const secondLayer = {
      ...structuredClone(base.layers[0]),
      id: 'layer_second_for_reorder',
      name: 'second',
    };
    base.layers.push(secondLayer);
    const draft = createLinkedMirrorVariantDraft(base, { now: NOW });
    const baseBlobs = blobsFor(base);
    const variantBlobs = blobsFor(draft.asset);
    const fingerprint = await createLinkedVariantFingerprint({
      base,
      variant: draft.asset,
      recipe: draft.recipe,
      baseBlobs,
      variantBlobs,
      now: NOW,
    });
    const variant: LinkedAssetFamilyVariant = {
      assetId: draft.asset.id,
      kind: 'linked-mirror',
      recipe: draft.recipe,
      fingerprint,
    };
    const reorderedBase = {
      ...structuredClone(base),
      layers: [structuredClone(secondLayer), structuredClone(base.layers[0])],
    };
    const artifact = await prepareLinkedVariantRefresh({
      base: reorderedBase,
      variantAsset: draft.asset,
      variant,
      baseBlobs,
      variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(artifact.afterAsset.layers.map(({ id }) => id)).toEqual([
      draft.recipe.idMap.layers[secondLayer.id],
      draft.recipe.idMap.layers[base.layers[0].id],
    ]);
    await expect(
      inspectLinkedVariant({
        base: reorderedBase,
        variantAsset: artifact.afterAsset,
        variant: artifact.nextVariant,
        baseBlobs,
        variantBlobs,
      }),
    ).resolves.toMatchObject({ status: 'up-to-date' });
  });

  it('base追加IDがvariantのwrite-set外IDと衝突するときだけ別target IDを固定する', async () => {
    const fixture = await mirrorFixture();
    const collidingId = 'layer_added_collision';
    const variantAsset = structuredClone(fixture.draft.asset);
    variantAsset.layers.push({
      ...structuredClone(variantAsset.layers[0]),
      id: collidingId,
      name: 'variant only guide',
      layerType: 'guide',
      textureId: undefined,
    });
    const changedBase = structuredClone(fixture.base);
    changedBase.layers.push({
      ...structuredClone(changedBase.layers[0]),
      id: collidingId,
      name: 'new base layer',
    });
    const artifact = await prepareLinkedVariantRefresh({
      base: changedBase,
      variantAsset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    const mappedTargetId = artifact.nextVariant.recipe.idMap.layers[collidingId];
    expect(mappedTargetId).not.toBe(collidingId);
    expect(artifact.afterAsset.layers.map(({ id }) => id)).toContain(collidingId);
    expect(artifact.afterAsset.layers.map(({ id }) => id)).toContain(mappedTargetId);
    expect(new Set(artifact.afterAsset.layers.map(({ id }) => id)).size).toBe(
      artifact.afterAsset.layers.length,
    );
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'Object prototype由来の特殊ID（%s）も未mappingと誤認せず追加する',
    async (specialId) => {
      const fixture = await mirrorFixture();
      const changedBase = structuredClone(fixture.base);
      changedBase.layers.push({
        ...structuredClone(changedBase.layers[0]),
        id: specialId,
        name: `special ${specialId}`,
        layerType: 'guide',
        textureId: undefined,
      });

      const artifact = await prepareLinkedVariantRefresh({
        base: changedBase,
        variantAsset: fixture.draft.asset,
        variant: fixture.variant,
        baseBlobs: fixture.baseBlobs,
        variantBlobs: fixture.variantBlobs,
        now: new Date('2026-07-18T01:00:00.000Z'),
      });
      const mapping = artifact.nextVariant.recipe.idMap.layers;
      expect(Object.prototype.hasOwnProperty.call(mapping, specialId)).toBe(true);
      expect(mapping[specialId]).toBe(specialId);
      expect(artifact.afterAsset.layers.map(({ id }) => id)).toContain(specialId);
      await expect(
        inspectLinkedVariant({
          base: changedBase,
          variantAsset: artifact.afterAsset,
          variant: artifact.nextVariant,
          baseBlobs: fixture.baseBlobs,
          variantBlobs: fixture.variantBlobs,
        }),
      ).resolves.toMatchObject({ status: 'up-to-date' });
    },
  );

  it('mirror refreshでもrecipe / writeSetの未知fieldを保持する', async () => {
    const fixture = await mirrorFixture();
    const recipeRecord = fixture.variant.recipe as unknown as Record<string, unknown>;
    const writeSetRecord = fixture.variant.recipe.writeSet as unknown as Record<string, unknown>;
    recipeRecord.futureRecipeField = { mode: 'preserve' };
    writeSetRecord.futureWriteTargets = { mode: 'preserve' };
    fixture.variant.fingerprint = await createLinkedVariantFingerprint({
      base: fixture.base,
      variant: fixture.draft.asset,
      recipe: fixture.variant.recipe,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: NOW,
    });
    const artifact = await prepareLinkedVariantRefresh({
      base: fixture.base,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(
      (artifact.nextVariant.recipe as unknown as Record<string, unknown>).futureRecipeField,
    ).toEqual({ mode: 'preserve' });
    expect(
      (artifact.nextVariant.recipe.writeSet as unknown as Record<string, unknown>)
        .futureWriteTargets,
    ).toEqual({ mode: 'preserve' });
  });

  it('baseから削除されたmirror対象をpreview artifactから除き、idMapも更新する', async () => {
    const fixture = await mirrorFixture();
    const removedBaseId = fixture.base.layers[0].id;
    const removedTargetId = fixture.variant.recipe.idMap.layers[removedBaseId];
    const changedBase = {
      ...structuredClone(fixture.base),
      layers: fixture.base.layers.filter((layer) => layer.id !== removedBaseId),
      parts: fixture.base.parts.map((part) => ({
        ...part,
        layerIds: part.layerIds.filter((id) => id !== removedBaseId),
      })),
      frames: fixture.base.frames?.map((frame) => ({
        ...frame,
        layerStates: frame.layerStates.filter((state) => state.layerId !== removedBaseId),
      })),
    };
    const artifact = await prepareLinkedVariantRefresh({
      base: changedBase,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(artifact.afterAsset.layers.map(({ id }) => id)).not.toContain(removedTargetId);
    expect(artifact.nextVariant.recipe.idMap.layers).not.toHaveProperty(removedBaseId);
    expect(artifact.changes.join('\n')).toContain('削除1件');
  });

  it('paletteは明示した1 layerのbase Blobから再生成し、共有TextureRefを拒否する', async () => {
    const base = baseAsset();
    (base as unknown as Record<string, unknown>).provenance = [
      { textureId: base.textures[0].id, source: 'future-field' },
    ];
    const draft = createLinkedPaletteVariantDraft(base, {
      baseLayerId: base.layers[0].id,
      replacements: [{ from: '#ff0000', to: '#00ff00' }],
      tolerance: 10,
      now: NOW,
    });
    expect((draft.asset as unknown as Record<string, unknown>).provenance).toEqual(
      (base as unknown as Record<string, unknown>).provenance,
    );
    expect(draft.asset.textures.map(({ id }) => id)).toEqual(base.textures.map(({ id }) => id));
    const baseBlobs = blobsFor(base, 2);
    const targetPath = draft.recipe.writeSet.blobPaths[0];
    const variantBlobs = blobsFor(draft.asset, 9);
    variantBlobs.set(targetPath, new Blob([new Uint8Array([9])], { type: 'image/png' }));
    const fingerprint = await createLinkedVariantFingerprint({
      base,
      variant: draft.asset,
      recipe: draft.recipe,
      baseBlobs,
      variantBlobs,
      now: NOW,
    });
    const variant: LinkedAssetFamilyVariant = {
      assetId: draft.asset.id,
      kind: 'linked-palette',
      recipe: draft.recipe,
      fingerprint,
    };
    const changedBaseBlobs = blobsFor(base, 3);
    const artifact = await prepareLinkedVariantRefresh({
      base,
      variantAsset: draft.asset,
      variant,
      baseBlobs: changedBaseBlobs,
      variantBlobs,
      transformPaletteBlob: async () => new Blob([new Uint8Array([8])], { type: 'image/png' }),
      now: new Date('2026-07-18T01:00:00.000Z'),
    });
    expect(artifact.inspection.status).toBe('ready');
    expect(artifact.blobChanges).toHaveLength(1);
    expect([...new Uint8Array(await artifact.blobChanges[0].after.arrayBuffer())]).toEqual([8]);
    expect(artifact.afterAsset.id).toBe(draft.asset.id);

    const shared = baseAsset();
    shared.layers.push({
      ...structuredClone(shared.layers[0]),
      id: 'layer_shared_texture',
    });
    expect(() =>
      createLinkedPaletteVariantDraft(shared, {
        baseLayerId: shared.layers[0].id,
        replacements: [{ from: '#ff0000', to: '#00ff00' }],
        tolerance: 10,
      }),
    ).toThrow(FamilyVariantRecipeError);
  });

  it('rig・複数edit Blob・欠落Blob・source変更・未対応paletteを理由付きineligibleにする', async () => {
    const rigged = baseAsset();
    rigged.parts[0].bindPose = { localRotation: 0 };
    expect(() => createLinkedMirrorVariantDraft(rigged)).toThrow('bind pose');
    expect(() =>
      createLinkedPaletteVariantDraft(rigged, {
        baseLayerId: rigged.layers[0].id,
        replacements: [{ from: '#ff0000', to: '#00ff00' }],
        tolerance: 10,
      }),
    ).not.toThrow();

    const extendedFrame = baseAsset();
    (extendedFrame.frames![0] as unknown as Record<string, unknown>).gameData = {
      targetLayerId: extendedFrame.layers[0].id,
    };
    expect(() => createLinkedMirrorVariantDraft(extendedFrame)).toThrow('未対応field');

    const animationWithEvents = baseAsset();
    animationWithEvents.animations[0].events = [
      { id: 'event_1', name: 'hit', frameId: animationWithEvents.frames![0].id },
    ];
    expect(() => createLinkedMirrorVariantDraft(animationWithEvents)).not.toThrow();

    const extendedAnimation = baseAsset();
    (extendedAnimation.animations[0] as unknown as Record<string, unknown>).futureMotion = {
      frameId: extendedAnimation.frames![0].id,
    };
    expect(() => createLinkedMirrorVariantDraft(extendedAnimation)).toThrow('animation');
    const forwardCompatiblePalette = createLinkedPaletteVariantDraft(animationWithEvents, {
      baseLayerId: animationWithEvents.layers[0].id,
      replacements: [{ from: '#ff0000', to: '#00ff00' }],
      tolerance: 10,
    });
    expect(forwardCompatiblePalette.asset.textures.map(({ id }) => id)).toEqual(
      animationWithEvents.textures.map(({ id }) => id),
    );
    expect(forwardCompatiblePalette.asset.animations[0].events).toEqual(
      animationWithEvents.animations[0].events,
    );

    const multiple = baseAsset();
    multiple.textures.push({
      ...structuredClone(multiple.textures.find((texture) => texture.kind === 'edit')!),
      id: 'tex_second_edit',
      path: 'textures/second.png',
    });
    expect(() => createLinkedMirrorVariantDraft(multiple)).toThrow('edit textureが複数');

    const fixture = await mirrorFixture();
    fixture.variantBlobs.delete('textures/main.png');
    const inspection = await inspectLinkedVariant({
      base: fixture.base,
      variantAsset: fixture.draft.asset,
      variant: fixture.variant,
      baseBlobs: fixture.baseBlobs,
      variantBlobs: fixture.variantBlobs,
    });
    expect(inspection.status).toBe('ineligible');
    expect(inspection.reasons.join('\n')).toContain('Blobがありません');

    const sourceChanged = await mirrorFixture();
    sourceChanged.variantBlobs.set(
      'source/original.png',
      new Blob([new Uint8Array([99])], { type: 'image/png' }),
    );
    const sourceInspection = await inspectLinkedVariant({
      base: sourceChanged.base,
      variantAsset: sourceChanged.draft.asset,
      variant: sourceChanged.variant,
      baseBlobs: sourceChanged.baseBlobs,
      variantBlobs: sourceChanged.variantBlobs,
    });
    expect(sourceInspection.status).toBe('ineligible');
    expect(sourceInspection.reasons.join('\n')).toContain('source Blobが変更');

    const thumbnailBase = baseAsset();
    thumbnailBase.textures.push({
      ...structuredClone(thumbnailBase.textures.find((texture) => texture.kind === 'source')!),
      id: 'texture_thumbnail',
      kind: 'thumbnail',
      name: 'preview',
      mimeType: 'image/png',
      path: 'thumbnails/preview.png',
    });
    thumbnailBase.layers.push({
      ...structuredClone(thumbnailBase.layers[0]),
      id: 'layer_thumbnail_preview',
      name: 'thumbnail preview',
      textureId: 'texture_thumbnail',
    });
    const thumbnailDraft = createLinkedMirrorVariantDraft(thumbnailBase, { now: NOW });
    const thumbnailBaseBlobs = blobsFor(thumbnailBase);
    const thumbnailVariantBlobs = blobsFor(thumbnailDraft.asset);
    const thumbnailFingerprint = await createLinkedVariantFingerprint({
      base: thumbnailBase,
      variant: thumbnailDraft.asset,
      recipe: thumbnailDraft.recipe,
      baseBlobs: thumbnailBaseBlobs,
      variantBlobs: thumbnailVariantBlobs,
      now: NOW,
    });
    thumbnailBaseBlobs.set(
      'thumbnails/preview.png',
      new Blob([new Uint8Array([7])], { type: 'image/png' }),
    );
    const thumbnailInspection = await inspectLinkedVariant({
      base: thumbnailBase,
      variantAsset: thumbnailDraft.asset,
      variant: {
        assetId: thumbnailDraft.asset.id,
        kind: 'linked-mirror',
        recipe: thumbnailDraft.recipe,
        fingerprint: thumbnailFingerprint,
      },
      baseBlobs: thumbnailBaseBlobs,
      variantBlobs: thumbnailVariantBlobs,
    });
    expect(thumbnailInspection.status).toBe('ineligible');
    expect(thumbnailInspection.reasons.join('\n')).toContain('thumbnail Blobが変更');

    const mismatchedCanvas = await mirrorFixture();
    mismatchedCanvas.draft.asset.canvasSize.width += 1;
    const mismatchInspection = await inspectLinkedVariant({
      base: mismatchedCanvas.base,
      variantAsset: mismatchedCanvas.draft.asset,
      variant: mismatchedCanvas.variant,
      baseBlobs: mismatchedCanvas.baseBlobs,
      variantBlobs: mismatchedCanvas.variantBlobs,
    });
    expect(mismatchInspection.status).toBe('ineligible');
    expect(mismatchInspection.reasons.join('\n')).toContain('canvas size');

    const tamperedWriteSet = await mirrorFixture();
    tamperedWriteSet.variant.recipe.writeSet.layers.pop();
    const tamperedInspection = await inspectLinkedVariant({
      base: tamperedWriteSet.base,
      variantAsset: tamperedWriteSet.draft.asset,
      variant: tamperedWriteSet.variant,
      baseBlobs: tamperedWriteSet.baseBlobs,
      variantBlobs: tamperedWriteSet.variantBlobs,
    });
    expect(tamperedInspection.status).toBe('ineligible');
    expect(tamperedInspection.reasons.join('\n')).toContain('writeSet.layers');

    const sharedTarget = await mirrorFixture();
    const targetEditId = sharedTarget.variant.recipe.writeSet.textures[0];
    sharedTarget.draft.asset.layers.push({
      ...structuredClone(sharedTarget.draft.asset.layers[0]),
      id: 'variant_only_shared_layer',
      textureId: targetEditId,
    });
    const sharedTargetInspection = await inspectLinkedVariant({
      base: sharedTarget.base,
      variantAsset: sharedTarget.draft.asset,
      variant: sharedTarget.variant,
      baseBlobs: sharedTarget.baseBlobs,
      variantBlobs: sharedTarget.variantBlobs,
    });
    expect(sharedTargetInspection.status).toBe('ineligible');
    expect(sharedTargetInspection.reasons.join('\n')).toContain('write-set外');

    const extendedVariantFrame = await mirrorFixture();
    (
      extendedVariantFrame.draft.asset.frames![0] as unknown as Record<string, unknown>
    ).eventPayload = { preserved: false };
    const extendedVariantInspection = await inspectLinkedVariant({
      base: extendedVariantFrame.base,
      variantAsset: extendedVariantFrame.draft.asset,
      variant: extendedVariantFrame.variant,
      baseBlobs: extendedVariantFrame.baseBlobs,
      variantBlobs: extendedVariantFrame.variantBlobs,
    });
    expect(extendedVariantInspection.status).toBe('ineligible');
    expect(extendedVariantInspection.reasons.join('\n')).toContain('未対応field');

    const paletteBase = baseAsset();
    const paletteDraft = createLinkedPaletteVariantDraft(paletteBase, {
      baseLayerId: paletteBase.layers[0].id,
      replacements: [{ from: '#ff0000', to: '#00ff00' }],
      tolerance: 10,
      now: NOW,
    });
    const paletteBlobs = blobsFor(paletteBase);
    const paletteFingerprint = await createLinkedVariantFingerprint({
      base: paletteBase,
      variant: paletteDraft.asset,
      recipe: paletteDraft.recipe,
      baseBlobs: paletteBlobs,
      variantBlobs: blobsFor(paletteDraft.asset),
      now: NOW,
    });
    const alphaVariant: LinkedAssetFamilyVariant = {
      assetId: paletteDraft.asset.id,
      kind: 'linked-palette',
      recipe: {
        ...structuredClone(paletteDraft.recipe),
        replacements: [{ from: '#ff000080', to: '#00ff00ff' }],
      },
      fingerprint: paletteFingerprint,
    };
    const alphaInspection = await inspectLinkedVariant({
      base: paletteBase,
      variantAsset: paletteDraft.asset,
      variant: alphaVariant,
      baseBlobs: paletteBlobs,
      variantBlobs: blobsFor(paletteDraft.asset),
    });
    expect(alphaInspection.status).toBe('ineligible');
    expect(alphaInspection.reasons.join('\n')).toContain('8桁alpha色');

    const multiLayerBase = structuredClone(paletteBase);
    const multiLayerAsset = structuredClone(paletteDraft.asset);
    const multiLayerVariant = structuredClone(alphaVariant);
    multiLayerVariant.recipe.replacements = [{ from: '#ff0000', to: '#00ff00' }];
    const secondBaseLayer = {
      ...structuredClone(multiLayerBase.layers[0]),
      id: 'palette_base_layer_second',
    };
    const secondTargetLayer = {
      ...structuredClone(multiLayerAsset.layers[0]),
      id: 'palette_target_layer_second',
    };
    multiLayerBase.layers.push(secondBaseLayer);
    multiLayerAsset.layers.push(secondTargetLayer);
    multiLayerVariant.recipe.idMap.layers[secondBaseLayer.id] = secondTargetLayer.id;
    multiLayerVariant.recipe.baseLayerIds.push(secondBaseLayer.id);
    multiLayerVariant.recipe.writeSet.layers.push(secondTargetLayer.id);
    const multiLayerInspection = await inspectLinkedVariant({
      base: multiLayerBase,
      variantAsset: multiLayerAsset,
      variant: multiLayerVariant,
      baseBlobs: paletteBlobs,
      variantBlobs: blobsFor(multiLayerAsset),
    });
    expect(multiLayerInspection.status).toBe('ineligible');
    expect(multiLayerInspection.reasons.join('\n')).toContain('baseLayerIds 1件');
  });
});
