import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/testing/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/testing/src/**/*.{ts,tsx}'],
  }),
);
