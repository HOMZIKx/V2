import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['apps/api-gateway/src/**/*.spec.ts'],
    coverageInclude: ['apps/api-gateway/src/**/*.{ts,tsx}'],
  }),
);
