import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/observability/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/observability/src/**/*.{ts,tsx}'],
  }),
);
