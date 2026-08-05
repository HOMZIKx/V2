import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const base = createProjectTestConfig({
  testInclude: ['apps/discord-gateway/src/**/*.spec.ts'],
  coverageInclude: ['apps/discord-gateway/src/**/*.{ts,tsx}'],
});

export default defineConfig({
  root: repositoryRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'apps/discord-gateway/src/application/ports/**',
        'apps/discord-gateway/src/interface/discord/discord.tokens.ts',
        'apps/discord-gateway/src/interface/app.module.ts',
      ],
    },
  },
});
