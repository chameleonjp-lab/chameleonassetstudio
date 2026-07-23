import { expect, test } from '@playwright/test';

type ExpectedH3Status = 'open' | 'closed';

interface H3PublicationRecord {
  schemaVersion?: string;
  status?: string;
  publishedAt?: string | null;
  expiresAt?: string | null;
  sourceCommit?: string | null;
}

const H3_PUBLICATION_DURATION_MS = 24 * 60 * 60 * 1000;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set for the Pages route test`);
  }
  return value;
}

function expectedH3Status(): ExpectedH3Status {
  const value = requiredEnvironment('PAGES_EXPECTED_H3_STATUS');
  if (value !== 'open' && value !== 'closed') {
    throw new Error('PAGES_EXPECTED_H3_STATUS must be open or closed');
  }
  return value;
}

test('serves the application, beginner guide, and H3 at their Pages routes', async ({
  page,
  request,
}) => {
  const expectedStatus = expectedH3Status();
  const failedResponses: string[] = [];
  const pageErrors: string[] = [];
  const criticalResourceTypes = new Set(['document', 'script', 'stylesheet']);

  page.on('response', (response) => {
    if (response.status() >= 400 && criticalResourceTypes.has(response.request().resourceType())) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('./');
  await expect(page).toHaveTitle('Chameleon Asset Studio');
  await expect(page.locator('#root')).not.toBeEmpty();

  await page.goto('./guide/');
  await expect(page).toHaveTitle('はじめての使い方 | Chameleon Asset Studio');
  await expect(page.getByRole('heading', { name: /まずは画像1枚.*5ステップ.*完成/ })).toBeVisible();

  await page.goto('./guide/features/');
  await expect(page).toHaveTitle('機能別・操作図鑑 | Chameleon Asset Studio');
  await expect(page.getByRole('heading', { name: 'ボタン名から機能を探す' })).toBeVisible();

  await page.goto('./h3/');
  if (expectedStatus === 'open') {
    await expect(page).toHaveTitle('Chameleon H3 measurement harness');
    await expect(page.locator('body')).toContainText('H3 measurement harness');
    await expect(page.locator('#publication-status')).toContainText('Open for');
    await expect(page.locator('#measurement-controls')).toBeEnabled();
  } else {
    await expect(page).toHaveTitle('Chameleon H3 measurement closed');
    await expect(page.locator('body')).toContainText('H3 measurement is closed');
  }

  const publicationResponse = await request.get('./h3/publication.json');
  expect(publicationResponse.ok()).toBe(true);
  const publication = (await publicationResponse.json()) as H3PublicationRecord;

  if (expectedStatus === 'open') {
    const expectedPublishedAt = requiredEnvironment('H3_PUBLISHED_AT');
    const expectedExpiresAt = requiredEnvironment('H3_EXPIRES_AT');
    const expectedSourceCommit = requiredEnvironment('PAGES_EXPECTED_SOURCE_COMMIT');
    expect(publication).toEqual({
      schemaVersion: 'h3-publication-1',
      status: 'open',
      publishedAt: expectedPublishedAt,
      expiresAt: expectedExpiresAt,
      sourceCommit: expectedSourceCommit,
    });

    const publishedAtMs = Date.parse(expectedPublishedAt);
    const expiresAtMs = Date.parse(expectedExpiresAt);
    expect(Number.isFinite(publishedAtMs)).toBe(true);
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    expect(expiresAtMs - publishedAtMs).toBe(H3_PUBLICATION_DURATION_MS);
    expect(Date.now()).toBeGreaterThanOrEqual(publishedAtMs);
    expect(Date.now()).toBeLessThan(expiresAtMs);
  } else {
    expect(publication).toEqual({
      schemaVersion: 'h3-publication-1',
      status: 'closed',
      publishedAt: null,
      expiresAt: null,
      sourceCommit: null,
    });
  }

  expect(failedResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
});
