import { expect, test, type Locator, type Page } from '@playwright/test';
import type { PanelHarness } from './fixtures/native-panel';
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { panelHarness: PanelHarness }).panelHarness.ports);

test('PNG capture synchronizes the committed revision before the passive display effect', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Increment and capture in layout' }).click();
  await expect.poll(async () => (await state(page))[0].captures).toEqual([1]);
});

test('late factories dispose detached old hosts without replacing the new project', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?delay');
  await expect.poll(async () => (await state(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await expect.poll(async () => (await state(page)).length).toBe(2);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.resolve(0),
  );
  await expect.poll(async () => (await state(page))[0].disposed).toBe(true);
  expect((await state(page))[0].connected).toBe(false);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.resolve(1),
  );
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  expect((await state(page))[1]).toMatchObject({ disposed: false, connected: true, revision: 0 });
});

test('save failure prevents GPU suspension and preserves the view', async ({ page }) => {
  await page.goto('/e2e/fixtures/native-panel.html');
  await expect(page.getByRole('button', { name: '保存してGPU表示を休止' })).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle save failure' }).click();
  await page.getByRole('button', { name: '保存してGPU表示を休止' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await state(page))[0]).toMatchObject({ disposed: false, suspends: 0 });
  await page.getByRole('button', { name: 'Toggle save failure' }).click();
  await page.getByRole('button', { name: '保存してGPU表示を休止' }).click();
  await expect(page.getByRole('button', { name: 'GPU表示を再開' })).toBeEnabled();
  expect((await state(page))[0].suspends).toBe(1);
});

test('a throwing synchronization port is disposed and leaves a retry control', async ({ page }) => {
  await page.goto('/e2e/fixtures/native-panel.html');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle sync failure' }).click();
  await page.getByRole('button', { name: 'Increment and capture in layout' }).click();
  await expect(page.getByRole('button', { name: '3D表示を再試行' })).toBeVisible();
  await expect(page.locator('.native-viewport-panel')).not.toContainText('Fixture sync failed');
  await expect(page.locator('.native-viewport-reason').first()).toContainText('原因を特定できず');
  expect((await state(page))[0].disposed).toBe(true);
  await page.getByRole('button', { name: 'Toggle sync failure' }).click();
  await page.getByRole('button', { name: '3D表示を再試行' }).click();
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
});

test('a newer edit during save cannot authorize disposal of an older saved revision', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?save-delay');
  await expect(page.getByRole('button', { name: '保存してGPU表示を休止' })).toBeEnabled();
  await page.getByRole('button', { name: '保存してGPU表示を休止' }).click();
  await expect(
    page.getByText('操作中です。完了するまでこのタブを開いておいてください。'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Increment and capture in layout' }).click();
  await expect.poll(async () => (await state(page))[0].revision).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.finishSave(),
  );
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await state(page))[0]).toMatchObject({ disposed: false, suspends: 0, revision: 1 });
});

test('numeric camera draft rejects blanks and IME composition without mutating the port', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  const x = page.getByLabel('カメラ位置 X', { exact: true });
  await expect(x).toHaveValue('3');
  await x.fill('');
  await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('空欄は適用できません');
  expect((await state(page))[0].cameraWrites).toBe(0);
  await x.fill('0');
  await page.getByLabel('カメラ位置 Y', { exact: true }).fill('0');
  await page.getByLabel('カメラ位置 Z', { exact: true }).fill('0');
  await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('別の位置に');
  expect((await state(page))[0].cameraWrites).toBe(0);
  await x.fill('4');
  await x.dispatchEvent('compositionstart');
  await page.getByRole('button', { name: '数値カメラを適用', exact: true }).click();
  expect((await state(page))[0].cameraWrites).toBe(0);
  await x.dispatchEvent('compositionend');
  const apply = page.getByRole('button', { name: '数値カメラを適用', exact: true });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(apply).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await state(page))[0].cameraWrites).toBe(2);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  await expect(x).toHaveValue('3');
});

test('editing preview rejects PNG without silently cancelling or encoding it', async ({ page }) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.preview(),
    ),
  ).toEqual({ ok: true });
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '操作を完了できませんでした' }),
  ).toBeVisible();
  expect((await state(page))[0].captures).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { panelHarness: PanelHarness }).panelHarness.editing?.active,
    ),
  ).toBe(true);
});

test('same-revision editing changes fence a delayed PNG before download', async ({ page }) => {
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.goto('/e2e/fixtures/native-panel.html?editing&capture-delay');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  await expect.poll(async () => (await state(page))[0].capturePending).toBe(true);
  await page.evaluate(() => {
    const api = (window as unknown as { panelHarness: PanelHarness }).panelHarness;
    api.clearSelection();
    api.finishCapture();
  });
  await expect(
    page.getByRole('alert').filter({ hasText: '操作を完了できませんでした' }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
  expect((await state(page))[0].revision).toBe(0);
});

test('same-project binding replacement cancels the old owner without rebuilding the port', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const api = (window as unknown as { panelHarness: PanelHarness }).panelHarness;
    api.preview();
    api.replaceBinding();
  });
  await expect.poll(async () => (await state(page))[0].bindings).toBe(2);
  expect((await state(page)).length).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.commitLast(),
    ),
  ).toMatchObject({ ok: false });
  expect((await state(page))[0]).toMatchObject({ revision: 0, disposed: false });
});

test('GPU suspension cancels preview before delayed saving and releases the numeric block afterward', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing&save-delay');
  await expect(
    page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.preview(),
  );
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(
    page.getByText('操作中です。完了するまでこのタブを開いておいてください。'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { panelHarness: PanelHarness }).panelHarness.editing?.active,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.preview(),
    ),
  ).toMatchObject({ ok: false });
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.finishSave(),
  );
  await expect(page.getByRole('button', { name: 'GPU表示を再開', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.preview(),
    ),
  ).toEqual({ ok: true });
});

test('selection-only authoring does not rerender for invalid and valid pointer preview samples', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  const counts = await page.evaluate(async () => {
    const api = (window as unknown as { panelHarness: PanelHarness }).panelHarness;
    api.preview();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const before = api.authorRenders;
    await api.samples(25);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { before, after: api.authorRenders, active: api.editing?.active };
  });
  expect(counts.before).toBeGreaterThan(0);
  expect(counts.after).toBe(counts.before);
  expect(counts.active).toBe(true);
});

test('a view-only provider cannot silently accept product editing', async ({ page }) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing&missing-binding');
  await expect(page.getByRole('button', { name: '3D表示を再試行', exact: true })).toBeVisible();
  expect((await state(page))[0].disposed).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.preview(),
    ),
  ).toEqual({ ok: true });
});

test('rig pose binding replacement cancels the old preview and PNG blocks new poses until encoding ends', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing&rig-pose&capture-delay');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  const rigState = () =>
    page.evaluate(() => (window as unknown as { panelHarness: PanelHarness }).panelHarness.rigPose);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewRig(),
  );
  expect((await rigState())!.active).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.replaceBinding(),
  );
  await expect.poll(async () => (await rigState())?.active).toBe(false);
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  await expect.poll(async () => (await state(page))[0].capturePending).toBe(true);
  const result = await page.evaluate(() => {
    try {
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewRig();
      return 'accepted';
    } catch {
      return 'blocked';
    }
  });
  expect(result).toBe('blocked');
  const download = page.waitForEvent('download');
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.finishCapture(),
  );
  await download;
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewRig(),
    ),
  ).toMatchObject({ ok: true });
});

test('animation binding and delayed PNG preserve canonical captures and reject intervening previews', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing&animation&capture-delay');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  const animation = () =>
    page.evaluate(
      () => (window as unknown as { panelHarness: PanelHarness }).panelHarness.animation,
    );
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewAnimation(),
    ),
  ).toMatchObject({ ok: true });
  expect((await animation())!.active).toBe(true);
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.replaceBinding(),
  );
  await expect.poll(async () => (await animation())?.active).toBe(false);
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  await expect.poll(async () => (await state(page))[0].capturePending).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewAnimation(),
    ),
  ).toMatchObject({ ok: false });
  const download = page.waitForEvent('download');
  await page.evaluate(() =>
    (window as unknown as { panelHarness: PanelHarness }).panelHarness.finishCapture(),
  );
  await download;
  expect(
    await page.evaluate(() =>
      (window as unknown as { panelHarness: PanelHarness }).panelHarness.previewAnimation(),
    ),
  ).toMatchObject({ ok: true });
});

// Synthetic dispatch proves cancellation/propagation, not physical IME ordering or trusted clicks.
async function cameraCompositionKey(
  target: Locator,
  key: 'Enter' | 'Escape',
  signal: 'native' | '229' | 'none',
) {
  return target.evaluate(
    (element, { key, signal }) => {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        isComposing: signal === 'native',
      });
      if (signal === '229') Object.defineProperty(event, 'keyCode', { value: 229 });
      let reachedDocument = false;
      const observe = () => {
        reachedDocument = true;
      };
      document.addEventListener('keydown', observe);
      try {
        element.dispatchEvent(event);
        return { prevented: event.defaultPrevented, reachedDocument };
      } finally {
        document.removeEventListener('keydown', observe);
      }
    },
    { key, signal },
  );
}

test('numeric camera separates final composition keys from ordinary button activation', async ({
  page,
}) => {
  await page.goto('/e2e/fixtures/native-panel.html?editing');
  await expect(page.getByRole('button', { name: 'PNG画像を保存', exact: true })).toBeEnabled();
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  const x = page.getByLabel('カメラ位置 X', { exact: true });
  const apply = page.getByRole('button', { name: '数値カメラを適用', exact: true });
  await x.fill('4');
  const before = await page.evaluate(
    () => (window as unknown as { panelHarness: PanelHarness }).panelHarness.editing,
  );
  expect(before).not.toBeNull();
  const beforePort = (await state(page))[0];
  await apply.focus();
  for (const signal of ['native', '229'] as const) {
    expect(await cameraCompositionKey(apply, 'Enter', signal)).toEqual({
      prevented: true,
      reachedDocument: false,
    });
    expect(await cameraCompositionKey(apply, 'Escape', signal)).toEqual({
      prevented: false,
      reachedDocument: false,
    });
    await expect(apply).toBeFocused();
    expect((await state(page))[0].cameraWrites).toBe(beforePort.cameraWrites);
  }
  await x.dispatchEvent('compositionstart');
  expect(await cameraCompositionKey(apply, 'Enter', 'none')).toEqual({
    prevented: true,
    reachedDocument: false,
  });
  expect(await cameraCompositionKey(x, 'Enter', 'none')).toEqual({
    prevented: false,
    reachedDocument: false,
  });
  expect(await cameraCompositionKey(x, 'Escape', 'none')).toEqual({
    prevented: false,
    reachedDocument: false,
  });
  await x.dispatchEvent('compositionend');
  expect(await cameraCompositionKey(apply, 'Escape', 'none')).toEqual({
    prevented: false,
    reachedDocument: true,
  });
  expect(await cameraCompositionKey(apply, 'Enter', 'none')).toEqual({
    prevented: false,
    reachedDocument: true,
  });
  await apply.press('Enter');
  await expect
    .poll(async () => (await state(page))[0].cameraWrites)
    .toBe(beforePort.cameraWrites + 1);
  await expect(apply).toBeFocused();
  expect((await state(page))[0].revision).toBe(beforePort.revision);
  expect(
    await page.evaluate(
      () => (window as unknown as { panelHarness: PanelHarness }).panelHarness.editing,
    ),
  ).toEqual(before);
});
