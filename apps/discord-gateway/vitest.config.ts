import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

export default defineConfig(
  createProjectTestConfig({
    testInclude: ['apps/discord-gateway/src/**/*.spec.ts'],
    coverageInclude: ['apps/discord-gateway/src/**/*.{ts,tsx}'],
  }),
);
