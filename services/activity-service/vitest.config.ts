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
    coverage: {
      ...base.test?.coverage,
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'services/activity-service/src/main.ts',
        'services/activity-service/src/application/ports/**',
        'services/activity-service/src/interface/activity.tokens.ts',
        'services/activity-service/src/interface/app.module.ts',
        'services/activity-service/src/interface/activity.controller.ts',
        'services/activity-service/src/interface/activity-admin.controller.ts',
        'services/activity-service/src/interface/inbound-assertion.guard.ts',
        'services/activity-service/src/interface/activity-exception.filter.ts',
        'services/activity-service/src/interface/health.controller.ts',
        'services/activity-service/src/infrastructure/db/**',
        'services/activity-service/src/infrastructure/config/load-env-file.ts',
        // Exercised by infra integration tests (skipped without Docker locally / CI unit coverage).
        'services/activity-service/src/infrastructure/persistence/activity-repository.ts',
        'services/activity-service/src/infrastructure/authorization/**',
        'services/activity-service/src/infrastructure/internal/**',
        'services/activity-service/src/infrastructure/discord/**',
        // Large application orchestration; covered by focused unit suites + HTTP/infra integration.
        'services/activity-service/src/application/use-cases/activity-admin.use-cases.ts',
        'services/activity-service/src/application/use-cases/activity.use-cases.ts',
      ],
    },
  },
});
