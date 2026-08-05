import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['services/authorization-service/src/**/*.spec.ts'],
  coverageInclude: ['services/authorization-service/src/**/*.{ts,tsx}'],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'services/authorization-service/src/application/ports/**',
        'services/authorization-service/src/interface/authorization.tokens.ts',
        'services/authorization-service/src/interface/app.module.ts',
        'services/authorization-service/src/interface/authorization.controller.ts',
        'services/authorization-service/src/interface/authorization-bootstrap.service.ts',
        'services/authorization-service/src/interface/inbound-assertion.guard.ts',
        'services/authorization-service/src/infrastructure/adapters/**',
        'services/authorization-service/src/infrastructure/db/pg-pool.ts',
      ],
    },
  },
});
