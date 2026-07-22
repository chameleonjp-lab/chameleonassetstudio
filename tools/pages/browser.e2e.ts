import { expect, test } from '@playwright/test';

test('serves the application at the Pages root and H3 under /h3/', async ({ page, request }) => {
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

  await page.goto('./h3/');
  await expect(page).toHaveTitle(/Chameleon H3 measurement/);
  await expect(page.locator('body')).toContainText(/H3 measurement (harness|is closed)/);

  const publicationResponse = await request.get('./h3/publication.json');
  expect(publicationResponse.ok()).toBe(true);
  const publication = (await publicationResponse.json()) as { status?: string };
  expect(['open', 'local-build', 'closed']).toContain(publication.status);
  if (publication.status !== 'closed') {
    await expect(page.locator('#publication-status')).not.toBeEmpty();
  }

  expect(failedResponses).toEqual([]);
  expect(pageErrors).toEqual([]);
});
