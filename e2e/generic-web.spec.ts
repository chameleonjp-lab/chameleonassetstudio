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
        page: number;
        rect: { width: number; height: number };
        sourceSize: { width: number; height: number };
        contentOffset: { x: number; y: number };
        contentRect: { width: number; height: number };
      }>;
      origin: { x: number; y: number };
      anchors: Array<{ name: string; role: string; x: number; y: number }>;
      colliders: Array<{
        id: string;
        name: string;
        shape: string;
        rect?: { x: number; y: number; width: number; height: number };
        circle?: { x: number; y: number; radius: number };
      }>;
    };
    manifestHash = createHash('sha256').update(manifestText).digest('hex');
    pageCount = manifest.pages.length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
    expect(manifest.scale).toBe(2);
    expect(manifest.pages).toEqual([
      { path: 'atlas/pages/page-000.svg', width: 128, height: 128, rotated: false },
      { path: 'atlas/pages/page-001.svg', width: 64, height: 64, rotated: false },
    ]);
    expect(manifest.frames[0]).toMatchObject({
      page: 0,
      rect: { width: 64, height: 64 },
      sourceSize: { width: 64, height: 64 },
      contentOffset: { x: 8, y: 8 },
      contentRect: { width: 48, height: 48 },
    });
    expect(manifest.origin).toEqual({ x: 32, y: 64 });
    expect(manifest.anchors).toEqual([{ name: 'center', role: 'center', x: 32, y: 32 }]);
    expect(manifest.colliders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'generic-web-hitbox',
          name: 'hitbox',
          shape: 'rect',
          rect: { x: 8, y: 8, width: 48, height: 48 },
        }),
        expect.objectContaining({
          id: 'generic-web-radius',
          name: 'radius',
          shape: 'circle',
          circle: { x: 32, y: 32, radius: 24 },
        }),
      ]),
    );
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
    expect(
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const context = canvas?.getContext('2d');
        return context ? context.getImageData(80, 80, 1, 1).data[3] : 0;
      }),
    ).toBeGreaterThan(0);
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
