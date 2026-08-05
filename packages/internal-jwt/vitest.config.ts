import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/internal-jwt/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/internal-jwt/src/**/*.{ts,tsx}'],
  }),
);
