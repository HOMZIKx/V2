import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/messaging/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/messaging/src/**/*.{ts,tsx}'],
  }),
);
