import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { AutosaveQueue, type SaveState } from './autosave';
import { resetDbForTests } from './db';
import {
  loadAsset,
  loadProject,
  renameProject,
  loadBlob,
  saveAsset,
  saveAssetRevision,
  saveBlob,
  saveProject,
} from './projectStore';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('AutosaveQueue', () => {
  it('読み取り専用snapshotでpending task・timer・実行状態を比較できる', async () => {
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    queue.schedule(async () => {});

    expect(queue.getSnapshot()).toMatchObject({
      hasTimer: true,
      hasPendingTask: true,
      isRunning: false,
      lastError: null,
    });
    await queue.flush();
    expect(queue.getSnapshot()).toMatchObject({
      hasTimer: false,
      hasPendingTask: false,
      isRunning: false,
      lastError: null,
    });
  });

  it('保存タスクが実行され、状態が saving -> saved と遷移する', async () => {
    const queue = new AutosaveQueue({ delayMs: 5 });
    const states: SaveState[] = [];
    queue.subscribe((state) => states.push(state));
    let saved = 0;
    queue.schedule(async () => {
      saved += 1;
    });
    await queue.flush();
    expect(saved).toBe(1);
    expect(states.map((state) => state.status)).toEqual(['pending', 'saving', 'saved']);
    expect(queue.getState().status).toBe('saved');
  });

  it('連続する操作は最後のタスクにまとまる', async () => {
    const queue = new AutosaveQueue({ delayMs: 30 });
    const runs: string[] = [];
    queue.schedule(async () => {
      runs.push('1回目');
    });
    queue.schedule(async () => {
      runs.push('2回目');
    });
    queue.schedule(async () => {
      runs.push('3回目');
    });
    await queue.flush();
    expect(runs).toEqual(['3回目']);
  });

  it('保存中に予約された操作は保存完了後に続けて実行される', async () => {
    const queue = new AutosaveQueue({ delayMs: 1 });
    const runs: string[] = [];
    queue.schedule(async () => {
      runs.push('先行保存');
      await wait(20);
    });
    await wait(10);
    queue.schedule(async () => {
      runs.push('後続保存');
    });
    await queue.flush();
    expect(runs).toEqual(['先行保存', '後続保存']);
  });

  it('保存失敗をflushへ伝え、次の保存成功で回復する', async () => {
    const queue = new AutosaveQueue({ delayMs: 1 });
    queue.schedule(async () => {
      throw new Error('容量が足りません');
    });
    await expect(queue.flush()).rejects.toThrow('容量が足りません');
    expect(queue.getState().status).toBe('error');
    expect(queue.getState().errorMessage).toContain('容量が足りません');
    await expect(AutosaveQueue.flushAll()).rejects.toThrow('容量が足りません');
    queue.schedule(async () => {});
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(queue.getState().status).toBe('saved');
  });

  it('保存失敗した同じタスクを明示的に再試行できる', async () => {
    const queue = new AutosaveQueue({ delayMs: 1 });
    let attempts = 0;
    queue.schedule(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('一時的な保存失敗');
      }
    });

    await expect(queue.flush()).rejects.toThrow('一時的な保存失敗');
    expect(queue.canRetry()).toBe(true);
    expect(queue.getSnapshot().hasFailedTask).toBe(true);
    expect(queue.retryLastFailure()).toBe(true);
    await expect(queue.flush()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(queue.getState().status).toBe('saved');
    expect(queue.canRetry()).toBe(false);
  });

  it('flushAllは複数queueの失敗を呼び出し元へ返す', async () => {
    const success = new AutosaveQueue({ delayMs: 60_000 });
    const failure = new AutosaveQueue({ delayMs: 60_000 });
    let successRan = false;
    success.schedule(async () => {
      successRan = true;
    });
    failure.schedule(async () => {
      throw new Error('global autosave failed');
    });
    await expect(AutosaveQueue.flushAll()).rejects.toThrow('global autosave failed');
    expect(successRan).toBe(true);
  });

  it.each([true, false])(
    '名前と複数素材の連続保存を両順序で保持する: nameFirst=%s',
    async (nameFirst) => {
      const queue = new AutosaveQueue({ delayMs: 60_000 });
      const first = structuredClone(characterAsset) as unknown as Asset;
      const second = { ...first, id: 'asset_second' };
      const project = {
        ...createEmptyProject('before'),
        assets: [first, second].map((asset) => ({
          id: asset.id,
          name: asset.name,
          displayName: asset.displayName,
          assetType: asset.assetType,
        })),
      };
      await saveProject(project);
      await saveAsset(project.id, first);
      await saveAsset(project.id, second);
      const name = () => queue.schedule(() => renameProject(project.id, 'after'), 'project');
      if (nameFirst) name();
      for (const asset of [first, second]) {
        queue.schedule(() => saveAsset(project.id, { ...asset, displayName: 'latest' }), asset.id);
      }
      if (!nameFirst) name();
      await queue.flush();
      const stored = await loadProject(project.id);
      expect(stored.project.name).toBe('after');
      expect(stored.project.assets.map((asset) => asset.displayName)).toEqual(['latest', 'latest']);
      expect((await loadAsset(first.id)).asset.displayName).toBe('latest');
      expect((await loadAsset(second.id)).asset.displayName).toBe('latest');
    },
  );

  it('別対象の成功や新規予約は失敗を隠さず、失敗対象だけ再試行する', async () => {
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    let attempts = 0;
    let otherSaves = 0;
    queue.schedule(async () => {
      if (++attempts === 1) throw new Error('name failed');
    }, 'project');
    queue.schedule(async () => {
      otherSaves++;
    }, 'asset');
    await expect(queue.flush()).rejects.toThrow('name failed');
    expect(otherSaves).toBe(1);
    queue.schedule(async () => {
      otherSaves++;
    }, 'asset');
    expect(queue.getState().status).toBe('error');
    await expect(queue.flush()).rejects.toThrow('name failed');
    expect(queue.retryLastFailure()).toBe(true);
    await queue.flush();
    expect(attempts).toBe(2);
    expect(otherSaves).toBe(2);
    expect(queue.getState().status).toBe('saved');
  });

  it('同じ対象の最新変更へまとめても保存中の別対象を失わない', async () => {
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    const runs: string[] = [];
    queue.schedule(async () => {
      runs.push('project');
      queue.schedule(async () => {
        runs.push('asset old');
      }, 'asset');
      queue.schedule(async () => {
        runs.push('asset new');
      }, 'asset');
      queue.schedule(async () => {
        runs.push('other asset');
      }, 'other');
    }, 'project');
    await queue.flush();
    expect(runs).toEqual(['project', 'asset new', 'other asset']);
    expect(queue.getSnapshot()).toMatchObject({
      hasTimer: false,
      hasPendingTask: false,
      isRunning: false,
    });
  });

  it('原子的保存前のflush後は古いautosaveが改訂を上書きしない', async () => {
    const queue = new AutosaveQueue({ delayMs: 800 });
    const assetA = characterAsset as unknown as Asset;
    const project = {
      ...createEmptyProject('autosave conflict'),
      assets: [
        {
          id: assetA.id,
          name: assetA.name,
          displayName: assetA.displayName,
          assetType: assetA.assetType,
        },
      ],
    };
    const assetB: Asset = { ...assetA, displayName: 'B autosave' };
    const assetC: Asset = {
      ...assetB,
      displayName: 'C atomic',
      textures: assetB.textures.map((texture) =>
        texture.id === 'tex_main' ? { ...texture, size: { width: 48, height: 32 } } : texture,
      ),
    };
    const sourceKey = `${assetA.id}/source/original.png`;
    const editKey = `${assetA.id}/textures/main.png`;
    await saveProject(project);
    await saveAsset(project.id, assetA);
    await saveBlob(project.id, sourceKey, new Blob([new Uint8Array([1])], { type: 'image/png' }));
    await saveBlob(project.id, editKey, new Blob([new Uint8Array([2])], { type: 'image/png' }));
    queue.schedule(() => saveAsset(project.id, assetB));
    await queue.flush();
    await saveAssetRevision({
      projectId: project.id,
      asset: assetC,
      putBlobs: [{ key: editKey, blob: new Blob([new Uint8Array([3])], { type: 'image/png' }) }],
    });
    expect((await loadAsset(assetA.id)).asset.displayName).toBe('C atomic');
    expect(new Uint8Array(await (await loadBlob(editKey))!.arrayBuffer())).toEqual(
      new Uint8Array([3]),
    );
    expect(new Uint8Array(await (await loadBlob(sourceKey))!.arrayBuffer())).toEqual(
      new Uint8Array([1]),
    );
  });
});
