import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset, Project } from '../model';
import { createEmptyProject } from '../model';
import characterAsset from '../samples/asset.character.json';
import { StorageError, resetDbForTests } from './db';
import {
  deleteProject,
  listProjectAssets,
  listProjects,
  loadAsset,
  loadBlob,
  loadProject,
  saveAsset,
  saveBlob,
  saveProject,
} from './projectStore';

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

  it('プロジェクト削除で Blob も消える', async () => {
    const project = createEmptyProject('Blob 削除');
    await saveProject(project);
    await saveBlob(
      project.id,
      'key1',
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    await deleteProject(project.id);
    expect(await loadBlob('key1')).toBeNull();
  });
});
