import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const base = createProjectTestConfig({
  testInclude: ['src/**/*.spec.ts'],
  coverageInclude: ['src/**/*.{ts,tsx}'],
});

export default defineConfig({
  ...base,
  root: packageRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      exclude: [...(base.test?.coverage?.exclude ?? []), 'src/components/**', 'src/lib/types.ts'],
    },
  },
});
