import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['apps/web/src/**/*.spec.ts'],
    coverageInclude: ['apps/web/src/**/*.{ts,tsx}'],
  }),
);
