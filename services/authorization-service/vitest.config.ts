import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['services/authorization-service/src/**/*.spec.ts'],
    coverageInclude: ['services/authorization-service/src/**/*.{ts,tsx}'],
  }),
);
