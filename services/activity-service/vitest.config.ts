import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['services/activity-service/src/**/*.spec.ts'],
  coverageInclude: ['services/activity-service/src/**/*.{ts,tsx}'],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
  },
});
