from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f'expected block not found: {path}')
    file.write_text(text.replace(old, new, 1))


replace_once(
    'src/core/storage/projectStoreFinalInvariants.test.ts',
    """async function seedAsset(asset: Asset = cloneBaseAsset()) {
  const project = createEmptyProject('texture invariants');
  const blobs = asset.textures.map((texture, index) => ({
""",
    """async function seedAsset(asset: Asset = cloneBaseAsset()) {
  const project = {
    ...createEmptyProject('texture invariants'),
    assets: [
      {
        id: asset.id,
        name: asset.name,
        displayName: asset.displayName,
        assetType: asset.assetType,
      },
    ],
  };
  const blobs = asset.textures.map((texture, index) => ({
""",
)

replace_once(
    'src/core/storage/snapshotRestoreFlow.test.ts',
    """  const project = { ...createEmptyProject('復旧点フローテスト'), id: projectId };
""",
    """  const project = {
    ...createEmptyProject('復旧点フローテスト'),
    id: projectId,
    assets: [
      {
        id: currentAsset.id,
        name: currentAsset.name,
        displayName: currentAsset.displayName,
        assetType: currentAsset.assetType,
      },
    ],
  };
""",
)
replace_once(
    'src/core/storage/snapshotRestoreFlow.test.ts',
    """  await saveProjectBundle(
    project,
    [currentAsset],
    [
      { key: sourceKey, blob: new Blob([sourceBytes], { type: 'image/png' }) },
      { key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) },
    ],
  );
  await saveSnapshot({
    projectId,
    assetId: currentAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: new Blob([snapshotBytes], { type: 'image/png' }),
  });
""",
    """  const snapshotBlob = new Blob([snapshotBytes], { type: 'image/png' });
  await saveProjectBundle(
    project,
    [snapshotAsset],
    [
      { key: sourceKey, blob: new Blob([sourceBytes], { type: 'image/png' }) },
      { key: editKey, blob: snapshotBlob },
    ],
  );
  await saveSnapshot({
    projectId,
    assetId: snapshotAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: snapshotBlob,
  });
  await saveAssetRevision({
    projectId,
    asset: currentAsset,
    putBlobs: [{ key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) }],
  });
""",
)

replace_once(
    'src/core/storage/snapshotRestoreCoordinator.test.ts',
    """  const project = { ...createEmptyProject('復旧調整テスト'), id: projectId };
""",
    """  const project = {
    ...createEmptyProject('復旧調整テスト'),
    id: projectId,
    assets: [
      {
        id: currentAsset.id,
        name: currentAsset.name,
        displayName: currentAsset.displayName,
        assetType: currentAsset.assetType,
      },
    ],
  };
""",
)
replace_once(
    'src/core/storage/snapshotRestoreCoordinator.test.ts',
    """  await saveProjectBundle(
    project,
    [currentAsset],
    [{ key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) }],
  );
  await saveSnapshot({
    projectId,
    assetId: currentAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: new Blob([snapshotBytes], { type: 'image/png' }),
  });
""",
    """  const snapshotBlob = new Blob([snapshotBytes], { type: 'image/png' });
  await saveProjectBundle(project, [snapshotAsset], [{ key: editKey, blob: snapshotBlob }]);
  await saveSnapshot({
    projectId,
    assetId: snapshotAsset.id,
    label: '消しゴム',
    asset: snapshotAsset,
    blobKey: editKey,
    blob: snapshotBlob,
  });
  await saveAssetRevisionBase({
    projectId,
    asset: currentAsset,
    putBlobs: [{ key: editKey, blob: new Blob([currentBytes], { type: 'image/png' }) }],
  });
""",
)

replace_once(
    'src/features/editor/editorMutationGuard.test.ts',
    """    expect(apply).toHaveBeenCalledTimes(1);
    expect(history.getState()).toMatchObject({ isBusy: true, canUndo: false });
    await history.waitForPending();
""",
    """    expect(apply).toHaveBeenCalledTimes(1);
    await history.waitForPending();
""",
)
