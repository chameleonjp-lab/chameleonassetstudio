import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Keep Chromium reports and engine evidence intact when WebKit runs afterward.
export default defineConfig({
  ...config,
  projects: config.projects?.filter((project) => project.name === 'webkit-critical'),
  outputDir: 'test-results-webkit',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-webkit' }]]
    : 'list',
});
