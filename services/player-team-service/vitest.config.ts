import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['services/player-team-service/src/**/*.spec.ts'],
  coverageInclude: ['services/player-team-service/src/**/*.{ts,tsx}'],
  coverageExclude: [
    'services/player-team-service/src/domain/ports/**',
    'services/player-team-service/src/infrastructure/config/load-env-file.ts',
    'services/player-team-service/src/infrastructure/config/player-team-env.provider.ts',
    'services/player-team-service/src/infrastructure/db/**',
    'services/player-team-service/src/interface/**',
  ],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
    coverage: base.test?.coverage,
  },
});
