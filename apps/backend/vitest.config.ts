import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // One mongod for the whole run; every test file uses its own database.
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
