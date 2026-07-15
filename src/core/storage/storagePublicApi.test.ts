import { describe, expect, it } from 'vitest';
import * as storage from './index';

describe('storage public API', () => {
  it('正本整合性を迂回する低水準mutation APIを公開しない', () => {
    expect(storage).not.toHaveProperty('saveBlob');
    expect(storage).not.toHaveProperty('deleteBlob');
    expect(storage).not.toHaveProperty('deleteAsset');
    expect(storage).not.toHaveProperty('applySnapshotRestore');
  });

  it('bundle、revision、snapshot復元の安全な入口を公開する', () => {
    expect(storage.saveProjectBundle).toBeTypeOf('function');
    expect(storage.saveAssetRevision).toBeTypeOf('function');
    expect(storage.deleteAssetBundle).toBeTypeOf('function');
    expect(storage.prepareSnapshotRestore).toBeTypeOf('function');
    expect(storage.commitSnapshotRestore).toBeTypeOf('function');
    expect(storage.cancelSnapshotRestore).toBeTypeOf('function');
  });
});
