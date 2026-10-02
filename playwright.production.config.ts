import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  workers: 1,
  fullyParallel: false,
  testMatch: ['release-quality.spec.ts', 'release-performance.spec.ts'],
  projects: config.projects?.map((project) => ({
    ...project,
    testMatch: ['release-quality.spec.ts', 'release-performance.spec.ts'],
  })),
  use: { ...config.use, baseURL: 'http://localhost:4176' },
  webServer: {
    command: 'npm run build:app && npx vite preview --host localhost --port 4176 --strictPort',
    url: 'http://localhost:4176',
    reuseExistingServer: false,
  },
  outputDir: 'test-results-quality',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-quality' }]]
    : 'list',
});
