import { defineConfig } from 'vitest/config';

import { sharedTestConfig } from '../vitest.shared.js';

export default defineConfig({
  test: {
    ...sharedTestConfig,
    include: ['tools/architecture/**/*.test.ts'],
  },
});
