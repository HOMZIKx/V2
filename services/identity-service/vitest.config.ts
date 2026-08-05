import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['services/identity-service/src/**/*.spec.ts'],
  coverageInclude: ['services/identity-service/src/**/*.{ts,tsx}'],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'services/identity-service/src/application/ports/**',
        'services/identity-service/src/interface/identity.tokens.ts',
        'services/identity-service/src/interface/app.module.ts',
      ],
    },
  },
});
