import type { UserConfig } from 'vitest/config';

export const sharedTestConfig: NonNullable<UserConfig['test']> = {
  environment: 'node',
  coverage: {
    enabled: process.argv.includes('--coverage'),
    all: false,
    provider: 'v8',
    reporter: ['text', 'json-summary'],
    reportsDirectory: `coverage/${process.env.NX_TASK_TARGET_PROJECT ?? 'local'}`,
    thresholds: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
    exclude: ['**/*.config.*', '**/main.ts', '**/*.module.ts', '**/dist/**', '**/.next/**'],
  },
};
