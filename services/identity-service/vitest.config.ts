import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['services/identity-service/src/**/*.spec.ts'],
    coverageInclude: ['services/identity-service/src/**/*.{ts,tsx}'],
  }),
);
