import { z } from 'zod';

export const RuntimeEnvironmentSchema = z.enum(['development', 'test', 'production']);
export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

export function isProduction(environment: RuntimeEnvironment): boolean {
  return environment === 'production';
}

/**
 * Development must never silently use production connection flags.
 * Production still fail-fasts on invalid config via createConfig.
 */
export function assertNoAccidentalProductionConnections(
  environment: RuntimeEnvironment,
  env: NodeJS.ProcessEnv,
): void {
  if (environment === 'production') {
    return;
  }

  if (env.ALLOW_PRODUCTION_CONNECTIONS === 'true') {
    throw new Error(
      'ALLOW_PRODUCTION_CONNECTIONS=true is forbidden outside production. Refusing to start.',
    );
  }
}

export function assertProductionRequirements(
  environment: RuntimeEnvironment,
  validationSucceeded: boolean,
): void {
  if (isProduction(environment) && !validationSucceeded) {
    throw new Error('Production configuration is invalid or missing required variables.');
  }
}
