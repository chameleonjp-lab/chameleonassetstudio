import { defineConfig, devices } from '@playwright/test';

// バージョン違いの同梱ブラウザしか無い環境向けに、実行ファイルを差し替えられるようにする。
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
// Playwrightは通常BFCacheを無効化する。LIFE-07の実BFCache受入時だけ明示的に有効化する。
const enableChromiumBackForwardCache = process.env.PLAYWRIGHT_ENABLE_BFCACHE === '1';

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
        ...(chromiumExecutablePath || enableChromiumBackForwardCache
          ? {
              launchOptions: {
                ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
                ...(enableChromiumBackForwardCache
                  ? { ignoreDefaultArgs: ['--disable-back-forward-cache'] }
                  : {}),
              },
            }
          : {}),
      },
    },
    {
      name: 'webkit-critical',
      testMatch: [
        'app.spec.ts',
        'studio-entries.spec.ts',
        'native-viewport-evaluation.spec.ts',
        'native-performance-evaluation.spec.ts',
        'native-workspace-skip-link.spec.ts',
        'native-transform-evaluation.spec.ts',
        'native-panel.spec.ts',
        'native-viewport-product.spec.ts',
        'native-editing-product.spec.ts',
        'native-texture-product.spec.ts',
        'native-rig-product.spec.ts',
        'native-animation-product.spec.ts',
        'native-asset-io-product.spec.ts',
        'native-quality-product.spec.ts',
        'native-recovery-product.spec.ts',
        'native-cross-domain-recovery.spec.ts',
        'native-library-product.spec.ts',
        'native-legacy-backup-product.spec.ts',
        'native-diagnostics-product.spec.ts',
        'native-consumer.spec.ts',
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
        'revision-review.spec.ts',
      ],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run consumer:serve',
      url: 'http://localhost:4177',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
