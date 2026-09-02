import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['services/player-workspace-service/src/**/*.spec.ts'],
  coverageInclude: [
    'services/player-workspace-service/src/domain/**/*.{ts,tsx}',
    'services/player-workspace-service/src/application/player-workspace.security.spec.ts',
  ],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      include: ['services/player-workspace-service/src/domain/**/*.{ts,tsx}'],
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'services/player-workspace-service/src/**/*.spec.ts',
        'services/player-workspace-service/src/main.ts',
        'services/player-workspace-service/src/application/**',
        'services/player-workspace-service/src/interface/**',
        'services/player-workspace-service/src/infrastructure/**',
      ],
    },
  },
});
