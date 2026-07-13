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
    expect(states.map((s) => s.status)).toEqual(['saving', 'saved']);
    expect(queue.getState().status).toBe('saved');
    expect(queue.getState().lastSavedAt).toBeDefined();
  });

  it('連続する操作は最後のタスクにまとまる（デバウンス）', async () => {
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

  it('保存失敗で error 状態と理由を返し、次の保存成功で回復する', async () => {
    const queue = new AutosaveQueue({ delayMs: 1 });
    queue.schedule(async () => {
      throw new Error('容量が足りません');
    });
    await queue.flush();
    expect(queue.getState().status).toBe('error');
    expect(queue.getState().errorMessage).toContain('容量が足りません');

    queue.schedule(async () => {});
    await queue.flush();
    expect(queue.getState().status).toBe('saved');
    expect(queue.getState().errorMessage).toBeUndefined();
  });

  it('flush は待機中のタスクを即時実行する', async () => {
    const queue = new AutosaveQueue({ delayMs: 60_000 });
    let saved = false;
    queue.schedule(async () => {
      saved = true;
    });
    await queue.flush();
    expect(saved).toBe(true);
  });

  it('原子的保存前の flush で保留中 Asset 単体 autosave が先に完了し、後から上書きしない', async () => {
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
    await queue.flush();

    const finalAsset = (await loadAsset(assetA.id)).asset;
    expect(finalAsset.displayName).toBe('C atomic');
    expect(finalAsset.textures.find((texture) => texture.id === 'tex_main')?.size).toEqual({
      width: 48,
      height: 32,
    });
    expect(new Uint8Array(await (await loadBlob(editKey))!.arrayBuffer())).toEqual(
      new Uint8Array([3]),
    );
    expect(new Uint8Array(await (await loadBlob(sourceKey))!.arrayBuffer())).toEqual(
      new Uint8Array([1]),
    );
  });
});
