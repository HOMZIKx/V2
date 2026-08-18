import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { createProjectTestConfig } from '../../tools/vitest.shared.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const base = createProjectTestConfig({
  testInclude: ['src/**/*.{spec,test}.{ts,tsx}', 'scripts/**/*.spec.ts'],
  coverageInclude: ['src/**/*.{ts,tsx}'],
});

export default defineConfig({
  ...base,
  root: packageRoot,
  test: {
    ...base.test,
    coverage: {
      ...base.test?.coverage,
      exclude: [
        ...(base.test?.coverage?.exclude ?? []),
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/pages/**',
        'src/layout/**',
        'src/hooks/**',
        'src/components/**',
        'src/api/**',
        'src/auth/**',
      ],
    },
  },
});
