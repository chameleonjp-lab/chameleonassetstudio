import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { canvasWorldPoint } from './canvasTestHelpers';

// Observe the product canvas after a real browser input. Do not time the driver,
// or equate requestAnimationFrame with physical display presentation.
async function observeRedPixel(
  canvas: Locator,
  point: { x: number; y: number },
  eventType: 'pointerdown' | 'pointerup' | 'pointermove',
) {
  await canvas.evaluate(
    (element, { point, eventType }) => {
      const canvas = element as HTMLCanvasElement;
      const target = window as unknown as { releasePaintSample: Promise<number> };
      target.releasePaintSample = new Promise<number>((resolve, reject) => {
        let started: number | null = null;
        let frame = 0;
        const cleanup = () => {
          canvas.removeEventListener(eventType, onInput, true);
          cancelAnimationFrame(frame);
          clearTimeout(timeout);
        };
        const check = () => {
          const view = JSON.parse(canvas.getAttribute('data-view-transform')!);
          const box = canvas.getBoundingClientRect();
          const x = Math.floor((point.x * view.scale + view.offsetX) * (canvas.width / box.width));
          const y = Math.floor(
            (point.y * view.scale + view.offsetY) * (canvas.height / box.height),
          );
          const pixel = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
          const changed =
            eventType === 'pointerdown'
              ? pixel[0] > 120 && pixel[1] < 75 && pixel[2] < 75
              : pixel[0] > 220 && pixel[1] < 40 && pixel[2] < 40;
          if (changed) {
            const duration = performance.now() - started!;
            cleanup();
            resolve(duration);
          } else {
            frame = requestAnimationFrame(check);
          }
        };
        const onInput = (event: Event) => {
          if (eventType === 'pointermove' && (event as PointerEvent).buttons !== 1) return;
          canvas.removeEventListener(eventType, onInput, true);
          started = performance.now();
          frame = requestAnimationFrame(check);
        };
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('実入力後のキャンバスに期待する赤い画素が現れませんでした。'));
        }, 5000);
        canvas.addEventListener(eventType, onInput, true);
      });
    },
    { point, eventType },
  );
}

async function readSample(page: Page) {
  return page.evaluate(
    () => (window as unknown as { releasePaintSample: Promise<number> }).releasePaintSample,
  );
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: samples.length,
    minMs: sorted[0],
    medianMs: sorted[Math.ceil(sorted.length / 2) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted[sorted.length - 1],
    rawMs: samples,
  };
}

async function readBrowserProcessMemory() {
  if (process.platform !== 'linux') return null;
  try {
    const rootPid = Number((await readFile('/proc/self/stat', 'utf8')).split(' ')[0]);
    const pids = (await readdir('/proc')).filter((entry) => /^\d+$/.test(entry));
    const statuses = await Promise.allSettled(
      pids.map(async (entry) => {
        const status = await readFile(`/proc/${entry}/status`, 'utf8');
        const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
        return {
          pid: Number(entry),
          parentPid: Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]),
          name: /^Name:\s+(.+)$/m.exec(status)?.[1] ?? 'unknown',
          rssBytes: rss ? Number(rss[1]) * 1024 : null,
        };
      }),
    );
    const snapshot = statuses.flatMap((status) =>
      status.status === 'fulfilled' ? [status.value] : [],
    );
    const pending = [rootPid];
    const seen = new Set<number>();
    const processes: Array<{ pid: number; name: string; rssBytes: number }> = [];
    while (pending.length && seen.size < 128) {
      const pid = pending.shift()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      for (const child of snapshot.filter((record) => record.parentPid === pid)) {
        pending.push(child.pid);
        if (child.rssBytes !== null)
          processes.push({ pid: child.pid, name: child.name, rssBytes: child.rssBytes });
      }
    }
    // Keep only browser-worker descendant records; never read process arguments or environment.
    return processes.length
      ? {
          method: 'Linux /proc parent-PID snapshot of browser-worker descendants',
          rootPid,
          partial: pending.length > 0,
          rssSumBytes: processes.reduce((bytes, child) => bytes + child.rssBytes, 0),
          processes,
        }
      : null;
  } catch {
    return null;
  }
}

async function readMemory(page: Page, phase: string) {
  const canvasAndHeap = await page.evaluate((phase) => {
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    const canvases = [...document.querySelectorAll('canvas')].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
    }));
    return {
      phase,
      elapsedMs: performance.now(),
      jsHeap: memory
        ? {
            usedBytes: memory.usedJSHeapSize,
            allocatedBytes: memory.totalJSHeapSize,
            limitBytes: memory.jsHeapSizeLimit,
          }
        : null,
      canvases,
      estimatedDomCanvasRGBABytes: canvases.reduce(
        (bytes, canvas) => bytes + canvas.width * canvas.height * 4,
        0,
      ),
    };
  }, phase);
  return { ...canvasAndHeap, browserChildProcessMemory: await readBrowserProcessMemory() };
}

async function measurePlayback(page: Page, canvas: Locator) {
  const play = page.getByRole('button', { name: '再生', exact: true });
  await play.evaluate((button) => {
    const target = window as unknown as { releasePlaybackStarted?: number };
    button.addEventListener(
      'click',
      () => {
        target.releasePlaybackStarted = performance.now();
      },
      { once: true, capture: true },
    );
  });
  await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const target = window as unknown as {
      releasePlaybackStarted?: number;
      releasePlaybackSample: Promise<{
        firstFrameMs: number;
        changes: Array<{ frame: number; elapsedMs: number }>;
        intervalsMs: number[];
      }>;
    };
    target.releasePlaybackSample = new Promise((resolve, reject) => {
      const changes: Array<{ frame: number; elapsedMs: number }> = [];
      let lastPixels: number[][] = [];
      let handle = 0;
      const cleanup = () => {
        cancelAnimationFrame(handle);
        clearTimeout(timeout);
      };
      const tick = () => {
        if (target.releasePlaybackStarted !== undefined) {
          const view = JSON.parse(canvas.getAttribute('data-view-transform')!);
          const box = canvas.getBoundingClientRect();
          let visible = -1;
          lastPixels = [];
          for (let index = 0; index < 8; index++) {
            const x = Math.floor(
              (((40 + index * 32) * view.scale + view.offsetX) * canvas.width) / box.width,
            );
            const y = Math.floor(((72 * view.scale + view.offsetY) * canvas.height) / box.height);
            const pixel = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
            lastPixels.push([...pixel]);
            if (pixel[2] > 220 && pixel[0] < 40 && pixel[1] < 40) visible = index;
          }
          // Begin with frame zero, after the real play click, rather than the previous edit view.
          if (
            visible >= 0 &&
            (changes.length > 0 || visible === 0) &&
            changes.at(-1)?.frame !== visible
          ) {
            changes.push({
              frame: visible,
              elapsedMs: performance.now() - target.releasePlaybackStarted,
            });
            if (changes.length === 24) {
              cleanup();
              resolve({
                firstFrameMs: changes[0].elapsedMs,
                changes,
                intervalsMs: changes
                  .slice(1)
                  .map((change, index) => change.elapsedMs - changes[index].elapsedMs),
              });
              return;
            }
          }
        }
        handle = requestAnimationFrame(tick);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            '8コマ再生の実画素更新を24回観測できませんでした: ' +
              JSON.stringify({ changes, lastPixels }),
          ),
        );
      }, 10000);
      handle = requestAnimationFrame(tick);
    });
  });
  await play.click();
  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          releasePlaybackSample: Promise<{
            firstFrameMs: number;
            changes: Array<{ frame: number; elapsedMs: number }>;
            intervalsMs: number[];
          }>;
        }
      ).releasePlaybackSample,
  );
  await page.getByRole('button', { name: '停止', exact: true }).click();
  expect([...new Set(result.changes.map((change) => change.frame))].sort()).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7,
  ]);
  return { ...result, intervals: summarize(result.intervalsMs), requestedFrameMs: 125 };
}

for (const layers of [1, 2]) {
  test(`R06: 512px ${layers}レイヤー素材の描画・移動と保存・出力・メモリを計測する`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const initialStarted = Date.now();
    await page.goto('/');
    await expect(page.getByRole('button', { name: '作成', exact: true })).toBeVisible();
    const initialHomeMs = Date.now() - initialStarted;
    const memory = [await readMemory(page, 'home')];
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#555555';
      context.fillRect(0, 0, 512, 512);
      return canvas.toDataURL().split(',')[1];
    });
    const fixture = Buffer.from(png, 'base64');
    const importStarted = Date.now();
    await page.getByLabel('画像を取り込む').setInputFiles({
      name: 'r06-performance-512.png',
      mimeType: 'image/png',
      buffer: fixture,
    });
    await page.getByRole('dialog').getByRole('button', { name: '取り込みを確定' }).click();
    const canvas = page.getByLabel('アセットキャンバス');
    await expect(canvas).toBeVisible();
    const importMs = Date.now() - importStarted;
    let overlay: Buffer | undefined;
    if (layers === 2) {
      overlay = Buffer.from(
        await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          const context = canvas.getContext('2d')!;
          context.fillStyle = '#0000ff';
          context.fillRect(32, 64, 16, 16);
          return canvas.toDataURL().split(',')[1];
        }),
        'base64',
      );
      await page
        .getByLabel('画像レイヤーを追加', { exact: true })
        .setInputFiles({ name: 'overlay.png', mimeType: 'image/png', buffer: overlay });
      await page.getByRole('dialog').getByRole('button', { name: '取り込みを確定' }).click();
      await page
        .getByRole('list', { name: 'レイヤー一覧' })
        .getByRole('button', { name: 'overlay', exact: true })
        .click();
    }
    await expect(
      page.getByRole('list', { name: 'レイヤー一覧' }).getByRole('listitem'),
    ).toHaveCount(layers);
    memory.push(await readMemory(page, 'imported'));
    const toolbar = page.getByRole('navigation', { name: 'ツール', exact: true });
    await toolbar.getByRole('button', { name: 'ブラシ', exact: true }).click();
    await page.getByLabel('描画色').fill('#ff0000');
    await page.getByLabel('ブラシサイズ').fill('4');
    await expect(canvas).toHaveAttribute('data-raster-input-ready', 'true');
    const drawingPreview: number[] = [];
    const drawingCommit: number[] = [];
    for (let index = 0; index < 30; index++) {
      const point = { x: 128 + (index % 6) * 40, y: 128 + Math.floor(index / 6) * 40 };
      const position = await canvasWorldPoint(canvas, point.x, point.y);
      await page.mouse.move(position.x, position.y);
      await observeRedPixel(canvas, point, 'pointerdown');
      await page.mouse.down();
      drawingPreview.push(await readSample(page));
      await observeRedPixel(canvas, point, 'pointerup');
      await page.mouse.up();
      drawingCommit.push(await readSample(page));
      await expect(page.locator('.editor')).toHaveAttribute('aria-busy', 'false');
    }

    memory.push(await readMemory(page, 'drawn'));
    await toolbar.getByRole('button', { name: '選択', exact: true }).click();
    const movement: number[] = [];
    let offsetX = 0;
    for (let index = 0; index < 30; index++) {
      const nextOffsetX = offsetX === 0 ? 16 : 0;
      const start = await canvasWorldPoint(canvas, 248 + offsetX, 248);
      const end = await canvasWorldPoint(canvas, 248 + nextOffsetX, 248);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await observeRedPixel(canvas, { x: 128 + nextOffsetX, y: 128 }, 'pointermove');
      await page.mouse.move(end.x, end.y);
      movement.push(await readSample(page));
      await page.mouse.up();
      await expect(page.locator('.editor')).toHaveAttribute('aria-busy', 'false');
      offsetX = nextOffsetX;
    }
    const saveMs: number[] = [];
    let playback;
    if (layers === 2) {
      await page
        .getByRole('list', { name: 'レイヤー一覧' })
        .getByRole('button', { name: 'overlay', exact: true })
        .click();
      const frames = page.getByRole('list', { name: 'フレーム一覧' });
      for (let index = 0; index < 8; index++) {
        await page.getByLabel('X', { exact: true }).fill(String(index * 32));
        await page.getByLabel('X', { exact: true }).blur();
        await expect(page.locator('.editor')).toHaveAttribute('aria-busy', 'false');
        const started = Date.now();
        await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
        await expect(frames.getByRole('listitem')).toHaveCount(index + 1);
        await expect(page.locator('.editor-save-status')).toHaveText('保存済み');
        saveMs.push(Date.now() - started);
      }
      await page.getByLabel('新しいアニメーション名').fill('r06-performance');
      await page.getByRole('button', { name: '作成', exact: true }).click();
      await expect(page.getByLabel('fps', { exact: true })).toHaveValue('8');
      memory.push(await readMemory(page, 'eight-frames'));
      playback = await measurePlayback(page, canvas);
      memory.push(await readMemory(page, 'after-playback'));
    }
    const outputs = [];
    for (const [kind, name] of [
      ['backup', '.casproj をダウンロード'],
      ['png', 'PNG をダウンロード'],
    ] as const) {
      const started = Date.now();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name, exact: true }).click(),
      ]);
      const elapsedMs = Date.now() - started;
      const path = info.outputPath(`r06-${layers}-layers.${kind === 'backup' ? 'casproj' : 'png'}`);
      await download.saveAs(path);
      const bytes = await readFile(path);
      await info.attach(`r06-${kind}`, {
        path,
        contentType: kind === 'backup' ? 'application/zip' : 'image/png',
      });
      if (kind === 'backup') {
        const entries = unzipSync(bytes);
        const assets = Object.entries(entries).filter(([path]) =>
          /^assets\/[^/]+\/asset\.json$/.test(path),
        );
        expect(assets).toHaveLength(1);
        const asset = JSON.parse(new TextDecoder().decode(assets[0][1]));
        expect(asset.layers).toHaveLength(layers);
        if (layers === 2) {
          expect(asset.frames).toHaveLength(8);
          expect(asset.animations[0].frameIds).toHaveLength(8);
        }
      }
      outputs.push({
        kind,
        elapsedMs,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      memory.push(await readMemory(page, `after-${kind}`));
    }
    await page.getByRole('button', { name: '← ホーム', exact: true }).click();
    memory.push(await readMemory(page, 'returned-home'));
    const measurement = {
      kind: 'r06-input-to-canvas-buffer',
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      trackedChanges:
        execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
          encoding: 'utf8',
        }).trim() !== '',
      browser: info.project.name,
      browserVersion: page.context().browser()!.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      url: page.url(),
      viewport: page.viewportSize(),
      realDevice: false,
      fixture: {
        width: 512,
        height: 512,
        layers,
        frames: layers === 2 ? 8 : 0,
        overlaySha256: overlay ? createHash('sha256').update(overlay).digest('hex') : null,
        sha256: createHash('sha256').update(fixture).digest('hex'),
        rights: 'Generated original fixture',
      },
      intervals: {
        drawingPreview:
          'pointerdown capture to stroke overlay pixel observed in requestAnimationFrame; excludes driver',
        drawingCommit:
          'pointerup capture to committed red pixel observed in requestAnimationFrame; includes processing, atomic persistence and decode; excludes driver',
        movement:
          'pointermove capture during drag to moved red pixel observed in requestAnimationFrame; excludes driver and save wait',
      },
      initialHomeMs,
      importMs,
      save: saveMs.length ? summarize(saveMs) : null,
      playback: playback ?? null,
      outputs,
      memory,
      measurementNotes: {
        UIActions:
          'Home/import/frame-save/download intervals use driver-inclusive wall time; drawing/movement/playback use browser input and actual canvas pixels',
        memory:
          'JS heap is an approximate Chromium-only API; null means unavailable. DOM canvas RGBA bytes estimate attached canvases only. Linux RSS snapshots sum current children of the Playwright browser worker, excluding the Node worker; shared pages can be counted more than once, exited/reparented processes can be missed, and this is not a peak or physical-device memory.',
      },
      drawingPreview: summarize(drawingPreview),
      drawingCommit: summarize(drawingCommit),
      movement: summarize(movement),
      limitations: [
        'Cloud browser only',
        'Canvas buffer update is not physical display timing',
        'No iPhone memory or final release acceptance claim',
      ],
    };
    const evidencePath = info.outputPath('r06-input-performance.json');
    await writeFile(evidencePath, JSON.stringify(measurement, null, 2));
    await info.attach('r06-input-performance.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
    console.log(JSON.stringify(measurement));
  });
}
