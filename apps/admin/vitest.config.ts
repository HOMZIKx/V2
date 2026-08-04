import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['apps/admin/src/**/*.{spec,test}.{ts,tsx}'],
    coverageInclude: ['apps/admin/src/**/*.{ts,tsx}'],
  }),
);
