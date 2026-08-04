import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from './vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['tools/scripts/**/*.test.mjs'],
    coverageInclude: ['tools/scripts/generate-service.mjs'],
  }),
);
