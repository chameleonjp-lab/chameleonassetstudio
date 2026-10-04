import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { NativeTransformEvaluation } from '../tools/3d-edit-evaluation/main';

type EvaluationWindow = Window & { nativeTransformEvaluation: NativeTransformEvaluation };
const diagnostics = (page: Page) =>
  page.evaluate(
    () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.diagnostics,
  );
async function ready(page: Page) {
  await page.goto('/tools/3d-edit-evaluation/index.html');
  await expect.poll(async () => (await diagnostics(page)).framesRendered).toBeGreaterThan(0);
}
async function startDrag(page: Page) {
  const point = await page.evaluate(() =>
    (window as unknown as EvaluationWindow).nativeTransformEvaluation.handlePoint('X'),
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect.poll(async () => (await diagnostics(page)).active).toBe(true);
  await page.mouse.move(point.x + 65, point.y - 10, { steps: 8 });
  return point;
}

for (const projection of ['perspective', 'orthographic'] as const) {
  test(`${projection}: canvas CSS picking, pointer preview, atomic commit and numeric equivalence`, async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole('combobox', { name: 'Projection', exact: true }).selectOption(projection);
    const right = await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.projectPoint('right-node'),
    );
    await page.mouse.click(right.x, right.y);
    await expect.poll(async () => (await diagnostics(page)).selection).toEqual(['right-node']);
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const initial = await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
    );
    const camera = (await diagnostics(page)).camera;
    await startDrag(page);
    expect(await diagnostics(page)).toMatchObject({
      revision: 0,
      commits: 0,
      dirty: false,
      captures: 1,
      orbitEnabled: false,
    });
    expect((await diagnostics(page)).camera).toEqual(camera);
    expect(
      await page.evaluate(
        () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
      ),
    ).toEqual(initial);
    const preview = await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.preview,
    );
    expect(preview.nodes[0].transform).not.toEqual(initial.nodes[0].transform);
    await page.mouse.up();
    expect(await diagnostics(page)).toMatchObject({
      revision: 1,
      commits: 1,
      active: false,
      captures: 0,
      orbitEnabled: true,
    });
    const committed = await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
    );
    const delta = committed.nodes[0].transform.translation.map(
      (v, i) => v - initial.nodes[0].transform.translation[i],
    );
    expect(delta[0] / 0.5).toBeCloseTo(Math.round(delta[0] / 0.5), 8);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(
      (
        await page.evaluate(
          () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
        )
      ).nodes,
    ).toEqual(initial.nodes);
    await page.getByRole('button', { name: 'Begin numeric', exact: true }).click();
    for (const [index, id] of ['dx', 'dy', 'dz'].entries())
      await page.locator(`#${id}`).fill(String(delta[index]));
    await page.getByRole('button', { name: 'Preview delta', exact: true }).click();
    await page.getByRole('button', { name: 'Commit once', exact: true }).click();
    const numeric = await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
    );
    numeric.nodes[0].transform.translation.forEach((value, index) =>
      expect(value).toBeCloseTo(committed.nodes[0].transform.translation[index], 8),
    );
    const png = await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.capture(),
    );
    expect(png.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const imagePath = test.info().outputPath(`native-transform-${projection}.png`);
    await writeFile(imagePath, Buffer.from(png));
    await test
      .info()
      .attach(`native-transform-${projection}.png`, { path: imagePath, contentType: 'image/png' });
  });

  for (const mode of ['rotate', 'scale'] as const) {
    test(`${projection}: ${mode} pointer and numeric paths share one snapped result`, async ({
      page,
    }) => {
      await ready(page);
      await page
        .getByRole('combobox', { name: 'Projection', exact: true })
        .selectOption(projection);
      await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption(mode);
      await page
        .getByRole('combobox', { name: 'Space', exact: true })
        .selectOption(mode === 'rotate' ? 'local' : 'world');
      await page
        .getByLabel('Snap increment', { exact: true })
        .fill(mode === 'rotate' ? String(Math.PI / 12) : '0.25');
      await page.getByLabel('Snap increment', { exact: true }).blur();
      const camera = (await diagnostics(page)).camera;
      await startDrag(page);
      expect(await diagnostics(page)).toMatchObject({ revision: 0, commits: 0, dirty: false });
      expect((await diagnostics(page)).camera).toEqual(camera);
      await page.mouse.up();
      expect(await diagnostics(page)).toMatchObject({ revision: 1, commits: 1 });
      const pointer = await page.evaluate(
        () =>
          (window as unknown as EvaluationWindow).nativeTransformEvaluation.project.nodes[0]
            .transform,
      );
      const delta: [number, number, number] =
        mode === 'scale'
          ? pointer.scale
          : [2 * Math.atan2(pointer.rotation[0], pointer.rotation[3]), 0, 0];
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      const numeric = await page.evaluate((input) => {
        const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
        e.begin();
        const preview = e.update(input);
        const commit = e.commit();
        return { preview, commit, transform: e.project.nodes[0].transform };
      }, delta);
      expect(numeric.preview).toEqual({ ok: true });
      expect(numeric.commit).toEqual({ ok: true, changed: true });
      numeric.transform.translation.forEach((value, index) =>
        expect(value).toBeCloseTo(pointer.translation[index], 8),
      );
      numeric.transform.scale.forEach((value, index) =>
        expect(value).toBeCloseTo(pointer.scale[index], 8),
      );
      const dot = numeric.transform.rotation.reduce(
        (sum, value, index) => sum + value * pointer.rotation[index],
        0,
      );
      expect(Math.abs(dot)).toBeCloseTo(1, 8);
    });
  }
}

test('multi-selection uses the active pivot and rejects parent/descendant ambiguity', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole('button', { name: 'Right box', exact: true })
    .click({ modifiers: ['Shift'] });
  expect((await diagnostics(page)).selection).toEqual(['box-node', 'right-node']);
  const result = await page.evaluate(() => {
    const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
    e.begin();
    e.update([0.6, 0, 0]);
    return { commit: e.commit(), project: e.project };
  });
  expect(result.commit).toEqual({ ok: true, changed: true });
  expect(result.project.nodes[0].transform.translation[0]).toBeCloseTo(-0.75);
  expect(result.project.nodes[2].transform.translation[0]).toBeCloseTo(1.75);
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await page
    .getByRole('button', { name: 'Right box', exact: true })
    .click({ modifiers: ['Shift'] });
  expect(
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.begin(),
    ),
  ).toMatchObject({ ok: false });
  expect((await diagnostics(page)).revision).toBe(1);
});

test('Escape, cancel, pointer cancellation and second touch never create a history entry', async ({
  page,
}) => {
  await ready(page);
  for (const reason of [
    'Escape',
    'explicit',
    'pointercancel',
    'lostpointercapture',
    'second pointer',
  ] as const) {
    const point = await startDrag(page);
    if (reason === 'Escape') await page.keyboard.press('Escape');
    else if (reason === 'explicit')
      await page.evaluate(() =>
        (window as unknown as EvaluationWindow).nativeTransformEvaluation.cancel(),
      );
    else
      await page.evaluate((kind) => {
        const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
        const canvas = document.querySelector('#viewport canvas') as HTMLCanvasElement;
        const pointerId = e.diagnostics.pointerId!;
        if (kind === 'lostpointercapture') canvas.releasePointerCapture(pointerId);
        else
          canvas.dispatchEvent(
            new PointerEvent(kind === 'second pointer' ? 'pointerdown' : 'pointercancel', {
              pointerId: kind === 'second pointer' ? pointerId + 1 : pointerId,
              pointerType: 'touch',
              button: 0,
              bubbles: true,
            }),
          );
      }, reason);
    // releasePointerCapture changes the pending target; a real pointer event processes it.
    if (reason === 'lostpointercapture') await page.mouse.move(point.x + 66, point.y - 10);
    await expect
      .poll(async () => (await diagnostics(page)).active, {
        message: `${reason} should cancel before pointerup`,
      })
      .toBe(false);
    if (reason === 'lostpointercapture')
      expect((await diagnostics(page)).reason).toBe('lostpointercapture');
    await page.mouse.up();
    expect(await diagnostics(page)).toMatchObject({
      revision: 0,
      commits: 0,
      canUndo: false,
      captures: 0,
      orbitEnabled: true,
    });
  }
});

test('mode/selection/project changes, hidden/freeze/pagehide, context loss and disposal cancel previews', async ({
  page,
}) => {
  await ready(page);
  for (const reason of [
    'mode',
    'selection',
    'hidden',
    'freeze',
    'pagehide',
    'context',
    'project',
    'dispose',
  ] as const) {
    await page.evaluate(() => {
      const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
      e.begin();
      e.update([2, 0, 0]);
    });
    await page.evaluate((kind) => {
      const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
      if (kind === 'mode') e.configure({ options: { mode: 'rotate', space: 'world', snap: 0.5 } });
      if (kind === 'selection') e.configure({ selection: ['right-node'], activeId: 'right-node' });
      if (kind === 'hidden') e.hidden(true);
      if (kind === 'freeze') e.frozen(true);
      if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'));
      if (kind === 'context' && !e.contextLoss()) throw new Error('WEBGL_lose_context unavailable');
      if (kind === 'project') e.swap();
      if (kind === 'dispose') e.dispose();
    }, reason);
    await expect.poll(async () => (await diagnostics(page)).active).toBe(false);
    expect((await diagnostics(page)).revision).toBe(0);
    if (reason === 'context')
      await expect.poll(async () => (await diagnostics(page)).contextRestores).toBeGreaterThan(0);
    await page.evaluate(() => {
      const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
      e.hidden(false);
      e.frozen(false);
      window.dispatchEvent(new Event('pageshow'));
      e.remount();
    });
    await expect.poll(async () => (await diagnostics(page)).pendingFrames).toBe(0);
  }
});

test('snapshot barriers, invalid final samples, lock/read-only, keyboard and IME preserve canonical data', async ({
  page,
}) => {
  await ready(page);
  const guarded = await page.evaluate(async () => {
    const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
    e.begin();
    e.update([2, 0, 0]);
    const pngBlocked = await e.capture().then(
      () => false,
      () => true,
    );
    const saved = e.save(),
      lateCommit = e.commit();
    e.begin();
    e.update([3, 0, 0]);
    const suspended = e.suspend();
    e.resume();
    e.begin();
    e.update([1, 0, 0]);
    const invalid = e.update([NaN, 0, 0]),
      invalidCommit = e.commit();
    return { pngBlocked, saved, lateCommit, suspended, invalid, invalidCommit };
  });
  expect(guarded.pngBlocked).toBe(true);
  expect(guarded.saved.revision).toBe(0);
  expect(guarded.suspended.nodes).toEqual(guarded.saved.nodes);
  expect(guarded.lateCommit).toMatchObject({ ok: false });
  expect(guarded.invalidCommit).toMatchObject({ ok: false });
  expect((await diagnostics(page)).revision).toBe(0);
  for (const name of ['Read only', 'Lock active node']) {
    await page.getByLabel(name, { exact: true }).check();
    expect(
      await page.evaluate(() =>
        (window as unknown as EvaluationWindow).nativeTransformEvaluation.begin(),
      ),
    ).toMatchObject({ ok: false });
    await page.getByLabel(name, { exact: true }).uncheck();
  }
  await page.getByLabel('Lock active node', { exact: true }).check();
  await page.getByRole('button', { name: 'Right box', exact: true }).click();
  await expect(page.getByLabel('Lock active node', { exact: true })).not.toBeChecked();
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('rotate');
  expect(
    await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.settings.lockedIds,
    ),
  ).toEqual(['box-node']);
  await page.getByLabel('Lock active node', { exact: true }).check();
  expect(
    await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.settings.lockedIds,
    ),
  ).toEqual(['box-node', 'right-node']);
  await page.getByLabel('Lock active node', { exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('translate');
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await expect(page.getByLabel('Lock active node', { exact: true })).toBeChecked();
  await page.getByLabel('Lock active node', { exact: true }).uncheck();
  await page.locator('#viewport canvas').focus();
  await page.keyboard.press('ArrowRight');
  expect((await diagnostics(page)).revision).toBe(1);
  await page.getByRole('button', { name: 'Begin numeric', exact: true }).click();
  await page.locator('#dx').dispatchEvent('compositionstart');
  expect(
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.commit(),
    ),
  ).toMatchObject({ ok: false });
  await page.locator('#dx').dispatchEvent('compositionend');
  expect((await diagnostics(page)).revision).toBe(1);
});

test('world-scale proxy exposes world axes but rejects unrepresentable shear', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const e = (window as unknown as EvaluationWindow).nativeTransformEvaluation;
    e.configure({ options: { mode: 'rotate', space: 'local', snap: null } });
    e.begin();
    e.update([0, 0, Math.PI / 4]);
    e.commit();
    const before = e.project;
    e.configure({ options: { mode: 'scale', space: 'world', snap: null } });
    e.begin();
    const invalid = e.update([2, 1, 1]);
    const commit = e.commit();
    return { before, after: e.project, invalid, commit };
  });
  expect(result.invalid).toMatchObject({ ok: false });
  expect(result.commit).toMatchObject({ ok: false });
  expect(result.after).toEqual(result.before);
});

test('375px numeric controls perform an edit and cancellation without a hover target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  await page.getByRole('button', { name: 'Right box', exact: true }).click();
  await page.getByRole('button', { name: 'Begin numeric', exact: true }).click();
  await page.locator('#dx').fill('1.1');
  await page.getByRole('button', { name: 'Preview delta', exact: true }).click();
  expect(await diagnostics(page)).toMatchObject({ revision: 0, active: true });
  await page.getByRole('button', { name: 'Commit once', exact: true }).click();
  expect(await diagnostics(page)).toMatchObject({ revision: 1, active: false });
  const committed = await page.evaluate(
    () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
  );
  expect(committed.nodes[2].transform.translation[0]).toBeCloseTo(2.25);
  await page.getByRole('button', { name: 'Begin numeric', exact: true }).click();
  await page.locator('#dx').fill('4');
  await page.getByRole('button', { name: 'Preview delta', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel transform', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as EvaluationWindow).nativeTransformEvaluation.project,
    ),
  ).toEqual(committed);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const imagePath = test.info().outputPath('native-transform-mobile-controls.png');
  await page.screenshot({ path: imagePath, fullPage: true });
  await test.info().attach('native-transform-mobile-controls.png', {
    path: imagePath,
    contentType: 'image/png',
  });
});

test('repeated mounts return helpers, captures, listeners, canvases and scheduled frames to baseline', async ({
  page,
}) => {
  await ready(page);
  const initial = await diagnostics(page);
  for (let i = 0; i < 5; i++) {
    await startDrag(page);
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.dispose(),
    );
    await page.mouse.up();
    expect(await diagnostics(page)).toMatchObject({
      disposed: true,
      active: false,
      helperGeometries: 0,
      helperMaterials: 0,
      helperObjects: 0,
      listeners: 0,
      captures: 0,
      mainListeners: 0,
      resizeObservers: 0,
      pendingFrames: 0,
      pendingContextTimers: 0,
      nativeGeometries: 0,
      nativeMaterials: 0,
      canvases: 0,
      renderers: 0,
      revision: 0,
    });
    await page.evaluate(() =>
      (window as unknown as EvaluationWindow).nativeTransformEvaluation.remount(),
    );
    await expect(page.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue(
      'translate',
    );
    await expect(page.getByRole('combobox', { name: 'Projection', exact: true })).toHaveValue(
      'perspective',
    );
    await expect(page.getByLabel('Read only', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Lock active node', { exact: true })).not.toBeChecked();
    await expect.poll(async () => (await diagnostics(page)).pendingFrames).toBe(0);
    expect(await diagnostics(page)).toMatchObject({
      helperGeometries: initial.helperGeometries,
      helperMaterials: initial.helperMaterials,
      listeners: initial.listeners,
      mainListeners: initial.mainListeners,
      resizeObservers: 1,
      canvases: 1,
      renderers: 1,
    });
  }
  await test.info().attach('native-transform-lifecycle.json', {
    body: Buffer.from(JSON.stringify(await diagnostics(page), null, 2)),
    contentType: 'application/json',
  });
});
