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
  {
    files: ['app/teams/**/economy/team-economy.tsx'],
    rules: {
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    // Legacy local party snapshots are runtime-normalized before use. TypeScript's
    // Array.isArray() narrows readonly typed arrays through any[], which makes the
    // strict unsafe rules report false positives in that compatibility decoder.
    files: ['app/maps/party-hunt.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];
