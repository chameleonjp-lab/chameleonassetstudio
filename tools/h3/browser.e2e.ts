import Ajv2020 from 'ajv/dist/2020.js';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const resultSchema = JSON.parse(
  readFileSync(new URL('./result.schema.json', import.meta.url), 'utf8'),
) as object;

test('Chromium runs one baseline case and produces a schema-valid reference result', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#publication-status')).toContainText(/Local preview mode|Open for/);

  await page.getByLabel('Device').fill('GitHub Actions Chromium');
  await page.getByLabel('OS').fill('GitHub-hosted Ubuntu');
  await page.getByLabel('Browser').fill('Playwright Chromium');
  await page.getByLabel('Low Power Mode').selectOption('unknown');
  await page.getByLabel('Thermal state').selectOption('unknown');
  await page.getByLabel('One case only').selectOption('baseline-60x4x64');
  await page.getByRole('button', { name: 'Run selected case' }).click();

  await expect(page.locator('#status')).toContainText('Completed baseline-60x4x64', {
    timeout: 120_000,
  });
  const resultText = await page.locator('#output').inputValue();
  const result = JSON.parse(resultText) as Record<string, unknown>;
  const validate = new Ajv2020({ allErrors: true }).compile(resultSchema);

  expect(validate(result), validate.errors?.map((error) => error.message).join(', ')).toBe(true);
  expect(result).toMatchObject({
    status: 'measured',
    source: { repository: 'chameleonjp-lab/chameleonassetstudio' },
    case: { id: 'baseline-60x4x64' },
    environment: { runtime: 'browser', device: 'GitHub Actions Chromium' },
    run: { warmupIterations: 3, recordedIterations: 10 },
    fixture: { l1Valid: true },
    recordComplete: true,
  });
  expect((result.source as { commit: string }).commit).toMatch(/^[0-9a-f]{7,40}$/i);
  expect(result.samples).toHaveLength(10);
});
