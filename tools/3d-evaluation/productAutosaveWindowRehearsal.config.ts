import { defineConfig, devices } from '@playwright/test';
import config from '../../playwright.config';

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const selectedBrowser = process.env.PRODUCT_AUTOSAVE_WINDOW_BROWSER ?? 'all';
const allProjects = [
  {
    name: 'chromium-product-autosave-window',
    use: {
      ...devices['Desktop Chrome'],
      ...(chromiumExecutablePath
        ? { launchOptions: { executablePath: chromiumExecutablePath } }
        : {}),
    },
  },
  { name: 'webkit-product-autosave-window', use: { ...devices['Desktop Safari'] } },
];
const projects =
  selectedBrowser === 'all'
    ? allProjects
    : allProjects.filter((project) => project.name.startsWith(`${selectedBrowser}-`));
if (projects.length === 0)
  throw new Error('PRODUCT_AUTOSAVE_WINDOW_BROWSER must be all, chromium, or webkit');

export default defineConfig({
  ...config,
  testDir: '.',
  testMatch: '**/productAutosaveWindowRehearsal.e2e.ts',
  fullyParallel: false,
  workers: 1,
  outputDir: '../../test-results/product-autosave-window-playwright',
  reporter: 'list',
  projects,
  // Measure the production bundle; never reuse the inherited Vite dev server.
  webServer: {
    command: 'npm run build:app && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
