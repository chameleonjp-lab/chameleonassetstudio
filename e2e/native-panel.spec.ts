import { expect, test, type Page } from '@playwright/test';
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
