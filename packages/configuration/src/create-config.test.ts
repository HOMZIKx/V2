import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigValidationError, createConfig } from './create-config.js';
import * as configuration from './index.js';

const trackedKeys = [
  'NODE_ENV',
  'REQUIRED_VALUE',
  'ALLOW_PRODUCTION_CONNECTIONS',
  'IDENTITY_DATABASE_URL',
] as const;

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
  it('re-exports the public configuration surface', () => {
    expect(configuration.createConfig).toBeTypeOf('function');
    expect(configuration.assertNoAccidentalProductionConnections).toBeTypeOf('function');
  });

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

  it('refuses non-local infrastructure hosts in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.REQUIRED_VALUE = '1';
    process.env.IDENTITY_DATABASE_URL = 'postgresql://user:pass@db.prod.example.com:5432/identity';
    delete process.env.ALLOW_PRODUCTION_CONNECTIONS;

    expect(() =>
      createConfig(
        z.object({
          REQUIRED_VALUE: z.coerce.number().int().positive(),
        }),
      ),
    ).toThrow(/Refusing non-local infrastructure hosts/);
  });
});
