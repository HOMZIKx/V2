import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['src/**/*.spec.ts'],
    coverageInclude: ['src/**/*.{ts,tsx}'],
  }),
);
