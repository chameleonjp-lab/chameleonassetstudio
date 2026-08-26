import { expect, test } from '@playwright/test';

async function expectVisibleControlsToHaveNames(page: import('@playwright/test').Page) {
  const unnamed = await page
    .locator(
      'button:visible, a:visible, input:visible, select:visible, textarea:visible, summary:visible',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const labelledBy = element.getAttribute('aria-labelledby');
          const referencedLabel = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
                .join(' ')
                .trim()
            : '';
          const explicitLabel = element.getAttribute('aria-label')?.trim() ?? '';
          const title = element.getAttribute('title')?.trim() ?? '';
          const wrappingLabel = element.closest('label')?.textContent?.trim() ?? '';
          const text = element.textContent?.trim() ?? '';
          return {
            tag: element.tagName.toLowerCase(),
            name: explicitLabel || referencedLabel || wrappingLabel || text || title,
          };
        })
        .filter((entry) => entry.name.length === 0),
    );

  expect(unnamed).toEqual([]);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(Math.max(widths.documentWidth, widths.bodyWidth)).toBeLessThanOrEqual(widths.viewport);
}

test.describe('Group 21C quality contracts', () => {
  test('性能指標の未計測境界とキーボード・縮小動作を表示する', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const qualitySummary = page.locator('.quality-status summary');
    await expect(qualitySummary).toBeVisible();
    await qualitySummary.focus();
    await expect(qualitySummary).toBeFocused();
    const focusStyle = await qualitySummary.evaluate((element) => ({
      tag: element.tagName,
      outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth) || 0,
    }));
    expect(focusStyle.tag).toBe('SUMMARY');
    expect(focusStyle.outlineWidth).toBeGreaterThan(0);

    await qualitySummary.press('Enter');
    const quality = page.getByRole('region', { name: '品質情報' });
    await expect(quality).toBeVisible();
    await expect(quality.getByRole('status')).toContainText('未計測');
    await expect(quality.locator('[data-quality-metric]')).toHaveCount(6);
    await expectVisibleControlsToHaveNames(page);
    await expectNoHorizontalOverflow(page);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motionOffenders = await page.locator('body *:visible').evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        const durations = [style.animationDuration, style.transitionDuration]
          .flatMap((value) => value.split(','))
          .map((value) => Number.parseFloat(value) || 0);
        return durations.some((duration) => duration > 0.011);
      }),
    );
    expect(motionOffenders).toEqual([]);
  });

  test('新規タブのリンクを分離し、利用者入力をHTMLとして解釈しない', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('プロジェクト名').fill('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: '<img src=x onerror=alert(1)>',
        exact: true,
      }),
    ).toBeVisible();

    expect(await page.locator('img[src="x"]').count()).toBe(0);

    const unsafeLinks = await page.locator('a[target="_blank"]').evaluateAll((links) =>
      links
        .map((link) => ({
          href: link.getAttribute('href') ?? '',
          rel: (link.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean),
        }))
        .filter(({ rel }) => !rel.includes('noopener') || !rel.includes('noreferrer')),
    );
    expect(unsafeLinks).toEqual([]);
  });
});
