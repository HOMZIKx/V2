import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['packages/notification-core/src/**/*.{test,spec}.ts'],
    coverageInclude: ['packages/notification-core/src/**/*.{ts,tsx}'],
  }),
);
