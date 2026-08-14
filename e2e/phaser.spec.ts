import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

type FixtureManifest = {
  profile: string;
  scale: number;
  pages: Array<{ path: string }>;
  frames: Array<{
    contentOffset: { x: number; y: number };
    page: number;
  }>;
  animations: Array<{ frames: string[] }>;
  origin: { x: number; y: number };
  anchors: Array<Record<string, unknown>>;
  colliders: Array<Record<string, unknown>>;
};

type G17Runtime = {
  engine?: string;
  version?: string;
  pageCount?: number;
  frameHistory?: string[];
  pixelAlpha?: () => boolean;
};

type G17Window = Window & { __g17?: G17Runtime };

test('Phaser 4.2.0 fixtureはHTTP経由で2ページとanimationを確認できる', async ({ page, browser }) => {
  const consoleErrors: string[] = [];
  const downloads: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  const viewports = [
    { width: 1280, height: 720 },
    { width: 375, height: 667 },
  ];
  let status = 'not-run';
  let manifestHash = 'unrecorded';
  let fixtureHash = 'unrecorded';
  let pageCount = 0;
  const viewportResults: Array<Record<string, unknown>> = [];

  try {
    const indexResponse = await page.request.get('/engine-fixtures/phaser-v4/index.html');
    fixtureHash =
      'sha256:' + createHash('sha256').update(await indexResponse.text(), 'utf8').digest('hex');

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/engine-fixtures/phaser-v4/index.html');
      await expect(page.getByRole('heading', { name: 'Phaser 4.2.0 fixture' })).toBeVisible();
      await expect(page.locator('#status')).toContainText('Phaser 4.2.0 ready', {
        timeout: 15000,
      });

      const response = await page.request.get('/engine-fixtures/phaser-v4/manifest.json');
      const text = await response.text();
      expect(response.ok()).toBe(true);
      const manifest = JSON.parse(text) as FixtureManifest;
      manifestHash = 'sha256:' + createHash('sha256').update(text, 'utf8').digest('hex');
      pageCount = manifest.pages.length;
      expect(pageCount).toBe(2);
      expect(manifest.profile).toBe('packed');
      expect(manifest.scale).toBe(2);
      expect(manifest.frames[0].contentOffset).toEqual({ x: 16, y: 24 });
      expect(manifest.frames[1].page).toBe(1);
      expect(manifest.animations[0].frames).toEqual(['fixture-a', 'fixture-b']);
      expect(manifest.origin).toEqual({ x: 64, y: 120 });
      expect(manifest.anchors[0]).toMatchObject({ x: 64, y: 64 });
      expect(manifest.colliders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ shape: 'rect' }),
          expect.objectContaining({ shape: 'circle' }),
        ]),
      );

      for (const entry of manifest.pages) {
        expect((await page.request.get('/engine-fixtures/phaser-v4/' + entry.path)).ok()).toBe(true);
      }

      await expect
        .poll(
          async () =>
            page.evaluate(
              () => (window as unknown as G17Window).__g17?.frameHistory ?? [],
            ),
          { timeout: 5000 },
        )
        .toContain('fixture-b');

      const rendered = await page.evaluate(() => {
        const runtime = (window as unknown as G17Window).__g17;
        return Boolean(runtime?.pixelAlpha?.());
      });
      expect(rendered).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
        true,
      );

      const runtime = await page.evaluate(() => {
        const value = (window as unknown as G17Window).__g17;
        return {
          engine: value?.engine,
          version: value?.version,
          pageCount: value?.pageCount,
        };
      });
      expect(runtime).toEqual({ engine: 'Phaser', version: '4.2.0', pageCount: 2 });

      viewportResults.push({
        viewport,
        frameHistory: await page.evaluate(
          () => (window as unknown as G17Window).__g17?.frameHistory ?? [],
        ),
      });
    }

    status = 'verified';
    expect(consoleErrors).toEqual([]);
    expect(downloads).toEqual([]);
  } finally {
    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/group17-phaser-evidence.json',
      JSON.stringify(
        {
          workPackage: '2D-4-PHASER',
          engine: 'Phaser',
          engineVersion: '4.2.0',
          cdnUrl: 'https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js',
          status,
          sourceCommit: process.env.GITHUB_SHA ?? 'local',
          fixtureHash,
          manifestHash,
          browserVersion: browser.version(),
          viewportResults,
          consoleErrors,
          downloadCount: downloads.length,
          pageCount,
        },
        null,
        2,
      ) + '\n',
    );
  }
});
