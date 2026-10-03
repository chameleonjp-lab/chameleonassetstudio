import { expect, test, type Page } from '@playwright/test';
import type { NativeEvaluation } from '../tools/3d-evaluation/main';

type EvaluationWindow = Window & { nativeEvaluation: NativeEvaluation };
const diagnostics = (page: Page) =>
  page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.diagnostics);
const capture = (page: Page) =>
  page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.capture());
async function ready(page: Page) {
  await page.goto('/tools/3d-evaluation/index.html');
  await expect.poll(async () => (await diagnostics(page)).state).toBe('active');
  await expect.poll(async () => (await diagnostics(page)).framesRendered).toBeGreaterThan(0);
}

test('native geometry actually renders, camera interacts, and loss/rebuild retains the view', async ({
  page,
}) => {
  await ready(page);
  const initial = await diagnostics(page);
  const originalPng = await capture(page);
  expect(originalPng.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pixels = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      center: [...context.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data],
      corner: [...context.getImageData(0, 0, 1, 1).data],
    };
  }, originalPng);
  expect(pixels.center).not.toEqual(pixels.corner);
  expect(pixels.center[3]).toBe(255);
  await test
    .info()
    .attach('native-box.png', { body: Buffer.from(originalPng), contentType: 'image/png' });

  const box = await page.locator('#viewport canvas').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 75, box!.y + box!.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  expect((await diagnostics(page)).camera.position).not.toEqual(initial.camera.position);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const reset = await diagnostics(page);
  reset.camera.position.forEach((value, index) =>
    expect(value).toBeCloseTo(initial.camera.position[index], 8),
  );

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 60, box!.y + box!.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  const chosenCamera = (await diagnostics(page)).camera;
  await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.edit());
  (await diagnostics(page)).camera.position.forEach((value, index) =>
    expect(value).toBeCloseTo(chosenCamera.position[index], 8),
  );
  const beforeLoss = await capture(page);

  expect(
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeEvaluation.contextLoss(),
    ),
  ).toBe(true);
  await expect.poll(async () => (await diagnostics(page)).contextRestores).toBeGreaterThan(0);
  await expect.poll(async () => (await diagnostics(page)).state).toBe('active');
  const recoveredPng = await capture(page);
  expect(Buffer.from(recoveredPng)).toEqual(Buffer.from(beforeLoss));
  await test.info().attach('native-box-after-context-restore.png', {
    body: Buffer.from(recoveredPng),
    contentType: 'image/png',
  });
});

test('hidden/frozen stop frames, GPU pause requires saved data, repeated disposal releases ownership', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.hidden(true));
  const hidden = await diagnostics(page);
  await page.waitForTimeout(120); // Observation window, not initialization readiness.
  expect((await diagnostics(page)).framesRendered).toBe(hidden.framesRendered);
  expect(hidden.pendingFrames).toBe(0);
  await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.hidden(false));
  await expect
    .poll(async () => (await diagnostics(page)).framesRendered)
    .toBeGreaterThan(hidden.framesRendered);
  await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.frozen(true));
  const frozen = await diagnostics(page);
  await page.waitForTimeout(120);
  expect((await diagnostics(page)).framesRendered).toBe(frozen.framesRendered);
  await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.frozen(false));

  expect(
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeEvaluation.suspend(null),
    ),
  ).toMatchObject({ ok: false });
  expect((await diagnostics(page)).renderers).toBe(1);
  const before = await capture(page);
  expect(
    await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.suspend()),
  ).toEqual({ ok: true });
  expect(await diagnostics(page)).toMatchObject({
    state: 'suspended',
    renderers: 0,
    contexts: 0,
    geometries: 0,
    materials: 0,
    controls: 0,
    canvases: 0,
    pendingFrames: 0,
  });
  expect(
    await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.resume()),
  ).toEqual({ ok: true });
  expect(Buffer.from(await capture(page))).toEqual(Buffer.from(before));

  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: 'Swap project', exact: true }).click();
    const state = await diagnostics(page);
    expect(state.renderers).toBe(1);
    expect(state.geometries).toBeGreaterThan(0);
    await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.dispose());
    expect(await diagnostics(page)).toMatchObject({
      state: 'disposed',
      renderers: 0,
      geometries: 0,
      materials: 0,
      controls: 0,
      canvases: 0,
      listeners: 0,
      resizeObservers: 0,
      pendingFrames: 0,
    });
    await page.evaluate(() => (window as unknown as EvaluationWindow).nativeEvaluation.remount());
  }
  await test.info().attach('native-lifecycle.json', {
    body: Buffer.from(JSON.stringify(await diagnostics(page), null, 2)),
    contentType: 'application/json',
  });
});

test('WebGL2 unavailable is explicit and does not initialize a renderer', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (args[0] === 'webgl2') return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/tools/3d-evaluation/index.html');
  await expect.poll(async () => (await diagnostics(page)).state).toBe('unavailable');
  expect(await diagnostics(page)).toMatchObject({
    renderers: 0,
    contexts: 0,
    geometries: 0,
    materials: 0,
    controls: 0,
    pendingFrames: 0,
  });
});

test('candidate dependencies stay outside product entry requests', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  for (const path of ['/', '/2d/', '/3d/']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(
    requested.filter((url) =>
      /three(?:\.js|\.module|_addons)|3d-evaluation|OrbitControls/.test(url),
    ),
  ).toEqual([]);
});
