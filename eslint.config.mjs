import { createV2Config } from '@v2/eslint-config';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.config.{js,mjs,cjs,ts}',
      '**/playwright.config.ts',
      '**/vitest.config.ts',
      'packages/typescript-config/**',
    ],
  },
  ...createV2Config(),
];
