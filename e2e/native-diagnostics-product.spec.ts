import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
interface ClipboardFixture {
  writes: string[];
  resolve?: () => void;
  pending: boolean;
}
type FixtureWindow = Window & { diagnosticClipboard: ClipboardFixture };
async function clipboardFixture(page: Page) {
  await page.addInitScript(() => {
    const fixture: ClipboardFixture = { writes: [], pending: false };
    (window as unknown as FixtureWindow).diagnosticClipboard = fixture;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          fixture.writes.push(text);
        },
      },
    });
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: { isActive: true },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: () =>
          new Promise((resolve) => {
            fixture.pending = true;
            fixture.resolve = () => {
              fixture.pending = false;
              resolve({ state: 'granted' });
            };
          }),
      },
    });
  });
}
async function diagnostic(page: Page) {
  const panel = page
    .locator('footer details')
    .filter({ has: page.locator('summary').filter({ hasText: '問題報告用の診断情報' }) });
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '診断情報を作成', exact: true }).click();
  return panel;
}
test('diagnostics omit project data and export only the user-reviewed replacement text', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url() + ' ' + (r.postData() ?? '')));
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('PRIVATE-PROJECT-FIXTURE');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'PRIVATE-PROJECT-FIXTURE', exact: true }),
  ).toBeVisible();
  const panel = await diagnostic(page),
    preview = panel.getByLabel('共有前の確認・編集', { exact: true });
  const text = await preview.inputValue();
  expect(text).not.toContain('PRIVATE-PROJECT-FIXTURE');
  expect(text).not.toMatch(/file:\/\/|blob:|https?:\/\//);
  await preview.fill('確認した内容だけ');
  const downloaded = page.waitForEvent('download');
  await panel.getByRole('button', { name: '確認した内容をテキスト保存', exact: true }).click();
  expect(await readFile((await (await downloaded).path())!, 'utf8')).toBe('確認した内容だけ');
  expect(
    requests.some((r) => r.includes('PRIVATE-PROJECT-FIXTURE') || r.includes('確認した内容だけ')),
  ).toBe(false);
  await preview.fill('');
  await expect(
    panel.getByRole('button', { name: '確認した内容をコピー', exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: '確認した内容をテキスト保存', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('native-visual-diagnostics-mobile.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('late clipboard permission cannot copy content redacted or hidden while awaiting it', async ({
  page,
}) => {
  await clipboardFixture(page);
  await page.goto('/3d/');
  const panel = await diagnostic(page),
    preview = panel.getByLabel('共有前の確認・編集', { exact: true });
  const copy = panel.getByRole('button', { name: '確認した内容をコピー', exact: true });
  const pending = () =>
    page.evaluate(() => (window as unknown as FixtureWindow).diagnosticClipboard.pending);
  const writes = () =>
    page.evaluate(() => (window as unknown as FixtureWindow).diagnosticClipboard.writes);
  const resolve = () =>
    page.evaluate(() => (window as unknown as FixtureWindow).diagnosticClipboard.resolve?.());
  await copy.click();
  await expect.poll(pending).toBe(true);
  await preview.fill('redacted');
  await resolve();
  await expect(copy).toBeEnabled();
  expect(await writes()).toEqual([]);
  await copy.click();
  await expect.poll(pending).toBe(true);
  await resolve();
  await expect.poll(writes).toEqual(['redacted']);
  await copy.click();
  await expect.poll(pending).toBe(true);
  await panel.locator('summary').click();
  await resolve();
  expect(await writes()).toEqual(['redacted']);
});
test('checking a different deployed revision never reloads automatically and offline checks remain recoverable', async ({
  page,
}) => {
  await page.goto('/3d/');
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.route('**/native-build-info.json', (route) =>
    route.fulfill({
      json: {
        format: 'chameleon-build-info-1',
        appVersion: '0.2.0',
        sourceRevision: 'c'.repeat(40),
        sourceDirty: false,
        nativeSchemaVersion: '0.4.0',
      },
    }),
  );
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '配信版を確認', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('別の版');
  expect(navigations).toEqual([]);
  await page.unroute('**/native-build-info.json');
  await page.route('**/native-build-info.json', (route) => route.abort());
  await panel.getByRole('button', { name: '配信版を確認', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('再試行');
  expect(navigations).toEqual([]);
});
test('a failed latest save prevents the explicit update reload and retains the editable project', async ({
  page,
}) => {
  await page.goto('/3d/');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') throw new DOMException('Fixture quota', 'QuotaExceededError');
      return original.call(
        this,
        typeof args[0] === 'string' ? args[0] : Array.from(args[0]),
        args[1],
        args[2],
      );
    };
  });
  await page.getByLabel('プロジェクト名', { exact: true }).fill('Unsaved update fixture');
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '現在の内容を保存して再読み込み', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('完了できません');
  expect(navigations).toEqual([]);
  await expect(page.getByLabel('プロジェクト名', { exact: true })).toHaveValue(
    'Unsaved update fixture',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Unsaved update fixture.cas3dproj');
});

test('a failed initial 3D shell chunk leaves local diagnostics and a separate working hub', async ({
  page,
  context,
}) => {
  await page.route('**/*Editor3DShell*', (route) => route.abort());
  await page.goto('/3d/');
  await expect(
    page.getByRole('heading', { name: '3Dを表示できませんでした', exact: true }),
  ).toBeVisible();
  await page.getByText('問題報告用の診断情報', { exact: true }).click();
  await page.getByRole('button', { name: '診断情報を作成', exact: true }).click();
  await expect(page.getByLabel('共有前の確認・編集', { exact: true })).toHaveValue(
    /editor-render-failed/,
  );
  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: 'トップを別タブで開く', exact: true }).click();
  const hub = await opened;
  await expect(hub.getByRole('heading', { name: '作りたい素材を選ぶ', exact: true })).toBeVisible();
  await hub.getByRole('link', { name: '2Dを開く', exact: true }).click();
  await expect(
    hub.getByRole('heading', { name: 'Chameleon Asset Studio', exact: true }),
  ).toBeVisible();
});

test('a stalled explicit version check can be cancelled and the served metadata can be retried', async ({
  page,
}) => {
  await page.goto('/3d/');
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  await page.route('**/native-build-info.json', () => undefined);
  await panel.getByRole('button', { name: '配信版を確認', exact: true }).click();
  await panel.getByRole('button', { name: '配信版の確認を中止', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('中止');
  await expect(
    panel.getByRole('button', { name: '現在の内容を保存して再読み込み', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/native-build-info.json');
  await panel.getByRole('button', { name: '配信版を確認', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('同じ版');
});

test('already loaded editing and backup continue offline without an automatic reload', async ({
  page,
  context,
}) => {
  await page.goto('/3d/');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await expect(page.getByLabel('プロジェクト名', { exact: true })).toBeVisible();
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await context.setOffline(true);
  try {
    await page.getByLabel('プロジェクト名', { exact: true }).fill('Offline local fixture');
    await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
    await expect(page.getByText(/保存済み · revision/)).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe('Offline local fixture.cas3dproj');
    expect(navigations).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test('the editor opens the served native guide without replacing unsaved work', async ({
  page,
  context,
}) => {
  await page.goto('/3d/');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByLabel('プロジェクト名', { exact: true }).fill('Guide keeps this project');
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  const opened = context.waitForEvent('page');
  await panel.getByRole('link', { name: 'ガイドを別タブで開く', exact: true }).click();
  const guide = await opened;
  await expect(guide).toHaveURL(/\/guide\/3d\/$/);
  await expect(
    guide.getByRole('heading', { name: '自動保存とバックアップを使い分ける', exact: true }),
  ).toBeVisible();
  await expect(
    guide.getByRole('heading', { name: '版を確認し、保存してから読み直す', exact: true }),
  ).toBeVisible();
  expect(await guide.evaluate(() => window.opener === null)).toBe(true);
  await expect(page.getByLabel('プロジェクト名', { exact: true })).toHaveValue(
    'Guide keeps this project',
  );
  await guide.setViewportSize({ width: 320, height: 568 });
  expect(
    await guide.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await test.info().attach('native-visual-guide-mobile', {
    body: await guide.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('bundled notes retain current-tab identity when a different deployed revision is checked', async ({
  page,
}) => {
  let buildRequests = 0;
  await page.route('**/native-build-info.json', (route) => {
    buildRequests += 1;
    return route.fulfill({
      json: {
        format: 'chameleon-build-info-1',
        appVersion: '9.9.9',
        sourceRevision: 'd'.repeat(40),
        sourceDirty: false,
        nativeSchemaVersion: '0.4.0',
      },
    });
  });
  await page.goto('/3d/');
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  const notes = panel.getByRole('region', { name: 'このタブの更新内容', exact: true });
  await expect(notes).toBeVisible();
  await expect(notes).toContainText('0.3.0');
  const before = await notes.innerText();
  expect(before).not.toContain('d'.repeat(40));
  expect(buildRequests).toBe(0);
  await expect(notes.locator('button, input, form, iframe, script')).toHaveCount(0);
  await panel.getByRole('button', { name: '配信版を確認', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('別の版');
  expect(buildRequests).toBe(1);
  expect(await notes.innerText()).toBe(before);
  await expect(notes).not.toContainText('9.9.9');
  await expect(notes).not.toContainText('d'.repeat(40));
});

test('static guide identifies release notes as an explanatory checkpoint with recovery and unverified limits', async ({
  page,
}) => {
  await page.goto('/guide/3d/#release-notes');
  const section = page.getByRole('region', { name: 'このタブの更新内容', exact: true });
  await expect(section).toBeVisible();
  await expect(section).toContainText('2026-10-10');
  await expect(section).toContainText('0.3.0');
  await expect(section).toContainText('編集用バックアップ');
  await expect(section).toContainText('合格にはなりません');
  await expect(section).toContainText('採用完了していません');
});

test('bundled dependency notices open only on request and preserve their complete static text', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('runtime-notices.txt')) requests.push(request.url());
  });
  await page.goto('/3d/');
  const panel = page.getByLabel('3Dの版と更新', { exact: true });
  await panel.locator('summary').click();
  const link = panel.getByRole('link', { name: '同梱ライブラリのライセンス原文', exact: true });
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(panel).toContainText('作品に使う素材の権利情報とは別');
  expect(requests).toEqual([]);
  const popupEvent = page.waitForEvent('popup');
  await link.click();
  const popup = await popupEvent;
  await popup.waitForLoadState();
  const url = new URL(popup.url());
  expect(url.origin).toBe(new URL(page.url()).origin);
  expect(url.pathname).toMatch(/\/licenses\/runtime-notices\.txt$/);
  expect(url.search).toBe('');
  await expect(popup.locator('body')).toContainText('Permission is hereby granted');
  const actual = await popup.request.get(popup.url());
  expect(actual.ok()).toBe(true);
  expect(await actual.body()).toEqual(await readFile('public/licenses/runtime-notices.txt'));
  await popup.close();
  await expect(panel).toBeVisible();
});
