import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Source only. Without this, a stale compiled copy under dist/ would be
    // collected as a second, duplicate suite.
    include: ['src/**/*.test.ts'],
  },
});
