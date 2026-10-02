import { defineConfig, devices } from '@playwright/test';

// バージョン違いの同梱ブラウザしか無い環境向けに、実行ファイルを差し替えられるようにする。
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  expect: {
    timeout: process.env.CI ? 10_000 : 5_000,
  },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
    {
      name: 'webkit-critical',
      testMatch: [
        'app.spec.ts',
        'import.spec.ts',
        'storage.spec.ts',
        'export.spec.ts',
        'casproj.spec.ts',
        'device-flow.spec.ts',
        'canvas-viewport.spec.ts',
        'workspace.spec.ts',
        'onion-skin-browser.spec.ts',
        'rich-distribution-controls.spec.ts',
        'rich-distribution-engines.spec.ts',
        'legacy-distribution-pixels.spec.ts',
        'event-payload.spec.ts',
      ],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
