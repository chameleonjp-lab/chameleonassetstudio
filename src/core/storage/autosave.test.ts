import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { AutosaveQueue, type SaveState } from './autosave';
import { resetDbForTests } from './db';
import {
  loadAsset,
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
    expect(states.map((state) => state.status)).toEqual(['saving', 'saved']);
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

  it('原子的保存前のflush後は古いautosaveが改訂を上書きしない', async () => {
    const queue = new AutosaveQueue({ delayMs: 800 });
    const project = createEmptyProject('autosave conflict');
    const assetA = characterAsset as unknown as Asset;
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
