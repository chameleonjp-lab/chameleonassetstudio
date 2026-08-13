import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Generic Web fixtureはHTTP経由でpackageとCanvasを確認できる', async ({ page, browser }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const consoleErrors: string[] = [];
  const downloads: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  let manifestHash = 'unrecorded';
  let pageCount = 0;
  let status = 'not-run';
  try {
    await page.goto('/generic-web-fixture/index.html');
    await expect(page.getByRole('heading', { name: 'Generic Web fixture' })).toBeVisible();
    await expect(page.locator('#status')).toContainText('読み込み成功');
    await expect(page.locator('canvas')).toBeVisible();

    const packageResponse = await page.request.get('/generic-web-fixture/package-manifest.json');
    expect(packageResponse.ok()).toBe(true);
    const packageManifest = await packageResponse.json();
    const manifestResponse = await page.request.get(
      `/generic-web-fixture/${packageManifest.files.distributionManifest}`,
    );
    const manifestText = await manifestResponse.text();
    expect(manifestResponse.ok()).toBe(true);
    const manifest = JSON.parse(manifestText) as {
      scale: number;
      pages: Array<{ path: string }>;
      frames: Array<{
        contentOffset: { x: number; y: number };
        contentRect: { width: number; height: number };
      }>;
    };
    manifestHash = createHash('sha256').update(manifestText).digest('hex');
    pageCount = manifest.pages.length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
    expect(manifest.scale).toBe(2);
    expect(manifest.frames[0]).toMatchObject({
      contentOffset: { x: 4, y: 4 },
      contentRect: { width: 24, height: 24 },
    });
    const pageResponses = await Promise.all(
      manifest.pages.map((entry) => page.request.get(`/generic-web-fixture/${entry.path}`)),
    );
    expect(pageResponses.every((response) => response.ok())).toBe(true);

    const sidecarResponse = await page.request.get(
      `/generic-web-fixture/${packageManifest.files.target}`,
    );
    const sidecar = await sidecarResponse.json();
    expect(sidecarResponse.ok()).toBe(true);
    expect(sidecar.coordinateSystem).toMatchObject({ origin: 'top-left', unit: 'px' });
    expect(sidecar.anchors).toHaveLength(1);
    expect(sidecar.colliders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'hitbox', shape: 'rect' }),
        expect.objectContaining({ name: 'radius', shape: 'circle' }),
      ]),
    );
    expect(sidecar.animations[0]).toMatchObject({
      name: 'loop',
      frameNames: ['fixture', 'second'],
    });

    status = (await page.locator('#status').textContent()) ?? 'empty';
    expect(consoleErrors).toEqual([]);
    expect(downloads).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/group16-generic-web-evidence.json',
      `${JSON.stringify(
        {
          workPackage: '2D-4-GENERIC-WEB',
          profile: 'generic-web-v1',
          status,
          fixtureHash: 'fixture:generic-web-v1',
          manifestHash,
          browserVersion: browser.version(),
          userAgent: await page.evaluate(() => navigator.userAgent),
          viewport: { width: 375, height: 667 },
          consoleErrors,
          downloadCount: downloads.length,
          pageCount,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
});
