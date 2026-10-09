import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  workers: 1,
  fullyParallel: false,
  testMatch: [
    'release-quality.spec.ts',
    'release-performance.spec.ts',
    'studio-entries.spec.ts',
    'native-viewport-product.spec.ts',
    'native-editing-product.spec.ts',
    'native-texture-product.spec.ts',
    'native-rig-product.spec.ts',
    'native-animation-product.spec.ts',
    'native-asset-io-product.spec.ts',
    'native-quality-product.spec.ts',
    'native-consumer.spec.ts',
  ],
  projects: config.projects?.map((project) => ({
    ...project,
    testMatch: [
      'release-quality.spec.ts',
      'release-performance.spec.ts',
      'studio-entries.spec.ts',
      'native-viewport-product.spec.ts',
      'native-editing-product.spec.ts',
      'native-texture-product.spec.ts',
      'native-rig-product.spec.ts',
      'native-animation-product.spec.ts',
      'native-asset-io-product.spec.ts',
      'native-quality-product.spec.ts',
      'native-consumer.spec.ts',
    ],
  })),
  use: { ...config.use, baseURL: 'http://localhost:4176' },
  webServer: [
    {
      command: 'npm run build:app && npx vite preview --host localhost --port 4176 --strictPort',
      url: 'http://localhost:4176',
      reuseExistingServer: false,
    },
    {
      command:
        'npm run consumer:build && npx vite preview --config tools/3d-consumer/vite.config.ts --port 4177 --strictPort',
      url: 'http://localhost:4177',
      reuseExistingServer: false,
    },
  ],
  outputDir: 'test-results-quality',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-quality' }]]
    : 'list',
});
