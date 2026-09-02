import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/hub-core/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/hub-core/src/**/*.{ts,tsx}'],
  }),
);
