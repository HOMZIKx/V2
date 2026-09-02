import { createV2Config } from '@v2/eslint-config';

export default [
  { ignores: ['eslint.config.mjs', 'dist/**', 'vitest.config.ts', 'node_modules/**'] },
  ...createV2Config(),
];
