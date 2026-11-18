import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // One browser, one backend: run the steps in order.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
