import { describe, expect, it } from 'vitest';
import { AutosaveQueue, type SaveState } from './autosave';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    await wait(10); // デバウンスを越えて保存が始まるのを待つ
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
});
