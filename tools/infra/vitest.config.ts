import { defineConfig } from 'vitest/config';

import { sharedTestConfig } from '../vitest.shared.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    include: ['tools/infra/**/*.test.ts'],
    // Docker Compose on GitHub runners can be slow to finish init scripts; allow per-test headroom.
    testTimeout: 15_000,
  },
});
