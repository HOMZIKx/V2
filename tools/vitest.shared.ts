import type { UserConfig } from 'vitest/config';

export const sharedCoverageExcludes = [
  '**/*.config.*',
  '**/main.ts',
  '**/main.tsx',
  '**/*.module.ts',
  '**/*.{spec,test}.{ts,tsx}',
  '**/dist/**',
  '**/.next/**',
  '**/e2e/**',
  '**/coverage/**',
] as const;

export const sharedTestConfig: NonNullable<UserConfig['test']> = {
  environment: 'node',
  coverage: {
    enabled: process.argv.includes('--coverage'),
    all: true,
    provider: 'v8',
    reporter: ['text', 'json-summary'],
    reportsDirectory: `coverage/${process.env.NX_TASK_TARGET_PROJECT ?? 'local'}`,
    thresholds: {
      lines: 60,
      functions: 60,
      branches: 50,
      statements: 60,
    },
    exclude: [...sharedCoverageExcludes],
  },
};

export function createProjectTestConfig(options: {
  testInclude: string[];
  coverageInclude: string[];
}): UserConfig {
  return {
    test: {
      ...sharedTestConfig,
      include: options.testInclude,
      coverage: {
        provider: 'v8',
        enabled: process.argv.includes('--coverage'),
        all: true,
        reporter: ['text', 'json-summary'],
        reportsDirectory: `coverage/${process.env.NX_TASK_TARGET_PROJECT ?? 'local'}`,
        thresholds: {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60,
        },
        exclude: [...sharedCoverageExcludes],
        include: options.coverageInclude,
      },
    },
  };
}
