import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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

test('R06: 512px素材の描画確定・ドラッグ移動を実入力から30回ずつ計測する', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#555555';
    context.fillRect(0, 0, 512, 512);
    return canvas.toDataURL().split(',')[1];
  });
  const fixture = Buffer.from(png, 'base64');
  await page.getByLabel('画像を取り込む').setInputFiles({
    name: 'r06-performance-512.png',
    mimeType: 'image/png',
    buffer: fixture,
  });
  await page.getByRole('dialog').getByRole('button', { name: '取り込みを確定' }).click();
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
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

  await toolbar.getByRole('button', { name: '選択', exact: true }).click();
  const movement: number[] = [];
  let offsetX = 0;
  for (let index = 0; index < 30; index++) {
    const nextOffsetX = offsetX === 0 ? 16 : 0;
    const start = await canvasWorldPoint(canvas, 256 + offsetX, 256);
    const end = await canvasWorldPoint(canvas, 256 + nextOffsetX, 256);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await observeRedPixel(canvas, { x: 128 + nextOffsetX, y: 128 }, 'pointermove');
    await page.mouse.move(end.x, end.y);
    movement.push(await readSample(page));
    await page.mouse.up();
    await expect(page.locator('.editor')).toHaveAttribute('aria-busy', 'false');
    offsetX = nextOffsetX;
  }
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
      layers: 1,
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
    drawingPreview: summarize(drawingPreview),
    drawingCommit: summarize(drawingCommit),
    movement: summarize(movement),
    limitations: [
      'Cloud browser only',
      'Canvas buffer update is not physical display timing',
      'No iPhone memory or final release acceptance claim',
    ],
  };
  await info.attach('r06-input-performance.json', {
    body: JSON.stringify(measurement, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify(measurement));
});
