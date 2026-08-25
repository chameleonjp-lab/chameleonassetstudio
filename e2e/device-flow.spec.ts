import { expect, test, type Page } from '@playwright/test';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2a9d8f';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'device-flow.png',
    mimeType: 'image/png',
    buffer: await makePngBuffer(page),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(Math.max(widths.documentWidth, widths.bodyWidth)).toBeLessThanOrEqual(widths.viewport);
}

async function expectTouchTargetsAtLeast(
  page: Page,
  selector: string,
  minimumHeight: number,
): Promise<void> {
  const undersized = await page.locator(selector).evaluateAll((elements, minimum) => {
    return elements
      .map((element) => ({
        label: element.textContent?.trim() ?? element.getAttribute('aria-label') ?? '',
        height: element.getBoundingClientRect().height,
      }))
      .filter(({ height }) => height < minimum);
  }, minimumHeight);
  expect(undersized).toEqual([]);
}

test('iPhone SE級の縦画面で作成から書き出し、再読み込み後の再開まで到達できる', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const projectName = 'Group21A iPhone SE導線';

  await setupProjectWithImage(page, projectName);
  await expectNoHorizontalOverflow(page);

  const mobileNav = page.getByRole('navigation', { name: '画面切り替え' });
  await expect(mobileNav).toBeVisible();
  await expectTouchTargetsAtLeast(page, 'nav[aria-label="画面切り替え"] button:visible', 44);

  const destinations = [
    {
      label: 'プロパティ',
      locator: page.getByRole('complementary', { name: 'プロパティ' }),
    },
    {
      label: 'タイムライン',
      locator: page.getByRole('contentinfo', { name: 'タイムライン' }),
    },
    {
      label: '書き出し',
      locator: page.getByRole('region', { name: '書き出し' }),
    },
  ];

  for (const destination of destinations) {
    await mobileNav.getByRole('button', { name: destination.label }).click();
    await expect(destination.locator).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG をダウンロード' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('device-flow.png');

  await mobileNav.getByRole('button', { name: 'ホーム' }).click();
  await expect(page.getByRole('heading', { name: 'Chameleon Asset Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: `「${projectName}」を開く` })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: `「${projectName}」を開く` }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
});

test('スマホ入力とキャンバス操作の適用範囲を分離する', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  const projectNameInput = page.getByLabel('プロジェクト名');
  const homeInputFontSize = await projectNameInput.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  expect(homeInputFontSize).toBeGreaterThanOrEqual(16);

  await setupProjectWithImage(page, 'Group21A 入力境界');
  await expectNoHorizontalOverflow(page);

  const touchActions = await page.evaluate(() => ({
    body: getComputedStyle(document.body).touchAction,
    root: getComputedStyle(document.documentElement).touchAction,
  }));
  expect(touchActions.body).not.toBe('none');
  expect(touchActions.root).not.toBe('none');

  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS('touch-action', 'none');

  await expectTouchTargetsAtLeast(page, 'nav[aria-label="編集ツール"] button:visible', 44);

  const undersizedInputs = await page
    .locator('input:visible, select:visible, textarea:visible')
    .evaluateAll((elements) => {
      return elements
        .map((element) => ({
          label: element.getAttribute('aria-label') ?? element.tagName,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
        }))
        .filter(({ fontSize }) => fontSize < 16);
    });
  expect(undersizedInputs).toEqual([]);
});

test('iPad幅でキャンバス、プロパティ、タイムライン、書き出しを同時に使える', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await setupProjectWithImage(page, 'Group21A iPad導線');

  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('region', { name: 'キャンバス' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'プロパティ' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'タイムライン' })).toBeVisible();
  await expect(page.getByRole('region', { name: '書き出し' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '画面切り替え' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'PNG をダウンロード' })).toBeVisible();
});
