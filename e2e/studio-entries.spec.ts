import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Fresh browser contexts and observed requests, never a warm-cache timing proxy.
test('lightweight hub opens a separate noopener 3D tab and preserves 2D discovery', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '作りたい素材を選ぶ' })).toBeVisible();
  await expect(
    page.getByText('これまで保存した2Dプロジェクトも、こちらから開けます。'),
  ).toBeVisible();
  expect(
    requests.filter((url) => /core3d|editor3d|EditorScreen|imageOps|node_modules.*react/.test(url)),
  ).toEqual([]);
  const link = page.getByRole('link', { name: '3Dを新しいタブで開く' });
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const opened = context.waitForEvent('page');
  await link.click();
  const three = await opened;
  await expect(three.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  expect(await three.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: '2Dを開く', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chameleon Asset Studio' })).toBeVisible();
  expect(requests.filter((url) => /core3d|editor3d/.test(url))).toEqual([]);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '作りたい素材を選ぶ' })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('プロジェクト名')).toBeVisible();
});

test('blocked activation leaves the hub and a selectable URL; repeated clicks do not double-open', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '3Dを新しいタブで開く' }).evaluate((element) => {
    element.addEventListener('click', (event) => event.preventDefault());
  });
  await page.getByRole('link', { name: '3Dを新しいタブで開く' }).click();
  await page.getByText('3Dが開かないとき', { exact: true }).click();
  await expect(page.getByLabel('3DのURL')).toHaveValue(/\/3d\/$/);
  expect(context.pages()).toHaveLength(1);
  await page.reload();
  const popup = context.waitForEvent('page');
  await page.getByRole('link', { name: '3Dを新しいタブで開く' }).dblclick();
  const three = await popup;
  await expect(three.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  expect(context.pages()).toHaveLength(2);
});

test('3D cold shell does not request the 2D domain and keeps narrow screens usable', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/3d/');
  await expect(page.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  expect(
    requests.filter((url) =>
      /\/src\/(core\/|features\/(home|editor)\/|workers\/)|EditorScreen|imageOps/.test(url),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('3d-shell-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '3Dプロジェクト', exact: true })).toBeVisible();
  await page.goto('/');
  await test.info().attach('hub-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});

test('production graph identifies every domain and has no cross-domain chunk fetch', async ({
  page,
  request,
}) => {
  // Build evidence is served by the production quality configuration; dev has no output manifest.
  test.skip(
    !String(test.info().project.use.baseURL).includes(':4176'),
    'Built manifest is checked in the production quality run',
  );
  const response = await request.get('/domain-bundles.json');
  expect(response.ok()).toBe(true);
  const audit = (await response.json()) as Record<string, { files: string[]; modules: string[] }>;
  expect(Object.keys(audit).sort()).toEqual(['2d', '3d', 'hub']);
  for (const domain of ['hub', '2d', '3d']) {
    const loaded: string[] = [];
    const listener = (request: { url(): string }) =>
      loaded.push(new URL(request.url()).pathname.slice(1));
    page.on('request', listener);
    await page.goto(domain === 'hub' ? '/' : `/${domain}/`);
    await expect(page.locator('h1')).toBeVisible();
    page.off('request', listener);
    const otherFiles = Object.entries(audit)
      .filter(([key]) => key !== domain)
      .flatMap(([, value]) => value.files);
    const exclusiveOtherFiles = otherFiles.filter((file) => !audit[domain].files.includes(file));
    expect(loaded.filter((file) => exclusiveOtherFiles.includes(file))).toEqual([]);
  }
});

test('3D current backup works on the first offline attempt and restores as an editable copy', async ({
  page,
  context,
}) => {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('最初の3D');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
  await expect(page.getByRole('heading', { name: '最初の3D', exact: true })).toBeVisible();
  const name = page.getByLabel('プロジェクト名', { exact: true });
  await name.fill('編集した3D');
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(name).toHaveValue('最初の3D');
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect(name).toHaveValue('編集した3D');
  await context.setOffline(true);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('編集した3D.cas3dproj');
  const path = await download.path();
  expect(path).not.toBeNull();
  await context.setOffline(false);
  // Restore into an empty browser database, not merely back into the source project.
  const fresh = await context.browser()!.newContext();
  const restored = await fresh.newPage();
  try {
    await restored.goto(new URL('/3d/', page.url()).href);
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: await readFile(path!),
    });
    await expect(restored.getByRole('heading', { name: '編集した3D', exact: true })).toBeVisible();
    await restored.getByLabel('プロジェクト名', { exact: true }).fill('復元後も編集');
    await restored.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(
      restored.getByRole('status').filter({ hasText: '保存済み · revision' }),
    ).toBeVisible();
    await restored.reload();
    await expect(restored.getByRole('button', { name: /復元後も編集/ })).toBeVisible();
  } finally {
    await fresh.close();
  }
});

test('a second tab explicitly takes over while the old writer retains unsaved work for a copy', async ({
  page,
  context,
}) => {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('二つのタブ');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成' }).click();
  await expect(page.getByRole('status').filter({ hasText: '保存済み · revision' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/3d/');
  await other.getByRole('button', { name: /二つのタブ.*revision/ }).click();
  await expect(other.getByLabel('プロジェクト名', { exact: true })).toHaveAttribute('readonly', '');
  await other.getByRole('button', { name: 'このタブで編集を引き継ぐ' }).click();
  await other.getByLabel('プロジェクト名', { exact: true }).fill('新しい所有者');
  await other.getByRole('button', { name: '今すぐ保存' }).click();
  await page.getByLabel('プロジェクト名', { exact: true }).fill('旧タブの大切な変更');
  await page.getByRole('button', { name: '今すぐ保存' }).click();
  await expect(page.getByRole('status').filter({ hasText: '競合・未保存' })).toBeVisible();
  await expect(page.getByLabel('プロジェクト名', { exact: true })).toHaveValue(
    '旧タブの大切な変更',
  );
  await page.getByRole('button', { name: 'コピーとして保存' }).click();
  await expect(page.getByRole('status').filter({ hasText: '保存済み · revision' })).toBeVisible();
  await other.getByRole('button', { name: '一覧を更新' }).click();
  await expect(other.getByRole('button', { name: /旧タブの大切な変更.*revision/ })).toBeVisible();
  await expect(other.getByLabel('プロジェクト名', { exact: true })).toHaveValue('新しい所有者');
});
