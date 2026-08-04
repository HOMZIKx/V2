import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/design-system/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/design-system/src/**/*.{ts,tsx}'],
  }),
);
