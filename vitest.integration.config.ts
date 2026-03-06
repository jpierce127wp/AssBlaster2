import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 30_000,
    fileParallelism: false,
    globalSetup: ['test/integration/setup/global-setup.ts'],
  },
});
