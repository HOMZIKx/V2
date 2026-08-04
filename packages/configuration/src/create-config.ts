import { z } from 'zod';

import {
  assertNoAccidentalProductionConnections,
  isProduction,
  RuntimeEnvironmentSchema,
} from './guards.js';

export class ConfigValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

export function createConfig<TSchema extends z.ZodType>(schema: TSchema): z.output<TSchema> {
  const environmentResult = RuntimeEnvironmentSchema.safeParse(
    process.env.NODE_ENV ?? 'development',
  );
  const environment = environmentResult.success ? environmentResult.data : 'development';

  assertNoAccidentalProductionConnections(environment, process.env);

  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    if (isProduction(environment)) {
      throw new ConfigValidationError(
        `Production configuration is invalid or missing required variables. ${details}`,
      );
    }

    throw new ConfigValidationError(`Invalid configuration: ${details}`);
  }

  return parsed.data;
}
