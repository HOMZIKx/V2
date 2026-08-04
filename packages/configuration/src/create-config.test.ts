import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError, createConfig } from './create-config.js';

const trackedKeys = ['NODE_ENV', 'REQUIRED_VALUE', 'ALLOW_PRODUCTION_CONNECTIONS'] as const;

const originals = Object.fromEntries(trackedKeys.map((key) => [key, process.env[key]])) as Record<
  (typeof trackedKeys)[number],
  string | undefined
>;

afterEach(() => {
  for (const key of trackedKeys) {
    const value = originals[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('createConfig', () => {
  it('rejects an invalid required environment value', () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRED_VALUE = 'not-a-number';

    expect(() =>
      createConfig(
        z.object({
          REQUIRED_VALUE: z.coerce.number().int().positive(),
        }),
      ),
    ).toThrow(ConfigValidationError);
  });

  it('rejects invalid values in development with ConfigValidationError', () => {
    process.env.NODE_ENV = 'development';
    process.env.REQUIRED_VALUE = 'nope';

    expect(() =>
      createConfig(
        z.object({
          REQUIRED_VALUE: z.coerce.number().int().positive(),
        }),
      ),
    ).toThrow(/Invalid configuration/);
  });

  it('refuses accidental production connection flag in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_PRODUCTION_CONNECTIONS = 'true';
    process.env.REQUIRED_VALUE = '1';

    expect(() =>
      createConfig(
        z.object({
          REQUIRED_VALUE: z.coerce.number().int().positive(),
        }),
      ),
    ).toThrow(/ALLOW_PRODUCTION_CONNECTIONS/);
  });
});
