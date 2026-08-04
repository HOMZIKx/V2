import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/contracts/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/contracts/src/**/*.{ts,tsx}'],
  }),
);
