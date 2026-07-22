import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const configuredBasePath = process.env.APP_BASE_PATH?.trim() || '/';
const basePath = configuredBasePath.endsWith('/') ? configuredBasePath : `${configuredBasePath}/`;

export default defineConfig({
  base: basePath,
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
