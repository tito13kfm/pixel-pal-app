import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_DATE__: JSON.stringify('test'),
    // Force this to empty regardless of a real local .env: Vitest's
    // import.meta.env is populated from .env files at config-eval time and
    // vi.stubEnv() only patches process.env, not import.meta.env, so a real
    // key in a developer's own .env would otherwise leak into every test
    // that expects the keyless/default path (getLospecApiKey's own explicit
    // process.env fallback still works correctly with vi.stubEnv).
    'import.meta.env.VITE_LOSPEC_API_KEY': JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup/testing-library.ts'],
    include: ['tests/unit/**/*.spec.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
