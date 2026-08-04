import { afterEach, describe, expect, it } from 'vitest';

import {
  assertNoAccidentalProductionConnections,
  assertProductionRequirements,
  extractConnectionHosts,
  isLocalInfrastructureHost,
} from './guards.js';

const trackedKeys = [
  'ALLOW_PRODUCTION_CONNECTIONS',
  'IDENTITY_DATABASE_URL',
  'REDIS_URL',
  'RABBITMQ_URL',
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

describe('infrastructure host guards', () => {
  it('accepts loopback and Compose service hosts', () => {
    expect(isLocalInfrastructureHost('127.0.0.1')).toBe(true);
    expect(isLocalInfrastructureHost('localhost')).toBe(true);
    expect(isLocalInfrastructureHost('postgres')).toBe(true);
    expect(isLocalInfrastructureHost('redis.internal')).toBe(true);
    expect(isLocalInfrastructureHost('10.0.0.8')).toBe(true);
  });

  it('rejects public production-like hosts', () => {
    expect(isLocalInfrastructureHost('db.prod.example.com')).toBe(false);
    expect(isLocalInfrastructureHost('cache.amazonaws.com')).toBe(false);
  });

  it('extracts hosts from connection URL environment variables', () => {
    process.env.IDENTITY_DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/identity';
    process.env.REDIS_URL = 'redis://redis:6379/0';
    process.env.RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672';

    expect(extractConnectionHosts(process.env)).toEqual(
      expect.arrayContaining([
        { key: 'IDENTITY_DATABASE_URL', host: '127.0.0.1' },
        { key: 'REDIS_URL', host: 'redis' },
        { key: 'RABBITMQ_URL', host: 'rabbitmq' },
      ]),
    );
  });

  it('blocks non-local hosts in development without an explicit exception', () => {
    process.env.IDENTITY_DATABASE_URL = 'postgresql://user:pass@db.prod.example.com:5432/identity';
    delete process.env.ALLOW_PRODUCTION_CONNECTIONS;

    expect(() => assertNoAccidentalProductionConnections('development', process.env)).toThrow(
      /Refusing non-local infrastructure hosts/,
    );
  });

  it('allows non-local hosts only with an explicit auditable exception flag', () => {
    process.env.IDENTITY_DATABASE_URL = 'postgresql://user:pass@db.prod.example.com:5432/identity';
    process.env.ALLOW_PRODUCTION_CONNECTIONS = 'true';

    expect(() => assertNoAccidentalProductionConnections('development', process.env)).not.toThrow();
  });

  it('enforces production configuration validity', () => {
    expect(() => assertProductionRequirements('production', false)).toThrow(
      /Production configuration is invalid/,
    );
    expect(() => assertProductionRequirements('production', true)).not.toThrow();
    expect(() => assertProductionRequirements('development', false)).not.toThrow();
  });
});
