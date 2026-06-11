import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_DATE__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup/testing-library.ts'],
    include: ['tests/unit/**/*.spec.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
