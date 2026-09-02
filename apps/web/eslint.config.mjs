import { createV2Config } from '@v2/eslint-config';

export default [
  {
    ignores: [
      'eslint.config.mjs',
      '.next/**',
      'next-env.d.ts',
      'node_modules/**',
      'test-results/**',
      'e2e/**',
      'playwright.config.ts',
    ],
  },
  ...createV2Config(),
];
